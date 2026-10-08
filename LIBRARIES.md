# Project libraries

Inventory of libraries and platform APIs used by **HS IR Capture** (React Native 0.76.5 / Android).  
Sources: `package.json`, `android/app/build.gradle`, `android/build.gradle`, and code usage under `src/` and `android/`.

---

## Summary

| Layer | Role |
|-------|------|
| **JavaScript / React Native** | UI, navigation, storage, crypto helpers, domain services |
| **Android (Kotlin / Gradle)** | USB IR dongle native module, coroutines, app shell |
| **Platform APIs (not npm packages)** | Android USB Host for IR dongle I/O |
| **Custom in-repo code** | IR frame codec, NEC/RC5/SIRC parsers, React Native bridge |

> **Important:** This project does **not** use a third-party IR remote library (no LIRC, Consumer IR SDK, usb-serial-for-android, etc.). IR receive is implemented with the **Android USB Host API** plus custom Kotlin (`IrDongleModule`, `UsbSerialReader`, `IrFrameCodec`) and TypeScript parsers.

---

## 1. Core runtime

| Library | Version | Use |
|---------|---------|-----|
| `react` | 18.3.1 | UI component model |
| `react-native` | 0.76.5 | Cross-platform app framework; JS ↔ native bridge (`NativeModules`, `NativeEventEmitter`) |
| `typescript` | ^5.7.2 | Static typing (dev) |

---

## 2. Navigation & UI interaction

| Library | Version | Use |
|---------|---------|-----|
| `@react-navigation/native` | ^7.0.14 | Navigation container and focus helpers |
| `@react-navigation/native-stack` | ^7.2.0 | Stack navigators (root, home, history) |
| `@react-navigation/bottom-tabs` | ^7.2.0 | Main tab bar |
| `react-native-screens` | 4.4.0 | Native screen containers for navigation performance |
| `react-native-safe-area-context` | ^5.0.0 | Safe area insets (`SafeAreaProvider`) |
| `react-native-gesture-handler` | 2.21.2 | Gesture root and navigation gestures |
| `react-native-reanimated` | 3.16.7 | UI animations (buttons, splash, section cards) |
| `react-native-svg` | ^15.11.1 | IR waveform polyline rendering (`WaveformView`) |
| `react-native-haptic-feedback` | ^2.3.3 | Tactile feedback on key actions |

---

## 3. State management

| Library | Version | Use |
|---------|---------|-----|
| `zustand` | ^5.0.2 | App-wide client state (`appStore`) |

---

## 4. Persistence, security & identity

| Library | Version | Use |
|---------|---------|-----|
| `react-native-quick-sqlite` | ^8.1.1 | Local SQLite for recordings, AED sessions, sync metadata |
| `@react-native-async-storage/async-storage` | ^2.1.0 | Lightweight prefs (onboarding, flags) |
| `react-native-keychain` | ^9.2.2 | Secure storage for auth/session and encryption-related secrets |
| `react-native-get-random-values` | ^1.11.0 | Polyfill for `crypto.getRandomValues` (loaded in `index.js`) |
| `react-native-uuid` | ^2.0.3 | Generate IDs for captures, sessions, auth, encryption keys |

---

## 5. Utilities & sharing

| Library | Version | Use |
|---------|---------|-----|
| `date-fns` | ^4.1.0 | Timestamp formatting and relative time in History / Device Capture / detail screens |
| `react-native-share` | ^12.0.3 | Export/share session data |

---

## 6. Android / native (Gradle)

### 6.1 App dependencies (`android/app/build.gradle`)

| Library | Version | Use |
|---------|---------|-----|
| `com.facebook.react:react-android` | (from RN) | React Native Android runtime |
| `com.facebook.react:hermes-android` | (from RN, if Hermes enabled) | JS engine |
| `org.jetbrains.kotlinx:kotlinx-coroutines-android` | 1.9.0 | Async USB read loops, permission/lifecycle jobs in `IrDongleModule` / `UsbSerialReader` |
| `androidx.appcompat:appcompat` | 1.7.0 | AndroidX appcompat support |

### 6.2 Build plugins (`android/build.gradle`)

| Library / plugin | Use |
|------------------|-----|
| Android Gradle Plugin (`com.android.tools.build:gradle`) | Android build |
| React Native Gradle Plugin (`com.facebook.react:react-native-gradle-plugin`) | RN autolinking and native build |
| Kotlin Gradle Plugin (`org.jetbrains.kotlin:kotlin-gradle-plugin`) | Compile Kotlin (version **2.0.21**) |

### 6.3 Android unit-test dependencies

| Library | Version | Use |
|---------|---------|-----|
| `junit:junit` | 4.13.2 | Kotlin unit tests |
| `org.jetbrains.kotlinx:kotlinx-coroutines-test` | 1.9.0 | Coroutine test utilities for USB reader tests |
| `com.google.truth:truth` | 1.4.4 | Fluent assertions (`IrFrameCodec`, USB ID tests) |

---

## 7. Tooling & quality (devDependencies)

### 7.1 React Native / Babel / Metro

| Library | Version | Use |
|---------|---------|-----|
| `@react-native/babel-preset` | 0.76.5 | Babel preset for RN |
| `@react-native/metro-config` | 0.76.5 | Metro bundler config |
| `@react-native/typescript-config` | 0.76.5 | Shared TS config base |
| `@react-native/eslint-config` | 0.76.5 | ESLint rules for RN |
| `@react-native-community/cli` | 15.0.1 | `react-native` CLI |
| `@react-native-community/cli-platform-android` | 15.0.1 | Android CLI platform |
| `@react-native-community/cli-platform-ios` | 15.0.1 | iOS CLI platform (iOS IR not implemented) |
| `@babel/core` | ^7.26.0 | Babel compiler core |
| `@babel/preset-env` | ^7.26.0 | Env preset |
| `@babel/runtime` | ^7.26.0 | Babel helpers at runtime |
| `babel-plugin-module-resolver` | ^5.0.2 | Path aliases (`@domain`, `@data`, etc.) |

### 7.2 Lint, format, types

| Library | Version | Use |
|---------|---------|-----|
| `eslint` | ^8.57.1 | Lint |
| `eslint-config-prettier` | ^9.1.0 | Disable ESLint rules that conflict with Prettier |
| `eslint-plugin-prettier` | ^5.2.1 | Run Prettier as ESLint rules |
| `prettier` | ^3.4.2 | Code formatting |
| `@types/react` | ^18.3.12 | React TypeScript types |
| `@types/jest` | ^29.5.14 | Jest TypeScript types |
| `@types/react-test-renderer` | ^18.3.0 | Test renderer types |

### 7.3 Testing

| Library | Version | Use |
|---------|---------|-----|
| `jest` | ^29.7.0 | Unit / component tests |
| `@testing-library/react-native` | ^12.9.0 | RN component testing helpers |
| `react-test-renderer` | 18.3.1 | React test renderer |
| `detox` | ^20.28.0 | E2E tests (emulator + simulator mode) |

---

## 8. Libraries & APIs used for IR

### 8.1 Finding

There is **no dedicated third-party “IR library”** in `package.json` or Gradle.  
IR capture and decoding use:

1. **Android platform USB APIs**
2. **Custom Kotlin native module** (`android/.../usb`, `android/.../ir`)
3. **Custom TypeScript parsers / services** (`src/domain/parsers/ir`, `DongleService`, `IrDongleBridge`)
4. **Supporting libraries** that enable the IR pipeline (React Native bridge, coroutines, UI waveform, persistence)

### 8.2 IR-related table (library / API → use)

| Name | Type | Use in this project |
|------|------|---------------------|
| **Android USB Host API** (`android.hardware.usb.*`: `UsbManager`, `UsbDevice`, endpoints, bulk/interrupt transfers) | Platform API | Detect allowlisted IR dongles, request permission, open interfaces, read USB IN chunks that carry IR/raw payloads |
| **React Native bridge** (`com.facebook.react.bridge.*`, `NativeModules`, `NativeEventEmitter`) | Framework | Expose `IrDongle` native module methods/events to JS (`initialize`, `startListening`, `IrDongleFrameReceived`, etc.) |
| **`kotlinx-coroutines-android`** | Gradle library | Background USB read loops, reconnect/permission flows, frame delivery acknowledgements without blocking the UI thread |
| **`react-native`** (JS side) | npm library | Host app + bridge wiring in `IrDongleBridge.ts` / `DongleService` |
| **`react-native-quick-sqlite`** | npm library | Persist captured IR/AED frames and sessions offline |
| **`react-native-svg`** | npm library | Draw captured IR timing waveforms |
| **`react-native-uuid`** | npm library | Unique IDs for IR recording / AED / remote-test sessions |
| **`date-fns`** | npm library | Display capture timestamps in history and capture UIs |
| **Custom `IrFrameCodec` (Kotlin)** | In-repo | Encode/decode native IR frame binary layout (timings + payload) |
| **Custom `UsbSerialReader` / `IrDongleModule` (Kotlin)** | In-repo | USB serial/CDC-style reads, dongle lifecycle, simulator mode, diagnostics |
| **Custom `UsbDongleIds` (Kotlin)** | In-repo | Vendor/product ID allowlist for supported IR dongles |
| **Custom IR parsers (TypeScript)** (`necParser`, `rc5Parser`, `sircParser`, `irDecoder`, `signalSignature`) | In-repo | Decode NEC / RC5 / SIRC-style IR and build signal signatures for AED / remote test |

### 8.3 IR stack (how pieces connect)

```text
USB IR dongle
    → Android USB Host API
    → UsbSerialReader + IrFrameCodec (Kotlin)
    → IrDongleModule (React Native native module)
    → IrDongleBridge.ts + DongleService
    → CaptureService / AedRetrievalService / RemoteTestService
    → irDecoder (NEC / RC5 / SIRC) + SQLite persistence
    → UI (WaveformView, Device Capture, Remote Test, History)
```

### 8.4 Explicitly not used for IR

| Common IR / USB libraries | Status here |
|---------------------------|-------------|
| `usb-serial-for-android` / mik3y | Not used (custom USB reader) |
| Android `ConsumerIrManager` (phone IR blaster) | Not used (external USB-C dongle only) |
| LIRC / WinLIRC clients | Not used |
| Commercial IR SDK packages | Not used |

---

## 9. Quick reference — all production npm dependencies

| Library | Category |
|---------|----------|
| `react` | Core runtime |
| `react-native` | Core runtime |
| `@react-navigation/native` | Navigation |
| `@react-navigation/native-stack` | Navigation |
| `@react-navigation/bottom-tabs` | Navigation |
| `react-native-screens` | Navigation |
| `react-native-safe-area-context` | UI / layout |
| `react-native-gesture-handler` | UI / gestures |
| `react-native-reanimated` | UI / animation |
| `react-native-svg` | UI / IR waveform |
| `react-native-haptic-feedback` | UI / haptics |
| `zustand` | State |
| `react-native-quick-sqlite` | Persistence |
| `@react-native-async-storage/async-storage` | Persistence |
| `react-native-keychain` | Security |
| `react-native-get-random-values` | Crypto polyfill |
| `react-native-uuid` | Identity |
| `date-fns` | Utilities |
| `react-native-share` | Export / sharing |

---

*Generated from the repository dependency manifests and source usage. Pin notes for Reanimated / Gesture Handler / Screens are documented in `README.md`.*
