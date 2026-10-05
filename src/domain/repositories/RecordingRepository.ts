import type {RecordingSession, RecordingSource, SyncStatus} from '../entities/types';

export interface RecordingFilter {
  query?: string;
  mode?: 'device' | 'aed';
  source?: RecordingSource;
  syncStatus?: SyncStatus;
  fromIso?: string;
  toIso?: string;
}

export interface RecordingRepository {
  save(session: RecordingSession): Promise<void>;
  update(session: RecordingSession): Promise<void>;
  getById(id: string): Promise<RecordingSession | null>;
  list(filter?: RecordingFilter): Promise<RecordingSession[]>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
  listPendingSync(): Promise<RecordingSession[]>;
  setSyncStatus(id: string, status: SyncStatus, error?: string | null): Promise<void>;
}
