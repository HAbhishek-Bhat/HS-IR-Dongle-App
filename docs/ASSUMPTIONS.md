# Assumptions and verification boundaries

## Physical dongle

Previously observed Android descriptors identify ELKSMART Smart IR Blaster,
VID **045C**, PID **0132**, vendor interface FF/F0/00, bulk IN 82 and OUT 02,
64-byte packets. These are identification evidence, **not proof of IR receive
capability**. No new hardware reception result is claimed by this change.

The previous receive-unverified hard gate is removed. USB permission now leads
to an open passive receiver (`listening`), without a learn command. A listening
state means the USB input transport is open, not that AED compatibility is
verified. Unknown USB reports are retained exactly as raw/unparsed data.

- No undocumented vendor commands are sent.
- ELKSMART is not CDC; no UART baud or line coding is inferred for it.
- HID interrupt IN packets are retained as opaque input reports, including any
  report-ID byte. The app does not invent pulse timings from HID bytes.
- USB-UART entries are identification profiles, not chipset drivers. Vendor
  UART initialization is not guessed. CDC settings apply only to CDC classes.
- Supported IDs and transport/codec/baud choices live in
  [UsbDongleIds.kt](../android/app/src/main/java/com/hsircapture/usb/UsbDongleIds.kt).
- The AA55 codec in [IrFrameCodec.kt](../android/app/src/main/java/com/hsircapture/ir/IrFrameCodec.kt)
  is a synthetic lab format, not an ELKSMART specification. It must not be
  automatically applied to opaque physical reports.
- NEC/RC5/SIRC decoding requires actual pulse timings in a documented format.
  An opaque USB hex report can be saved/exported but cannot yield an honest
  waveform, carrier, address or command without that specification.
- `receiveProtocolVerified` stays false for unknown reports; receiving bytes
  alone does not prove a valid IR signal.

## Default capture and grouping

App-wide AED acquisition is registered before native initialization. Every
received transfer is stored before its native delivery is acknowledged.
Each raw frame has a Unix epoch timestamp and, when provided, interface and
endpoint identifiers. These are USB chunks, not necessarily complete IR frames.
Parsed events reference their session's raw frame index.

Sessions end after **5 seconds of inactivity** (constructor-configurable), or
are marked partial on disconnect. Raw byte hashes do not select an AED or
discard other reports. This grouping is a practical capture boundary, not a
verified OEM session boundary or evidence of a unique physical AED.

Remote Test switches the acquisition source to `REMOTE_TEST` while explicitly
listening. Stop restores default AED routing; closing a capture screen does
not stop the app-wide receiver. Test traffic must be generated while Remote
Test is listening to avoid being classified as the default AED/raw source.

The existing HS-AED example parser is **fictional**. It is permitted for
simulator traffic only, not physical data. Production clinical interpretation
requires an OEM parser and validated non-patient vectors. Raw fallback
captures do not assert pads, shocks, rhythm or patient information.

## Persistence and privacy

- Schema version 2 adds recording `source` and `label`, and separate AED
  `raw_frames_json`. Legacy recordings default to `AED`; this preserves legacy
  behavior but cannot retrospectively identify old remote captures.
- Existing AED event-linked raw frames are used when old rows have no separate
  raw-frame column value.
- Raw frames and decoded/event blobs use the existing Keychain-backed field
  encryption layer. This change does not claim SQLCipher or regulated-grade
  encryption. Labels/signatures/metadata are not fully encrypted database-wide.
- Persistence is incremental, not deferred until a Stop/Save button. Failed
  storage is surfaced and delivery is not acknowledged; export/delete old
  data or free space before retrying.
- JSON and CSV exports include raw data, receive timestamps, source and decoded
  fields. Exports are intentionally readable and should be shared only with
  authorized recipients.
- Ordinary logs contain codes/counts only. Live USB Diagnostics can contain
  sensitive wire data; copying/sharing requires a deliberate user action.
  Use bench signals only, not patient data.
- The existing offline/cloud/auth defaults are unchanged. REST placeholder
  configuration must be replaced before deployment.

## Lifecycle and limits

USB open/claim/read/close happen off the UI thread. Bounded native queues and
storage acknowledgements apply backpressure without intentionally dropping
queued chunks. This is not a guarantee that a hardware FIFO will never overflow
if incoming traffic exceeds USB/database throughput; measure that on hardware.
Normal stop/detach gives already acquired chunks five seconds to drain through
persistence acknowledgements. A timeout reports `USB_DELIVERY_INCOMPLETE`:
unpersisted queued bytes cannot then be guaranteed. This is an explicit failure,
not a lossless-shutdown claim.

Background/foreground transitions resume enumeration and keep reception alive
while the process and React Native runtime remain alive. There is no foreground
service: Android process death, force-stop and aggressive power management can
interrupt capture. Persisted frames survive; reads never completed cannot be
reconstructed. Reliable unattended background operation needs a separately
approved foreground-service/power policy.

Sessions use the existing JSON-blob repositories. Sustained sessions without
an inactivity gap grow their in-memory snapshots and database rewrite cost;
long-running throughput/memory and storage-full tests remain required. A
normalized append-only frame store would be a larger storage refactor and is
not silently substituted here.

## Open questions

1. Does firmware **045C:0132** passively receive IR, require a documented learn
   command, or only transmit? Supply the exact SDK/specification for this PID.
2. What is its wire/report format: headers, fragmentation, units, carrier,
   report IDs, checksums, and maximum sustained rate?
3. Which AED manufacturers/models are in scope, and do they emit demodulated
   remote-control IR, IrDA serial, or another physical layer?
4. Supply OEM event semantics and authorized non-patient receive test vectors.
5. Confirm the five-second inactivity boundary and desired background-service
   policy, storage retention and maximum continuous-capture workload.
6. Confirm regulated deployment requirements, cloud/auth provider, and whether
   full authenticated database encryption is required.

## Verification

Automated fake-bridge, parser, repository and codec checks validate software
contracts, not optical reception. Real remote reception, AED interoperability,
device restart/export fidelity, permission revocation and capture soak testing
must follow [CHECKLIST.md](CHECKLIST.md) on a physical phone with the release APK.

The release APK was assembled with release lint/checks enabled. The existing
Gradle configuration signs that variant with the debug key; it is suitable for
bench installation, not a production-signed distribution. Physical reception
and restart fidelity have not been verified by installing it on hardware.
