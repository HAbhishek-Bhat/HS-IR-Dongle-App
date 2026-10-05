import type {RecordingSession, SyncStatus} from '@domain/entities/types';
import type {RecordingFilter, RecordingRepository} from '@domain/repositories/RecordingRepository';
import type {DatabaseClient} from '../db/Database';
import {decryptString, encryptString} from '../db/encryption';

async function rowToSession(row: Record<string, unknown>): Promise<RecordingSession> {
  const rawJson = await decryptString(String(row.raw_frames_json));
  const decodedJson = await decryptString(String(row.decoded_json));
  return {
    id: String(row.id),
    mode: row.mode as RecordingSession['mode'],
    source: row.source === 'REMOTE_TEST' ? 'REMOTE_TEST' : 'AED',
    label: row.label == null ? null : String(row.label),
    signature: JSON.parse(String(row.signature_json)),
    startedAt: String(row.started_at),
    endedAt: row.ended_at == null ? null : String(row.ended_at),
    durationMs: Number(row.duration_ms),
    rawFrames: JSON.parse(rawJson),
    decodedSnapshots: JSON.parse(decodedJson),
    isPartial: Number(row.is_partial) === 1,
    notes: row.notes == null ? null : String(row.notes),
    syncStatus: row.sync_status as SyncStatus,
    syncError: row.sync_error == null ? null : String(row.sync_error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class SqliteRecordingRepository implements RecordingRepository {
  constructor(private readonly db: DatabaseClient) {}

  async save(session: RecordingSession): Promise<void> {
    const rawEnc = await encryptString(JSON.stringify(session.rawFrames));
    const decodedEnc = await encryptString(JSON.stringify(session.decodedSnapshots));
    await this.db.executeAsync(
      `INSERT INTO recordings (
        id, mode, signature_json, started_at, ended_at, duration_ms,
        raw_frames_json, decoded_json, is_partial, notes, sync_status, sync_error, created_at, updated_at,
        source, label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.mode,
        JSON.stringify(session.signature),
        session.startedAt,
        session.endedAt,
        session.durationMs,
        rawEnc,
        decodedEnc,
        session.isPartial ? 1 : 0,
        session.notes,
        session.syncStatus,
        session.syncError,
        session.createdAt,
        session.updatedAt,
        session.source ?? 'AED',
        session.label ?? null,
      ],
    );
  }

  async update(session: RecordingSession): Promise<void> {
    const rawEnc = await encryptString(JSON.stringify(session.rawFrames));
    const decodedEnc = await encryptString(JSON.stringify(session.decodedSnapshots));
    await this.db.executeAsync(
      `UPDATE recordings SET
        mode = ?, signature_json = ?, started_at = ?, ended_at = ?, duration_ms = ?,
        raw_frames_json = ?, decoded_json = ?, is_partial = ?, notes = ?,
        sync_status = ?, sync_error = ?, updated_at = ?, source = ?, label = ?
      WHERE id = ?`,
      [
        session.mode,
        JSON.stringify(session.signature),
        session.startedAt,
        session.endedAt,
        session.durationMs,
        rawEnc,
        decodedEnc,
        session.isPartial ? 1 : 0,
        session.notes,
        session.syncStatus,
        session.syncError,
        session.updatedAt,
        session.source ?? 'AED',
        session.label ?? null,
        session.id,
      ],
    );
  }

  async getById(id: string): Promise<RecordingSession | null> {
    const result = await this.db.executeAsync('SELECT * FROM recordings WHERE id = ?', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return rowToSession(result.rows.item(0));
  }

  async list(filter: RecordingFilter = {}): Promise<RecordingSession[]> {
    const clauses: string[] = [];
    const params: (string | number | null)[] = [];
    if (filter.source) {
      clauses.push('source = ?');
      params.push(filter.source);
    }
    if (filter.mode) {
      clauses.push('mode = ?');
      params.push(filter.mode);
    }
    if (filter.syncStatus) {
      clauses.push('sync_status = ?');
      params.push(filter.syncStatus);
    }
    if (filter.fromIso) {
      clauses.push('started_at >= ?');
      params.push(filter.fromIso);
    }
    if (filter.toIso) {
      clauses.push('started_at <= ?');
      params.push(filter.toIso);
    }
    if (filter.query) {
      clauses.push('(signature_json LIKE ? OR notes LIKE ? OR id LIKE ? OR label LIKE ?)');
      const q = `%${filter.query}%`;
      params.push(q, q, q, q);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.db.executeAsync(
      `SELECT * FROM recordings ${where} ORDER BY started_at DESC`,
      params,
    );
    return Promise.all(result.rows._array.map(rowToSession));
  }

  async delete(id: string): Promise<void> {
    await this.db.executeAsync('DELETE FROM recordings WHERE id = ?', [id]);
  }

  async deleteAll(): Promise<void> {
    await this.db.executeAsync('DELETE FROM recordings');
  }

  async listPendingSync(): Promise<RecordingSession[]> {
    return this.list({syncStatus: 'pending'});
  }

  async setSyncStatus(id: string, status: SyncStatus, error: string | null = null): Promise<void> {
    await this.db.executeAsync(
      'UPDATE recordings SET sync_status = ?, sync_error = ?, updated_at = ? WHERE id = ?',
      [status, error, new Date().toISOString(), id],
    );
  }
}
