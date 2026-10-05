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
        assertThat(frame.frameBytesHex).isEqualTo(IrFrameCodec.toHex(encoded))
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

    @Test
    fun everyFragmentBoundaryPreservesFullFrame() {
        val encoded = IrFrameCodec.encodeFrame(38000, intArrayOf(560, -560), byteArrayOf(1, 2, 3))
        for (split in 0..encoded.size) {
            val (first, remainder) = IrFrameCodec.extractFrames(encoded.copyOfRange(0, split), 10)
            val (second, rest) = IrFrameCodec.extractFrames(
                remainder + encoded.copyOfRange(split, encoded.size), 20,
            )
            assertThat(first + second).hasSize(1)
            assertThat((first + second).single().frameBytesHex).isEqualTo(IrFrameCodec.toHex(encoded))
            assertThat(rest).isEmpty()
        }
    }

    @Test
    fun byteByByteFragmentationAndTrailingSync() {
        val encoded = IrFrameCodec.encodeFrame(0, intArrayOf(1, -1))
        var remainder = byteArrayOf(7, 8, 0xAA.toByte())
        val frames = mutableListOf<com.hsircapture.ir.DecodedNativeFrame>()
        for (byte in encoded) {
            val (found, rest) = IrFrameCodec.extractFrames(remainder + byte, 99)
            frames += found
            remainder = rest
        }
        assertThat(frames).hasSize(1)
        assertThat(frames.single().receivedAtMs).isEqualTo(99)
        assertThat(frames.single().carrierHz).isNull()
        assertThat(remainder).isEmpty()
    }

    @Test
    fun backToBackAndMinimalFrame() {
        val empty = IrFrameCodec.encodeFrame(0, intArrayOf())
        val full = IrFrameCodec.encodeFrame(40000, intArrayOf(100, -200))
        val (frames, remainder) = IrFrameCodec.extractFrames(empty + full, 55)
        assertThat(frames.map { it.frameBytesHex }).containsExactly(
            IrFrameCodec.toHex(empty), IrFrameCodec.toHex(full),
        ).inOrder()
        assertThat(remainder).isEmpty()
    }

    @Test
    fun corruptCrcFollowedByValidFrameRecovers() {
        val valid = IrFrameCodec.encodeFrame(38000, intArrayOf(10, -20))
        val corrupt = valid.copyOf().apply { this[lastIndex] = (this[lastIndex].toInt() xor 1).toByte() }
        val (frames, _) = IrFrameCodec.extractFrames(corrupt + valid, 1)
        assertThat(frames).hasSize(1)
        assertThat(frames.single().frameBytesHex).isEqualTo(IrFrameCodec.toHex(valid))
    }

    @Test
    fun corruptIncompleteLengthDoesNotHideFollowingValidFrame() {
        val valid = IrFrameCodec.encodeFrame(38000, intArrayOf(1, -2))
        val corrupt = byteArrayOf(0xAA.toByte(), 0x55, 0x00, 0x07, 1, 2)
        val (frames, remainder) = IrFrameCodec.extractFrames(corrupt + valid, 1)
        assertThat(frames).hasSize(1)
        assertThat(remainder).isEmpty()
    }

    @Test
    fun invalidCountWithValidCrcDoesNotDecodeOrHideNextFrame() {
        val valid = IrFrameCodec.encodeFrame(38000, intArrayOf(1, -2))
        val invalid = valid.copyOf().apply {
            this[8] = 0xFF.toByte()
            this[9] = 0x7F
            this[lastIndex] = IrFrameCodec.crc8(this, 0, size - 1).toByte()
        }
        val (frames, _) = IrFrameCodec.extractFrames(invalid + valid, 1)
        assertThat(frames).hasSize(1)
        assertThat(frames.single().frameBytesHex).isEqualTo(IrFrameCodec.toHex(valid))
    }

    @Test
    fun noiseOnlyRetainsPotentialSyncByte() {
        val (_, remainder) = IrFrameCodec.extractFrames(ByteArray(10000) { 1 } + 0xAA.toByte(), 1)
        assertThat(remainder.toList()).containsExactly(0xAA.toByte())
    }

    @Test
    fun hexPreservesUnsignedBytes() {
        assertThat(IrFrameCodec.toHex(byteArrayOf(0, 0x7F, 0x80.toByte(), 0xFF.toByte())))
            .isEqualTo("007F80FF")
    }

    @Test(expected = IllegalArgumentException::class)
    fun encoderRejectsTruncatedTimings() {
        IrFrameCodec.encodeFrame(38000, intArrayOf(40000))
    }
}
