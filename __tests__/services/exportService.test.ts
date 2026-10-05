import {
  aedSessionToCsv,
  aedSessionToJson,
  recordingToCsv,
  recordingToJson,
} from '@data/export/ExportService';
import type {AedSession, RecordingSession} from '@domain/entities/types';

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

  it('exports explicit source, escaped labels, exact raw and decoded fields', () => {
    const remote: RecordingSession = {
      ...sample,
      source: 'REMOTE_TEST',
      label: 'TV, "Power"',
      decodedSnapshots: [
        {protocol: 'NEC', address: 32, command: 4, confidence: 1, extras: {repeat: false}},
      ],
    };
    const csv = recordingToCsv(remote);
    expect(csv).toContain('source,label,decodedProtocol,decodedAddress,decodedCommand');
    expect(csv).toContain('REMOTE_TEST,"TV, ""Power""",NEC,32,4,1');
    expect(csv).toContain('AA55');
    expect(JSON.parse(recordingToJson(remote))).toMatchObject({
      source: 'REMOTE_TEST',
      label: 'TV, "Power"',
      rawFrames: sample.rawFrames,
    });
    expect(JSON.parse(recordingToJson(sample)).source).toBe('AED');
  });
  it('retains AED raw frames without a decoded event in JSON and CSV', () => {
    const aed: AedSession = {
      id: 'aed-1',
      signature: sample.signature,
      manufacturer: null,
      model: null,
      parserId: 'raw-capture',
      startedAt: sample.startedAt,
      endedAt: sample.endedAt,
      events: [],
      rawFrames: sample.rawFrames,
      isPartial: false,
      syncStatus: 'pending',
      syncError: null,
      createdAt: sample.createdAt,
      updatedAt: sample.updatedAt,
    };
    expect(JSON.parse(aedSessionToJson(aed))).toMatchObject({
      source: 'AED',
      rawFrames: sample.rawFrames,
    });
    expect(aedSessionToCsv(aed)).toContain('9000|-4500|560,AA55,AED,0,1,38000');
    expect(aedSessionToCsv(aed)).toContain('rawBytesHex,rawTimingsUs');
    const linked = {
      ...aed,
      rawFrames: [...sample.rawFrames, {...sample.rawFrames[0], frameBytesHex: 'bb'}],
      events: [
        {
          id: 'e1',
          sessionId: aed.id,
          type: 'unknown' as const,
          label: 'Unknown',
          timestamp: sample.startedAt,
          rawFrame: sample.rawFrames[0],
          decoded: null,
          metadata: {rawFrameIndex: 1},
        },
      ],
    };
    const rows = aedSessionToCsv(linked).split('\n');
    expect(rows).toHaveLength(3);
    expect(rows[1]).not.toContain('e1');
    expect(rows[2]).toContain('e1,unknown,Unknown');
    expect(rows[2]).toContain('9000|-4500|560,bb,AED,1');
    expect(
      JSON.parse(aedSessionToJson({...aed, rawFrames: undefined, events: linked.events})).rawFrames,
    ).toEqual([sample.rawFrames[0]]);
  });
});
