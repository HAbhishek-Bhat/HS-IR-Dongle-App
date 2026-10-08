# Signal signatures & AED parsers

## Why signatures?

IR has no discovery protocol. Remotes and AEDs simply emit pulses. HS IR Capture synthesizes a stable **signal signature** from each frame:

1. **Protocol family** — NEC / RC5 / SIRC / RAW (from decoders)
2. **Carrier frequency** — when the dongle reports it
3. **Address / device ID** — from decoded payload when available
4. **Timing fingerprint** — FNV-1a over quantized early timings for RAW-only frames

The signature `key` is a deterministic 8-hex hash used for logical Device Capture
discovery. It is not a unique physical-device identifier. Opaque USB reports
without documented timings cannot provide a meaningful pulse fingerprint.
Automatic AED sessions group by inactivity and never discard a report because
its signature differs from an earlier frame.

Strength is derived from recency (and hit count for UX), not RF RSSI (USB IR dongles typically do not expose RSSI).

Relevant code:

- `src/domain/parsers/ir/signalSignature.ts`
- `src/domain/services/CaptureService.ts`
- `src/domain/services/AedRetrievalService.ts`

## Adding a new AED parser

1. Create `src/domain/parsers/aed/MyManufacturerParser.ts` implementing `AedProtocolParser`.
2. Implement `canHandle(signature, frame)` with manufacturer-specific preambles, addresses, or hex markers.
3. Implement `parseFrame` to emit labeled `AedParsedEvent`s. **Always keep `rawFrame` untouched** — the retrieval service attaches the original frame.
4. Register in `bootstrapAedParsers()` via `registerAedParser(new MyManufacturerParser())`.
5. Add unit tests under `__tests__/parsers/`.

Unknown devices automatically fall through to `RawCaptureAedParser` (`raw-capture`),
which stores every frame as `raw_frame` without clinical interpretation. All
wire frames are also saved independently in `AedSession.rawFrames`, including
when a parser throws or returns no events. Event metadata contains
`rawFrameIndex` linking back to the session raw list.

### Example

See `HsAedV1Parser` for a fictional lab example mapping status bytes (`0x10`
analyzing, `0x20` shock advised, etc.) from NEC commands or `4853...` hex payloads.
It is allowed only for simulator traffic, never physical dongle data. A real
OEM parser needs a cited protocol and validated non-patient vectors.

## Passive AED scan and serial numbers

AED Event Capture offers a 15-second passive scan of incoming IR/IrDA data.
Align the AED port and enable its transfer mode. This does not implement active
IrDA discovery or negotiate an IrDA link; reception depends on compatible
receiver hardware and its transport. Stopping a scan, leaving the screen, or
timing out only removes scan UI subscriptions; automatic raw capture continues.
Each scan excludes previously seen sources unless they transmit again.
The receiver banner and scan panel share a scrollable header, with native
offscreen clipping disabled so scan controls remain mounted during updates.
The no-data hint appears below the banner status instead of competing for row
width on narrow screens. Stop scan and Scan again remain part of the panel.

A validated OEM parser may set `AedParsedEvent.serialNumber` from its documented
AED identity field. The retrieval service saves it in encrypted event metadata,
alongside the authoritative `parserId`. The scan, session list and session detail
use the same identity helper. History also displays and searches reported serials.
Raw/unparsed and fictional lab parser results
never provide a serial number. Missing identity is displayed as **Not reported**,
not replaced by a USB dongle serial, NEC address or generated signal signature.
Existing stored sessions remain compatible; no database migration is needed.
Known serial numbers distinguish scan results even when signal signatures match.
A different reported serial closes the current session before capturing the
new device's frame, so identified AEDs do not share a session. Unidentified
traffic continues to use the existing inactivity grouping.
