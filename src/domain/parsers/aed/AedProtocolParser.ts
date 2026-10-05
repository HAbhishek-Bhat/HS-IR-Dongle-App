import type {AedEventType, DecodedIrData, RawIrFrame, SignalSignature} from '../../entities/types';

/**
 * Pluggable AED protocol/parser interface.
 *
 * To add a new manufacturer/model parser:
 * 1. Create a class implementing AedProtocolParser in this folder.
 * 2. Register it in aedParserRegistry.ts via registerAedParser(...).
 * 3. Prefer matching on manufacturer/model or a unique preamble in canHandle().
 * 4. Always attach the original RawIrFrame to every emitted event — never mutate timings.
 * 5. Unknown frames should return type 'raw_frame' or 'unknown', not throw.
 */
export interface AedParsedEvent {
  type: AedEventType;
  label: string;
  decoded: DecodedIrData | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface AedProtocolParser {
  /** Unique parser id, e.g. "hs-aed-v1". */
  readonly id: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly description: string;

  /** Return true if this parser should attempt the frame/signature. */
  canHandle(signature: SignalSignature, frame: RawIrFrame): boolean;

  /** Parse one raw frame into zero or more labeled events. */
  parseFrame(frame: RawIrFrame, signature: SignalSignature): AedParsedEvent[];
}
