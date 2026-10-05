import type {DecodedIrData, RawIrFrame} from '../../entities/types';

const SIRC_HEADER_MARK = 2400;
const SIRC_HEADER_SPACE = 600;
const SIRC_ONE_MARK = 1200;
const SIRC_ZERO_MARK = 600;
const SIRC_BIT_SPACE = 600;
const TOLERANCE = 0.3;

function near(actual: number, expected: number): boolean {
  return Math.abs(Math.abs(actual) - expected) <= expected * TOLERANCE;
}

export function parseSirc(frame: RawIrFrame): DecodedIrData | null {
  const t = frame.timingsUs;
  if (t.length < 24) {
    return null;
  }

  let start = 0;
  while (start < t.length - 24) {
    if (near(t[start], SIRC_HEADER_MARK) && t[start] > 0 && near(t[start + 1], SIRC_HEADER_SPACE)) {
      break;
    }
    start += 1;
  }
  if (start >= t.length - 24) {
    return null;
  }

  const bits: number[] = [];
  let idx = start + 2;
  while (idx + 1 < t.length && bits.length < 20) {
    const mark = t[idx];
    const space = t[idx + 1];
    if (mark == null || mark <= 0) {
      break;
    }
    if (near(mark, SIRC_ONE_MARK)) {
      bits.push(1);
    } else if (near(mark, SIRC_ZERO_MARK)) {
      bits.push(0);
    } else {
      break;
    }
    if (space != null && !near(space, SIRC_BIT_SPACE) && Math.abs(space) > SIRC_BIT_SPACE * 2) {
      // trailing space / end of frame
      bits.length >= 12 ? undefined : undefined;
    }
    idx += 2;
  }

  if (bits.length !== 12 && bits.length !== 15 && bits.length !== 20) {
    return null;
  }

  let command = 0;
  for (let i = 0; i < 7; i += 1) {
    command |= (bits[i] ?? 0) << i;
  }
  let address = 0;
  const addrBits = bits.length === 12 ? 5 : bits.length === 15 ? 8 : 13;
  for (let i = 0; i < addrBits; i += 1) {
    address |= (bits[7 + i] ?? 0) << i;
  }

  const protocol = bits.length === 12 ? 'SIRC' : bits.length === 15 ? 'SIRC15' : 'SIRC20';

  return {
    protocol,
    address,
    command,
    extras: {bitLength: bits.length},
    confidence: 0.8,
  };
}
