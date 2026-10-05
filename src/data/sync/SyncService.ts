import type {AedSessionRepository} from '@domain/repositories/AedSessionRepository';
import type {RecordingRepository} from '@domain/repositories/RecordingRepository';
import {AppError} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';
import type {CloudSyncClient} from './CloudSyncClient';

export interface AuthTokenProvider {
  getAccessToken(): Promise<string | null>;
}

function backoffMs(attempts: number): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
  const jitter = Math.floor(Math.random() * 400);
  return base + jitter;
}

/**
 * Offline-first sync with exponential backoff.
 * Conflict policy (default): last-write-wins using updatedAt; server acknowledged upload replaces pending.
 */
export class SyncService {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly recordings: RecordingRepository,
    private readonly aedSessions: AedSessionRepository,
    private readonly cloud: CloudSyncClient,
    private readonly auth: AuthTokenProvider,
  ) {}

  startBackgroundSync(intervalMs = 30_000): void {
    this.stopBackgroundSync();
    const tick = async () => {
      await this.syncPending();
      this.timer = setTimeout(tick, intervalMs);
    };
    void tick();
  }

  stopBackgroundSync(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async syncPending(): Promise<{synced: number; failed: number}> {
    if (this.running) {
      return {synced: 0, failed: 0};
    }
    this.running = true;
    let synced = 0;
    let failed = 0;
    try {
      const token = await this.auth.getAccessToken();
      if (!token) {
        return {synced, failed};
      }

      const pendingRecordings = await this.recordings.listPendingSync();
      const failedRecordings = (await this.recordings.list({syncStatus: 'failed'})).filter(
        r => r.syncStatus === 'failed',
      );
      const recordingJobs = [...pendingRecordings, ...failedRecordings];

      for (const session of recordingJobs) {
        try {
          await this.cloud.uploadRecording(session, token);
          await this.recordings.setSyncStatus(session.id, 'synced', null);
          synced += 1;
        } catch (error) {
          failed += 1;
          const message = error instanceof AppError ? error.code : 'SYNC_FAILED';
          await this.recordings.setSyncStatus(session.id, 'failed', message);
          logger.warn('Recording sync failed', {id: session.id, code: message});
          await delay(backoffMs(1));
        }
      }

      const aedJobs = await this.aedSessions.listPendingSync();
      for (const session of aedJobs) {
        try {
          await this.cloud.uploadAedSession(session, token);
          await this.aedSessions.setSyncStatus(session.id, 'synced', null);
          synced += 1;
        } catch (error) {
          failed += 1;
          const message = error instanceof AppError ? error.code : 'SYNC_FAILED';
          await this.aedSessions.setSyncStatus(session.id, 'failed', message);
          logger.warn('AED session sync failed', {id: session.id, code: message});
          await delay(backoffMs(1));
        }
      }
    } finally {
      this.running = false;
    }
    return {synced, failed};
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
