/** Sync lifecycle for offline-first records. */
export type SyncStatus = 'pending' | 'synced' | 'failed';

/** High-level capture modes. */
export type CaptureMode = 'device' | 'aed' | 'idle';

/** Known IR protocol families (extensible). */
export type IrProtocolFamily =
  'NEC' | 'NECext' | 'RC5' | 'RC6' | 'SIRC' | 'SIRC15' | 'SIRC20' | 'RAW' | 'UNKNOWN';

/** Pulse/space timing sample in microseconds. Positive = mark (IR on), negative = space (IR off). */
export interface TimingSample {
  /** Duration in microseconds. Sign convention: +mark / -space. */
  durationUs: number;
}

/** Exact raw frame as received from the dongle — never mutated after capture. */
export interface RawIrFrame {
  /** Monotonic capture timestamp (device uptime ms from native, or Date.now() in simulator). */
  receivedAtMs: number;
  /** Carrier frequency in Hz if reported by dongle; null if unknown. */
  carrierHz: number | null;
  /** Ordered pulse/space timings exactly as received. */
  timingsUs: readonly number[];
  /** Optional opaque bytes from dongle framing layer (CRC, headers) — stored verbatim. */
  frameBytesHex: string | null;
}

/** Decoded IR payload when a protocol parser succeeds. */
export interface DecodedIrData {
  protocol: IrProtocolFamily;
  address: number | null;
  command: number | null;
  /** Extra protocol-specific fields (e.g. toggle bit). */
  extras: Record<string, number | string | boolean>;
  confidence: number;
}

/**
 * Signal signature used as a stable "device identity" when IR has no discovery.
 * Built from protocol + carrier + address/ID code.
 */
export interface SignalSignature {
  /** Deterministic hash key for map lookups. */
  key: string;
  protocol: IrProtocolFamily;
  carrierHz: number | null;
  address: number | null;
  /** Secondary ID when protocol exposes it (e.g. device id in AED frames). */
  deviceIdCode: string | null;
  /** Human-readable label derived from signature. */
  displayName: string;
}

export interface DetectedDevice {
  signature: SignalSignature;
  signalStrength: number;
  lastSeenAt: string;
  firstSeenAt: string;
  hitCount: number;
}

export interface DongleInfo {
  deviceName: string;
  vendorId: number;
  productId: number;
  manufacturerName: string | null;
  serialNumber: string | null;
  connected: boolean;
  simulated?: boolean;
  receiveProtocolVerified?: boolean;
  transport?: string;
}

export type DongleConnectionState =
  | {status: 'disconnected'}
  | {
      status:
        | 'detected'
        | 'permission_required'
        | 'permission_denied'
        | 'connecting'
        | 'ready'
        | 'receiving';
      dongle: DongleInfo;
      lastReceivedAtMs?: number;
      message?: string;
      code?: string;
    }
  | {status: 'unsupported'; dongle: DongleInfo; reason: string}
  | {status: 'error'; message: string; code: string; dongle?: DongleInfo};

export interface RecordingSession {
  id: string;
  mode: CaptureMode;
  signature: SignalSignature;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  /** Exact raw frames — never cleaned or altered. */
  rawFrames: RawIrFrame[];
  decodedSnapshots: DecodedIrData[];
  /** Partial save flag set on hot-unplug. */
  isPartial: boolean;
  notes: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Labeled AED clinical/workflow events. */
export type AedEventType =
  | 'power_on'
  | 'pads_connected'
  | 'pads_disconnected'
  | 'analyzing'
  | 'shock_advised'
  | 'no_shock_advised'
  | 'charging'
  | 'shock_delivered'
  | 'cpr_prompt'
  | 'self_test'
  | 'battery_low'
  | 'error'
  | 'unknown'
  | 'raw_frame';

export interface AedEvent {
  id: string;
  sessionId: string;
  type: AedEventType;
  label: string;
  timestamp: string;
  /** Exact raw signal for this event — never altered. */
  rawFrame: RawIrFrame;
  decoded: DecodedIrData | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface AedSession {
  id: string;
  signature: SignalSignature;
  manufacturer: string | null;
  model: string | null;
  parserId: string;
  startedAt: string;
  endedAt: string | null;
  events: AedEvent[];
  isPartial: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  consentAcceptedAt: string | null;
  privacyVersion: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  user: UserProfile;
}

export interface AppSettings {
  cloudProvider: 'rest' | 'firebase' | 'none';
  restApiBaseUrl: string;
  mockSimulatorEnabled: boolean;
  darkMode: 'system' | 'light' | 'dark';
  autoSync: boolean;
  hapticFeedback: boolean;
  crashReportingEnabled: boolean;
}

export interface SyncQueueItem {
  id: string;
  entityType: 'recording' | 'aed_session';
  entityId: string;
  attempts: number;
  nextRetryAt: string;
  lastError: string | null;
  createdAt: string;
}
