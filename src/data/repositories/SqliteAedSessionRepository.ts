import type {AedSession, SyncStatus} from '@domain/entities/types';
import type {AedSessionRepository} from '@domain/repositories/AedSessionRepository';
import type {DatabaseClient} from '../db/Database';
import {decryptString, encryptString} from '../db/encryption';

async function rowToSession(row: Record<string, unknown>): Promise<AedSession> {
  const eventsJson = await decryptString(String(row.events_json));
  return {
    id: String(row.id),
    signature: JSON.parse(String(row.signature_json)),
    manufacturer: row.manufacturer == null ? null : String(row.manufacturer),
    model: row.model == null ? null : String(row.model),
    parserId: String(row.parser_id),
    startedAt: String(row.started_at),
    endedAt: row.ended_at == null ? null : String(row.ended_at),
    events: JSON.parse(eventsJson),
    isPartial: Number(row.is_partial) === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncError: row.sync_error == null ? null : String(row.sync_error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class SqliteAedSessionRepository implements AedSessionRepository {
  constructor(private readonly db: DatabaseClient) {}

  async save(session: AedSession): Promise<void> {
    const eventsEnc = await encryptString(JSON.stringify(session.events));
    await this.db.executeAsync(
      `INSERT INTO aed_sessions (
        id, signature_json, manufacturer, model, parser_id, started_at, ended_at,
        events_json, is_partial, sync_status, sync_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        JSON.stringify(session.signature),
        session.manufacturer,
        session.model,
        session.parserId,
        session.startedAt,
        session.endedAt,
        eventsEnc,
        session.isPartial ? 1 : 0,
        session.syncStatus,
        session.syncError,
        session.createdAt,
        session.updatedAt,
      ],
    );
  }

  async update(session: AedSession): Promise<void> {
    const eventsEnc = await encryptString(JSON.stringify(session.events));
    await this.db.executeAsync(
      `UPDATE aed_sessions SET
        signature_json = ?, manufacturer = ?, model = ?, parser_id = ?,
        started_at = ?, ended_at = ?, events_json = ?, is_partial = ?,
        sync_status = ?, sync_error = ?, updated_at = ?
      WHERE id = ?`,
      [
        JSON.stringify(session.signature),
        session.manufacturer,
        session.model,
        session.parserId,
        session.startedAt,
        session.endedAt,
        eventsEnc,
        session.isPartial ? 1 : 0,
        session.syncStatus,
        session.syncError,
        session.updatedAt,
        session.id,
      ],
    );
  }

  async getById(id: string): Promise<AedSession | null> {
    const result = await this.db.executeAsync('SELECT * FROM aed_sessions WHERE id = ?', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return rowToSession(result.rows.item(0));
  }

  async list(): Promise<AedSession[]> {
    const result = await this.db.executeAsync(
      'SELECT * FROM aed_sessions ORDER BY started_at DESC',
    );
    return Promise.all(result.rows._array.map(rowToSession));
  }

  async delete(id: string): Promise<void> {
    await this.db.executeAsync('DELETE FROM aed_sessions WHERE id = ?', [id]);
  }

  async deleteAll(): Promise<void> {
    await this.db.executeAsync('DELETE FROM aed_sessions');
  }

  async listPendingSync(): Promise<AedSession[]> {
    const result = await this.db.executeAsync(
      `SELECT * FROM aed_sessions WHERE sync_status = 'pending' OR sync_status = 'failed' ORDER BY started_at ASC`,
    );
    return Promise.all(result.rows._array.map(rowToSession));
  }

  async setSyncStatus(id: string, status: SyncStatus, error: string | null = null): Promise<void> {
    await this.db.executeAsync(
      'UPDATE aed_sessions SET sync_status = ?, sync_error = ?, updated_at = ? WHERE id = ?',
      [status, error, new Date().toISOString(), id],
    );
  }
}
