package com.hsircapture

import android.hardware.usb.UsbConstants
import com.google.common.truth.Truth.assertThat
import com.hsircapture.usb.UsbSerialReader
import com.hsircapture.usb.UsbCaptureDelivery
import com.hsircapture.usb.UsbFrameAcknowledgements
import com.hsircapture.ir.DecodedNativeFrame
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

class UsbSerialReaderTest {
    @Test
    fun bulkAndHidInterruptInputAreReadableRegardlessOfInterfaceClass() {
        assertThat(UsbSerialReader.isReadableEndpoint(
            UsbConstants.USB_DIR_IN, UsbConstants.USB_ENDPOINT_XFER_BULK,
        )).isTrue()
        assertThat(UsbSerialReader.isReadableEndpoint(
            UsbConstants.USB_DIR_IN, UsbConstants.USB_ENDPOINT_XFER_INT,
        )).isTrue()
    }

    @Test
    fun noOutputControlOrIsochronousEndpointIsQueued() {
        for (direction in listOf(UsbConstants.USB_DIR_IN, UsbConstants.USB_DIR_OUT)) {
            for (type in 0..3) {
                assertThat(UsbSerialReader.isReadableEndpoint(direction, type)).isEqualTo(
                    direction == UsbConstants.USB_DIR_IN &&
                        type in listOf(UsbConstants.USB_ENDPOINT_XFER_BULK, UsbConstants.USB_ENDPOINT_XFER_INT),
                )
            }
        }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun slowConsumerBackpressuresAndDrainsEveryChunkInOrder() = runTest {
        val gate = CompletableDeferred<Unit>()
        val received = mutableListOf<DecodedNativeFrame>()
        val delivery = UsbCaptureDelivery(this, capacity = 1) {
            gate.await()
            received += it
        }
        val frames = (0..4).map {
            DecodedNativeFrame(it.toLong(), null, intArrayOf(), "%02X".format(it),
                interfaceId = 2, endpointAddress = 0x81, endpointType = 3, payloadKind = "raw")
        }
        val producer = launch { frames.forEach { delivery.send(it) } }
        runCurrent()
        assertThat(producer.isCompleted).isFalse()
        assertThat(received).isEmpty()
        gate.complete(Unit)
        producer.join()
        assertThat(delivery.closeAndDrain()).isNull()
        assertThat(received).containsExactlyElementsIn(frames).inOrder()
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun gracefulCloseDrainsAlreadyReadChunksWaitingForCapacity() = runTest {
        val gate = CompletableDeferred<Unit>()
        val received = mutableListOf<String?>()
        val delivery = UsbCaptureDelivery(this, capacity = 1) {
            gate.await()
            received += it.frameBytesHex
        }
        val producer = launch {
            for (hex in listOf("AA", "55", "FF")) {
                delivery.send(DecodedNativeFrame(1, null, intArrayOf(), hex, payloadKind = "raw"))
            }
        }
        runCurrent()
        gate.complete(Unit)
        producer.join()
        assertThat(delivery.closeAndDrain()).isNull()
        assertThat(received).containsExactly("AA", "55", "FF").inOrder()
    }

    @Test
    fun deliveryFailureIsReportedRatherThanSilentlyContinuing() = runTest {
        val delivery = UsbCaptureDelivery(this) { throw IllegalStateException("delivery unavailable") }
        delivery.send(DecodedNativeFrame(1, null, intArrayOf(), "FF", payloadKind = "raw"))
        assertThat(delivery.closeAndDrain()?.message).isEqualTo("delivery unavailable")
        var reported = false
        try {
            delivery.ensureHealthy()
        } catch (_: IllegalStateException) {
            reported = true
        }
        assertThat(reported).isTrue()
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun bridgeWaitsForMatchingAckBeforeNextPayload() = runTest {
        val acks = UsbFrameAcknowledgements()
        val emitted = mutableListOf<Long>()
        val delivery = UsbCaptureDelivery(this) {
            val (id, ack) = acks.begin()
            emitted += id
            ack.await()
        }
        repeat(2) { delivery.send(DecodedNativeFrame(1, null, intArrayOf(), "FF", payloadKind = "raw")) }
        runCurrent()
        assertThat(emitted).containsExactly(1L)
        acks.acknowledge(2.0)
        acks.acknowledge(Double.NaN)
        runCurrent()
        assertThat(emitted).containsExactly(1L)
        acks.acknowledge(1.0)
        runCurrent()
        assertThat(emitted).containsExactly(1L, 2L).inOrder()
        acks.acknowledge(1.0)
        assertThat(acks.pendingId).isEqualTo(2L)
        acks.acknowledge(2.0)
        assertThat(delivery.closeAndDrain()).isNull()
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun cleanupCancelsAckAndUnblocksProducerWithFullQueue() = runTest {
        val acks = UsbFrameAcknowledgements()
        val delivery = UsbCaptureDelivery(this, capacity = 1) {
            acks.begin().second.await()
        }
        val producer = launch {
            repeat(3) { delivery.send(DecodedNativeFrame(1, null, intArrayOf(), "AA", payloadKind = "raw")) }
        }
        runCurrent()
        assertThat(producer.isCompleted).isFalse()
        val oldId = acks.pendingId!!
        acks.cancelPending()
        delivery.abort()
        producer.cancel()
        producer.join()
        assertThat(delivery.closeAndDrain()).isNotNull()
        val (newId, pending) = acks.begin()
        assertThat(newId).isGreaterThan(oldId)
        acks.acknowledge(oldId.toDouble())
        assertThat(pending.isCompleted).isFalse()
        acks.cancelPending()
        assertThat(pending.isCancelled).isTrue()
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun gracefulStopRetainsBlockedAcquiredChunkAndWaitsForAllAcks() = runTest {
        val acks = UsbFrameAcknowledgements()
        val emitted = mutableListOf<String?>()
        val delivery = UsbCaptureDelivery(this, capacity = 1) {
            emitted += it.frameBytesHex
            acks.begin().second.await()
        }
        var pending: DecodedNativeFrame? = null
        val producer = launch {
            for (hex in listOf("AA", "55", "FF")) {
                pending = DecodedNativeFrame(1, null, intArrayOf(), hex, payloadKind = "raw")
                delivery.send(pending!!)
                pending = null
            }
        }
        runCurrent()
        producer.cancel()
        producer.join()
        assertThat(pending?.frameBytesHex).isEqualTo("FF")
        val shutdown = launch {
            pending?.let { delivery.send(it) }
            delivery.closeAndDrain()
        }
        runCurrent()
        assertThat(shutdown.isCompleted).isFalse()
        repeat(3) {
            acks.acknowledge(acks.pendingId!!.toDouble())
            runCurrent()
        }
        shutdown.join()
        assertThat(emitted).containsExactly("AA", "55", "FF").inOrder()
    }

    @Test
    fun unacknowledgedDrainCanTimeOutAndAbortWithoutHangingCleanup() = runTest {
        val acks = UsbFrameAcknowledgements()
        val delivery = UsbCaptureDelivery(this) { acks.begin().second.await() }
        delivery.send(DecodedNativeFrame(1, null, intArrayOf(), "AA", payloadKind = "raw"))
        var incomplete = false
        try {
            withTimeout(5000) { delivery.closeAndDrain() }
        } catch (_: TimeoutCancellationException) {
            incomplete = true
            delivery.abort()
            delivery.closeAndDrain()
            acks.cancelPending()
        }
        assertThat(incomplete).isTrue()
        assertThat(acks.pendingId).isNull()
    }

    @Test
    fun deliveryIdsNeverRestartAfterSuccessfulSessionOrReconnect() {
        val acks = UsbFrameAcknowledgements()
        val (firstId, first) = acks.begin()
        acks.acknowledge(firstId.toDouble())
        assertThat(first.isCompleted).isTrue()
        acks.cancelPending()
        val (nextId, next) = acks.begin()
        assertThat(nextId).isGreaterThan(firstId)
        acks.acknowledge(firstId.toDouble())
        assertThat(next.isCompleted).isFalse()
        acks.acknowledge(nextId.toDouble())
        assertThat(next.isCompleted).isTrue()
    }
}
