import uuid from 'react-native-uuid';
import type {RecordingRepository} from '../repositories/RecordingRepository';
import type {
  DecodedIrData,
  DetectedDevice,
  RawIrFrame,
  RecordingSession,
  SignalSignature,
} from '../entities/types';
import {decodeIrFrame, createRawFallbackDecode} from '../parsers/ir/irDecoder';
import {buildSignalSignature, signalStrengthFromRecency} from '../parsers/ir/signalSignature';
import type {DongleService} from './DongleService';
import {AppError, ErrorMessages} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';

export class CaptureService {
  private readonly devices = new Map<string, DetectedDevice>();
  private deviceListeners = new Set<(devices: DetectedDevice[]) => void>();
  private scanning = false;
  private unsubscribeFrame: (() => void) | null = null;
  private unsubscribeError: (() => void) | null = null;

  private activeSession: {
    id: string;
    signature: SignalSignature;
    startedAt: string;
    frames: RawIrFrame[];
    decoded: DecodedIrData[];
  } | null = null;
  private sessionFrameUnsub: (() => void) | null = null;

  constructor(
    private readonly dongle: DongleService,
    private readonly recordings: RecordingRepository,
  ) {}

  async startDeviceScan(): Promise<void> {
    if (!this.dongle.isConnected()) {
      throw new AppError('NOT_CONNECTED', 'not connected', ErrorMessages.NOT_CONNECTED, false);
    }
    if (this.scanning) {
      return;
    }
    this.scanning = true;
    await this.dongle.startListening();
    this.unsubscribeFrame = this.dongle.onFrame(frame => this.handleScanFrame(frame));
    this.unsubscribeError = this.dongle.onError(async error => {
      if (error.code === 'DONGLE_REMOVED') {
        await this.handleHotUnplug();
      }
    });
  }

  async stopDeviceScan(): Promise<void> {
    this.scanning = false;
    this.unsubscribeFrame?.();
    this.unsubscribeFrame = null;
    this.unsubscribeError?.();
    this.unsubscribeError = null;
  }

  getDetectedDevices(): DetectedDevice[] {
    return Array.from(this.devices.values()).sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );
  }

  onDevicesChanged(listener: (devices: DetectedDevice[]) => void): () => void {
    this.deviceListeners.add(listener);
    listener(this.getDetectedDevices());
    return () => this.deviceListeners.delete(listener);
  }

  async startRecording(signature: SignalSignature): Promise<string> {
    if (!this.dongle.isConnected()) {
      throw new AppError('NOT_CONNECTED', 'not connected', ErrorMessages.NOT_CONNECTED, false);
    }
    if (this.activeSession) {
      await this.stopRecording(false);
    }
    const id = String(uuid.v4());
    this.activeSession = {
      id,
      signature,
      startedAt: new Date().toISOString(),
      frames: [],
      decoded: [],
    };
    await this.dongle.startListening();
    this.sessionFrameUnsub = this.dongle.onFrame(frame => {
      if (!this.activeSession) {
        return;
      }
      // Preserve exact raw frame
      this.activeSession.frames.push(frame);
      const decoded = decodeIrFrame(frame) ?? createRawFallbackDecode(frame);
      this.activeSession.decoded.push(decoded);
    });
    logger.info('Recording started', {id});
    return id;
  }

  getLiveFrames(): RawIrFrame[] {
    return this.activeSession?.frames.slice() ?? [];
  }

  getActiveSessionId(): string | null {
    return this.activeSession?.id ?? null;
  }

  async stopRecording(isPartial = false): Promise<RecordingSession | null> {
    this.sessionFrameUnsub?.();
    this.sessionFrameUnsub = null;
    const active = this.activeSession;
    this.activeSession = null;
    if (!active) {
      return null;
    }
    const endedAt = new Date().toISOString();
    const durationMs = Math.max(
      0,
      new Date(endedAt).getTime() - new Date(active.startedAt).getTime(),
    );
    const session: RecordingSession = {
      id: active.id,
      source: 'AED',
      label: null,
      mode: 'device',
      signature: active.signature,
      startedAt: active.startedAt,
      endedAt,
      durationMs,
      rawFrames: active.frames.map(f => ({...f, timingsUs: Object.freeze([...f.timingsUs])})),
      decodedSnapshots: active.decoded,
      isPartial,
      notes: isPartial ? 'Saved after dongle disconnect' : null,
      syncStatus: 'pending',
      syncError: null,
      createdAt: active.startedAt,
      updatedAt: endedAt,
    };
    await this.recordings.save(session);
    logger.info('Recording saved', {
      id: session.id,
      frames: session.rawFrames.length,
      partial: isPartial,
    });
    return session;
  }

  private handleScanFrame(frame: RawIrFrame): void {
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
            signalStrength: 1,
            lastSeenAt: now,
            firstSeenAt: now,
            hitCount: 1,
          };
      this.devices.set(signature.key, device);
      this.emitDevices();
    } catch {
      logger.warn('Corrupted frame skipped during scan');
    }
  }

  private emitDevices(): void {
    const list = this.getDetectedDevices();
    this.deviceListeners.forEach(l => l(list));
  }

  private async handleHotUnplug(): Promise<void> {
    if (this.activeSession) {
      await this.stopRecording(true);
    }
    await this.stopDeviceScan();
  }
}
