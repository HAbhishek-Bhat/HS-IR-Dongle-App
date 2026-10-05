import type {RawIrFrame, SignalSignature} from '../../entities/types';
import type {AedProtocolParser} from './AedProtocolParser';
import {HsAedV1Parser} from './HsAedV1Parser';
import {RawCaptureAedParser} from './RawCaptureAedParser';

const parsers: AedProtocolParser[] = [];
const rawFallback = new RawCaptureAedParser();

export function registerAedParser(parser: AedProtocolParser): void {
  const existing = parsers.findIndex(p => p.id === parser.id);
  if (existing >= 0) {
    parsers[existing] = parser;
  } else {
    parsers.push(parser);
  }
}

export function getRegisteredAedParsers(): readonly AedProtocolParser[] {
  return parsers;
}

export function resolveAedParser(
  signature: SignalSignature,
  frame: RawIrFrame,
  preferredParserId?: string | null,
  allowExampleParser = false,
): AedProtocolParser {
  if (preferredParserId) {
    const preferred = parsers.find(p => p.id === preferredParserId);
    if (
      preferred &&
      (allowExampleParser || preferred.id !== 'hs-aed-v1') &&
      preferred.canHandle(signature, frame)
    ) {
      return preferred;
    }
  }
  for (const parser of parsers) {
    if (parser.id === rawFallback.id) {
      continue;
    }
    if (!allowExampleParser && parser.id === 'hs-aed-v1') continue;
    if (parser.canHandle(signature, frame)) {
      return parser;
    }
  }
  return rawFallback;
}

/** Bootstrap default parsers. Call once at app start. */
export function bootstrapAedParsers(): void {
  registerAedParser(new HsAedV1Parser());
  registerAedParser(rawFallback);
}
