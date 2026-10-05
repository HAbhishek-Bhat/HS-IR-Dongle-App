# HS IR Capture

Professional React Native (TypeScript) app for capturing IR signals through a USB-C IR receiver dongle on Android, with AED event retrieval, offline-first storage, cloud sync, and a hardware-free simulator mode.

## Versions (pinned defaults)

| Component | Version |
|-----------|---------|
| React Native | **0.76.5** |
| React Native Reanimated | **3.16.7** |
| React Native Gesture Handler | **2.21.2** |
| React Native Screens | **4.4.0** |
| React | **18.3.1** |
| TypeScript | **5.7.x** |
| Kotlin | **2.0.21** |
| Gradle | **8.10.2** |
| Android minSdk | **26** |
| Android compileSdk | **35** |
| Android targetSdk | **34** |
| Node | **≥ 18** (CI-tested mindset; local may be newer) |
| JDK | **17** |

## Folder structure

```
.
├── App.tsx
├── index.js
├── package.json
├── tsconfig.json
├── babel.config.js / metro.config.js / jest.config.js
├── .detoxrc.js
├── android/
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── res/xml/device_filter.xml
│   │   └── java/com/hsircapture/
│   │       ├── MainActivity.kt / MainApplication.kt
│   │       ├── usb/ (IrDongleModule, UsbSerialReader, UsbDongleIds)
│   │       └── ir/IrFrameCodec.kt
│   └── app/src/test/java/com/hsircapture/IrFrameCodecTest.kt
├── src/
│   ├── app/                 # Error boundary, crash hook
│   ├── di/                  # Composition root
│   ├── domain/              # Entities, parsers, services, repository ports
│   ├── data/                # SQLite, sync, export, encryption
│   ├── native/              # JS bridge types
│   ├── presentation/        # Theme, store, hooks, navigation, screens, UI
│   └── shared/              # Errors, logging
├── __tests__/               # Jest unit tests
├── e2e/                     # Detox flow (simulator)
└── docs/                    # Bridge API, signatures, iOS plan, checklist
```

## Setup & run (Android)

### 1) Prerequisites

- Node ≥ 18, npm ≥ 9
- JDK 17
- Android Studio with SDK Platform 34/35, Platform-Tools, and an emulator or device
- USB debugging enabled on a physical device for real dongle tests

### 2) Install JS dependencies

```bash
cd "C:\hs aed app\IR dongle app"
npm install
```

Reanimated, Gesture Handler, and Screens are pinned for React Native 0.76.5
compatibility. Do not use caret ranges for these packages: they allow newer
minor releases that drop support for this React Native version or the legacy
architecture. Reanimated 3.19.x requires React Native 0.78 or newer, and Screens
4.25+ no longer supports the legacy architecture used here.
Keep `package-lock.json` in sync when changing native dependencies.

After changing dependencies, stop the existing Metro server with Ctrl+C and
restart it with a fresh cache:

```powershell
npm start -- --reset-cache
```

If Metro reports that an installed module cannot be resolved, check it with
`npm ls react-native-gesture-handler` and restart Metro before reinstalling
packages. Reload the app after Metro restarts.

### 3) Generate Gradle wrapper (first time)

If `android/gradlew` / `gradlew.bat` are missing:

```bash
cd android
gradle wrapper --gradle-version 8.10.2
cd ..
```

Or copy the wrapper scripts from a fresh `npx @react-native-community/cli@15.0.1 init` Android template of RN 0.76.5.

### 4) Debug keystore (first time)

```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 -keystore debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
cd ../..
```

### 5) Start Metro and run

```bash
npm start
```

In another terminal:

```bash
npm run android
```

#### Windows Gradle cache

The Windows wrapper uses `%LOCALAPPDATA%\HSIRCapture\gradle-project-cache`
instead of `android\.gradle` for the project cache. This avoids the
`Could not move temporary workspace ... to immutable location` failure observed
with Gradle 8.10.2 in this workspace. Gradle and React Native versions are unchanged;
the Unix wrapper is unaffected.

To use another writable cache directory, set `HSIR_GRADLE_PROJECT_CACHE` before
building (PowerShell):

```powershell
$env:HSIR_GRADLE_PROJECT_CACHE = "$env:LOCALAPPDATA\HSIRCapture\my-project-cache"
npm run android
```

Use a separate directory for each checkout if working with multiple copies.
If regenerating or replacing `gradlew.bat`, preserve its project-cache option.
The first successful configuration may take longer while Android SDK/NDK
components are downloaded.

### 6) Passive reception and Remote Test

#### Windows Metro watcher troubleshooting

Metro excludes generated Android `.cxx`, `.gradle` and build directories,
including those inside native dependencies. Git ignore rules alone do not
control Metro's watcher. If Metro exits with `ENOENT` while watching a CMake
temporary directory, restart it with `npm start -- --reset-cache` after updating
the configuration. Native source files remain watchable.

If further tooling problems occur on Node 26, use Node 22 LTS for this older
React Native toolchain; changing Node is not a substitute for the watcher fix.

Physical reception is the default. After USB permission, the app automatically
opens supported input endpoints and shows **Ready: listening for AED data**.
Every received USB chunk is stored locally, including unknown formats, and AED
sessions appear live without a manual start. The identified ELKSMART Smart IR
Blaster (`045C:0132`) has an unverified receive format; this is informational,
not a capture blocker. Listening is not proof that this hardware receives IR.
No undocumented vendor commands or invented pulse timings are used.

Open **Remote Test** from Home or Device Capture to label and save bench remote
signals separately as `REMOTE_TEST`. History supports source filtering; exports
include raw data and timestamps. USB Diagnostics exposes descriptors and an
explicitly shareable live hex view. See the
[hardware assumptions](docs/ASSUMPTIONS.md) and
[release hardware checklist](docs/CHECKLIST.md) before claiming interoperability.

### 7) Simulator mode (no hardware)

In a development build only:

1. Open **Settings**
2. Enable **Mock IR simulator**
3. Banner shows **Ready to receive** / **Receiving**, clearly labeled **SIMULATOR**
4. Use Device Capture / AED tabs normally

## Architecture

`UI screens → Zustand store + hooks → domain services → repositories → SQLite / REST`  
USB IO lives only in the Kotlin module; JS talks through `DongleService` (mockable in tests).

## Tests

Database startup runs schema statements individually because Quick SQLite's
`execute` handles only one statement at a time. Initialization is idempotent and
repairs incomplete schema creation without clearing stored sessions. A failed
initialization is reported and its connection is closed so a subsequent startup
can retry.

```bash
# TypeScript unit tests
npm test

# Kotlin codec unit tests
cd android
./gradlew :app:testDebugUnitTest
cd ..

# Detox E2E (emulator + simulator mode)
npm run e2e:build
npm run e2e:test
```

## Documentation

- [Native bridge API](docs/NATIVE_BRIDGE_API.md)
- [Signal signatures & AED parsers](docs/SIGNAL_SIGNATURE_AND_AED_PARSERS.md)
- [iOS plan](docs/IOS_PLAN.md)
- [Build/test checklist](docs/CHECKLIST.md)
- [Assumptions & open questions](docs/ASSUMPTIONS.md)

## Privacy

AED-related IR events may be health-adjacent. The app includes a consent screen, encrypted at-rest blobs (Keychain-backed), TLS-only sync, structured logs without PII, and **Delete my data** in Settings. Upgrade to SQLCipher for full-database encryption in regulated deployments.
