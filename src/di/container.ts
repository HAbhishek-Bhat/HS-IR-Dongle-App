import {getDatabase} from '@data/db/Database';
import {SqliteRecordingRepository} from '@data/repositories/SqliteRecordingRepository';
import {SqliteAedSessionRepository} from '@data/repositories/SqliteAedSessionRepository';
import {NullCloudSyncClient, RestCloudSyncClient} from '@data/sync/CloudSyncClient';
import {SyncService} from '@data/sync/SyncService';
import {ExportService} from '@data/export/ExportService';
import {LocalAuthService} from '@domain/services/AuthService';
import {DongleService} from '@domain/services/DongleService';
import {CaptureService} from '@domain/services/CaptureService';
import {AedRetrievalService} from '@domain/services/AedRetrievalService';
import {bootstrapAedParsers} from '@domain/parsers/aed/aedParserRegistry';
import type {AppSettings} from '@domain/entities/types';

export interface AppContainer {
  auth: LocalAuthService;
  dongle: DongleService;
  capture: CaptureService;
  aed: AedRetrievalService;
  recordings: SqliteRecordingRepository;
  aedSessions: SqliteAedSessionRepository;
  sync: SyncService;
  export: ExportService;
  settings: AppSettings;
}

let container: AppContainer | null = null;

const DEFAULT_SETTINGS: AppSettings = {
  cloudProvider: 'rest',
  restApiBaseUrl: 'https://api.example.com/v1',
  mockSimulatorEnabled: true,
  darkMode: 'system',
  autoSync: true,
  hapticFeedback: true,
  crashReportingEnabled: false,
};

export function createContainer(overrides?: Partial<AppSettings>): AppContainer {
  bootstrapAedParsers();
  const settings: AppSettings = {...DEFAULT_SETTINGS, ...overrides};
  const db = getDatabase();
  const recordings = new SqliteRecordingRepository(db);
  const aedSessions = new SqliteAedSessionRepository(db);
  const auth = new LocalAuthService();
  const dongle = new DongleService();
  const capture = new CaptureService(dongle, recordings);
  const aed = new AedRetrievalService(dongle, aedSessions);
  const cloud =
    settings.cloudProvider === 'none'
      ? new NullCloudSyncClient()
      : new RestCloudSyncClient(settings.restApiBaseUrl);
  const sync = new SyncService(recordings, aedSessions, cloud, auth);
  const exportService = new ExportService();

  container = {
    auth,
    dongle,
    capture,
    aed,
    recordings,
    aedSessions,
    sync,
    export: exportService,
    settings,
  };
  return container;
}

export function getContainer(): AppContainer {
  if (!container) {
    return createContainer();
  }
  return container;
}

/** Test helper to inject a prebuilt container. */
export function setContainerForTests(next: AppContainer | null): void {
  container = next;
}
