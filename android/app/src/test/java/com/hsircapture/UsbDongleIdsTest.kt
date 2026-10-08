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
        assertThat(profile?.codecProfile).isEqualTo(UsbDongleIds.CodecProfile.RAW)
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

    @Test
    fun noPhysicalDeviceInfersSyntheticFraming() {
        assertThat(UsbDongleIds.SUPPORTED.all {
            it.codecProfile == UsbDongleIds.CodecProfile.RAW && it.cdcBaudRate > 0
        }).isTrue()
    }

    @Test
    fun labCodecAndStandardCdcBaudRequireExplicitProfileConfiguration() {
        val profile = UsbDongleIds.VidPid(
            1, 2, "Explicit lab profile",
            codecProfile = UsbDongleIds.CodecProfile.SYNTHETIC_AA55, cdcBaudRate = 9600,
        )
        assertThat(profile.codecProfile).isEqualTo(UsbDongleIds.CodecProfile.SYNTHETIC_AA55)
        assertThat(profile.cdcBaudRate).isEqualTo(9600)
    }

    @Test
    fun unfamiliarDevicesRequireExplicitSelection() {
        assertThat(UsbDongleIds.selectDeviceId(listOf(3, 9), emptyList(), null, null)).isNull()
        assertThat(UsbDongleIds.selectDeviceId(listOf(3, 9), emptyList(), null, 9)).isEqualTo(9)
    }

    @Test
    fun explicitSelectionWinsAndSurvivesEnumerationWithKnownDevices() {
        assertThat(UsbDongleIds.selectDeviceId(listOf(3, 9), listOf(3), 3, 9)).isEqualTo(9)
        assertThat(UsbDongleIds.selectDeviceId(listOf(3, 9), listOf(3), 9, 9)).isEqualTo(9)
    }

    @Test
    fun knownDeviceAutoSelectionPreservesCurrentConnection() {
        assertThat(UsbDongleIds.selectDeviceId(listOf(3, 9), listOf(3, 9), 9, null)).isEqualTo(9)
        assertThat(UsbDongleIds.selectDeviceId(listOf(3, 9), listOf(3, 9), null, null)).isEqualTo(3)
    }

    @Test
    fun detachedSelectionCannotReconnectAnUnrelatedUnknownDevice() {
        assertThat(UsbDongleIds.selectDeviceId(listOf(3), emptyList(), 9, 9)).isNull()
        assertThat(UsbDongleIds.selectDeviceId(listOf(3), listOf(3), 9, 9)).isEqualTo(3)
    }
}
