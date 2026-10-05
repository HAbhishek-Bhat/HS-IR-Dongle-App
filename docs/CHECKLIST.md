# Pre-release build & test checklist

## Compile / install

- [ ] `npm install` completes without peer dependency failures
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (or only accepted warnings)
- [ ] `npm test` passes
- [ ] `cd android && ./gradlew :app:assembleDebug` succeeds
- [ ] `cd android && ./gradlew :app:testDebugUnitTest` succeeds
- [ ] App installs on a physical Android device (`npm run android`)
- [ ] App installs on an emulator

## Simulator mode

- [ ] Settings → Mock IR simulator ON
- [ ] Banner: **IR Dongle Connected** with simulator name / VID/PID
- [ ] Device Capture lists simulated devices
- [ ] Recording screen shows live waveform and saves a session
- [ ] AED list receives simulated HS AED frames; timeline shows labeled events
- [ ] History search finds the saved recording
- [ ] Export JSON/CSV share sheet opens
- [ ] Sync status shows pending/failed/synced after sync attempt

## Real dongle

- [ ] Plug supported USB-C IR dongle → attach intent / permission dialog
- [ ] Banner shows device name + VID/PID
- [ ] Deny permission → features stay disabled; Allow recovers
- [ ] Capture works with a known remote (NEC/RC5/SIRC)
- [ ] Hot-unplug mid-recording → session marked partial, user notified, data saved
- [ ] Unsupported VID/PID → unsupported state, features disabled

## Security / privacy

- [ ] Privacy consent required before Main tabs
- [ ] No patient identifiers in notes/logs during test
- [ ] Delete my data clears local recordings and auth
- [ ] Cleartext HTTP blocked (`usesCleartextTraffic=false`)

## Detox

- [ ] `.detoxrc.js` AVD name matches local emulator
- [ ] `npm run e2e:build` + `npm run e2e:test` pass simulator home→capture path
