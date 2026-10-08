import uuid from 'react-native-uuid';
import type {AedSessionRepository} from '../repositories/AedSessionRepository';
import type {
  AedEvent,
  AedSession,
  DetectedDevice,
  RawIrFrame,
  SignalSignature,
} from '../entities/types';
import {decodeIrFrame} from '../parsers/ir/irDecoder';
import {buildSignalSignature, signalStrengthFromRecency} from '../parsers/ir/signalSignature';
import {resolveAedParser} from '../parsers/aed/aedParserRegistry';
import {RawCaptureAedParser} from '../parsers/aed/RawCaptureAedParser';
import {getReportedAedSerialNumber} from '../parsers/aed/aedIdentity';
import type {DongleService} from './DongleService';
import {AppError, ErrorMessages} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';

/** USB transfer boundaries are not AED device identities. Group by inactivity, not raw byte hashes. */
export class AedRetrievalService {
  private readonly devices = new Map<string, DetectedDevice>();
  private readonly deviceListeners = new Set<(devices: DetectedDevice[]) => void>();
  private readonly eventListeners = new Set<(events: AedEvent[]) => void>();
  private readonly sessionListeners = new Set<() => void>();
  private active: AedSession | null = null;
  private persisted = false;
  private unsubscribeFrame: (() => void) | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dongle: DongleService,
    private readonly aedSessions: AedSessionRepository,
    private readonly inactivityMs = 5_000,
  ) {}

  initializeAutoCapture(): void {
    if (this.unsubscribeFrame) return;
    this.unsubscribeFrame = this.dongle.onFrame(frame => {
      if (this.dongle.getCaptureSource() !== 'AED') return;
      return this.serialize(() => this.handleFrame(frame));
    });
    this.unsubscribeConnection = this.dongle.onConnectionChange(state => {
      if (state.status === 'disconnected' && this.active) {
        void this.endSession(true).catch(() => this.reportStorageFailure());
      }
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => {},
      () => {
        this.reportStorageFailure();
      },
    );
    return result;
  }

  private reportStorageFailure(): void {
    logger.warn('AED persistence failed', {code: 'STORAGE_ERROR'});
  }

  async startListeningForAeds(): Promise<void> {
    this.initializeAutoCapture();
    if (!this.dongle.isConnected()) {
      throw new AppError('NOT_CONNECTED', 'not connected', ErrorMessages.NOT_CONNECTED, false);
    }
    await this.dongle.startListening();
  }

  async stopListeningForAeds(): Promise<void> {
    // Screens unsubscribe from UI updates; default AED acquisition remains app-wide.
    await this.queue;
  }

  getDetectedAeds(): DetectedDevice[] {
    return Array.from(this.devices.values()).sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );
  }

  onAedsChanged(listener: (devices: DetectedDevice[]) => void): () => void {
    this.deviceListeners.add(listener);
    listener(this.getDetectedAeds());
    return () => this.deviceListeners.delete(listener);
  }

  onEventsChanged(listener: (events: AedEvent[]) => void): () => void {
    this.eventListeners.add(listener);
    listener(this.active?.events.slice() ?? []);
    return () => this.eventListeners.delete(listener);
  }

  onSessionsChanged(listener: () => void): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  listSessions(): Promise<AedSession[]> {
    return this.aedSessions.list();
  }

  async startSession(signature: SignalSignature, _preferredParserId?: string): Promise<AedSession> {
    await this.startListeningForAeds();
    return this.serialize(async () => {
      if (!this.active) this.createSession(signature, Date.now());
      return this.active!;
    });
  }

  private createSession(signature: SignalSignature, receivedAtMs: number): void {
    const now = new Date(receivedAtMs).toISOString();
    this.active = {
      id: String(uuid.v4()),
      source: 'AED',
      rawFrames: [],
      signature,
      manufacturer: null,
      model: null,
      parserId: 'raw-capture',
      startedAt: now,
      endedAt: null,
      events: [],
      isPartial: false,
      syncStatus: 'pending',
      syncError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.persisted = false;
  }

  getActiveSession(): AedSession | null {
    return this.active;
  }

  endSession(isPartial = false): Promise<AedSession | null> {
    return this.serialize(() => this.finishSession(isPartial));
  }

  private async finishSession(isPartial: boolean): Promise<AedSession | null> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const session = this.active;
    if (!session) return null;
    session.endedAt = new Date().toISOString();
    session.updatedAt = session.endedAt;
    session.isPartial = session.isPartial || isPartial;
    await this.persistActive();
    this.active = null;
    this.persisted = false;
    this.eventListeners.forEach(listener => listener(session.events.slice()));
    return session;
  }

  private async persistActive(): Promise<void> {
    if (!this.active) return;
    // Freeze a snapshot so encryption/SQL never observes a later mutation.
    const snapshot: AedSession = {
      ...this.active,
      rawFrames: this.active.rawFrames?.slice(),
      events: this.active.events.slice(),
    };
    if (this.persisted) await this.aedSessions.update(snapshot);
    else {
      await this.aedSessions.save(snapshot);
      this.persisted = true;
    }
    this.sessionListeners.forEach(listener => listener());
  }

  private async handleFrame(frame: RawIrFrame): Promise<void> {
    const decoded = decodeIrFrame(frame);
    const signature = buildSignalSignature(frame, decoded);
    const now = new Date(frame.receivedAtMs).toISOString();
    const state = this.dongle.getConnectionState();
    const isLab = 'dongle' in state && state.dongle?.simulated === true;
    let parser: ReturnType<typeof resolveAedParser> = new RawCaptureAedParser();
    let parsed: ReturnType<typeof parser.parseFrame>;
    try {
      parser = resolveAedParser(signature, frame, undefined, isLab);
      parsed = parser.parseFrame(frame, signature);
      if (!parsed.length) {
        parser = new RawCaptureAedParser();
        parsed = parser.parseFrame(frame, signature);
      }
    } catch {
      logger.warn('AED parser failed; preserving raw/unparsed frame', {code: 'CORRUPTED_FRAME'});
      parser = new RawCaptureAedParser();
      parsed = parser.parseFrame(frame, signature);
    }
    const reportedSerial = getReportedAedSerialNumber(
      parsed.map(item => ({
        metadata: {parserId: parser.id, serialNumber: item.serialNumber ?? null},
      })),
    );
    const activeSerial = this.active ? getReportedAedSerialNumber(this.active.events) : null;
    if (reportedSerial && activeSerial && reportedSerial !== activeSerial) {
      await this.finishSession(false);
    }
    if (!this.active) this.createSession(signature, frame.receivedAtMs);
    const session = this.active!;
    const rawFrameIndex = session.rawFrames!.length;
    session.rawFrames!.push(frame);
    session.updatedAt = now;
    session.endedAt = null;
    session.syncStatus = 'pending';
    session.isPartial = session.isPartial || state.status === 'disconnected';
    for (const item of parsed) {
      session.events.push({
        id: String(uuid.v4()),
        sessionId: session.id,
        type: item.type,
        label: item.label,
        timestamp: now,
        rawFrame: frame,
        decoded: item.decoded,
        metadata: {
          ...item.metadata,
          parserId: parser.id,
          serialNumber:
            parser.id !== 'raw-capture' && parser.id !== 'hs-aed-v1'
              ? (item.serialNumber ?? null)
              : null,
          rawFrameIndex,
          source: 'AED',
        },
      });
    }
    if (parser.id !== 'raw-capture') {
      session.parserId = parser.id;
      session.manufacturer = parser.manufacturer;
      session.model = parser.model;
    }
    await this.persistActive();
    const serialNumber = getReportedAedSerialNumber(session.events);
    const deviceKey = serialNumber ? `${session.parserId}:${serialNumber}` : session.signature.key;
    const existing = this.devices.get(deviceKey) ?? this.devices.get(session.signature.key);
    if (serialNumber) this.devices.delete(session.signature.key);
    this.devices.set(deviceKey, {
      signature: session.signature,
      serialNumber,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      hitCount: (existing?.hitCount ?? 0) + 1,
      signalStrength: signalStrengthFromRecency(now),
    });
    this.deviceListeners.forEach(listener => listener(this.getDetectedAeds()));
    this.eventListeners.forEach(listener => listener(session.events.slice()));
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.endSession(false).catch(() => this.reportStorageFailure());
    }, this.inactivityMs);
  }

  async destroy(): Promise<void> {
    this.unsubscribeFrame?.();
    this.unsubscribeConnection?.();
    this.unsubscribeFrame = null;
    this.unsubscribeConnection = null;
    await this.endSession(true);
  }
}
