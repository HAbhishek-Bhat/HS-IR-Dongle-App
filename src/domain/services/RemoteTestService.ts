import uuid from 'react-native-uuid';
import type {
  DecodedIrData,
  DetectedDevice,
  RawIrFrame,
  RecordingSession,
  RecordingSource,
} from '../entities/types';
import type {RecordingRepository} from '../repositories/RecordingRepository';
import {createRawFallbackDecode, decodeIrFrame} from '../parsers/ir/irDecoder';
import {buildSignalSignature} from '../parsers/ir/signalSignature';
import type {DongleService} from './DongleService';
import {AppError, ErrorMessages} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';

export interface RemoteTestSnapshot {
  active: boolean;
  count: number;
  lastFrame: RawIrFrame | null;
  lastDecoded: DecodedIrData | null;
  startedAt: string | null;
  endedAt: string | null;
  isPartial: boolean;
  persistenceError?: string | null;
  devices: DetectedDevice[];
}

export class RemoteTestService {
  private frames: RawIrFrame[] = [];
  private decoded: DecodedIrData[] = [];
  private startedAt: string | null = null;
  private endedAt: string | null = null;
  private partial = false;
  private active = false;
  private starting = false;
  private startOperation: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;
  private saving = false;
  private id: string | null = null;
  private persisted = false;
  private label: string | null = null;
  private writes: Promise<void> = Promise.resolve();
  private persistenceError: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private listeners = new Set<(snapshot: RemoteTestSnapshot) => void>();
  private devices = new Map<string, DetectedDevice>();

  constructor(
    private readonly dongle: DongleService,
    private readonly recordings: RecordingRepository,
    private readonly onRoutingChanged: (active: boolean) => void = () => {},
    private readonly source: Exclude<RecordingSource, 'AED'> = 'REMOTE_TEST',
  ) {}

  async start(): Promise<void> {
    if (this.startOperation) return this.startOperation;
    const operation = this.startCapture();
    this.startOperation = operation;
    try {
      await operation;
    } finally {
      this.startOperation = null;
    }
  }

  private async startCapture(): Promise<void> {
    if (this.stopping) await this.stopping;
    if (this.active || this.starting || this.saving) return;
    if (!this.dongle.isConnected()) {
      throw new AppError('NOT_CONNECTED', 'not ready', ErrorMessages.NOT_CONNECTED, false);
    }
    this.starting = true;
    try {
      await this.dongle.flushFrames();
    } catch (error) {
      this.starting = false;
      throw error;
    }
    await this.writes;
    this.active = true;
    this.startedAt ??= new Date().toISOString();
    this.endedAt = null;
    this.dongle.setCaptureSource(this.source);
    this.onRoutingChanged(true);
    this.unsubscribe = this.dongle.onFrame(frame => {
      if (!this.active) return;
      const exact = Object.freeze({...frame, timingsUs: Object.freeze([...frame.timingsUs])});
      this.frames.push(exact);
      const decoded = decodeIrFrame(exact) ?? createRawFallbackDecode(exact);
      this.decoded.push(decoded);
      const signature = buildSignalSignature(exact, decoded);
      const now = new Date(exact.receivedAtMs).toISOString();
      const previous = this.devices.get(signature.key);
      this.devices.set(signature.key, {
        signature,
        firstSeenAt: previous?.firstSeenAt ?? now,
        lastSeenAt: now,
        hitCount: (previous?.hitCount ?? 0) + 1,
        signalStrength: 1,
      });
      this.emit();
      return this.persist();
    });
    this.unsubscribeConnection = this.dongle.onConnectionChange(() => {
      if (this.active && !this.dongle.isConnected()) {
        this.partial = true;
        void this.stop().catch(error => {
          logger.warn('Device capture could not close after disconnect', {
            code: error instanceof AppError ? error.code : 'STORAGE_ERROR',
          });
        });
      }
    });
    try {
      await this.dongle.startListening();
      this.emit();
    } catch (error) {
      await this.finishStop();
      throw error;
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    if (this.startOperation) await this.startOperation;
    if (this.stopping) return this.stopping;
    const operation = this.finishStop();
    this.stopping = operation;
    try {
      await operation;
    } finally {
      this.stopping = null;
    }
  }

  private async finishStop(): Promise<void> {
    // Frame callbacks only await persistence, never this drain operation.
    await this.dongle.flushFrames();
    this.unsubscribe?.();
    this.unsubscribeConnection?.();
    this.unsubscribe = null;
    this.unsubscribeConnection = null;
    if (this.active) {
      this.active = false;
      this.endedAt = new Date().toISOString();
      this.dongle.setCaptureSource('AED');
      this.onRoutingChanged(false);
    }
    // The app-wide passive receiver owns the hardware listening lifecycle.
    this.emit();
    await this.persist();
  }

  async clear(): Promise<void> {
    if (this.saving) return;
    await this.stop();
    this.reset();
  }

  private reset(): void {
    this.frames = [];
    this.decoded = [];
    this.startedAt = this.active ? new Date().toISOString() : null;
    this.endedAt = null;
    this.partial = false;
    this.id = null;
    this.persisted = false;
    this.label = null;
    this.persistenceError = null;
    this.devices.clear();
    this.emit();
  }

  getSnapshot(): RemoteTestSnapshot {
    return {
      active: this.active,
      count: this.frames.length,
      lastFrame: this.frames[this.frames.length - 1] ?? null,
      lastDecoded: this.decoded[this.decoded.length - 1] ?? null,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      isPartial: this.partial,
      persistenceError: this.persistenceError,
      devices: Array.from(this.devices.values()),
    };
  }

  onChanged(listener: (snapshot: RemoteTestSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async save(label = ''): Promise<RecordingSession> {
    if (this.saving || this.starting) throw new Error('Remote test operation is in progress.');
    await this.stop();
    if (!this.frames.length || !this.startedAt) throw new Error('Receive a frame before saving.');
    this.saving = true;
    this.label = label.trim() || null;
    try {
      await this.persist();
      const session = this.createSession();
      this.reset();
      return session;
    } finally {
      this.saving = false;
    }
  }

  private createSession(): RecordingSession {
    const startedAt = this.startedAt!;
    const updatedAt = new Date().toISOString();
    this.id ??= String(uuid.v4());
    return {
      id: this.id,
      mode: 'device',
      source: this.source,
      label: this.label,
      signature: buildSignalSignature(this.frames[0], this.decoded[0]),
      startedAt,
      endedAt: this.endedAt,
      durationMs: Math.max(0, Date.parse(this.endedAt ?? updatedAt) - Date.parse(startedAt)),
      rawFrames: this.frames.slice(),
      decodedSnapshots: this.decoded.slice(),
      isPartial: this.partial,
      notes: this.endedAt
        ? null
        : `${this.source === 'ALL_DEVICES' ? 'All Devices' : 'Remote Test'} draft - automatically saved`,
      syncStatus: 'pending',
      syncError: null,
      createdAt: startedAt,
      updatedAt,
    };
  }

  private persist(): Promise<void> {
    const operation = this.writes.then(async () => {
      if (!this.frames.length || !this.startedAt) return;
      const session = this.createSession();
      if (this.persisted) await this.recordings.update(session);
      else {
        await this.recordings.save(session);
        this.persisted = true;
      }
      this.persistenceError = null;
      this.emit();
    });
    this.writes = operation.catch(error => {
      this.persistenceError =
        error instanceof Error ? error.message : 'Unable to save remote capture';
      this.emit();
    });
    return operation;
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(listener => listener(snapshot));
  }
}
