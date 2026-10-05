package com.hsircapture.usb

/**
 * Identification allowlist, not a guarantee of IR receive capability.
 * No physical receive protocol or chipset driver is verified in this build.
 */
object UsbDongleIds {
    enum class CodecProfile { RAW, SYNTHETIC_AA55 }

    data class VidPid(
        val vendorId: Int,
        val productId: Int,
        val label: String,
        val transport: String = "unverified USB-UART",
        val codecProfile: CodecProfile = CodecProfile.RAW,
        val cdcBaudRate: Int = 115200,
    )

    val SUPPORTED: List<VidPid> = listOf(
        VidPid(0x045C, 0x0132, "ELKSMART Smart IR Blaster", "vendor-specific USB (FF/F0)"),
        VidPid(0x1A86, 0x7523, "CH340 IR Dongle"),
        VidPid(0x1A86, 0x5523, "CH341 IR Dongle"),
        VidPid(0x10C4, 0xEA60, "CP210x IR Dongle"),
        VidPid(0x10C4, 0xEA70, "CP2105 IR Dongle"),
        VidPid(0x0403, 0x6001, "FTDI FT232 IR Dongle"),
        VidPid(0x0403, 0x6015, "FTDI FT231X IR Dongle"),
        VidPid(0x067B, 0x2303, "Prolific PL2303 IR Dongle"),
        // Placeholder HS engineering VID/PID for lab builds
        VidPid(0x1209, 0x4853, "HS IR Capture Dongle"),
    )

    fun find(vendorId: Int, productId: Int): VidPid? =
        SUPPORTED.firstOrNull { it.vendorId == vendorId && it.productId == productId }

    fun isSupported(vendorId: Int, productId: Int): Boolean = find(vendorId, productId) != null
}
