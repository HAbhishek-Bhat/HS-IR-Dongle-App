import {parseNec} from '@domain/parsers/ir/necParser';
import type {RawIrFrame} from '@domain/entities/types';

function buildNecTimings(address: number, command: number): number[] {
  const list: number[] = [9000, -4500];
  const writeByte = (value: number) => {
    for (let i = 0; i < 8; i += 1) {
      list.push(560);
      list.push((value >> i) & 1 ? -1690 : -560);
    }
  };
  writeByte(address & 0xff);
  writeByte(~address & 0xff);
  writeByte(command & 0xff);
  writeByte(~command & 0xff);
  list.push(560);
  return list;
}

describe('parseNec', () => {
  it('decodes a standard NEC frame', () => {
    const frame: RawIrFrame = {
      receivedAtMs: 1,
      carrierHz: 38000,
      timingsUs: buildNecTimings(0x20, 0x45),
      frameBytesHex: null,
    };
    const decoded = parseNec(frame);
    expect(decoded).not.toBeNull();
    expect(decoded?.protocol).toBe('NEC');
    expect(decoded?.address).toBe(0x20);
    expect(decoded?.command).toBe(0x45);
    expect(decoded?.confidence).toBeGreaterThan(0.9);
  });

  it('returns null for truncated frames', () => {
    const frame: RawIrFrame = {
      receivedAtMs: 1,
      carrierHz: 38000,
      timingsUs: [9000, -4500, 560],
      frameBytesHex: null,
    };
    expect(parseNec(frame)).toBeNull();
  });
});
