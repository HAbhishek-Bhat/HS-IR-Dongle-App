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
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.hsircapture.BuildConfig
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

class IrDongleModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
    companion object {
        const val NAME = "IrDongle"
        private const val EVENT_CONNECTION = "IrDongleConnectionChanged"
        private const val EVENT_FRAME = "IrDongleFrameReceived"
        private const val EVENT_ERROR = "IrDongleError"
        private const val EVENT_PERMISSION = "IrDonglePermissionResult"
        private const val PROTOCOL_ERROR = "RECEIVE_PROTOCOL_UNVERIFIED"
        private const val PROTOCOL_MESSAGE =
            "USB dongle identified, but its IR receive capability and protocol are unverified. " +
                "Provide the vendor receive/learning SDK or use a documented IR receiver."
    }

    // USB transitions, receiver callbacks and simulator delivery all run on Main.
    // This build never opens a physical port or sends unverified vendor commands.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val usbManager =
        reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
    private val permissionAction = "${reactContext.packageName}.USB_PERMISSION"
    private var currentDevice: UsbDevice? = null
    private var pendingPermissionId: Int? = null
    private val deniedDeviceIds = mutableSetOf<Int>()
    private var status = "disconnected"
    private var message: String? = null
    private var code: String? = null
    private var simulatorMode = false
    private var simulatorJob: Job? = null
    private var idleJob: Job? = null
    private var lastReceivedAtMs: Long? = null
    private var registered = false
    private var active = false
    private var invalidated = false
    private class UsbOperationException(val errorCode: String, message: String) : Exception(message)

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (!active || intent == null) return
            observe {
                val device = intent.usbDeviceCompat() ?: return@observe
                when (intent.action) {
                    UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                        if (!simulatorMode && UsbDongleIds.isSupported(device.vendorId, device.productId)) {
                            deniedDeviceIds.remove(device.deviceId)
                            scan()
                        }
                    }
                    UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                        deniedDeviceIds.remove(device.deviceId)
                        if (currentDevice?.deviceId == device.deviceId) {
                            currentDevice = null
                            pendingPermissionId = null
                            lastReceivedAtMs = null
                            emitError("DONGLE_REMOVED", "Dongle disconnected, reconnect to continue.")
                            transition("disconnected")
                            scan()
                        }
                    }
                    permissionAction -> {
                        if (simulatorMode || pendingPermissionId != device.deviceId ||
                            currentDevice?.deviceId != device.deviceId ||
                            usbManager.deviceList.values.none { it.deviceId == device.deviceId }
                        ) return@observe
                        pendingPermissionId = null
                        val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false) &&
                            usbManager.hasPermission(device)
                        emit(EVENT_PERMISSION, Arguments.createMap().apply {
                            putBoolean("granted", granted)
                        })
                        if (granted) {
                            deniedDeviceIds.remove(device.deviceId)
                            reportReceiveGate()
                        } else {
                            deniedDeviceIds.add(device.deviceId)
                            transition(
                                "permission_denied",
                                "USB permission denied. Tap Grant permission to retry.",
                                "PERMISSION_DENIED",
                            )
                        }
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

    private fun run(promise: Promise, action: () -> Any?) {
        if (invalidated) {
            promise.reject("DESTROYED", "Native module has been invalidated.")
            return
        }
        scope.launch {
            if (invalidated) {
                promise.reject("DESTROYED", "Native module has been invalidated.")
                return@launch
            }
            try {
                promise.resolve(action())
            } catch (error: UsbOperationException) {
                promise.reject(error.errorCode, error.message, error)
            } catch (error: Exception) {
                transition("error", "USB operation failed. Reconnect and retry.", "USB_OPERATION_FAILED")
                emitError("USB_OPERATION_FAILED", "USB operation failed. Reconnect and retry.")
                promise.reject("USB_OPERATION_FAILED", "USB operation failed. Reconnect and retry.", error)
            }
        }
    }

    @ReactMethod
    fun initialize(promise: Promise) = run(promise) {
        active = true
        registerReceiver()
        scan()
        null
    }

    @ReactMethod
    fun getConnectionState(promise: Promise) = run(promise) { connectionMap() }

    @ReactMethod
    fun reconnect(promise: Promise) = run(promise) {
        active = true
        registerReceiver()
        if (simulatorMode) {
            startSimulator()
        } else {
            scan(requestIfNeeded = false)
        }
        null
    }

    @ReactMethod
    fun requestPermission(promise: Promise) = run(promise) {
        if (simulatorMode) return@run true
        scan(requestIfNeeded = false)
        val device = currentDevice
        if (device == null) {
            emitError("NO_DONGLE", "Plug in the IR dongle.")
            return@run false
        }
        if (usbManager.hasPermission(device)) {
            reportReceiveGate()
            return@run true
        }
        deniedDeviceIds.remove(device.deviceId)
        requestUsbPermission(device)
        false
    }

    @ReactMethod
    fun startListening(promise: Promise) = run(promise) {
        if (!simulatorMode) {
            scan(requestIfNeeded = false)
            throw UsbOperationException(
                if (currentDevice == null) "NO_DONGLE" else PROTOCOL_ERROR,
                if (currentDevice == null) "Plug in the IR dongle." else PROTOCOL_MESSAGE,
            )
        }
        startSimulator()
        null
    }

    @ReactMethod
    fun stopListening(promise: Promise) = run(promise) {
        // Consumers can stop recording while the enabled simulator remains ready.
        null
    }

    @ReactMethod
    fun setSimulatorMode(enabled: Boolean, promise: Promise) {
        if (enabled && !BuildConfig.DEBUG) {
            promise.reject("SIMULATOR_DISABLED", "Simulator is only available in development builds.")
            return
        }
        run(promise) {
            if (simulatorMode == enabled) {
                if (enabled) startSimulator() else scan()
                return@run null
            }
            stopSimulator()
            simulatorMode = enabled
            currentDevice = null
            pendingPermissionId = null
            lastReceivedAtMs = null
            if (enabled) startSimulator() else scan()
            null
        }
    }

    @ReactMethod
    fun destroy(promise: Promise) = run(promise) {
        cleanup()
        null
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Double) {}

    override fun onHostResume() {
        if (active && !invalidated) {
            observe {
                registerReceiver()
                if (!simulatorMode) scan()
            }
        }
    }

    override fun onHostPause() {
        // Physical mode performs detection only; no unverified reader to retain.
    }

    override fun onHostDestroy() {
        cleanup()
    }

    override fun invalidate() {
        invalidated = true
        reactContext.runOnUiQueueThread {
            cleanup()
            reactContext.removeLifecycleEventListener(this)
            scope.cancel()
        }
        super.invalidate()
    }

    private fun observe(action: () -> Unit) {
        try {
            action()
        } catch (error: Exception) {
            transition("error", "USB operation failed. Reconnect and retry.", "USB_OPERATION_FAILED")
            emitError("USB_OPERATION_FAILED", "USB operation failed. Reconnect and retry.")
        }
    }

    private fun cleanup() {
        active = false
        stopSimulator()
        simulatorMode = false
        if (registered) {
            reactContext.unregisterReceiver(receiver)
            registered = false
        }
        currentDevice = null
        pendingPermissionId = null
        deniedDeviceIds.clear()
        lastReceivedAtMs = null
        transition("disconnected")
    }

    private fun registerReceiver() {
        if (registered) return
        val filter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
            addAction(permissionAction)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            reactContext.registerReceiver(receiver, filter)
        }
        registered = true
    }

    private fun scan(requestIfNeeded: Boolean = true) {
        if (simulatorMode) return
        val devices = usbManager.deviceList.values.filter {
            UsbDongleIds.isSupported(it.vendorId, it.productId)
        }
        val device = devices.firstOrNull { it.deviceId == currentDevice?.deviceId }
            ?: devices.sortedBy { it.deviceId }.firstOrNull()
        if (currentDevice != null && device?.deviceId != currentDevice?.deviceId) {
            emitError("DONGLE_REMOVED", "Dongle disconnected, reconnect to continue.")
        }
        if (device == null) {
            currentDevice = null
            pendingPermissionId = null
            transition("disconnected")
            return
        }
        if (currentDevice?.deviceId != device.deviceId) {
            currentDevice = device
            pendingPermissionId = null
            transition("detected")
        }
        when {
            usbManager.hasPermission(device) -> reportReceiveGate()
            deniedDeviceIds.contains(device.deviceId) ->
                transition("permission_denied", "USB permission denied. Tap Grant permission to retry.", "PERMISSION_DENIED")
            requestIfNeeded -> requestUsbPermission(device)
            else -> transition("permission_required")
        }
    }

    private fun requestUsbPermission(device: UsbDevice) {
        transition("permission_required")
        if (pendingPermissionId == device.deviceId) return
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val pendingIntent = PendingIntent.getBroadcast(
            reactContext,
            device.deviceId,
            Intent(permissionAction).setPackage(reactContext.packageName),
            flags,
        )
        pendingPermissionId = device.deviceId
        try {
            usbManager.requestPermission(device, pendingIntent)
        } catch (error: Exception) {
            pendingPermissionId = null
            throw error
        }
    }

    private fun reportReceiveGate() {
        transition("error", PROTOCOL_MESSAGE, PROTOCOL_ERROR)
    }

    private fun transition(next: String, nextMessage: String? = null, nextCode: String? = null) {
        status = next
        message = nextMessage
        code = nextCode
        emit(EVENT_CONNECTION, connectionMap())
    }

    private fun connectionMap(): WritableMap = Arguments.createMap().apply {
        putString("status", status)
        if (message != null) putString("message", message)
        if (code != null) putString("code", code)
        if (lastReceivedAtMs != null) putDouble("lastReceivedAtMs", lastReceivedAtMs!!.toDouble())
        if (simulatorMode) {
            putMap("dongle", Arguments.createMap().apply {
                putString("deviceName", "HS IR Simulator")
                putString("manufacturerName", "Test simulator")
                putInt("vendorId", 0x1209)
                putInt("productId", 0x4853)
                putNull("serialNumber")
                putBoolean("connected", true)
                putBoolean("simulated", true)
                putBoolean("receiveProtocolVerified", false)
            })
        } else {
            currentDevice?.let { device -> putMap("dongle", deviceMap(device)) }
        }
    }

    private fun deviceMap(device: UsbDevice): WritableMap = Arguments.createMap().apply {
        val id = "%04X:%04X".format(device.vendorId, device.productId)
        putString("deviceName", device.productName?.takeIf { it.isNotBlank() } ?: "IR Dongle ($id)")
        putString("manufacturerName", device.manufacturerName)
        putInt("vendorId", device.vendorId)
        putInt("productId", device.productId)
        val serial = if (usbManager.hasPermission(device)) {
            try {
                device.serialNumber
            } catch (_: SecurityException) {
                null // Serial access can be revoked while building the descriptor.
            }
        } else null
        putString("serialNumber", serial)
        putBoolean("connected", true)
        putBoolean("simulated", false)
        putBoolean("receiveProtocolVerified", false)
        putString("transport", UsbDongleIds.find(device.vendorId, device.productId)?.transport)
    }

    private fun startSimulator() {
        if (simulatorJob?.isActive == true) return
        transition("ready")
        simulatorJob = scope.launch {
            var tick = 0
            while (isActive && simulatorMode) {
                delay(1200)
                tick += 1
                val aed = tick % 5 < 2
                val command = if (aed) 0x10 else tick % 16
                val payload = if (aed) byteArrayOf(0x48, 0x53, 0x10, 0x01) else ByteArray(0)
                val bytes = IrFrameCodec.encodeFrame(38000, necTimings(if (aed) 0xA1 else 0x20, command), payload)
                val (frames, _) = IrFrameCodec.extractFrames(bytes, System.currentTimeMillis())
                frames.forEach { emitFrame(it) }
            }
        }
    }

    private fun stopSimulator() {
        simulatorJob?.cancel()
        simulatorJob = null
        idleJob?.cancel()
        idleJob = null
    }

    private fun emitFrame(frame: DecodedNativeFrame) {
        lastReceivedAtMs = frame.receivedAtMs
        transition("receiving")
        val map = Arguments.createMap().apply {
            putDouble("receivedAtMs", frame.receivedAtMs.toDouble())
            if (frame.carrierHz == null) putNull("carrierHz") else putInt("carrierHz", frame.carrierHz)
            putArray("timingsUs", Arguments.createArray().apply {
                frame.timingsUs.forEach { pushInt(it) }
            })
            putString("frameBytesHex", frame.frameBytesHex)
        }
        emit(EVENT_FRAME, map)
        idleJob?.cancel()
        idleJob = scope.launch {
            delay(750)
            if (simulatorMode && simulatorJob?.isActive == true) transition("ready")
        }
    }

    private fun necTimings(address: Int, command: Int): IntArray {
        val timings = mutableListOf(9000, -4500)
        for (value in listOf(address, address.inv(), command, command.inv())) {
            for (bit in 0 until 8) {
                timings.add(560)
                timings.add(if ((value shr bit) and 1 == 1) -1690 else -560)
            }
        }
        timings.add(560)
        return timings.toIntArray()
    }

    private fun emitError(errorCode: String, errorMessage: String) {
        emit(EVENT_ERROR, Arguments.createMap().apply {
            putString("code", errorCode)
            putString("message", errorMessage)
        })
    }

    private fun emit(event: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(event, params)
        }
    }

    private fun Intent.usbDeviceCompat(): UsbDevice? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            getParcelableExtra(UsbManager.EXTRA_DEVICE)
        }
}
