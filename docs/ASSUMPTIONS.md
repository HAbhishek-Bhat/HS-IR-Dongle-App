# Assumptions & open questions

## Physical dongle identified on 2026-10-05

The connected phone enumerated **ELKSMART Smart IR Blaster, VID 045C /
PID 0132**. Its interface is vendor-specific FF/F0/00 (named iAP Interface),
with bulk OUT 02 and bulk IN 82, 64-byte packets.
Serial numbers are intentionally omitted from this document and diagnostic logs.

**Confirmed scope:** real USB detection, permission handling and status UI.
The user chose to gate reception until the vendor receive/learning protocol
is supplied. Descriptor identification is not proof of IR receive support.
The app reports "Receive protocol unverified" after permission and disables
capture. It does not send commands, configure a guessed baud rate or claim
"Ready to receive" for this hardware.

All physical profiles currently remain receive-unverified, including the older
USB-UART allowlist. Chipset-specific initialization is not implemented by
the legacy CDC reader. Other ELKSMART PIDs must not be substituted for 0132.
Mock mode defaults off, is an explicit development-only setting, and is
rejected by the native module in release builds.

### Must confirm before enabling reception

1. Does **045C:0132** support receive/learning, or only transmission?
2. Obtain the SDK or specification for this PID/firmware: interface selection,
   initialization, learning-mode commands, replies, timeouts and stop/reset.
3. Confirm whether serial parameters apply at all; no baud rate is inferred
   for this vendor-specific interface.
4. Confirm framing, endianness, carrier reporting, pulse units, CRC/checksum
   and maximum sustained data rate; supply non-patient test vectors.
5. Confirm AED manufacturer/model and whether signalling is demodulated remote
   IR, IrDA serial, or another physical/protocol layer.
6. Obtain OEM AED interpretation rules. The current HS-AED parser is fictional,
   not evidence of clinical event semantics.

The legacy defaults below are **lab assumptions only**, not confirmed hardware support.

## Legacy lab defaults

| Topic | Default chosen | Notes |
|-------|----------------|-------|
| Dongle transport | Legacy lab UART/CDC @ 115200 | Not applicable to the identified ELKSMART interface; no physical reader enabled |
| Identification VID/PID | ELKSMART `045C:0132`, CH340, CH341, CP210x, FTDI, PL2303, lab `1209:4853` | Allowlist for identification only; no receive support guaranteed |
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

## Manual hardware checklist

Use Android wireless debugging while the dongle occupies the phone's USB-C
port. Test only with authorized bench equipment; do not use patient data.

Verified on the connected Android phone: ELKSMART identification, receive gate
with USB permission present, disconnected status after removal/resume, and
automatic re-identification on replug. No AED receive test has been performed.
Denial/retry transitions are covered by fake-bridge tests; hardware denial,
revocation and soak checks below still need manual execution.

For debug builds, USB role changes may interrupt Metro routing. Reapply
`adb -s <wireless-device> reverse tcp:8081 tcp:8081`, set the React Native
developer server host to `127.0.0.1:8081` if localhost lookup fails, and Reload.
A standalone release avoids Metro, but release validation was blocked in this
environment by downloads of uncached Android lint dependencies (including
Groovy 3.0.17 and lint 31.6.0). Release checks were not disabled.

- Start with no dongle: "Not connected"; capture cards disabled; Retry actionable.
- Plug in 045C:0132: product/manufacturer/VID:PID displayed; permission prompt
  or current remembered permission honored.
- Deny: "Permission denied"; Grant permission available; resume does not
  repeatedly prompt.
- Grant: descriptors remain visible; **Receive protocol unverified**, not Ready.
- Attach an unrelated USB device: do not replace the selected dongle.
- Unplug: disconnected immediately; reconnect guidance; no phantom ready state.
- Replug: identified again; permission rechecked; receive gate remains.
- Background/foreground: no crash; enumerate on resume; revocation respected.
- Toggle debug simulator on/off: clearly labeled test data; physical metadata
  restored on disable; no simulator option in release.
- Repeat attachment and resume for an extended session: no duplicate events,
  dialogs or simulator jobs. Hardware soak testing is still required.

Deferred until a verified receiver/driver is supplied:

- AED transmission: validate wire-byte preservation and OEM parsing against
  known, non-patient vectors.
- Unplug mid-capture: persist a partial session, explicitly report interruption.
- Fragmentation/noise/CRC tests using **actual hardware framing**, not the
  simulator-only AA55 format.
- Burst/long-running capture: bounded native/JS queues, explicit overflow,
  no silent raw-byte loss, and measured memory/UI responsiveness.
- Background receiving: define foreground-service/power policy before claiming
  reliable Android background capture.
