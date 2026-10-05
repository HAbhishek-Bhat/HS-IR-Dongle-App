import type {DecodedIrData, RawIrFrame} from '../../entities/types';

/** Philips RC5 bi-phase decoder (simplified Manchester). */
const RC5_HALF_BIT = 889;
const TOLERANCE = 0.35;

function near(actual: number, expected: number): boolean {
  return Math.abs(Math.abs(actual) - expected) <= expected * TOLERANCE;
}

export function parseRc5(frame: RawIrFrame): DecodedIrData | null {
  const t = frame.timingsUs;
  if (t.length < 20) {
    return null;
  }

  // Flatten to half-bit grid
  const halves: number[] = [];
  for (const duration of t) {
    const abs = Math.abs(duration);
    if (near(abs, RC5_HALF_BIT)) {
      halves.push(duration > 0 ? 1 : 0);
    } else if (near(abs, RC5_HALF_BIT * 2)) {
      halves.push(duration > 0 ? 1 : 0);
      halves.push(duration > 0 ? 1 : 0);
    } else {
      return null;
    }
  }

  if (halves.length < 28) {
    return null;
  }

  // Sample mid-bit: pairs of half-bits forming Manchester
  const bits: number[] = [];
  for (let i = 0; i + 1 < Math.min(halves.length, 28); i += 2) {
    const a = halves[i];
    const b = halves[i + 1];
    if (a === 1 && b === 0) {
      bits.push(1);
    } else if (a === 0 && b === 1) {
      bits.push(0);
    } else {
      return null;
    }
  }

  if (bits.length < 14) {
    return null;
  }

  const start1 = bits[0];
  const start2 = bits[1];
  const toggle = bits[2];
  let address = 0;
  for (let i = 0; i < 5; i += 1) {
    address = (address << 1) | (bits[3 + i] ?? 0);
  }
  let command = 0;
  for (let i = 0; i < 6; i += 1) {
    command = (command << 1) | (bits[8 + i] ?? 0);
  }

  if (start1 !== 1 || start2 !== 1) {
    return null;
  }

  return {
    protocol: 'RC5',
    address,
    command,
    extras: {toggle: toggle === 1},
    confidence: 0.85,
  };
}
