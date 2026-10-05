package com.hsircapture.usb

import android.hardware.usb.*
import com.hsircapture.ir.DecodedNativeFrame
import com.hsircapture.ir.IrFrameCodec
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.nio.ByteBuffer
import java.util.concurrent.TimeoutException

/**
 * One request-wait owner per connection, with a request for every readable endpoint.
 * The bounded delivery queue suspends acquisition instead of discarding completed reads.
 * No vendor requests, HID output reports, or inferred chipset initialisation are sent.
 */
class UsbSerialReader(
    private val usbManager: UsbManager,
    private val onFrame: suspend (DecodedNativeFrame) -> Unit,
    private val onError: suspend (String, String) -> Unit,
    private val onPhysicalRead: suspend (Int) -> Unit = {},
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()
    @Volatile private var readJob: Job? = null
    @Volatile private var deviceId: Int? = null
    @Volatile private var stopping = false
    @Volatile var cdcConfiguration: String = "not attempted"
        private set

    suspend fun start(device: UsbDevice): Boolean = withContext(Dispatchers.IO) {
        mutex.withLock {
            if (readJob?.isActive == true && deviceId == device.deviceId) return@withLock true
            readJob?.cancelAndJoin()
            val conn = usbManager.openDevice(device)
            if (conn == null) {
                onError("USB_OPEN_FAILED", "Unable to open USB device.")
                return@withLock false
            }
            val claimed = mutableListOf<UsbInterface>()
            val requests = mutableMapOf<UsbRequest, Pair<UsbInterface, ByteBuffer>>()
            cdcConfiguration = "not applicable"
            try {
                val profile = UsbDongleIds.find(device.vendorId, device.productId)
                for (index in 0 until device.interfaceCount) {
                    val iface = device.getInterface(index)
                    val inputs = (0 until iface.endpointCount).map { iface.getEndpoint(it) }.filter {
                        isReadableEndpoint(it.direction, it.type)
                    }
                    val cdc = iface.interfaceClass == UsbConstants.USB_CLASS_COMM &&
                        iface.interfaceSubclass == 2
                    if (inputs.isEmpty() && !cdc) continue
                    check(conn.claimInterface(iface, true)) { "claim" }
                    claimed += iface
                    if (cdc) {
                        val baud = profile?.cdcBaudRate ?: 115200
                        val configured = try { configureCdc(conn, iface, baud) } catch (_: Exception) { false }
                        cdcConfiguration = "interface=${iface.id} baud=$baud accepted=$configured"
                    }
                    for (endpoint in inputs) {
                        val request = UsbRequest()
                        requests[request] = iface to ByteBuffer.allocateDirect(
                            endpoint.maxPacketSize.coerceAtLeast(1),
                        )
                        check(request.initialize(conn, endpoint)) { "initialise" }
                        val buffer = requests.getValue(request).second
                        check(request.queue(buffer)) { "queue" }
                    }
                }
                check(requests.isNotEmpty()) { "no input" }
            } catch (_: Exception) {
                requests.keys.forEach { try { it.cancel(); it.close() } catch (_: Exception) {} }
                claimed.forEach { try { conn.releaseInterface(it) } catch (_: Exception) {} }
                try { conn.close() } catch (_: Exception) {}
                onError("USB_SETUP_FAILED", "Cannot claim or queue all USB input endpoints.")
                return@withLock false
            }
            deviceId = device.deviceId
            stopping = false
            readJob = scope.launch {
                var readFailed = false
                var pendingChunk: DecodedNativeFrame? = null
                // Producer closes USB first; consumer then drains acknowledged deliveries.
                val remainders = mutableMapOf<Pair<Int, Int>, ByteArray>()
                val profile = UsbDongleIds.find(device.vendorId, device.productId)
                val delivery = UsbCaptureDelivery(scope) { chunk ->
                    onFrame(chunk)
                    if (profile?.codecProfile == UsbDongleIds.CodecProfile.SYNTHETIC_AA55) {
                        val key = chunk.interfaceId!! to chunk.endpointAddress!!
                        val bytes = hexBytes(chunk.frameBytesHex!!)
                        val (frames, rest) = IrFrameCodec.extractFrames(
                            (remainders[key] ?: ByteArray(0)) + bytes, chunk.receivedAtMs,
                        )
                        remainders[key] = rest
                        frames.forEach { onFrame(it.copy(
                            interfaceId = chunk.interfaceId,
                            endpointAddress = chunk.endpointAddress,
                            endpointType = chunk.endpointType,
                        )) }
                    }
                }
                try {
                    while (isActive) {
                        delivery.ensureHealthy()
                        val request = try {
                            // Exactly one connection-wide waiter dispatches every completion by request.
                            conn.requestWait(250)
                        } catch (_: TimeoutException) {
                            check(usbManager.deviceList.values.any {
                                it.deviceId == device.deviceId && it.deviceName == device.deviceName &&
                                    it.vendorId == device.vendorId && it.productId == device.productId
                            } && usbManager.hasPermission(device)) { "USB detached or permission revoked" }
                            continue
                        } ?: error("request wait")
                        val (iface, buffer) = requests[request] ?: error("unknown request")
                        val receivedAt = System.currentTimeMillis()
                        val size = buffer.position()
                        if (size > 0) {
                            buffer.flip()
                            val bytes = ByteArray(size)
                            buffer.get(bytes)
                            pendingChunk = DecodedNativeFrame(
                                receivedAt, null, intArrayOf(), IrFrameCodec.toHex(bytes),
                                iface.id, request.endpoint.address, request.endpoint.type, "raw",
                            )
                            withContext(NonCancellable) { onPhysicalRead(size) }
                            delivery.send(pendingChunk)
                            pendingChunk = null
                        }
                        buffer.clear()
                        check(request.queue(buffer)) { "requeue" }
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    readFailed = true
                } finally {
                    withContext(NonCancellable) {
                        requests.keys.forEach { request ->
                            try { request.cancel(); request.close() } catch (_: Exception) {}
                        }

                        claimed.forEach { try { conn.releaseInterface(it) } catch (_: Exception) {} }
                        try { conn.close() } catch (_: Exception) {}
                        try {
                            withTimeout(5000) {
                                pendingChunk?.let { delivery.send(it) }
                                if (delivery.closeAndDrain() != null) readFailed = true
                            }
                        } catch (_: TimeoutCancellationException) {
                            delivery.abort()
                            delivery.closeAndDrain()
                            onError("USB_DELIVERY_INCOMPLETE",
                                "USB input closed, but queued bytes could not finish JS delivery within 5 seconds.")
                        }
                        if (readFailed && !stopping) onError("USB_READ_FAILED", "USB input stopped. Reconnect to retry.")
                    }
                }
            }
            true
        }
    }

    suspend fun stop() = withContext(Dispatchers.IO) {
        mutex.withLock {
            stopping = true
            readJob?.cancelAndJoin()
            readJob = null
            deviceId = null
        }
    }

    suspend fun close() {
        stop()
        scope.cancel()
    }

    fun isRunning(): Boolean = readJob?.isActive == true

    private fun configureCdc(conn: UsbDeviceConnection, iface: UsbInterface, baud: Int): Boolean {
        require(baud > 0)
        val coding = byteArrayOf(
            baud.toByte(), (baud shr 8).toByte(), (baud shr 16).toByte(), (baud shr 24).toByte(),
            0, 0, 8,
        )
        val lineCoding = conn.controlTransfer(0x21, 0x20, 0, iface.id, coding, 7, 500)
        val lineState = conn.controlTransfer(0x21, 0x22, 3, iface.id, null, 0, 500)
        return lineCoding == 7 && lineState >= 0
    }

    companion object {
        fun isReadableEndpoint(direction: Int, type: Int): Boolean =
            direction == UsbConstants.USB_DIR_IN &&
                (type == UsbConstants.USB_ENDPOINT_XFER_BULK ||
                    type == UsbConstants.USB_ENDPOINT_XFER_INT)

        private fun hexBytes(hex: String): ByteArray =
            ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
    }
}

internal class UsbCaptureDelivery(
    scope: CoroutineScope,
    capacity: Int = 64,
    onFrame: suspend (DecodedNativeFrame) -> Unit,
) {
    private val chunks = Channel<DecodedNativeFrame>(capacity)
    @Volatile private var failure: Exception? = null
    private val job = scope.launch {
        try {
            for (frame in chunks) onFrame(frame)
        } catch (error: Exception) {
            failure = error
            chunks.close(error)
        }
    }

    suspend fun send(frame: DecodedNativeFrame) { chunks.send(frame) }

    fun ensureHealthy() {
        failure?.let { throw it }
    }

    fun abort() {
        chunks.cancel(CancellationException("USB capture stopped before delivery acknowledgement."))
        job.cancel()
    }

    suspend fun closeAndDrain(): Exception? {
        chunks.close()
        job.join()
        return failure
    }
}
