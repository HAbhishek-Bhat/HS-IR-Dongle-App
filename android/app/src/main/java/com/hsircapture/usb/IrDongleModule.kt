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
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CancellationException

class IrDongleModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
    companion object {
        const val NAME = "IrDongle"
        private const val EVENT_CONNECTION = "IrDongleConnectionChanged"
        private const val EVENT_FRAME = "IrDongleFrameReceived"
        private const val EVENT_DECODED = "IrDongleDecodedSignalReceived"
        private const val EVENT_ERROR = "IrDongleError"
        private const val EVENT_PERMISSION = "IrDonglePermissionResult"
        private const val EVENT_DEVICES = "IrDongleUsbDevicesChanged"
        private const val PROTOCOL_ERROR = "RECEIVE_PROTOCOL_UNVERIFIED"
        private const val PROTOCOL_MESSAGE =
            "USB dongle identified, but its IR receive capability and protocol are unverified. " +
                "Raw USB capture is active; bytes alone do not verify an IR signal."
    }

    // State is confined to Main; suspending USB operations are serialised and run on IO.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val operations = Mutex()
    private val usbManager =
        reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
    private val permissionAction = "${reactContext.packageName}.USB_PERMISSION"
    private var currentDevice: UsbDevice? = null
    private var selectedDeviceId: Int? = null
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
    @Volatile private var invalidated = false
    private var captureStopped = false
    private var receivingEnabled = false
    private var frameCount = 0L
    private var byteCount = 0L
    private var listeningSinceMs: Long? = null
    private var receiveProtocolVerified = false
    private val acknowledgements = UsbFrameAcknowledgements()
    private val reader = UsbSerialReader(usbManager, { frame ->
        withContext(Dispatchers.Main.immediate) {
            if (active && !invalidated && receivingEnabled && !simulatorMode) {
                if (frame.payloadKind == "raw") {
                    val pending = acknowledgements.begin()
                    emitFrame(frame, pending.first)
                    pending.second.await()
                } else {
                    emitFrame(frame)
                }
            }
        }
    }, { errorCode, errorMessage ->
        withContext(Dispatchers.Main.immediate) {
            if (active && !invalidated && !simulatorMode) {
                if (errorCode == "USB_DELIVERY_INCOMPLETE") acknowledgements.cancelPending()
                receivingEnabled = false
                transition("error", errorMessage, errorCode)
                emitError(errorCode, errorMessage)
            }
        }
    }, { size ->
        withContext(Dispatchers.Main.immediate) {
            frameCount += 1
            byteCount += size
        }
    })
    private class UsbOperationException(val errorCode: String, message: String) : Exception(message)

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (!active || intent == null) return
            observe {
                val device = intent.usbDeviceCompat() ?: return@observe
                when (intent.action) {
                    UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                        if (!simulatorMode) {
                            deniedDeviceIds.remove(device.deviceId)
                            scan()
                        }
                        emitUsbDevices()
                    }
                    UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                        deniedDeviceIds.remove(device.deviceId)
                        if (selectedDeviceId == device.deviceId) selectedDeviceId = null
                        if (currentDevice?.deviceId == device.deviceId) {
                            stopPhysical()
                            currentDevice = null
                            pendingPermissionId = null
                            lastReceivedAtMs = null
                            frameCount = 0
                            byteCount = 0
                            receiveProtocolVerified = false
                            emitError("DONGLE_REMOVED", "Dongle disconnected, reconnect to continue.")
                            transition("disconnected")
                            scan()
                        }
                        emitUsbDevices()
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
                            openPhysical(device)
                        } else {
                            deniedDeviceIds.add(device.deviceId)
                            transition(
                                "permission_denied",
                                "USB permission denied. Tap Grant permission to retry.",
                                "PERMISSION_DENIED",
                            )
                        }
                        emitUsbDevices()
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

    private fun run(promise: Promise, action: suspend () -> Any?) {
        if (invalidated) {
            promise.reject("DESTROYED", "Native module has been invalidated.")
            return
        }
        scope.launch {
            if (invalidated) {
                promise.reject("DESTROYED", "Native module has been invalidated.")
                return@launch
            }
            operations.withLock {
                try {
                    if (invalidated) throw UsbOperationException("DESTROYED", "Native module has been invalidated.")
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
    }

    @ReactMethod
    fun initialize(promise: Promise) = run(promise) {
        active = true
        captureStopped = false
        registerReceiver()
        scan()
        null
    }

    @ReactMethod
    fun getConnectionState(promise: Promise) = run(promise) { connectionMap() }

    @ReactMethod
    fun listUsbDevices(promise: Promise) = run(promise) { usbDevicesArray() }

    @ReactMethod
    fun selectUsbDevice(deviceName: String, promise: Promise) = run(promise) {
        val device = usbManager.deviceList.values.firstOrNull { it.deviceName == deviceName }
            ?: throw UsbOperationException("NO_DONGLE", "The selected USB device is no longer attached.")
        if (simulatorMode) {
            throw UsbOperationException("USB_OPERATION_FAILED", "Disable simulation before selecting physical hardware.")
        }
        active = true
        captureStopped = false
        registerReceiver()
        if (currentDevice?.deviceId != device.deviceId) {
            stopPhysical()
            if (currentDevice != null) {
                emitError("DONGLE_REMOVED", "USB receiver changed. The previous capture is closed.")
                transition("disconnected")
            }
            currentDevice = null
            pendingPermissionId = null
            lastReceivedAtMs = null
        }
        selectedDeviceId = device.deviceId
        deniedDeviceIds.remove(device.deviceId)
        scan()
        emitUsbDevices()
        if (status == "unsupported") {
            throw UsbOperationException("UNSUPPORTED_DONGLE", message ?: "No compatible USB input endpoint.")
        }
        if (status == "error") {
            throw UsbOperationException(code ?: "USB_OPERATION_FAILED", message ?: "USB connection failed.")
        }
        null
    }

    @ReactMethod
    fun reconnect(promise: Promise) = run(promise) {
        active = true
        captureStopped = false
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
            openPhysical(device)
            return@run true
        }
        deniedDeviceIds.remove(device.deviceId)
        requestUsbPermission(device)
        false
    }

    @ReactMethod
    fun startListening(promise: Promise) = run(promise) {
        active = true
        captureStopped = false
        registerReceiver()
        if (!simulatorMode) {
            scan()
            if (currentDevice == null) throw UsbOperationException("NO_DONGLE", "Plug in the IR dongle.")
        } else {
            startSimulator()
        }
        null
    }

    @ReactMethod
    fun stopListening(promise: Promise) = run(promise) {
        captureStopped = true
        stopPhysical()
        stopSimulator()
        transition(if (currentDevice != null) "detected" else "disconnected")
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
            stopPhysical()
            simulatorMode = enabled
            captureStopped = false
            active = true
            registerReceiver()
            currentDevice = null
            selectedDeviceId = null
            pendingPermissionId = null
            lastReceivedAtMs = null
            frameCount = 0
            byteCount = 0
            receiveProtocolVerified = false
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

    @ReactMethod
    fun acknowledgeFrame(deliveryId: Double) {
        scope.launch { acknowledgements.acknowledge(deliveryId) }
    }

    override fun onHostResume() {
        if (active && !invalidated) {
            observe {
                registerReceiver()
                if (!simulatorMode) scan()
            }
        }
    }

    override fun onHostPause() {
        // Continue capture while the process and React bridge remain alive.
    }

    override fun onHostDestroy() {
        // Activity destruction is not module destruction (e.g. rotation/background).
    }

    override fun invalidate() {
        invalidated = true
        scope.launch {
            operations.withLock {
                cleanup()
                reader.close()
                reactContext.removeLifecycleEventListener(this@IrDongleModule)
            }
            scope.cancel()
        }
        super.invalidate()
    }

    private fun observe(action: suspend () -> Unit) {
        scope.launch {
            operations.withLock {
                try {
                    if (!active || invalidated) return@withLock
                    action()
                } catch (error: Exception) {
                    transition("error", "USB operation failed. Reconnect and retry.", "USB_OPERATION_FAILED")
                    emitError("USB_OPERATION_FAILED", "USB operation failed. Reconnect and retry.")
                }
            }
        }
    }

    private suspend fun cleanup() {
        stopPhysical()
        active = false
        stopSimulator()
        simulatorMode = false
        if (registered) {
            reactContext.unregisterReceiver(receiver)
            registered = false
        }
        currentDevice = null
        pendingPermissionId = null
        selectedDeviceId = null
        deniedDeviceIds.clear()
        lastReceivedAtMs = null
        frameCount = 0
        byteCount = 0
        receiveProtocolVerified = false
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

    private suspend fun scan(requestIfNeeded: Boolean = true) {
        if (simulatorMode) return
        val devices = usbManager.deviceList.values.toList()
        val knownIds = devices.filter {
            UsbDongleIds.isSupported(it.vendorId, it.productId)
        }.map { it.deviceId }
        val selectedId = UsbDongleIds.selectDeviceId(
            devices.map { it.deviceId }, knownIds, currentDevice?.deviceId, selectedDeviceId,
        )
        val device = devices.firstOrNull { it.deviceId == selectedId }
        if (currentDevice != null && device?.deviceId != currentDevice?.deviceId) {
            emitError("DONGLE_REMOVED", "Dongle disconnected, reconnect to continue.")
        }
        if (device == null) {
            stopPhysical()
            currentDevice = null
            pendingPermissionId = null
            transition("disconnected")
            return
        }
        if (currentDevice?.deviceId != device.deviceId) {
            stopPhysical()
            currentDevice = device
            frameCount = 0
            byteCount = 0
            lastReceivedAtMs = null
            receiveProtocolVerified = false
            pendingPermissionId = null
            transition("detected")
        }
        if (readableEndpointCount(device) == 0) {
            stopPhysical()
            transition(
                "unsupported",
                "This USB device has no bulk or interrupt input endpoint. Its transport requires a specific driver.",
                "UNSUPPORTED_DONGLE",
            )
            return
        }
        when {
            usbManager.hasPermission(device) -> openPhysical(device)
            deniedDeviceIds.contains(device.deviceId) -> {
                stopPhysical()
                transition("permission_denied", "USB permission denied. Tap Grant permission to retry.", "PERMISSION_DENIED")
            }
            requestIfNeeded -> {
                stopPhysical()
                requestUsbPermission(device)
            }
            else -> {
                stopPhysical()
                transition("permission_required")
            }
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

    private suspend fun openPhysical(device: UsbDevice) {
        if (captureStopped || reader.isRunning()) return
        receivingEnabled = true
        listeningSinceMs = System.currentTimeMillis()
        if (reader.start(device)) {
            if (status != "receiving") transition(
                "listening",
                if (receiveProtocolVerified) null else PROTOCOL_MESSAGE,
                if (receiveProtocolVerified) null else PROTOCOL_ERROR,
            )
        } else {
            receivingEnabled = false
            listeningSinceMs = null
        }
    }

    private suspend fun stopPhysical() {
        reader.stop()
        receivingEnabled = false
        acknowledgements.cancelPending()
        idleJob?.cancel()
        idleJob = null
        listeningSinceMs = null
    }

    private fun transition(next: String, nextMessage: String? = null, nextCode: String? = null) {
        status = next
        message = nextMessage
        code = nextCode
        emit(EVENT_CONNECTION, connectionMap())
    }

    private fun connectionMap(): WritableMap = Arguments.createMap().apply {
        putString("status", status)
        putDouble("frameCount", frameCount.toDouble())
        putDouble("byteCount", byteCount.toDouble())
        if (listeningSinceMs == null) putNull("listeningSinceMs")
        else putDouble("listeningSinceMs", listeningSinceMs!!.toDouble())
        putBoolean("receiveProtocolVerified", receiveProtocolVerified)
        if (message != null) putString("message", message)
        if (code != null) putString("code", code)
        if (status == "unsupported") putString("reason", message)
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
        putString("deviceName", device.productName?.takeIf { it.isNotBlank() }
            ?: UsbDongleIds.find(device.vendorId, device.productId)?.label ?: "USB Device ($id)")
        putString("manufacturerName", device.manufacturerName)
        putInt("vendorId", device.vendorId)
        putInt("productId", device.productId)
        putNull("serialNumber")
        putBoolean("connected", true)
        putBoolean("simulated", false)
        putBoolean("receiveProtocolVerified", receiveProtocolVerified)
        putString("transport", UsbDongleIds.find(device.vendorId, device.productId)?.transport
            ?: "generic raw USB input (IR capability unverified)")
    }

    private fun readableEndpointCount(device: UsbDevice): Int =
        (0 until device.interfaceCount).sumOf { index ->
            val iface = device.getInterface(index)
            (0 until iface.endpointCount).count { endpointIndex ->
                val endpoint = iface.getEndpoint(endpointIndex)
                UsbSerialReader.isReadableEndpoint(endpoint.direction, endpoint.type)
            }
        }

    private fun usbDevicesArray() = Arguments.createArray().apply {
        usbManager.deviceList.values.sortedBy { it.deviceId }.forEach { device ->
            pushMap(Arguments.createMap().apply {
                putString("deviceName", device.deviceName)
                putString("displayName", device.productName?.takeIf { it.isNotBlank() }
                    ?: UsbDongleIds.find(device.vendorId, device.productId)?.label
                    ?: "USB Device (%04X:%04X)".format(device.vendorId, device.productId))
                putString("manufacturerName", device.manufacturerName)
                putInt("vendorId", device.vendorId)
                putInt("productId", device.productId)
                putBoolean("knownProfile", UsbDongleIds.isSupported(device.vendorId, device.productId))
                putBoolean("hasPermission", usbManager.hasPermission(device))
                putBoolean("selected", !simulatorMode && currentDevice?.deviceId == device.deviceId)
                putInt("readableEndpointCount", readableEndpointCount(device))
            })
        }
    }

    private fun emitUsbDevices() {
        emit(EVENT_DEVICES, Arguments.createMap().apply {
            putArray("devices", usbDevicesArray())
        })
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

    private fun emitFrame(frame: DecodedNativeFrame, deliveryId: Long? = null) {
        if (!simulatorMode && frame.payloadKind == "decoded" &&
            frame.timingsUs.isNotEmpty() && frame.timingsUs.all { it != 0 } &&
            (frame.carrierHz == null || frame.carrierHz > 0)
        ) receiveProtocolVerified = true
        lastReceivedAtMs = frame.receivedAtMs
        transition("receiving", if (!simulatorMode && !receiveProtocolVerified) PROTOCOL_MESSAGE else null,
            if (!simulatorMode && !receiveProtocolVerified) PROTOCOL_ERROR else null)
        val map = Arguments.createMap().apply {
            putDouble("receivedAtMs", frame.receivedAtMs.toDouble())
            deliveryId?.let { putDouble("deliveryId", it.toDouble()) }
            if (frame.carrierHz == null) putNull("carrierHz") else putInt("carrierHz", frame.carrierHz)
            putArray("timingsUs", Arguments.createArray().apply {
                frame.timingsUs.forEach { pushInt(it) }
            })
            putString("frameBytesHex", frame.frameBytesHex)
            frame.interfaceId?.let { putInt("interfaceId", it) }
            frame.endpointAddress?.let { putInt("endpointAddress", it) }
            frame.endpointType?.let { putInt("endpointType", it) }
            putString("payloadKind", frame.payloadKind)
            putDouble("frameCount", frameCount.toDouble())
            putDouble("byteCount", byteCount.toDouble())
            putBoolean("receiveProtocolVerified", receiveProtocolVerified)
            if (listeningSinceMs == null) putNull("listeningSinceMs")
            else putDouble("listeningSinceMs", listeningSinceMs!!.toDouble())
        }
        emit(if (!simulatorMode && frame.payloadKind == "decoded") EVENT_DECODED else EVENT_FRAME, map)
        idleJob?.cancel()
        idleJob = scope.launch {
            delay(750)
            if (simulatorMode && simulatorJob?.isActive == true) transition("ready")
            else if (receivingEnabled && reader.isRunning()) transition("listening",
                if (receiveProtocolVerified) null else PROTOCOL_MESSAGE,
                if (receiveProtocolVerified) null else PROTOCOL_ERROR)
        }
    }

    @ReactMethod
    fun getDiagnostics(promise: Promise) = run(promise) {
        val devices = usbManager.deviceList.values.sortedBy { it.deviceId }
        buildString {
            appendLine("USB capture: $status; chunks=$frameCount bytes=$byteCount")
            appendLine("listeningSinceMs=$listeningSinceMs receiveProtocolVerified=$receiveProtocolVerified")
            appendLine("CDC standard configuration: ${reader.cdcConfiguration}")
            appendLine("Awaiting JS acknowledgement: ${acknowledgements.pendingId}")
            appendLine("Background capture: process/bridge alive only; no persistent service.")
            for (device in devices) {
                appendLine("VID:PID=%04X:%04X class=%d subclass=%d protocol=%d permission=%s".format(
                    device.vendorId, device.productId, device.deviceClass, device.deviceSubclass,
                    device.deviceProtocol, usbManager.hasPermission(device),
                ))
                val profile = UsbDongleIds.find(device.vendorId, device.productId)
                appendLine("codec=${profile?.codecProfile ?: "RAW"} CDC_ACM_baud=${profile?.cdcBaudRate ?: 115200}")
                for (index in 0 until device.interfaceCount) {
                    val iface = device.getInterface(index)
                    appendLine(" interface=${iface.id} alternate=${iface.alternateSetting} class=${iface.interfaceClass} subclass=${iface.interfaceSubclass} protocol=${iface.interfaceProtocol}")
                    for (ep in 0 until iface.endpointCount) {
                        val endpoint = iface.getEndpoint(ep)
                        appendLine("  endpoint=${endpoint.address} direction=${endpoint.direction} type=${endpoint.type} maxPacket=${endpoint.maxPacketSize} interval=${endpoint.interval}")
                    }
                }
            }
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

/** Main-confined, one outstanding bridge delivery; IDs never restart on reconnect. */
internal class UsbFrameAcknowledgements {
    private var nextId = 0L
    var pendingId: Long? = null
        private set
    private var pending: CompletableDeferred<Unit>? = null

    fun begin(): Pair<Long, CompletableDeferred<Unit>> {
        check(pending == null) { "Previous USB delivery has not been acknowledged." }
        check(nextId < 9_007_199_254_740_991L) { "USB delivery ID exhausted." }
        val id = ++nextId
        val deferred = CompletableDeferred<Unit>()
        pendingId = id
        pending = deferred
        return id to deferred
    }

    fun acknowledge(id: Double) {
        if (!id.isFinite() || id != pendingId?.toDouble()) return
        val deferred = pending
        pending = null
        pendingId = null
        deferred?.complete(Unit)
    }

    fun cancelPending() {
        val deferred = pending
        pending = null
        pendingId = null
        deferred?.cancel(CancellationException("USB capture stopped."))
    }
}
