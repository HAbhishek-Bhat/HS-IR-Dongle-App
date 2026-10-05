# Native Bridge API — `IrDongle` (Android Kotlin)

Module name: `IrDongle`  
Package registration: `com.hsircapture.usb.IrDonglePackage`  
JS facade: `src/native/IrDongleBridge.ts`

## Methods

| Method | Args | Returns | Description |
|--------|------|---------|-------------|
| `initialize()` | — | `Promise<void>` | Registers USB receivers, prepares serial reader, scans attached devices. |
| `startListening()` | — | `Promise<void>` | Starts bulk USB read loop (or simulator frames). Requires permission + supported dongle. |
| `stopListening()` | — | `Promise<void>` | Stops read loop / simulator. |
| `requestPermission()` | — | `Promise<boolean>` | Requests USB permission dialog. `true` if already granted. |
| `getConnectionState()` | — | `Promise<DongleConnectionNative>` | Snapshot of connection status. |
| `setSimulatorMode(enabled)` | `boolean` | `Promise<void>` | Enables software IR frame generator for demo/tests. |
| `destroy()` | — | `Promise<void>` | Tears down receivers, coroutines, and connections. |

### `DongleConnectionNative`

```ts
{
  status: 'disconnected' | 'permission_required' | 'connecting' | 'connected' | 'unsupported' | 'error';
  dongle?: {
    deviceName: string;
    vendorId: number;
    productId: number;
    manufacturerName: string | null;
    serialNumber: string | null;
    connected: boolean;
  };
  reason?: string;   // unsupported
  message?: string;  // error
  code?: string;     // error
}
```

## Events (`NativeEventEmitter` / `DeviceEventEmitter`)

| Event | Payload |
|-------|---------|
| `IrDongleConnectionChanged` | `DongleConnectionNative` |
| `IrDongleFrameReceived` | `NativeIrFramePayload` |
| `IrDongleError` | `{ code: string; message: string }` |
| `IrDonglePermissionResult` | `{ granted: boolean }` |

### `NativeIrFramePayload`

```ts
{
  receivedAtMs: number;
  carrierHz: number | null;
  timingsUs: number[];      // +mark / -space microseconds
  frameBytesHex: string | null; // exact trailing/opaque bytes when present
}
```

## Error codes

- `PERMISSION_DENIED`
- `DONGLE_REMOVED`
- `USB_OPEN_FAILED` / `USB_CLAIM_FAILED` / `USB_NO_ENDPOINT`
- `NO_DONGLE`
- `INIT_FAILED` / `LISTEN_FAILED`

## Lifecycle

- Receivers registered on `initialize` / `onHostResume`
- Read loop continues across `onHostPause` for short clinical captures
- Full teardown on `onHostDestroy` / `destroy` / `invalidate`
- Hot-unplug emits `DONGLE_REMOVED` then `disconnected`; JS services save partial sessions

## Wire format (default assumption)

```
AA 55 | len:u16 LE | carrierHz:u32 LE | count:u16 LE | timings:i16 LE × count | [payload…] | crc8
```

Documented in `IrFrameCodec.kt`. Replace when OEM dongle framing is confirmed.
