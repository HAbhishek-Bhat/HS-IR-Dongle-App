package com.hsircapture.ir

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Dongle framing codec.
 *
 * Assumed default wire format (documented assumption — replace with OEM spec):
 *   [0xAA][0x55][len:u16 LE][carrierHz:u32 LE][count:u16 LE][timings:i16 LE * count][crc8][optional payload…]
 *
 * Timings are signed microseconds: positive = mark, negative = space.
 * Raw bytes are preserved as hex for exact storage.
 */
data class DecodedNativeFrame(
    val receivedAtMs: Long,
    val carrierHz: Int?,
    val timingsUs: IntArray,
    val frameBytesHex: String?,
)

object IrFrameCodec {
    private const val SYNC0: Byte = 0xAA.toByte()
    private const val SYNC1: Byte = 0x55.toByte()
    private const val MAX_TIMINGS = 512

    fun crc8(data: ByteArray, offset: Int, length: Int): Int {
        var crc = 0
        for (i in offset until offset + length) {
            crc = crc xor (data[i].toInt() and 0xFF)
            repeat(8) {
                crc = if ((crc and 0x80) != 0) {
                    ((crc shl 1) xor 0x07) and 0xFF
                } else {
                    (crc shl 1) and 0xFF
                }
            }
        }
        return crc and 0xFF
    }

    fun toHex(bytes: ByteArray): String =
        bytes.joinToString("") { b -> "%02X".format(b) }

    /**
     * Attempts to extract one or more frames from a rolling buffer.
     * Returns decoded frames and remaining unconsumed bytes.
     */
    fun extractFrames(buffer: ByteArray, receivedAtMs: Long): Pair<List<DecodedNativeFrame>, ByteArray> {
        val frames = mutableListOf<DecodedNativeFrame>()
        var offset = 0

        while (offset + 10 <= buffer.size) {
            // Seek sync
            var sync = -1
            for (i in offset until buffer.size - 1) {
                if (buffer[i] == SYNC0 && buffer[i + 1] == SYNC1) {
                    sync = i
                    break
                }
            }
            if (sync < 0) {
                return frames to ByteArray(0)
            }
            if (sync + 10 > buffer.size) {
                return frames to buffer.copyOfRange(sync, buffer.size)
            }

            val bb = ByteBuffer.wrap(buffer, sync, buffer.size - sync).order(ByteOrder.LITTLE_ENDIAN)
            bb.get() // sync0
            bb.get() // sync1
            val len = bb.short.toInt() and 0xFFFF
            if (len < 8 || len > 2048) {
                offset = sync + 2
                continue
            }
            if (sync + 2 + 2 + len + 1 > buffer.size) {
                return frames to buffer.copyOfRange(sync, buffer.size)
            }

            val payloadStart = sync + 4
            val payload = buffer.copyOfRange(payloadStart, payloadStart + len)
            val crc = buffer[payloadStart + len].toInt() and 0xFF
            val expected = crc8(buffer, sync, 4 + len)
            if (crc != expected) {
                // Corrupted frame — skip sync and continue; do not alter bytes for callers that store hex of successful frames
                offset = sync + 2
                continue
            }

            val pbb = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN)
            val carrier = pbb.int
            val count = pbb.short.toInt() and 0xFFFF
            if (count > MAX_TIMINGS || pbb.remaining() < count * 2) {
                offset = sync + 2
                continue
            }
            val timings = IntArray(count)
            for (i in 0 until count) {
                timings[i] = pbb.short.toInt()
            }
            val trailing = if (pbb.remaining() > 0) {
                val rest = ByteArray(pbb.remaining())
                pbb.get(rest)
                toHex(rest)
            } else null

            val fullFrame = buffer.copyOfRange(sync, payloadStart + len + 1)
            frames.add(
                DecodedNativeFrame(
                    receivedAtMs = receivedAtMs,
                    carrierHz = if (carrier == 0) null else carrier,
                    timingsUs = timings,
                    frameBytesHex = trailing ?: toHex(fullFrame),
                ),
            )
            offset = payloadStart + len + 1
        }

        return frames to if (offset < buffer.size) buffer.copyOfRange(offset, buffer.size) else ByteArray(0)
    }

    /** Encode a simulator frame for loopback testing. */
    fun encodeFrame(carrierHz: Int, timingsUs: IntArray, extraPayload: ByteArray = ByteArray(0)): ByteArray {
        val payloadLen = 4 + 2 + timingsUs.size * 2 + extraPayload.size
        val out = ByteBuffer.allocate(2 + 2 + payloadLen + 1).order(ByteOrder.LITTLE_ENDIAN)
        out.put(SYNC0)
        out.put(SYNC1)
        out.putShort(payloadLen.toShort())
        out.putInt(carrierHz)
        out.putShort(timingsUs.size.toShort())
        timingsUs.forEach { out.putShort(it.toShort()) }
        out.put(extraPayload)
        val bytes = out.array()
        bytes[bytes.lastIndex] = crc8(bytes, 0, bytes.size - 1).toByte()
        return bytes
    }
}
