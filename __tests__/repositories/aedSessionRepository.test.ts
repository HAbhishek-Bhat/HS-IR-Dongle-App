import {SqliteAedSessionRepository} from '@data/repositories/SqliteAedSessionRepository';
import type {AedSession} from '@domain/entities/types';
import {encryptString} from '@data/db/encryption';

describe('AED raw frame persistence', () => {
  const frame = {
    receivedAtMs: 1_790_000_000_000,
    frameBytesHex: '0000AA55FF',
    carrierHz: null,
    timingsUs: [],
    interfaceId: 0,
    endpointAddress: 130,
  };
  const session: AedSession = {
    id: 'aed-test',
    source: 'AED',
    rawFrames: [frame],
    signature: {
      key: 'raw',
      protocol: 'RAW',
      carrierHz: null,
      address: null,
      deviceIdCode: null,
      displayName: 'Raw/unparsed',
    },
    manufacturer: null,
    model: null,
    parserId: 'raw-capture',
    startedAt: '2026-10-05T10:00:00.000Z',
    endedAt: null,
    events: [],
    isPartial: false,
    syncStatus: 'pending',
    syncError: null,
    createdAt: '2026-10-05T10:00:00.000Z',
    updatedAt: '2026-10-05T10:00:00.000Z',
  };

  it('reopens encrypted raw-only sessions even when a parser produced no events', async () => {
    const storage: {row: Record<string, unknown> | null} = {row: null};
    const empty = {rows: {length: 0, _array: [], item: (_index: number) => ({})}};
    const db: ConstructorParameters<typeof SqliteAedSessionRepository>[0] = {
      execute: jest.fn(() => empty),
      executeAsync: jest.fn(async (sql, params = []) => {
        if (sql.includes('INSERT INTO aed_sessions')) {
          const columns = [
            'id',
            'signature_json',
            'manufacturer',
            'model',
            'parser_id',
            'started_at',
            'ended_at',
            'events_json',
            'is_partial',
            'sync_status',
            'sync_error',
            'created_at',
            'updated_at',
            'raw_frames_json',
          ];
          storage.row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
          return empty;
        }
        const rows = storage.row ? [storage.row] : [];
        return {rows: {length: rows.length, _array: rows, item: (index: number) => rows[index]}};
      }),
      close: jest.fn(),
    };
    await new SqliteAedSessionRepository(db).save(session);
    expect(storage.row).not.toBeNull();
    expect(String(storage.row?.raw_frames_json)).toMatch(/^enc:v1:/);
    expect(String(storage.row?.raw_frames_json)).not.toContain(frame.frameBytesHex);
    const reopened = await new SqliteAedSessionRepository(db).getById(session.id);
    expect(reopened?.source).toBe('AED');
    expect(reopened?.rawFrames).toEqual([frame]);
    expect(reopened?.events).toEqual([]);
  });

  it('derives legacy raw frames from encrypted events after migration', async () => {
    const events = [
      {
        id: 'event',
        sessionId: session.id,
        type: 'raw_frame',
        label: 'Raw',
        timestamp: session.startedAt,
        rawFrame: frame,
        decoded: null,
        metadata: {},
      },
    ];
    const row = {
      id: session.id,
      signature_json: JSON.stringify(session.signature),
      manufacturer: null,
      model: null,
      parser_id: 'raw-capture',
      started_at: session.startedAt,
      ended_at: null,
      events_json: await encryptString(JSON.stringify(events)),
      raw_frames_json: null,
      is_partial: 0,
      sync_status: 'pending',
      sync_error: null,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
    };
    const result = {rows: {length: 1, _array: [row], item: (_index: number) => row}};
    const db: ConstructorParameters<typeof SqliteAedSessionRepository>[0] = {
      execute: jest.fn(() => result),
      executeAsync: jest.fn(async () => result),
      close: jest.fn(),
    };
    const reopened = await new SqliteAedSessionRepository(db).getById(session.id);
    expect(reopened?.rawFrames).toEqual([frame]);
  });
});
