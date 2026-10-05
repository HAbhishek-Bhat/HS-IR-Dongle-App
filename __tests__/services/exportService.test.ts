import {recordingToCsv, recordingToJson} from '@data/export/ExportService';
import type {RecordingSession} from '@domain/entities/types';

const sample: RecordingSession = {
  id: 'rec-1',
  mode: 'device',
  signature: {
    key: 'deadbeef',
    protocol: 'NEC',
    carrierHz: 38000,
    address: 0x20,
    deviceIdCode: '0x20',
    displayName: 'NEC 0x20',
  },
  startedAt: '2026-10-01T00:00:00.000Z',
  endedAt: '2026-10-01T00:00:01.000Z',
  durationMs: 1000,
  rawFrames: [
    {
      receivedAtMs: 1,
      carrierHz: 38000,
      timingsUs: [9000, -4500, 560],
      frameBytesHex: 'AA55',
    },
  ],
  decodedSnapshots: [],
  isPartial: false,
  notes: null,
  syncStatus: 'pending',
  syncError: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:01.000Z',
};

describe('ExportService serializers', () => {
  it('exports JSON without mutating raw timings', () => {
    const json = recordingToJson(sample);
    const parsed = JSON.parse(json) as RecordingSession;
    expect(parsed.rawFrames[0]?.timingsUs).toEqual([9000, -4500, 560]);
  });

  it('exports CSV with timing pipe-separated values', () => {
    const csv = recordingToCsv(sample);
    expect(csv).toContain('9000|-4500|560');
    expect(csv.split('\n').length).toBe(2);
  });
});
