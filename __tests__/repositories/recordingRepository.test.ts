import {SqliteRecordingRepository} from '@data/repositories/SqliteRecordingRepository';
import type {DatabaseClient} from '@data/db/Database';
import type {RecordingSession} from '@domain/entities/types';

function createMemoryDb(): DatabaseClient {
  const rows: Record<string, unknown>[] = [];
  return {
    execute(sql, params = []) {
      return this.sync(sql, params);
    },
    async executeAsync(sql, params = []) {
      return this.sync(sql, params);
    },
    sync(sql: string, params: (string | number | null)[] = []) {
      if (sql.startsWith('INSERT')) {
        rows.push({
          id: params[0],
          mode: params[1],
          signature_json: params[2],
          started_at: params[3],
          ended_at: params[4],
          duration_ms: params[5],
          raw_frames_json: params[6],
          decoded_json: params[7],
          is_partial: params[8],
          notes: params[9],
          sync_status: params[10],
          sync_error: params[11],
          created_at: params[12],
          updated_at: params[13],
          source: params[14],
          label: params[15],
        });
      }
      if (sql.includes('WHERE id = ?') && sql.startsWith('SELECT')) {
        const found = rows.filter(r => r.id === params[0]);
        return {
          rows: {
            length: found.length,
            _array: found,
            item: (i: number) => found[i] ?? {},
          },
        };
      }
      if (sql.startsWith('SELECT')) {
        const selected = sql.includes('source = ?')
          ? rows.filter(r => r.source === params[0])
          : rows;
        return {
          rows: {
            length: selected.length,
            _array: selected,
            item: (i: number) => selected[i] ?? {},
          },
        };
      }
      if (sql.startsWith('UPDATE') && sql.includes('sync_status')) {
        const row = rows.find(r => r.id === params[3]);
        if (row) {
          row.sync_status = params[0];
          row.sync_error = params[1];
          row.updated_at = params[2];
        }
      }
      return {rows: {length: 0, _array: [], item: () => ({})}};
    },
    close() {},
  } as DatabaseClient & {sync: Function};
}

describe('SqliteRecordingRepository', () => {
  it('saves and loads a recording preserving raw frames', async () => {
    const repo = new SqliteRecordingRepository(createMemoryDb());
    const session: RecordingSession = {
      id: 'r1',
      mode: 'device',
      signature: {
        key: 'k1',
        protocol: 'RAW',
        carrierHz: null,
        address: null,
        deviceIdCode: null,
        displayName: 'IR Device',
      },
      startedAt: '2026-10-01T00:00:00.000Z',
      endedAt: '2026-10-01T00:00:01.000Z',
      durationMs: 1000,
      rawFrames: [{receivedAtMs: 1, carrierHz: null, timingsUs: [1, -2, 3], frameBytesHex: '00FF'}],
      decodedSnapshots: [],
      isPartial: false,
      notes: null,
      syncStatus: 'pending',
      syncError: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:01.000Z',
    };
    await repo.save(session);
    const loaded = await repo.getById('r1');
    expect(loaded?.rawFrames[0]?.timingsUs).toEqual([1, -2, 3]);
    expect(loaded?.rawFrames[0]?.frameBytesHex).toBe('00FF');
    expect(loaded?.source).toBe('AED');
    expect(loaded?.label).toBeNull();
    const remote = {...session, id: 'remote', source: 'REMOTE_TEST' as const, label: 'TV, Power'};
    await repo.save(remote);
    expect(await repo.getById('remote')).toMatchObject({
      source: 'REMOTE_TEST',
      label: 'TV, Power',
      rawFrames: session.rawFrames,
    });
    expect((await repo.list({source: 'REMOTE_TEST'})).map(row => row.id)).toEqual(['remote']);
    expect((await repo.list({source: 'AED'})).map(row => row.id)).toEqual(['r1']);
  });
});
