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
import type {DongleService} from './DongleService';
import {AppError, ErrorMessages} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';

export class AedRetrievalService {
  private readonly devices = new Map<string, DetectedDevice>();
  private deviceListeners = new Set<(devices: DetectedDevice[]) => void>();
  private eventListeners = new Set<(events: AedEvent[]) => void>();
  private scanning = false;
  private unsubFrame: (() => void) | null = null;
  private unsubError: (() => void) | null = null;

  private active: {
    session: AedSession;
  } | null = null;

  constructor(
    private readonly dongle: DongleService,
    private readonly aedSessions: AedSessionRepository,
  ) {}

  async startListeningForAeds(): Promise<void> {
    if (!this.dongle.isConnected()) {
      throw new AppError('NOT_CONNECTED', 'not connected', ErrorMessages.NOT_CONNECTED, false);
    }
    if (this.scanning) {
      return;
    }
    this.scanning = true;
    await this.dongle.startListening();
    this.unsubFrame = this.dongle.onFrame(frame => this.handleFrame(frame));
    this.unsubError = this.dongle.onError(async error => {
      if (error.code === 'DONGLE_REMOVED') {
        await this.endSession(true);
        await this.stopListeningForAeds();
      }
    });
  }

  async stopListeningForAeds(): Promise<void> {
    this.scanning = false;
    this.unsubFrame?.();
    this.unsubFrame = null;
    this.unsubError?.();
    this.unsubError = null;
    if (!this.active) {
      await this.dongle.stopListening();
    }
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
    listener(this.active?.session.events.slice() ?? []);
    return () => this.eventListeners.delete(listener);
  }

  async startSession(signature: SignalSignature, preferredParserId?: string): Promise<AedSession> {
    if (!this.dongle.isConnected()) {
      throw new AppError('NOT_CONNECTED', 'not connected', ErrorMessages.NOT_CONNECTED, false);
    }
    if (this.active) {
      await this.endSession(false);
    }
    const now = new Date().toISOString();
    // Probe parser with empty-ish frame for metadata
    const probeFrame: RawIrFrame = {
      receivedAtMs: Date.now(),
      carrierHz: signature.carrierHz,
      timingsUs: [],
      frameBytesHex: null,
    };
    const parser = resolveAedParser(signature, probeFrame, preferredParserId);
    const session: AedSession = {
      id: String(uuid.v4()),
      signature,
      manufacturer: parser.manufacturer === 'Unknown' ? null : parser.manufacturer,
      model: parser.model === 'Raw Capture' ? null : parser.model,
      parserId: parser.id,
      startedAt: now,
      endedAt: null,
      events: [],
      isPartial: false,
      syncStatus: 'pending',
      syncError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.active = {session};
    await this.dongle.startListening();
    if (!this.unsubFrame) {
      this.unsubFrame = this.dongle.onFrame(frame => this.handleFrame(frame));
    }
    logger.info('AED session started', {id: session.id, parserId: parser.id});
    return session;
  }

  getActiveSession(): AedSession | null {
    return this.active?.session ?? null;
  }

  async endSession(isPartial = false): Promise<AedSession | null> {
    const active = this.active;
    this.active = null;
    if (!active) {
      return null;
    }
    const endedAt = new Date().toISOString();
    const session: AedSession = {
      ...active.session,
      endedAt,
      isPartial,
      updatedAt: endedAt,
      syncStatus: 'pending',
    };
    await this.aedSessions.save(session);
    this.eventListeners.forEach(l => l(session.events.slice()));
    logger.info('AED session saved', {
      id: session.id,
      events: session.events.length,
      partial: isPartial,
    });
    return session;
  }

  private handleFrame(frame: RawIrFrame): void {
    try {
      const decoded = decodeIrFrame(frame);
      const signature = buildSignalSignature(frame, decoded);
      const now = new Date().toISOString();
      const existing = this.devices.get(signature.key);
      const device: DetectedDevice = existing
        ? {
            ...existing,
            lastSeenAt: now,
            hitCount: existing.hitCount + 1,
            signalStrength: signalStrengthFromRecency(now),
          }
        : {
            signature,
            firstSeenAt: now,
            lastSeenAt: now,
            hitCount: 1,
            signalStrength: 1,
          };
      this.devices.set(signature.key, device);
      this.deviceListeners.forEach(l => l(this.getDetectedAeds()));

      if (!this.active) {
        return;
      }
      // Only append events for the selected AED signature
      if (signature.key !== this.active.session.signature.key) {
        return;
      }

      const parser = resolveAedParser(signature, frame, this.active.session.parserId);
      const parsed = parser.parseFrame(frame, signature);
      for (const item of parsed) {
        const event: AedEvent = {
          id: String(uuid.v4()),
          sessionId: this.active.session.id,
          type: item.type,
          label: item.label,
          timestamp: new Date(frame.receivedAtMs).toISOString(),
          rawFrame: {
            receivedAtMs: frame.receivedAtMs,
            carrierHz: frame.carrierHz,
            timingsUs: Object.freeze([...frame.timingsUs]),
            frameBytesHex: frame.frameBytesHex,
          },
          decoded: item.decoded,
          metadata: item.metadata,
        };
        this.active.session.events.push(event);
        this.active.session.updatedAt = event.timestamp;
        if (parser.manufacturer !== 'Unknown') {
          this.active.session.manufacturer = parser.manufacturer;
          this.active.session.model = parser.model;
        }
      }
      this.eventListeners.forEach(l => l(this.active!.session.events.slice()));
    } catch {
      logger.warn('Corrupted AED frame skipped');
    }
  }
}
