import type {RawIrFrame, SignalSignature} from '../../entities/types';
import {decodeIrFrame} from '../ir/irDecoder';
import type {AedParsedEvent, AedProtocolParser} from './AedProtocolParser';

/**
 * Example AED parser for a fictional "HS AED" IR status stream.
 *
 * Assumed wire format (documented default — replace with real OEM docs):
 * - Frames use NEC-like 32-bit payloads when protocol matches, OR
 * - A custom 8-byte hex payload in frameBytesHex: "HS" + status byte + sequence
 *
 * Status byte map:
 *  0x01 power_on
 *  0x02 pads_connected
 *  0x03 pads_disconnected
 *  0x10 analyzing
 *  0x20 shock_advised
 *  0x21 no_shock_advised
 *  0x30 charging
 *  0x31 shock_delivered
 *  0x40 cpr_prompt
 *  0x50 self_test
 *  0x60 battery_low
 *  0x7F error
 */
const STATUS_MAP: Record<number, {type: AedParsedEvent['type']; label: string}> = {
  0x01: {type: 'power_on', label: 'Power On'},
  0x02: {type: 'pads_connected', label: 'Pads Connected'},
  0x03: {type: 'pads_disconnected', label: 'Pads Disconnected'},
  0x10: {type: 'analyzing', label: 'Analyzing Rhythm'},
  0x20: {type: 'shock_advised', label: 'Shock Advised'},
  0x21: {type: 'no_shock_advised', label: 'No Shock Advised'},
  0x30: {type: 'charging', label: 'Charging'},
  0x31: {type: 'shock_delivered', label: 'Shock Delivered'},
  0x40: {type: 'cpr_prompt', label: 'CPR Prompt'},
  0x50: {type: 'self_test', label: 'Self Test'},
  0x60: {type: 'battery_low', label: 'Battery Low'},
  0x7f: {type: 'error', label: 'Device Error'},
};

function parseStatusFromHex(frameBytesHex: string | null): number | null {
  if (!frameBytesHex) {
    return null;
  }
  const normalized = frameBytesHex.replace(/\s+/g, '').toUpperCase();
  // Expect at least: 4853 (HS) + status
  if (normalized.length < 6 || !normalized.startsWith('4853')) {
    return null;
  }
  const statusHex = normalized.slice(4, 6);
  const status = Number.parseInt(statusHex, 16);
  return Number.isFinite(status) ? status : null;
}

function parseStatusFromNecCommand(command: number | null): number | null {
  if (command == null) {
    return null;
  }
  return STATUS_MAP[command] ? command : null;
}

export class HsAedV1Parser implements AedProtocolParser {
  readonly id = 'hs-aed-v1';
  readonly manufacturer = 'HeartSafe';
  readonly model = 'HS-AED-1';
  readonly description =
    'Example parser for HS AED IR event stream (NEC command map + HS-prefixed hex frames).';

  canHandle(signature: SignalSignature, frame: RawIrFrame): boolean {
    if (signature.deviceIdCode?.toUpperCase().includes('HS-AED')) {
      return true;
    }
    if (frame.frameBytesHex?.toUpperCase().replace(/\s+/g, '').startsWith('4853')) {
      return true;
    }
    // Address 0xA1 reserved in our example OEM map for HS AED
    return signature.address === 0xa1 || signature.protocol === 'NEC';
  }

  parseFrame(frame: RawIrFrame, _signature: SignalSignature): AedParsedEvent[] {
    const decoded = decodeIrFrame(frame);
    const status =
      parseStatusFromHex(frame.frameBytesHex) ?? parseStatusFromNecCommand(decoded?.command ?? null);

    if (status == null) {
      return [
        {
          type: 'raw_frame',
          label: 'Unmapped HS AED Frame',
          decoded,
          metadata: {parserId: this.id, reason: 'no_status_byte'},
        },
      ];
    }

    const mapped = STATUS_MAP[status] ?? {type: 'unknown' as const, label: `Status 0x${status.toString(16)}`};
    return [
      {
        type: mapped.type,
        label: mapped.label,
        decoded,
        metadata: {
          parserId: this.id,
          statusByte: status,
          manufacturer: this.manufacturer,
          model: this.model,
        },
      },
    ];
  }
}
