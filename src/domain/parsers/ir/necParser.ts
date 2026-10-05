import type {DecodedIrData, RawIrFrame} from '../../entities/types';

/**
 * NEC IR protocol decoder (standard 32-bit).
 * Tolerances allow ±30% deviation from nominal pulse widths.
 */
const NEC_HEADER_MARK = 9000;
const NEC_HEADER_SPACE = 4500;
const NEC_BIT_MARK = 560;
const NEC_ONE_SPACE = 1690;
const NEC_ZERO_SPACE = 560;
const TOLERANCE = 0.3;

function near(actual: number, expected: number): boolean {
  const abs = Math.abs(actual);
  return Math.abs(abs - expected) <= expected * TOLERANCE;
}

export function parseNec(frame: RawIrFrame): DecodedIrData | null {
  const t = frame.timingsUs;
  // Header (2) + 32 bits × (mark+space) (64) + optional trailing mark
  if (t.length < 66) {
    return null;
  }

  // Find header: +9000, -4500
  let start = 0;
  while (start <= t.length - 66) {
    if (near(t[start], NEC_HEADER_MARK) && near(t[start + 1], NEC_HEADER_SPACE) && t[start] > 0) {
      break;
    }
    start += 1;
  }
  if (start > t.length - 66) {
    return null;
  }

  let bits = 0;
  let value = 0;
  for (let i = 0; i < 32; i += 1) {
    const mark = t[start + 2 + i * 2];
    const space = t[start + 3 + i * 2];
    if (mark == null || space == null || !near(mark, NEC_BIT_MARK) || mark <= 0) {
      return null;
    }
    const isOne = near(space, NEC_ONE_SPACE);
    const isZero = near(space, NEC_ZERO_SPACE);
    if (!isOne && !isZero) {
      return null;
    }
    if (isOne) {
      value |= 1 << i;
    }
    bits += 1;
  }

  if (bits !== 32) {
    return null;
  }

  const address = value & 0xff;
  const addressInv = (value >> 8) & 0xff;
  const command = (value >> 16) & 0xff;
  const commandInv = (value >> 24) & 0xff;

  const addressOk = (address ^ addressInv) === 0xff;
  const commandOk = (command ^ commandInv) === 0xff;
  const confidence = (addressOk ? 0.5 : 0.2) + (commandOk ? 0.5 : 0.2);

  return {
    protocol: addressOk && commandOk ? 'NEC' : 'NECext',
    address,
    command,
    extras: {
      addressInv,
      commandInv,
      rawValue: value,
    },
    confidence: Math.min(1, confidence),
  };
}
