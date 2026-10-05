# Native Bridge API - `IrDongle` (Android Kotlin)

Module: `IrDongle`; package: `com.hsircapture.usb.IrDonglePackage`.
JS facade: `src/native/IrDongleBridge.ts`. `DongleService` accepts an injected
`IrDongleNativeModule` and typed `IrDongleEventSource` for tests.

## Confirmed hardware and current scope

Android USB Host descriptors identify the connected device as:

- ELKSMART / Smart IR Blaster, **045C:0132** (decimal 1116:306).
- Interface 0, vendor-specific class **FF**, subclass **F0**, protocol 00.
- Bulk OUT 02 and bulk IN 82, maximum packet size 64 bytes.

These descriptors confirm USB identification, not IR learning or reception.
This is not a CDC-ACM interface. Neither a baud rate, command sequence nor IR
frame format is confirmed. No vendor commands are sent and no physical port
is opened in this build. After permission, the app reports
`error / RECEIVE_PROTOCOL_UNVERIFIED`, retaining device metadata.
It never claims physical `ready` or fabricates AED frames.

The user-approved implementation scope is real detection/status with reception
gated pending a vendor receive/learning protocol. The old `UsbSerialReader` and
`IrFrameCodec` remain unverified lab code, not drivers for ELKSMART.
Physical data buffering/decoding and OEM AED interpretation are deferred.

## Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `initialize()` | `Promise<void>` | Idempotently register USB broadcasts and enumerate matching devices. |
| `reconnect()` | `Promise<void>` | Rescan matching devices; does not bypass denial or the protocol gate. |
| `requestPermission()` | `Promise<boolean>` | True if permission exists; false if no device or a dialog is pending. A pending dialog completes via events. |
| `getConnectionState()` | `Promise<DongleConnectionNative>` | Current state machine snapshot, not an inference from permission alone. |
| `startListening()` | `Promise<void>` | Start the debug simulator; physical requests reject without sending USB commands. |
| `stopListening()` | `Promise<void>` | Consumer capture stop; the enabled debug source stays ready until simulator mode is disabled or destroyed. |
| `setSimulatorMode(enabled)` | `Promise<void>` | Explicit debug-only toggle. Release builds reject enabling it. Default is physical mode. |
| `destroy()` | `Promise<void>` | Unregister receivers, cancel simulator/activity jobs, clear permission state. A subsequent initialize is supported. |

The module implements `addListener` / `removeListeners` for NativeEventEmitter.
iOS remains unsupported as described in [IOS_PLAN.md](IOS_PLAN.md).

## States

Lowercase values on the bridge:

```text
disconnected -> detected -> permission_required -> permission_denied
                         -> error (RECEIVE_PROTOCOL_UNVERIFIED, when permitted)

debug simulator: ready <-> receiving
```

`connecting` is reserved for a future verified driver opening a port; it does
not occur merely because USB permission exists. `unsupported` remains a
contract state for future drivers. Unknown VID/PID devices are currently ignored.

```ts
type DongleConnectionNative =
  | {status: 'disconnected'}
  | {
      status: 'detected' | 'permission_required' | 'permission_denied'
        | 'connecting' | 'ready' | 'receiving';
      dongle: DongleInfo;
      lastReceivedAtMs?: number; // Unix epoch milliseconds
      message?: string;
      code?: string;
    }
  | {status: 'unsupported'; dongle: DongleInfo; reason: string}
  | {status: 'error'; message: string; code: string; dongle?: DongleInfo};
```

`DongleInfo`: product/fallback `deviceName`, numeric VID/PID, nullable
manufacturer and serial, `connected` (USB presence, NOT readiness), optional
`simulated`, `receiveProtocolVerified`, and transport description. A serial is
read only with permission and is neither logged nor displayed/persisted.
Fallback name is `IR Dongle (VID:PID)`.

## Events

| Event | Payload |
|-------|---------|
| `IrDongleConnectionChanged` | `DongleConnectionNative` |
| `IrDongleFrameReceived` | `{receivedAtMs, carrierHz, timingsUs, frameBytesHex}`; debug simulator only until a verified driver exists |
| `IrDongleError` | `{code: string, message: string}`; no raw data or identifiers |
| `IrDonglePermissionResult` | `{granted: boolean}` for the currently attached, requested device |

Frames use Unix epoch timestamps. The domain copies/freezes timing arrays.
The old codec's lab `AA 55` format is not the ELKSMART protocol; its framing
and raw-byte contract must be validated before enabling a physical driver.

## Permissions and lifecycle

- Enumerate on initialize, attach/detach, reconnect and host resume.
- Ignore unrelated devices; keep the selected matching device when another is attached.
- Android USB permission is granted via `UsbManager`, not a manifest permission.
- Permission PendingIntents are package-scoped and mutable on Android 12+ so
  the system can populate result extras. Broadcasts are non-exported on Android 13+.
- Validate pending device ID, current presence and `hasPermission` before accepting a grant.
- Denial is a distinct state and is not automatically re-prompted on resume.
  The Grant permission button explicitly retries.
- Android owns remembered/default-app selection; the app does not persist
  permission grants or simulate the OS "remember" checkbox.
- Replug re-enumerates and rechecks permission. Permission loss on resume
  returns to the permission flow.
- This detection-only build has no physical port/read thread to leak.
  Receiver and simulator cleanup is synchronous on the native main dispatcher.
- Pausing keeps identification broadcasts active. Process death ends detection;
  there is no foreground service or promise of background AED capture.

## Error codes

- `RECEIVE_PROTOCOL_UNVERIFIED`: identifiable USB device, unverified receive support.
- `PERMISSION_DENIED`: user denied USB permission.
- `DONGLE_REMOVED`: selected USB device disconnected.
- `NO_DONGLE`: no matching device.
- `USB_OPERATION_FAILED`: USB operation failed; reconnect/retry.
- `SIMULATOR_DISABLED`: attempted simulator enable in release.
- `DESTROYED`: React Native module invalidated.

JS maps failures to `AppError`. Logs contain states/codes only; never descriptors,
serials, raw bytes, timing values or parsed patient/device payloads.
