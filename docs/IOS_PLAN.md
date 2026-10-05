# iOS plan (not implemented in this Android-first release)

Apple platforms do **not** expose a general USB host API comparable to Android `UsbManager` for arbitrary USB-C IR dongles.

## Options

1. **MFi External Accessory (EAAccessory)**  
   Requires an MFi-certified dongle that speaks the External Accessory protocol. Implement a Swift native module (`IrDongle.swift`) mirroring the Android bridge API and events. Needs Apple MFi enrollment and vendor protocol docs.

2. **Lightning/USB accessories via DriverKit / custom hardware**  
   Only viable for first-party or tightly partnered silicon; not available for generic CH340/CP210x UART IR receivers on App Store apps.

3. **Network/BLE bridge accessory**  
   Pair the IR receiver with a small BLE or Wi-Fi bridge (firmware on ESP32, etc.). iOS talks CoreBluetooth; Android can keep direct USB. Domain layer stays identical; only `DongleService` transport changes.

## Recommended approach for HS

- Keep TypeScript domain/services unchanged.
- Add `ios/HSIRCapture/IrDongle.swift` implementing the same method/event contract as `docs/NATIVE_BRIDGE_API.md`.
- Ship iOS initially with **simulator mode only** for UI demos.
- Productize iOS when an MFi or BLE bridge dongle SKU is selected.

## Limitations to communicate to stakeholders

- Generic USB-UART IR dongles that work on Android will **not** work on iOS without MFi/BLE redesign.
- Background IR capture on iOS is more constrained (background modes, accessory disconnect rules).
