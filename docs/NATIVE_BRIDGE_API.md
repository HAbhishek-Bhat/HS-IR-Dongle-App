# Native bridge API - IrDongle (Android Kotlin)

Module `IrDongle`, package `com.hsircapture.usb.IrDonglePackage`.
Typed JS facade: [IrDongleBridge.ts](../src/native/IrDongleBridge.ts).
`DongleService` accepts an injected module/event source for tests.

## Default behavior

Initialize enumerates allowlisted USB devices. Attach with permission, permission
grant, reconnect and foreground resume automatically open passive input endpoints.
No manual AED start is required. Identification does not prove IR compatibility.
See [ASSUMPTIONS.md](ASSUMPTIONS.md) for physical-format and lifecycle limits.

`listUsbDevices` enumerates all attached devices, not just known profiles.
An unfamiliar device requires explicit `selectUsbDevice` confirmation in the
picker. Known profiles keep automatic selection; an attached explicit selection
takes priority on reconnect/resume. Detach and module cleanup clear that selection.
The Android attachment filter offers the app for any USB device but does not
automatically claim an unknown device. No readable bulk/interrupt IN endpoint
produces `unsupported` with a human-readable `reason`.

Every bulk/interrupt IN endpoint is read on an IO dispatcher; HID interrupt
packets are input reports, not decoded timings. CDC class configuration is
separate from unknown/vendor-specific interfaces. No undocumented vendor
receive/learn commands are sent. ELKSMART 045C:0132 defaults to opaque raw bytes.

## Methods

| Method | Returns | Contract |
|--------|---------|----------|
| `initialize()` | `Promise<void>` | Idempotently register broadcasts, enumerate, request permission if appropriate and start passive reception. |
| `reconnect()` | `Promise<void>` | Rescan/reopen; recheck actual permission, never simulate a grant. |
| `requestPermission()` | `Promise<boolean>` | True when already granted; false for no device or pending prompt. Grant completion arrives through events and starts reception. |
| `getConnectionState()` | `Promise<DongleConnectionNative>` | Current transport state/counters. |
| `listUsbDevices()` | `Promise<UsbDeviceInfo[]>` | Every attached USB device with USB path, display/manufacturer names, VID/PID, known profile, permission, selection and readable-endpoint count. No serial is read. |
| `selectUsbDevice(deviceName)` | `Promise<void>` | Resolve the attached USB path, close/drain the previous receiver, request permission and attempt raw reception. Reject stale selection, missing input endpoints or setup failures. A pending permission prompt is not a ready state. |
| `startListening()` | `Promise<void>` | Idempotently start physical transport or explicitly enabled debug simulator. |
| `stopListening()` | `Promise<void>` | Explicit native transport stop. Ordinary screen/device-scan Stop does not stop default AED acquisition. |
| `getDiagnostics()` | `Promise<string>` | Descriptor/interface/endpoint summary, no serial number. Live raw hex is accumulated by the diagnostics screen, not ordinary logs. |
| `acknowledgeFrame(deliveryId)` | `void` | JS calls only after all frame consumers finish persistence; permits the next physical delivery. |
| `setSimulatorMode(enabled)` | `Promise<void>` | Explicit debug flag. Release rejects enabling simulation. |
| `destroy()` | `Promise<void>` | Close input resources, cancel jobs, unregister broadcasts and clear state. Reinitialization is supported. |

NativeEventEmitter's `addListener`/`removeListeners` are also implemented.
iOS remains unsupported; see [IOS_PLAN.md](IOS_PLAN.md).

## States

```text
disconnected -> detected -> permission_required -> connecting -> listening
                         -> permission_denied                   <-> receiving
                                                             -> error
detected -> unsupported (no readable bulk/interrupt IN endpoint)
```

Existing `ready` is accepted for compatibility/debug tests; physical transport
uses `listening`. `LISTENING` means open/waiting, not confirmed optical reception.
Data activity sets `receiving`; idle returns to `listening`.
Capture features are enabled in either state even when the receive format is
unverified. The info chip is non-blocking. A capture screen with zero bytes for
30 seconds displays a hint and USB Diagnostics link without disabling capture.

Snapshots contain `dongle` identity, optional `listeningSinceMs`,
`lastReceivedAtMs`, `frameCount`, `byteCount`, `message` and `code`.
Counters count USB chunks where framing is unknown; they are not claims of
recognized remote button presses. Device metadata includes optional
`simulated`, `receiveProtocolVerified` and transport. Serial is not logged or
included in diagnostics/export.

## Events

`IrDongleUsbDevicesChanged` carries `{devices: UsbDeviceInfo[]}` after USB
attach/detach, selection and permission results. The picker also refreshes on
connection/foreground changes and on an explicit Refresh action; frame counters
alone do not trigger enumeration. Device names/identifiers are not logged.

| Event | Payload |
|-------|---------|
| `IrDongleConnectionChanged` | Domain `DongleConnectionState` |
| `IrDongleFrameReceived` | `NativeIrFramePayload` below |
| `IrDongleError` | `{code: string, message: string}` without raw payload |
| `IrDonglePermissionResult` | `{granted: boolean}` for the requested current device |

```ts
interface NativeIrFramePayload {
  receivedAtMs: number;        // Unix epoch ms assigned at USB read
  carrierHz: number | null;    // null if not documented/reported
  timingsUs: number[];         // empty for opaque bytes; never invented
  frameBytesHex: string | null;// exact received bytes, including headers
  interfaceId?: number;
  endpointAddress?: number;
  deliveryId?: number;         // physical flow-control token, not a patient/device ID
}
```

Timing arrays are copied/frozen by JS. Transport metadata is preserved in raw
storage. The synthetic AA55 codec is explicit lab prior art, not an ELKSMART
decoder. Corrupt/unknown chunks must still reach raw persistence.

## Acquisition and persistence

An app-wide AED consumer is installed before initialization. Native delivery
uses bounded queues and waits for JS acknowledgement after repository writes.
Storage errors pause acknowledged progress and notify the UI rather than
returning a successful empty capture. Hardware overflow remains a measured
throughput question, not a zero-loss promise.

AED sessions start on the first chunk and end after five seconds of inactivity.
Every raw chunk is independently retained in the encrypted session raw list;
parsed events reference `rawFrameIndex`. Unknown formats use raw fallback.
The fictional HS-AED parser is allowed for simulated traffic only.

All Devices selects `ALL_DEVICES` while listening, persists through the same
recording repository and restores AED routing on Stop. Its explicit Save
assigns the chosen label; unknown signals remain saveable. JSON/CSV exports
carry raw bytes/timings, timestamps, source, labels and decoded fields.
Leaving the workflow also drains pending frames and restores AED routing.
App bootstrap disables simulation in all builds; simulator APIs and legacy
`REMOTE_TEST` source support are retained only for internal tests and old data.

## Permission and resource rules

- Android USB permission is managed by `UsbManager`, not fabricated/persisted.
- PendingIntents are package-scoped; Android 12+ mutable result extras are
  validated against pending ID, current device presence and `hasPermission`.
- Denial does not repeatedly prompt on foreground resume; Grant retries.
- Unknown VID/PID devices are listed but are not claimed without explicit
  selection; other attachments do not replace the attached selected dongle.
- Detach closes transport and marks the active session partial. Reattach
  re-enumerates and automatically resumes when permission exists.
- Foreground resume rechecks permission. Background receiving is process-bound;
  no foreground service or killed-process guarantee is supplied.
- All USB resource operations are off the UI thread. Cleanup cancels pending
  reads and releases claimed interfaces. Normal detach/stop drains acquired
  chunks with persistence acknowledgements for up to five seconds. If draining
  cannot finish, `USB_DELIVERY_INCOMPLETE` explicitly reports incomplete
  delivery before remaining waits are canceled. Delivery IDs stay monotonic
  across reconnects; stale acknowledgements cannot release a new delivery.

The inactive `IrDongleDecodedSignalReceived` extension is reserved for explicitly
configured synthetic lab profiles. All current physical profiles are raw-only;
JS does not consume this extension and no physical profile should enable it
without a documented codec and coordinated JS implementation. The debug
simulator continues to use `IrDongleFrameReceived` with its synthetic timings.

## Errors and privacy

Transport/open/claim/no-input/permission/read errors are explicit and mapped to
`AppError`; `RECEIVE_PROTOCOL_UNVERIFIED` is no longer emitted as the normal
permission-granted state. JS persistence failures use `STORAGE_ERROR`.
Release builds reject simulator enable with `SIMULATOR_DISABLED`.

Logs contain only redacted codes/counts/states, never serials, wire bytes,
timings or clinical/device payloads. USB Diagnostics intentionally displays raw
data and only shares/copies it after a user action. Test with bench data only.
