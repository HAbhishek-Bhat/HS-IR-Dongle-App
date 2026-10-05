# Signal signatures & AED parsers

## Why signatures?

IR has no discovery protocol. Remotes and AEDs simply emit pulses. HS IR Capture synthesizes a stable **signal signature** from each frame:

1. **Protocol family** — NEC / RC5 / SIRC / RAW (from decoders)
2. **Carrier frequency** — when the dongle reports it
3. **Address / device ID** — from decoded payload when available
4. **Timing fingerprint** — FNV-1a over quantized early timings for RAW-only frames

The signature `key` is a deterministic 8-hex hash. Devices that share a key are treated as the same logical source in Device Capture and AED lists.

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

Unknown devices automatically fall through to `RawCaptureAedParser` (`raw-capture`), which stores every frame as `raw_frame` without clinical interpretation.

### Example

See `HsAedV1Parser` for a complete documented example mapping status bytes (`0x10` analyzing, `0x20` shock advised, …) from either NEC commands or `4853…` hex payloads.
