import {buildSignalSignature} from '@domain/parsers/ir/signalSignature';
import type {DecodedIrData, RawIrFrame} from '@domain/entities/types';

describe('buildSignalSignature', () => {
  it('creates stable keys for identical decoded payloads', () => {
    const frame: RawIrFrame = {
      receivedAtMs: 10,
      carrierHz: 38000,
      timingsUs: [9000, -4500, 560, -560],
      frameBytesHex: null,
    };
    const decoded: DecodedIrData = {
      protocol: 'NEC',
      address: 0xa1,
      command: 0x10,
      extras: {},
      confidence: 1,
    };
    const a = buildSignalSignature(frame, decoded);
    const b = buildSignalSignature(frame, decoded);
    expect(a.key).toBe(b.key);
    expect(a.displayName).toContain('NEC');
  });

  it('falls back to timing fingerprint for raw frames', () => {
    const frame: RawIrFrame = {
      receivedAtMs: 10,
      carrierHz: null,
      timingsUs: [1000, -500, 1000, -500, 2000],
      frameBytesHex: null,
    };
    const sig = buildSignalSignature(frame, null);
    expect(sig.protocol).toBe('RAW');
    expect(sig.key.length).toBe(8);
  });
});
