package com.hsircapture

import com.google.common.truth.Truth.assertThat
import com.hsircapture.usb.UsbDongleIds
import org.junit.Test

class UsbDongleIdsTest {
    @Test
    fun identifiesConnectedElksmartWithoutClaimingSerialTransport() {
        val profile = UsbDongleIds.find(0x045C, 0x0132)
        assertThat(profile?.label).isEqualTo("ELKSMART Smart IR Blaster")
        assertThat(profile?.transport).isEqualTo("vendor-specific USB (FF/F0)")
    }

    @Test
    fun ignoresUnrelatedUsbDevices() {
        assertThat(UsbDongleIds.isSupported(0xFFFF, 0x0001)).isFalse()
        assertThat(UsbDongleIds.find(0xFFFF, 0x0001)).isNull()
    }

    @Test
    fun identificationListHasNoDuplicatePairs() {
        val pairs = UsbDongleIds.SUPPORTED.map { it.vendorId to it.productId }
        assertThat(pairs.toSet()).hasSize(pairs.size)
    }
}
