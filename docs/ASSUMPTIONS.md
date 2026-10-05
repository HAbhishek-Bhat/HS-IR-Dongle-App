# Assumptions & open questions

## Chosen defaults (where unknown)

| Topic | Default chosen | Notes |
|-------|----------------|-------|
| Dongle transport | USB host + bulk IN UART/CDC @ 115200 | Common for CH340/CP210x/FTDI IR receivers |
| Supported VID/PID | CH340, CH341, CP210x, FTDI, PL2303, lab `0x1209/0x4853` | Extend `UsbDongleIds` + `device_filter.xml` for production SKU |
| Frame codec | `AA 55` framed timings + CRC8 | See `IrFrameCodec.kt` — replace with OEM spec |
| Timing convention | signed µs: `+mark` / `-space` | Matches common IR learning dumps |
| Cloud | REST API (`https://api.example.com/v1`) | Firebase can replace `CloudSyncClient` |
| Auth | Local email/password + Keychain tokens | Swap for SSO/OIDC without UI rewrite |
| AED example | Fictional HeartSafe HS-AED-1 (`hs-aed-v1`) | Real OEM parsers plug into the same interface |
| Encryption | Field-level Keychain-backed cipher on raw blobs | Prefer SQLCipher for HIPAA production |
| minSdk | 26 | USB host + modern permission APIs |

## Open questions

1. **Exact dongle chipset & framing** — Is the production dongle CH340 UART, a custom HID IR device, or something else? Baud rate? Endianness? Carrier reporting?
2. **AED models in scope** — Which manufacturers/models emit IR? Do we have protocol PDFs or sample captures?
3. **Cloud provider** — Confirm REST vs Firebase Firestore/Storage (or both). Auth provider?
4. **Regulatory posture** — Is the app a medical device accessory, or a service tool? Affects labeling, audit trails, and encryption bar.
5. **iOS requirement timeline** — MFi accessory vs BLE bridge vs Android-only for v1?
6. **Multi-user / org tenancy** — Single technician login or clinic-wide accounts with RBAC?

## Conflict handling (sync)

Last-write-wins using `updatedAt`. Failed uploads remain `failed` and retry with exponential backoff. Server-side merge rules should be confirmed with the backend team.
