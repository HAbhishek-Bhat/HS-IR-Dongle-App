package com.hsircapture.usb

import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import com.hsircapture.ir.DecodedNativeFrame
import com.hsircapture.ir.IrFrameCodec
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Bulk USB read loop for CDC/UART-style IR dongles.
 * Uses a dedicated IO dispatcher coroutine; frames are emitted via callback.
 */
class UsbSerialReader(
    private val usbManager: UsbManager,
    private val onFrame: (DecodedNativeFrame) -> Unit,
    private val onError: (code: String, message: String) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val running = AtomicBoolean(false)
    private val mutex = Mutex()
    private var readJob: Job? = null
    private var connection: UsbDeviceConnection? = null
    private var usbInterface: UsbInterface? = null
    private var inEndpoint: UsbEndpoint? = null
    private var remainder = ByteArray(0)

    suspend fun start(device: UsbDevice) {
        mutex.withLock {
            if (running.get()) return
            val conn = usbManager.openDevice(device)
            if (conn == null) {
                onError("USB_OPEN_FAILED", "Unable to open USB device connection.")
                return
            }

            val iface = selectDataInterface(device)
            if (iface == null) {
                conn.close()
                onError("USB_NO_INTERFACE", "No suitable USB data interface found.")
                return
            }
            if (!conn.claimInterface(iface, true)) {
                conn.close()
                onError("USB_CLAIM_FAILED", "Failed to claim USB interface.")
                return
            }

            val endpoint = selectBulkInEndpoint(iface)
            if (endpoint == null) {
                conn.releaseInterface(iface)
                conn.close()
                onError("USB_NO_ENDPOINT", "No bulk IN endpoint on IR dongle.")
                return
            }

            // Best-effort line coding for CDC ACM (ignored by non-CDC chips)
            configureCdcLineCoding(conn, iface, baudRate = 115200)

            connection = conn
            usbInterface = iface
            inEndpoint = endpoint
            remainder = ByteArray(0)
            running.set(true)

            readJob = scope.launch {
                val buffer = ByteArray(endpoint.maxPacketSize.coerceAtLeast(64))
                while (isActive && running.get()) {
                    val len = try {
                        conn.bulkTransfer(endpoint, buffer, buffer.size, 250)
                    } catch (t: Throwable) {
                        onError("USB_READ_EXCEPTION", t.message ?: "USB read failed")
                        break
                    }
                    when {
                        len == null || len < 0 -> {
                            // timeout — continue; allows hot-unplug detection via connection state
                            continue
                        }
                        len == 0 -> continue
                        else -> {
                            val chunk = buffer.copyOf(len)
                            val combined = remainder + chunk
                            val (frames, rest) = IrFrameCodec.extractFrames(
                                combined,
                                receivedAtMs = System.currentTimeMillis(),
                            )
                            remainder = rest
                            frames.forEach(onFrame)
                        }
                    }
                }
            }
        }
    }

    suspend fun stop() {
        mutex.withLock {
            running.set(false)
            readJob?.cancelAndJoin()
            readJob = null
            try {
                usbInterface?.let { connection?.releaseInterface(it) }
            } catch (_: Throwable) {
            }
            try {
                connection?.close()
            } catch (_: Throwable) {
            }
            connection = null
            usbInterface = null
            inEndpoint = null
            remainder = ByteArray(0)
        }
    }

    fun isRunning(): Boolean = running.get()

    private fun selectDataInterface(device: UsbDevice): UsbInterface? {
        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            if (selectBulkInEndpoint(iface) != null) return iface
        }
        return if (device.interfaceCount > 0) device.getInterface(0) else null
    }

    private fun selectBulkInEndpoint(iface: UsbInterface): UsbEndpoint? {
        for (i in 0 until iface.endpointCount) {
            val endpoint = iface.getEndpoint(i)
            if (endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK &&
                endpoint.direction == UsbConstants.USB_DIR_IN
            ) {
                return endpoint
            }
        }
        return null
    }

    private fun configureCdcLineCoding(conn: UsbDeviceConnection, iface: UsbInterface, baudRate: Int) {
        // CDC SET_LINE_CODING (0x20) — ignored if not CDC
        val lineCoding = ByteArray(7)
        lineCoding[0] = (baudRate and 0xFF).toByte()
        lineCoding[1] = ((baudRate shr 8) and 0xFF).toByte()
        lineCoding[2] = ((baudRate shr 16) and 0xFF).toByte()
        lineCoding[3] = ((baudRate shr 24) and 0xFF).toByte()
        lineCoding[4] = 0 // 1 stop bit
        lineCoding[5] = 0 // no parity
        lineCoding[6] = 8 // 8 data bits
        try {
            conn.controlTransfer(
                0x21,
                0x20,
                0,
                iface.id,
                lineCoding,
                lineCoding.size,
                500,
            )
            // SET_CONTROL_LINE_STATE
            conn.controlTransfer(0x21, 0x22, 0x0003, iface.id, null, 0, 500)
        } catch (_: Throwable) {
            // Non-CDC devices may throw or ignore — safe to continue
        }
    }
}
