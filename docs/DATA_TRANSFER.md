# AED → IR dongle → phone: data transfer

How data moves from an **AED** (or IR remote) to the **USB-C IR dongle** to the **Android device** running HS IR Capture, including physical layers, USB transport, protocols, algorithms, session rules, and known limits.

Related docs: [ASSUMPTIONS.md](ASSUMPTIONS.md), [NATIVE_BRIDGE_API.md](NATIVE_BRIDGE_API.md), [SIGNAL_SIGNATURE_AND_AED_PARSERS.md](SIGNAL_SIGNATURE_AND_AED_PARSERS.md), [LIBRARIES.md](../LIBRARIES.md).

---

## 1. End-to-end overview

```text
┌─────────────┐   optical IR    ┌──────────────────┐   USB (bulk / interrupt IN)   ┌─────────────────┐
│ AED / remote│ ───────────────► │ USB-C IR dongle  │ ─────────────────────────────► │ Android phone   │
│ (emitter)   │  ~940 nm pulses │ (demod / MCU)    │  VID:PID allowlisted host     │ HS IR Capture   │
└─────────────┘                 └──────────────────┘                                └────────┬────────┘
                                                                                              │
                    Kotlin native module (IrDongle / UsbSerialReader)                          │
                    React Native bridge events (IrDongleFrameReceived)                         │
                    TypeScript: DongleService → AedRetrievalService / CaptureService           │
                    Optional decode: NEC / RC5 / SIRC + AED parsers → SQLite                   ▼
```

**Important boundaries**

| Layer | What is transferred | What is *not* guaranteed |
|-------|---------------------|--------------------------|
| Optical (AED → dongle) | Modulated IR light (marks/spaces) | App cannot see this layer; no RSSI |
| USB (dongle → phone) | Raw byte chunks from IN endpoints | Not necessarily complete IR frames |
| App decode | Timings → NEC/RC5/SIRC / AED events | Opaque USB hex cannot invent timings |
| Persistence | Every USB chunk before ack | Hardware FIFO overflow if app is too slow |

There is **no IR discovery protocol**. The AED/remote simply emits pulses; the phone synthesizes identity later via **signal signatures**.

---

## 2. Physical / optical factors (AED → dongle)

These affect whether the dongle ever sees a usable signal. The app does not control them.

| Factor | Notes |
|--------|--------|
| **Line of sight** | IR is typically near-infrared (~850–940 nm); needs a clear path to the dongle receiver |
| **Distance & angle** | Range and beam width depend on AED emitter and dongle photodiode |
| **Ambient IR / sunlight** | Can raise noise floor; dongles may filter poorly in bright light |
| **Carrier frequency** | Consumer IR often ~36–40 kHz; AED OEM may differ or use another IR style |
| **Modulation** | Classic remotes use on/off keying of a carrier; some devices may use IrDA-style serial or proprietary formats |
| **Duty cycle / repeat** | Many remotes repeat while a button is held; AED event streams may be bursty |
| **Dongle receive capability** | Identification (VID/PID) ≠ proven optical receive. ELKSMART `045C:0132` is identified, not verified as a learner/receiver |

### Open physical questions (from project assumptions)

1. Does firmware `045C:0132` passively receive IR, need a learn command, or only transmit?
2. What is its wire/report format (headers, units, carrier, report IDs, checksums, max rate)?
3. Do in-scope AEDs emit demodulated remote-control IR, IrDA serial, or another physical layer?

Until those are answered with OEM docs, **physical traffic is stored as raw USB bytes**; clinical interpretation requires a validated OEM parser.

---

## 3. USB transport (dongle → Android)

### 3.1 Host stack

| Piece | Role |
|-------|------|
| Android **USB Host API** (`UsbManager`, `UsbDevice`, endpoints) | Enumerate device, permission, claim interfaces, queue reads |
| **`UsbSerialReader`** | Opens all readable **bulk IN** and **interrupt IN** endpoints; one `requestWait` owner per connection |
| **`IrDongleModule`** | React Native module: lifecycle, permission, events, simulator, diagnostics |
| **`UsbDongleIds`** | VID/PID allowlist + transport labels + codec/baud profiles |
| **`device_filter.xml`** | Intent filter so Android can prompt when a known dongle is attached |

### 3.2 Supported dongle identities (allowlist)

| VID:PID | Label | Transport note |
|---------|-------|----------------|
| `045C:0132` | ELKSMART Smart IR Blaster | Vendor-specific (`FF/F0`); opaque raw by default |
| `1A86:7523` | CH340 IR Dongle | USB-UART profile (identification only) |
| `1A86:5523` | CH341 IR Dongle | USB-UART profile |
| `10C4:EA60` | CP210x IR Dongle | USB-UART profile |
| `10C4:EA70` | CP2105 IR Dongle | USB-UART profile |
| `0403:6001` | FTDI FT232 IR Dongle | USB-UART profile |
| `0403:6015` | FTDI FT231X IR Dongle | USB-UART profile |
| `067B:2303` | Prolific PL2303 IR Dongle | USB-UART profile |
| `1209:4853` | HS IR Capture Dongle (lab) | Engineering placeholder |

Unknown VID/PID devices are **ignored**.

### 3.3 USB classes and how bytes are read

| USB class / endpoint | App behavior |
|----------------------|--------------|
| **Bulk IN** | Queued with `UsbRequest`; each completed transfer → one raw chunk |
| **Interrupt IN** (e.g. HID) | Same read path; retained as **opaque input reports** (including report-ID byte). **Not** converted into invented pulse timings |
| **CDC ACM** | If a CDC Comm interface is present, app may set line coding (**default baud 115200**, 8N1-style) via control transfers `0x21/0x20` and `0x21/0x22`. Applied only to CDC classes — **not** inferred for ELKSMART |
| **Vendor-specific** | No undocumented learn/receive vendor commands are sent |

### 3.4 Codec profiles

| Profile | When used | Behavior |
|---------|-----------|----------|
| **`RAW` (default)** | All current physical allowlist entries | Each USB chunk → hex string + empty `timingsUs`; no pulse invention |
| **`SYNTHETIC_AA55`** | Explicit lab/simulator framing only | Rolling buffer + `IrFrameCodec.extractFrames` for `0xAA 0x55` frames |

The AA55 codec is a **synthetic lab format**, not an ELKSMART OEM specification.

### 3.5 Delivery / backpressure algorithm

1. Native read completes → chunk assigned `receivedAtMs` (Unix epoch ms).
2. Chunk enters a **bounded delivery queue** (`UsbCaptureDelivery`).
3. Native emits `IrDongleFrameReceived` with optional **`deliveryId`**.
4. JS (`DongleService`) fans out to listeners (AED auto-capture, Remote Test, UI).
5. After **all consumers finish persistence**, JS calls `acknowledgeFrame(deliveryId)`.
6. Only then does native allow the next physical delivery to proceed.

| Rule | Value / behavior |
|------|------------------|
| Drop policy | Soft backpressure: suspend acquisition rather than discard completed reads |
| Drain on stop/detach | Up to **5 seconds** for queued chunks to be acknowledged |
| Incomplete drain | Error `USB_DELIVERY_INCOMPLETE` — unpersisted queued bytes not guaranteed |
| Storage failure | Delivery **not** acknowledged; UI gets `STORAGE_ERROR`; reception effectively paused |
| Delivery IDs | Monotonic across reconnects; stale acks cannot release a new delivery |

This is **not** a guarantee that the dongle’s hardware FIFO never overflows under sustained high rate.

### 3.6 Connection state machine

```text
disconnected → detected → permission_required → connecting → listening ⇄ receiving
                          → permission_denied                    → error
```

- **`listening`**: USB input transport open/waiting — **not** proof of optical IR reception.
- **`receiving`**: Data activity on the wire.
- Auto-start: attach + permission (+ foreground resume) opens passive endpoints; no manual “Start AED” required for default acquisition.

---

## 4. Synthetic AA55 frame protocol (lab / simulator)

Used only when the codec profile is `SYNTHETIC_AA55` or when the **debug simulator** synthesizes timings. **Not** applied automatically to opaque physical ELKSMART reports.

### Wire layout

```text
[0xAA][0x55][len:u16 LE][carrierHz:u32 LE][count:u16 LE][timings:i16 LE × count][crc8][optional payload…]
```

| Field | Meaning |
|-------|---------|
| Sync | `0xAA 0x55` |
| `len` | Payload length (6…2048) |
| `carrierHz` | Carrier; `0` → treated as unknown/`null` |
| `count` | Number of timing samples (max **512**) |
| `timings` | Signed µs: **positive = mark**, **negative = space** |
| `crc8` | CRC-8 over sync + len + payload (poly-style XOR with `0x07`) |

### Extract algorithm (`IrFrameCodec.extractFrames`)

1. Seek sync bytes in a rolling buffer.
2. Read length; wait if incomplete.
3. Verify CRC; on failure, skip sync and continue (do not invent data).
4. Parse carrier + timings; emit `DecodedNativeFrame`.
5. Keep remainder bytes for the next USB chunk.
6. Corrupt-length recovery: scan ahead for another sync whose length + CRC validate.

Simulator encode uses the same layout (`encodeFrame`) for loopback tests.

---

## 5. React Native bridge payload

Event: **`IrDongleFrameReceived`**

| Field | Meaning |
|-------|---------|
| `receivedAtMs` | Timestamp at USB read |
| `carrierHz` | Carrier if documented/reported; else `null` |
| `timingsUs` | Pulse timings in µs; **empty** for opaque physical bytes |
| `frameBytesHex` | Exact received bytes (headers included) |
| `interfaceId` / `endpointAddress` | USB source of the chunk |
| `deliveryId` | Flow-control token for acknowledgement |

JS maps this to domain `RawIrFrame` via `IrDongleBridge` / `DongleService`.

---

## 6. IR protocol decoders (app layer)

Decoding runs in TypeScript **only when `timingsUs` is non-empty**. Opaque USB hex alone cannot produce honest waveforms, carrier, address, or command.

Pipeline: `decodeIrFrame` tries **NEC → RC5 → SIRC** and keeps the **highest confidence** match. Timings are never mutated.

### 6.1 NEC (standard 32-bit)

| Parameter | Nominal | Tolerance |
|-----------|---------|-----------|
| Header mark | 9000 µs | ±30% |
| Header space | 4500 µs | ±30% |
| Bit mark | 560 µs | ±30% |
| Logic 1 space | 1690 µs | ±30% |
| Logic 0 space | 560 µs | ±30% |
| Bit count | 32 | — |

**Algorithm:** find header, decode LSB-first bits into address / ~address / command / ~command. Confidence boosts when inverse bytes match (`xor == 0xFF`). Label `NEC` vs `NECext` accordingly.

### 6.2 Philips RC5 (bi-phase / Manchester)

| Parameter | Value |
|-----------|-------|
| Half-bit | 889 µs (±35%) |
| Structure | Start bits, toggle, 5-bit address, 6-bit command |
| Confidence | 0.85 when structure validates |

**Algorithm:** expand half/full bit durations onto a half-bit grid, sample Manchester pairs (`10`→1, `01`→0).

### 6.3 Sony SIRC (12 / 15 / 20 bit)

| Parameter | Nominal | Tolerance |
|-----------|---------|-----------|
| Header mark | 2400 µs | ±30% |
| Header space | 600 µs | ±30% |
| One mark | 1200 µs | ±30% |
| Zero mark | 600 µs | ±30% |
| Bit space | 600 µs | ±30% |

**Algorithm:** find header; decode command (7 bits) + address (5 / 8 / 13 bits) by mark width. Protocols labeled `SIRC` / `SIRC15` / `SIRC20`. Confidence ~0.8.

### 6.4 RAW fallback

If no decoder matches (or timings empty after physical opaque path):

- Protocol `RAW`, confidence `0.1`
- Still stored; used for exports and signatures

---

## 7. Signal signature algorithm (logical “device” identity)

IR has no discovery. The app builds a stable **signal signature** per frame:

1. **Protocol family** — NEC / RC5 / SIRC / RAW / …
2. **Carrier frequency** — when present
3. **Address / device ID** — from decoded payload when available
4. **Timing fingerprint** — for RAW-only: FNV-1a over first 32 timings quantized to 50 µs steps

**Key** = FNV-1a 32-bit hex of `protocol|carrier|idPart`.

| Use | Behavior |
|-----|----------|
| Device Capture list | Group by signature key |
| Signal strength UX | Recency buckets (2s / 5s / 15s / 60s) — **not** RF RSSI |
| AED sessions | Group by **inactivity**, not by requiring matching signatures; raw hashes do not discard frames |

Hash: **FNV-1a** (`offset 0x811c9dc5`, prime `0x01000193`).

---

## 8. AED session & event path

Default capture source is **`AED`**. An app-wide consumer is registered before native init.

```text
USB chunk
  → DongleService.onFrame
  → AedRetrievalService.handleFrame (if source === AED)
      1. decodeIrFrame (if timings exist)
      2. buildSignalSignature
      3. start/continue session; append raw frame (always)
      4. resolveAedParser → parseFrame → AedEvent[]
      5. persist encrypted session snapshot (incremental)
      6. reset 5s inactivity timer
  → acknowledgeFrame (after all listeners finish)
```

### 8.1 Session boundaries

| Rule | Detail |
|------|--------|
| Start | First received chunk while AED routing is active |
| End | **5 seconds** of inactivity (configurable in constructor), or disconnect → **partial** |
| Raw retention | Every USB chunk in `AedSession.rawFrames` even if parser fails |
| Event link | `metadata.rawFrameIndex` points into the raw list |
| Screen Stop | Does **not** stop app-wide AED reception |
| Remote Test | Temporarily sets source `REMOTE_TEST`; Stop restores AED routing |

### 8.2 AED parsers

| Parser | ID | Role |
|--------|----|------|
| **`RawCaptureAedParser`** | `raw-capture` | Default for physical unknown devices: store as `raw_frame` without clinical meaning |
| **`HsAedV1Parser`** | `hs-aed-v1` | **Fictional lab example** — allowed for **simulator** traffic only, never physical dongle data |

#### Example HS-AED status map (simulator / lab only)

| Status byte | Event |
|-------------|-------|
| `0x01` | power_on |
| `0x02` / `0x03` | pads_connected / pads_disconnected |
| `0x10` | analyzing |
| `0x20` / `0x21` | shock_advised / no_shock_advised |
| `0x30` / `0x31` | charging / shock_delivered |
| `0x40` | cpr_prompt |
| `0x50` | self_test |
| `0x60` | battery_low |
| `0x7F` | error |

Wire hints in the example parser: NEC command map, or hex payload starting with **`4853`** (“HS”) + status byte. Production clinical use needs a **cited OEM protocol** and validated non-patient vectors.

---

## 9. Persistence, privacy, and export

| Factor | Behavior |
|--------|----------|
| Store when | Incrementally on each frame (not only on Stop/Save) |
| Encryption | Keychain-backed field encryption for raw/decoded blobs (not full SQLCipher by default) |
| Database | `react-native-quick-sqlite` |
| Export | JSON/CSV include raw hex/timings, timestamps, source, decoded fields |
| Logging | Codes/counts only — no wire bytes or clinical payloads in ordinary logs |
| USB Diagnostics | May show live hex; copy/share is an explicit user action |

---

## 10. Lifecycle & environmental factors

| Factor | Effect on transfer |
|--------|--------------------|
| USB permission denied | No open endpoints; Grant required |
| Dongle detach | Transport closed; active session marked partial |
| Reattach | Re-enumerate; resume if permission still granted |
| App background / process death | No foreground service; capture can stop; persisted frames survive, incomplete reads do not |
| Power management | Aggressive OEM battery policies can interrupt USB reception |
| Throughput | Sustained AED streams vs SQLite rewrite cost — soak-test on hardware |
| iOS | IR USB path not supported in this build |

---

## 11. Factor checklist (quick reference)

### Must be true for data to appear in the app

1. AED/remote actually emits IR the dongle can receive  
2. Dongle firmware delivers those receives over USB IN  
3. Dongle VID/PID is allowlisted  
4. Android USB permission granted  
5. App process alive with native module listening  
6. JS persistence succeeds so acknowledgements advance  

### Required for *decoded* IR (NEC/RC5/SIRC)

1. Dongle (or AA55 lab codec) supplies **real pulse timings** in a documented format  
2. Timings match protocol tolerances (±30% NEC/SIRC, ±35% RC5)  

### Required for *clinical AED events*

1. OEM protocol documented and parser registered  
2. Validated non-patient test vectors  
3. Do **not** treat `hs-aed-v1` as physical truth  

---

## 12. Code map

| Concern | Location |
|---------|----------|
| VID/PID allowlist | `android/.../usb/UsbDongleIds.kt` |
| USB read / CDC / delivery | `android/.../usb/UsbSerialReader.kt` |
| RN native module | `android/.../usb/IrDongleModule.kt` |
| AA55 codec + CRC | `android/.../ir/IrFrameCodec.kt` |
| USB filter | `android/app/src/main/res/xml/device_filter.xml` |
| JS bridge | `src/native/IrDongleBridge.ts` |
| Frame fan-out / ack | `src/domain/services/DongleService.ts` |
| AED sessions | `src/domain/services/AedRetrievalService.ts` |
| NEC / RC5 / SIRC | `src/domain/parsers/ir/*.ts` |
| Signatures | `src/domain/parsers/ir/signalSignature.ts` |
| AED parsers | `src/domain/parsers/aed/*.ts` |

---

## 13. One-sentence summary

**The AED emits optical IR; the dongle converts reception into USB bulk/interrupt bytes; Android passively reads those chunks with backpressure acknowledgements; the app always stores raw bytes and only decodes NEC/RC5/SIRC or AED semantics when documented timings/parsers exist — there is no automatic OEM AED protocol for physical dongles in this build.**
