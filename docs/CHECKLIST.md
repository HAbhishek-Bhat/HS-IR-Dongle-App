# Build and hardware acceptance checklist

Unchecked hardware items are required tests, not claims of verified reception.
Use authorized bench remotes/AED equipment without patient data. Use wireless
ADB while the phone's USB-C port is occupied.

## Software checks

- [x] `npm run typecheck`
- [x] Targeted Jest dongle/AED, Remote Test, repository migration/persistence,
      source filter and export tests
- [x] Existing parser/regression Jest tests (48 tests across 12 suites)
- [x] ESLint on changed TypeScript files (0 errors; existing-style warnings remain)
- [x] Android `gradlew.bat :app:testDebugUnitTest` (27 passing tests:
      fragmented, corrupt, back-to-back codec, opaque-byte and delivery cases)
- [x] Android release assemble succeeds with release simulator guard enabled
      (existing debug-key signing; production signing not configured)
- [ ] Install the standalone release APK; no Metro or debug generator required

## Plug in and automatic listening

- [ ] No dongle: disconnected, capture entry points disabled.
- [ ] Plug **045C:0132** in: identity shown; permission prompt if needed.
- [ ] Grant permission: CONNECTING then **Ready: listening for AED data**,
      without a manual capture step or receive-unverified error.
- [ ] Unverified-format info chip is informational; Device Capture, AED Data
      Retrieval and Remote Test are enabled.
- [ ] Deny then Grant: permission-required/denied UI is actionable; grant
      automatically opens input endpoints.
- [ ] LISTENING on a capture screen with zero bytes for 29 seconds: no hint.
- [ ] After 30 seconds: non-blocking alignment/type/transmit-only hint and
      working USB Diagnostics link; features stay enabled.
- [ ] Verify all advertised bulk/interrupt IN endpoints are listed in
      diagnostics. Confirm no guessed vendor commands or CDC setup on ELKSMART.

## Remote Test (real release hardware)

- [ ] Navigate from both Home and Device Capture.
- [ ] Purpose banner: "Point any IR remote at the dongle and press a button."
- [ ] Start listening; press a TV remote button.
- [ ] USB chunk/frame and byte counters and last-received time update.
- [ ] Exact raw hex appears. Waveform/timing view updates **only if real
      timings are reported in a documented format**; otherwise report
      unavailable/Unknown protocol rather than fabricate pulses.
- [ ] Known timing vectors decode NEC/RC5/SIRC with address and command;
      unknown/raw-only data can still be saved.
- [ ] Name "Samsung TV Power", Save: History shows label and REMOTE_TEST source.
- [ ] History REMOTE_TEST filter includes it; AED filter excludes it.
- [ ] Stop/leave Remote Test: default AED acquisition is restored.
- [ ] Clear clears the live view without silently deleting saved raw captures.
- [ ] Force-stop/restart app: saved label/raw frames/source remain readable.
- [ ] Export JSON and CSV: compare exact hex, receive timestamps, timings,
      source/label, protocol/address/command to the captured data.

## AED automatic capture

- [ ] Outside active Remote Test, point the AED at the dongle and transmit.
- [ ] A live session appears automatically in AED Data Retrieval and History.
- [ ] Every received chunk is present in the encrypted raw session list with
      timestamp and endpoint provenance; no signature-based discarding.
- [ ] Unknown data is raw/unparsed, not invented clinical events.
- [ ] Parsed events link to the matching raw-frame index.
- [ ] Five seconds without data closes the session; new data starts a new one.
- [ ] Restart before pressing any save button: already committed raw data remains.
- [ ] Export session and compare raw-byte concatenation against a trusted capture.

## Lifecycle, failures and soak

- [ ] Unplug mid-capture: disconnected, no lingering IO tasks; saved partial
      session includes all completed persisted reads.
- [ ] Replug with remembered permission: automatic LISTENING, no duplicate jobs.
- [ ] Background/foreground repeatedly: receive resumes/checks permission;
      captured data remains visible and counters do not duplicate reads.
- [ ] Revoke permission then re-grant: close/reopen safely, actionable UI.
- [ ] Continuous capture at expected maximum rate: measure native queue,
      database latency, memory, responsiveness and hardware FIFO losses.
- [ ] Block persistence during detach: verify the five-second drain limit
      reports `USB_DELIVERY_INCOMPLETE`, never a false complete save.
- [ ] Test multiple IN endpoints and fragmented/corrupt/back-to-back real reports.
- [ ] Storage-full/write failure: explicit error, no false success or
      acknowledgement of unpersisted bytes; recovery after space is freed.
- [ ] Process kill and power-management interruption: previously committed
      data survives; do not claim capture continues without a foreground service.

## Release, privacy and UI

- [ ] Simulator is hidden in release and enabling it natively is rejected.
- [ ] Real release traffic is never synthesized when no dongle/data exists.
- [ ] Logs contain no wire data, serials, labels, patient identifiers or
      parsed clinical payloads.
- [ ] Diagnostics Copy/Share is explicit and tested only with non-patient data.
- [ ] Bottom tabs have a single Home/History/Settings label without wrapping
      or truncation at supported font scales.
- [ ] Existing onboarding, recording, encrypted repository and export behavior
      still works after migration from a populated version-1 database.

Repository reopen/migration tests use a mocked native database connection.
They verify serialization, encryption round-trips and SQL/version sequencing,
not an actual Android SQLite file or force-stop/restart. Hardware items above
remain unchecked until executed on the release APK.
