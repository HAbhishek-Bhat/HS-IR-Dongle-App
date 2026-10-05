package com.hsircapture

import com.google.common.truth.Truth.assertThat
import com.hsircapture.ir.IrFrameCodec
import org.junit.Test

class IrFrameCodecTest {
    @Test
    fun encodeAndExtract_roundTripsTimings() {
        val timings = intArrayOf(9000, -4500, 560, -1690, 560, -560)
        val encoded = IrFrameCodec.encodeFrame(38000, timings, byteArrayOf(0x48, 0x53, 0x10))
        val (frames, remainder) = IrFrameCodec.extractFrames(encoded, receivedAtMs = 1234L)

        assertThat(remainder).isEmpty()
        assertThat(frames).hasSize(1)
        val frame = frames.first()
        assertThat(frame.carrierHz).isEqualTo(38000)
        assertThat(frame.timingsUs.toList()).isEqualTo(timings.toList())
        assertThat(frame.receivedAtMs).isEqualTo(1234L)
        assertThat(frame.frameBytesHex).contains("4853")
    }

    @Test
    fun extractFrames_skipsCorruptedCrc() {
        val timings = intArrayOf(9000, -4500)
        val encoded = IrFrameCodec.encodeFrame(38000, timings)
        encoded[encoded.lastIndex] = (encoded[encoded.lastIndex].toInt() xor 0xFF).toByte()
        val (frames, _) = IrFrameCodec.extractFrames(encoded, receivedAtMs = 1L)
        assertThat(frames).isEmpty()
    }

    @Test
    fun crc8_isDeterministic() {
        val data = byteArrayOf(0xAA.toByte(), 0x55, 0x01, 0x02)
        assertThat(IrFrameCodec.crc8(data, 0, data.size)).isEqualTo(IrFrameCodec.crc8(data, 0, data.size))
    }
}
