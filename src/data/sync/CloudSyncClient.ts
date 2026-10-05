import type {AedSession, RecordingSession} from '@domain/entities/types';
import {AppError} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';

export interface CloudSyncClient {
  uploadRecording(session: RecordingSession, accessToken: string): Promise<void>;
  uploadAedSession(session: AedSession, accessToken: string): Promise<void>;
  deleteRemoteData(userId: string, accessToken: string): Promise<void>;
}

export class RestCloudSyncClient implements CloudSyncClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async uploadRecording(session: RecordingSession, accessToken: string): Promise<void> {
    await this.post('/recordings', session, accessToken);
  }

  async uploadAedSession(session: AedSession, accessToken: string): Promise<void> {
    await this.post('/aed-sessions', session, accessToken);
  }

  async deleteRemoteData(userId: string, accessToken: string): Promise<void> {
    await this.request('DELETE', `/users/${encodeURIComponent(userId)}/data`, undefined, accessToken);
  }

  private async post(path: string, body: unknown, accessToken: string): Promise<void> {
    await this.request('POST', path, body, accessToken);
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
    accessToken: string,
  ): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 401) {
        throw new AppError('AUTH_EXPIRED', 'Auth expired', 'Your session expired. Please sign in again.', true);
      }
      if (!response.ok) {
        throw new AppError(
          'SYNC_FAILED',
          `Sync HTTP ${response.status}`,
          'Cloud sync failed. Will retry automatically.',
          true,
        );
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.warn('Network sync error', {path});
      throw new AppError(
        'NO_NETWORK',
        'Network error during sync',
        'No network connection. Changes will sync when you are online.',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/** No-op cloud client when CLOUD_PROVIDER=none. */
export class NullCloudSyncClient implements CloudSyncClient {
  async uploadRecording(): Promise<void> {
    return;
  }
  async uploadAedSession(): Promise<void> {
    return;
  }
  async deleteRemoteData(): Promise<void> {
    return;
  }
}
