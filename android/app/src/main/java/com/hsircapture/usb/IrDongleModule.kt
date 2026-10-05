package com.hsircapture.usb

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.hsircapture.ir.DecodedNativeFrame
import com.hsircapture.ir.IrFrameCodec
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

class IrDongleModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    companion object {
        const val NAME = "IrDongle"
        private const val ACTION_USB_PERMISSION = "com.hsircapture.USB_PERMISSION"
        private const val EVENT_CONNECTION = "IrDongleConnectionChanged"
        private const val EVENT_FRAME = "IrDongleFrameReceived"
        private const val EVENT_ERROR = "IrDongleError"
        private const val EVENT_PERMISSION = "IrDonglePermissionResult"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val usbManager: UsbManager =
        reactContext.getSystemService(Context.USB_SERVICE) as UsbManager

    private var reader: UsbSerialReader? = null
    private var currentDevice: UsbDevice? = null
    private var listening = AtomicBoolean(false)
    private var simulatorMode = AtomicBoolean(false)
    private var simulatorJob: Job? = null
    private var receiversRegistered = false
    private var destroyed = AtomicBoolean(false)

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    val device: UsbDevice? = intent.usbDeviceCompat()
                    if (device != null) {
                        handleDeviceAttached(device)
                    }
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    val device: UsbDevice? = intent.usbDeviceCompat()
                    if (device != null && currentDevice?.deviceId == device.deviceId) {
                        handleDeviceDetached()
                    }
                }
                ACTION_USB_PERMISSION -> {
                    val device: UsbDevice? = intent.usbDeviceCompat()
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    emit(EVENT_PERMISSION, Arguments.createMap().apply {
                        putBoolean("granted", granted)
                    })
                    if (granted && device != null) {
                        connectDevice(device)
                    } else {
                        emitConnection(
                            status = "error",
                            message = "USB permission denied",
                            code = "PERMISSION_DENIED",
                            device = device,
                        )
                    }
                }
            }
        }
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        reactContext.addLifecycleEventListener(this)
    }

    @ReactMethod
    fun initialize(promise: Promise) {
        try {
            registerReceiversIfNeeded()
            reader = UsbSerialReader(
                usbManager = usbManager,
                onFrame = { frame -> emitFrame(frame) },
                onError = { code, message -> emitError(code, message) },
            )
            scanForExistingDevice()
            promise.resolve(null)
        } catch (t: Throwable) {
            promise.reject("INIT_FAILED", t.message, t)
        }
    }

    @ReactMethod
    fun startListening(promise: Promise) {
        if (destroyed.get()) {
            promise.reject("DESTROYED", "Module destroyed")
            return
        }
        listening.set(true)
        if (simulatorMode.get()) {
            startSimulator()
            promise.resolve(null)
            return
        }
        val device = currentDevice
        if (device == null) {
            scanForExistingDevice()
        }
        val active = currentDevice
        if (active == null) {
            promise.reject("NO_DONGLE", "No IR dongle connected")
            return
        }
        if (!usbManager.hasPermission(active)) {
            requestUsbPermission(active)
            promise.reject("PERMISSION_REQUIRED", "USB permission required")
            return
        }
        scope.launch(Dispatchers.IO) {
            try {
                reader?.start(active)
                emitConnection("connected", device = active)
                promise.resolve(null)
            } catch (t: Throwable) {
                promise.reject("LISTEN_FAILED", t.message, t)
            }
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        listening.set(false)
        stopSimulator()
        scope.launch(Dispatchers.IO) {
            try {
                reader?.stop()
                promise.resolve(null)
            } catch (t: Throwable) {
                promise.reject("STOP_FAILED", t.message, t)
            }
        }
    }

    @ReactMethod
    fun requestPermission(promise: Promise) {
        val device = currentDevice ?: findSupportedDevice()
        if (device == null) {
            promise.resolve(false)
            return
        }
        if (usbManager.hasPermission(device)) {
            promise.resolve(true)
            return
        }
        requestUsbPermission(device)
        // Result delivered asynchronously via IrDonglePermissionResult
        promise.resolve(false)
    }

    @ReactMethod
    fun getConnectionState(promise: Promise) {
        try {
            promise.resolve(buildConnectionMap())
        } catch (t: Throwable) {
            promise.reject("STATE_FAILED", t.message, t)
        }
    }

    @ReactMethod
    fun setSimulatorMode(enabled: Boolean, promise: Promise) {
        simulatorMode.set(enabled)
        if (enabled) {
            emitConnection(
                status = "connected",
                device = null,
                simulator = true,
            )
            if (listening.get()) {
                startSimulator()
            }
        } else {
            stopSimulator()
            scanForExistingDevice()
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun destroy(promise: Promise) {
        teardown()
        promise.resolve(null)
    }

    override fun onHostResume() {
        registerReceiversIfNeeded()
        if (listening.get() && !simulatorMode.get()) {
            currentDevice?.let { device ->
                if (usbManager.hasPermission(device)) {
                    scope.launch(Dispatchers.IO) { reader?.start(device) }
                }
            }
        }
    }

    override fun onHostPause() {
        // Keep reading while backgrounded if listening — medical capture sessions may be short.
        // Stop only on destroy / detach.
    }

    override fun onHostDestroy() {
        teardown()
    }

    override fun invalidate() {
        teardown()
        super.invalidate()
    }

    private fun teardown() {
        if (!destroyed.compareAndSet(false, true)) return
        listening.set(false)
        stopSimulator()
        scope.launch(Dispatchers.IO) {
            reader?.stop()
        }
        unregisterReceivers()
        reactContext.removeLifecycleEventListener(this)
        scope.cancel()
    }

    private fun registerReceiversIfNeeded() {
        if (receiversRegistered) return
        val filter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
            addAction(ACTION_USB_PERMISSION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            reactContext.registerReceiver(usbReceiver, filter)
        }
        receiversRegistered = true
    }

    private fun unregisterReceivers() {
        if (!receiversRegistered) return
        try {
            reactContext.unregisterReceiver(usbReceiver)
        } catch (_: Throwable) {
        }
        receiversRegistered = false
    }

    private fun scanForExistingDevice() {
        if (simulatorMode.get()) {
            emitConnection("connected", simulator = true)
            return
        }
        val device = findSupportedDevice()
        if (device == null) {
            currentDevice = null
            emitConnection("disconnected")
            return
        }
        handleDeviceAttached(device)
    }

    private fun findSupportedDevice(): UsbDevice? =
        usbManager.deviceList.values.firstOrNull { UsbDongleIds.isSupported(it.vendorId, it.productId) }

    private fun handleDeviceAttached(device: UsbDevice) {
        val known = UsbDongleIds.find(device.vendorId, device.productId)
        if (known == null) {
            currentDevice = device
            emitConnection(
                status = "unsupported",
                device = device,
                reason = "Dongle VID/PID not in supported list",
            )
            return
        }
        currentDevice = device
        if (!usbManager.hasPermission(device)) {
            emitConnection("permission_required", device = device)
            requestUsbPermission(device)
            return
        }
        connectDevice(device)
    }

    private fun connectDevice(device: UsbDevice) {
        currentDevice = device
        emitConnection("connecting", device = device)
        if (!listening.get()) {
            emitConnection("connected", device = device)
            return
        }
        scope.launch(Dispatchers.IO) {
            reader?.stop()
            reader?.start(device)
            emitConnection("connected", device = device)
        }
    }

    private fun handleDeviceDetached() {
        scope.launch(Dispatchers.IO) {
            reader?.stop()
        }
        currentDevice = null
        emitError("DONGLE_REMOVED", "IR dongle was unplugged")
        emitConnection("disconnected")
    }

    private fun requestUsbPermission(device: UsbDevice) {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pi = PendingIntent.getBroadcast(
            reactContext,
            0,
            Intent(ACTION_USB_PERMISSION).setPackage(reactContext.packageName),
            flags,
        )
        usbManager.requestPermission(device, pi)
    }

    private fun startSimulator() {
        stopSimulator()
        simulatorJob = scope.launch(Dispatchers.IO) {
            var tick = 0
            while (isActive && simulatorMode.get() && listening.get()) {
                tick += 1
                val frameBytes = when (tick % 5) {
                    0 -> {
                        // HS AED hex payload: HS + status analyzing
                        val extra = byteArrayOf(0x48, 0x53, 0x10, 0x01)
                        val timings = necLikeTimings(address = 0xA1, command = 0x10)
                        IrFrameCodec.encodeFrame(38000, timings, extra)
                    }
                    1 -> {
                        val timings = necLikeTimings(address = 0xA1, command = 0x20)
                        IrFrameCodec.encodeFrame(38000, timings, byteArrayOf(0x48, 0x53, 0x20, 0x02))
                    }
                    else -> {
                        val timings = necLikeTimings(address = 0x20, command = (tick % 16))
                        IrFrameCodec.encodeFrame(38000, timings)
                    }
                }
                val (frames, _) = IrFrameCodec.extractFrames(frameBytes, System.currentTimeMillis())
                frames.forEach { emitFrame(it) }
                delay(1200)
            }
        }
        emitConnection("connected", simulator = true)
    }

    private fun stopSimulator() {
        simulatorJob?.cancel()
        simulatorJob = null
    }

    /** Generate NEC-like mark/space timings for simulator. */
    private fun necLikeTimings(address: Int, command: Int): IntArray {
        val list = ArrayList<Int>(68)
        list.add(9000)
        list.add(-4500)
        fun writeByte(value: Int) {
            for (i in 0 until 8) {
                list.add(560)
                list.add(if ((value shr i) and 1 == 1) -1690 else -560)
            }
        }
        writeByte(address and 0xFF)
        writeByte((address.inv()) and 0xFF)
        writeByte(command and 0xFF)
        writeByte((command.inv()) and 0xFF)
        list.add(560)
        return list.toIntArray()
    }

    private fun emitFrame(frame: DecodedNativeFrame) {
        val map = Arguments.createMap().apply {
            putDouble("receivedAtMs", frame.receivedAtMs.toDouble())
            if (frame.carrierHz == null) putNull("carrierHz") else putInt("carrierHz", frame.carrierHz)
            val arr: WritableArray = Arguments.createArray()
            frame.timingsUs.forEach { arr.pushInt(it) }
            putArray("timingsUs", arr)
            if (frame.frameBytesHex == null) putNull("frameBytesHex") else putString("frameBytesHex", frame.frameBytesHex)
        }
        emit(EVENT_FRAME, map)
    }

    private fun emitError(code: String, message: String) {
        emit(EVENT_ERROR, Arguments.createMap().apply {
            putString("code", code)
            putString("message", message)
        })
    }

    private fun emitConnection(
        status: String,
        device: UsbDevice? = currentDevice,
        reason: String? = null,
        message: String? = null,
        code: String? = null,
        simulator: Boolean = false,
    ) {
        emit(EVENT_CONNECTION, Arguments.createMap().apply {
            putString("status", status)
            if (reason != null) putString("reason", reason)
            if (message != null) putString("message", message)
            if (code != null) putString("code", code)
            if (simulator) {
                putMap("dongle", Arguments.createMap().apply {
                    putString("deviceName", "HS IR Simulator")
                    putInt("vendorId", 0x1209)
                    putInt("productId", 0x4853)
                    putString("manufacturerName", "HeartSafe")
                    putString("serialNumber", "SIM-001")
                    putBoolean("connected", true)
                })
            } else if (device != null) {
                putMap("dongle", deviceToMap(device))
            }
        })
    }

    private fun buildConnectionMap(): WritableMap {
        if (simulatorMode.get()) {
            return Arguments.createMap().apply {
                putString("status", "connected")
                putMap("dongle", Arguments.createMap().apply {
                    putString("deviceName", "HS IR Simulator")
                    putInt("vendorId", 0x1209)
                    putInt("productId", 0x4853)
                    putString("manufacturerName", "HeartSafe")
                    putString("serialNumber", "SIM-001")
                    putBoolean("connected", true)
                })
            }
        }
        val device = currentDevice ?: findSupportedDevice()
        return Arguments.createMap().apply {
            when {
                device == null -> putString("status", "disconnected")
                !UsbDongleIds.isSupported(device.vendorId, device.productId) -> {
                    putString("status", "unsupported")
                    putString("reason", "Dongle VID/PID not in supported list")
                    putMap("dongle", deviceToMap(device))
                }
                !usbManager.hasPermission(device) -> {
                    putString("status", "permission_required")
                    putMap("dongle", deviceToMap(device))
                }
                else -> {
                    putString("status", "connected")
                    putMap("dongle", deviceToMap(device))
                }
            }
        }
    }

    private fun deviceToMap(device: UsbDevice): WritableMap =
        Arguments.createMap().apply {
            val known = UsbDongleIds.find(device.vendorId, device.productId)
            putString("deviceName", known?.label ?: device.deviceName)
            putInt("vendorId", device.vendorId)
            putInt("productId", device.productId)
            putString("manufacturerName", device.manufacturerName)
            putString("serialNumber", device.serialNumber)
            putBoolean("connected", true)
        }

    private fun emit(event: String, params: WritableMap) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }

    private fun Intent.usbDeviceCompat(): UsbDevice? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            getParcelableExtra(UsbManager.EXTRA_DEVICE)
        }
}
