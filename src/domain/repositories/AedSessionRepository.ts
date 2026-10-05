import type {AedSession, SyncStatus} from '../entities/types';

export interface AedSessionRepository {
  save(session: AedSession): Promise<void>;
  update(session: AedSession): Promise<void>;
  getById(id: string): Promise<AedSession | null>;
  list(): Promise<AedSession[]>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
  listPendingSync(): Promise<AedSession[]>;
  setSyncStatus(id: string, status: SyncStatus, error?: string | null): Promise<void>;
}
