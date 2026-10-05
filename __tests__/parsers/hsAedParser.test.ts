import {HsAedV1Parser} from '@domain/parsers/aed/HsAedV1Parser';
import type {RawIrFrame, SignalSignature} from '@domain/entities/types';

describe('HsAedV1Parser', () => {
  const parser = new HsAedV1Parser();
  const signature: SignalSignature = {
    key: 'abc',
    protocol: 'NEC',
    carrierHz: 38000,
    address: 0xa1,
    deviceIdCode: 'HS-AED',
    displayName: 'HS AED',
  };

  it('maps HS hex status bytes to labeled events', () => {
    const frame: RawIrFrame = {
      receivedAtMs: Date.now(),
      carrierHz: 38000,
      timingsUs: [9000, -4500],
      frameBytesHex: '48531001',
    };
    const events = parser.parseFrame(frame, signature);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('analyzing');
    expect(events[0]?.label).toBe('Analyzing Rhythm');
  });

  it('returns raw_frame for unmapped payloads', () => {
    const frame: RawIrFrame = {
      receivedAtMs: Date.now(),
      carrierHz: 38000,
      timingsUs: [100, -100],
      frameBytesHex: 'DEADBEEF',
    };
    const events = parser.parseFrame(frame, signature);
    expect(events[0]?.type).toBe('raw_frame');
  });
});
