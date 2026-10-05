import type {RawIrFrame, SignalSignature} from '../../entities/types';
import {createRawFallbackDecode, decodeIrFrame} from '../ir/irDecoder';
import type {AedParsedEvent, AedProtocolParser} from './AedProtocolParser';

/**
 * Fallback parser for unknown AEDs.
 * Stores every frame as a labeled raw_frame event without interpretation.
 */
export class RawCaptureAedParser implements AedProtocolParser {
  readonly id = 'raw-capture';
  readonly manufacturer = 'Unknown';
  readonly model = 'Raw Capture';
  readonly description =
    'Fallback mode: captures exact IR frames for unknown AED models without decoding clinical meaning.';

  canHandle(_signature: SignalSignature, _frame: RawIrFrame): boolean {
    return true;
  }

  parseFrame(frame: RawIrFrame, signature: SignalSignature): AedParsedEvent[] {
    const decoded = decodeIrFrame(frame) ?? createRawFallbackDecode(frame);
    return [
      {
        type: 'raw_frame',
        label: `Raw IR Frame (${signature.displayName})`,
        decoded,
        metadata: {
          parserId: this.id,
          timingCount: frame.timingsUs.length,
          protocol: decoded.protocol,
        },
      },
    ];
  }
}
