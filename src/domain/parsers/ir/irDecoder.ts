import type {DecodedIrData, RawIrFrame} from '../../entities/types';
import {parseNec} from './necParser';
import {parseRc5} from './rc5Parser';
import {parseSirc} from './sircParser';

export type IrFrameDecoder = (frame: RawIrFrame) => DecodedIrData | null;

const DEFAULT_DECODERS: IrFrameDecoder[] = [parseNec, parseRc5, parseSirc];

/**
 * Tries registered protocol parsers and returns the highest-confidence match.
 * Raw timings are never modified — decoding is read-only.
 */
export function decodeIrFrame(
  frame: RawIrFrame,
  decoders: IrFrameDecoder[] = DEFAULT_DECODERS,
): DecodedIrData | null {
  if (frame.timingsUs.length === 0) {
    return null;
  }

  let best: DecodedIrData | null = null;
  for (const decode of decoders) {
    try {
      const result = decode(frame);
      if (result && (!best || result.confidence > best.confidence)) {
        best = result;
      }
    } catch {
      // Corrupted frame for this parser — try next
    }
  }
  return best;
}

export function createRawFallbackDecode(frame: RawIrFrame): DecodedIrData {
  return {
    protocol: 'RAW',
    address: null,
    command: null,
    extras: {
      timingCount: frame.timingsUs.length,
      carrierHz: frame.carrierHz ?? 'unknown',
    },
    confidence: 0.1,
  };
}
