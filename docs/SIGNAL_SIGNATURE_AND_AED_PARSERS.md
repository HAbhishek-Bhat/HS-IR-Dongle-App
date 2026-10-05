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
