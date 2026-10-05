import {
  createIrDongleEventEmitter,
  IrDongle,
  IrDongleEvents,
  toRawIrFrame,
  type DongleConnectionNative,
  type NativeIrFramePayload,
} from '@native/IrDongleBridge';
import type {DongleConnectionState, RawIrFrame} from '../entities/types';
import {AppError, ErrorMessages} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';

export type FrameListener = (frame: RawIrFrame) => void;
export type ConnectionListener = (state: DongleConnectionState) => void;
export type DongleErrorListener = (error: AppError) => void;

function mapConnection(native: DongleConnectionNative): DongleConnectionState {
  switch (native.status) {
    case 'disconnected':
      return {status: 'disconnected'};
    case 'permission_required':
      return {status: 'permission_required', dongle: native.dongle!};
    case 'connecting':
      return {status: 'connecting', dongle: native.dongle!};
    case 'connected':
      return {status: 'connected', dongle: native.dongle!};
    case 'unsupported':
      return {
        status: 'unsupported',
        dongle: native.dongle!,
        reason: native.reason ?? ErrorMessages.UNSUPPORTED_DONGLE,
      };
    case 'error':
      return {
        status: 'error',
        message: native.message ?? ErrorMessages.UNKNOWN,
        code: native.code ?? 'UNKNOWN',
      };
    default:
      return {status: 'disconnected'};
  }
}

/**
 * Domain service wrapping the native USB module.
 * Injectable / mockable for tests via constructor override of IrDongle-like API.
 */
export class DongleService {
  private readonly emitter = createIrDongleEventEmitter();
  private readonly frameListeners = new Set<FrameListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly errorListeners = new Set<DongleErrorListener>();
  private subscriptions: Array<{remove: () => void}> = [];
  private currentState: DongleConnectionState = {status: 'disconnected'};
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.subscriptions = [
      this.emitter.addListener(IrDongleEvents.CONNECTION_CHANGED, (payload: DongleConnectionNative) => {
        this.currentState = mapConnection(payload);
        this.connectionListeners.forEach(l => l(this.currentState));
      }),
      this.emitter.addListener(IrDongleEvents.FRAME_RECEIVED, (payload: NativeIrFramePayload) => {
        const frame = toRawIrFrame(payload);
        this.frameListeners.forEach(l => l(frame));
      }),
      this.emitter.addListener(IrDongleEvents.ERROR, (payload: {code: string; message: string}) => {
        const code =
          payload.code === 'DONGLE_REMOVED'
            ? 'DONGLE_REMOVED'
            : payload.code === 'PERMISSION_DENIED'
              ? 'PERMISSION_DENIED'
              : 'UNKNOWN';
        const error = new AppError(
          code,
          payload.message,
          ErrorMessages[code],
          code === 'DONGLE_REMOVED',
        );
        this.errorListeners.forEach(l => l(error));
        if (code === 'DONGLE_REMOVED') {
          this.currentState = {status: 'disconnected'};
          this.connectionListeners.forEach(l => l(this.currentState));
        }
      }),
    ];
    await IrDongle.initialize();
    const state = await IrDongle.getConnectionState();
    this.currentState = mapConnection(state);
    this.initialized = true;
    logger.info('DongleService initialized', {status: this.currentState.status});
  }

  getConnectionState(): DongleConnectionState {
    return this.currentState;
  }

  isConnected(): boolean {
    return this.currentState.status === 'connected';
  }

  async requestPermission(): Promise<boolean> {
    return IrDongle.requestPermission();
  }

  async startListening(): Promise<void> {
    if (!this.isConnected() && this.currentState.status !== 'permission_required') {
      throw new AppError('NOT_CONNECTED', 'not connected', ErrorMessages.NOT_CONNECTED, false);
    }
    await IrDongle.startListening();
  }

  async stopListening(): Promise<void> {
    await IrDongle.stopListening();
  }

  async setSimulatorMode(enabled: boolean): Promise<void> {
    await IrDongle.setSimulatorMode(enabled);
    const state = await IrDongle.getConnectionState();
    this.currentState = mapConnection(state);
    this.connectionListeners.forEach(l => l(this.currentState));
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.currentState);
    return () => this.connectionListeners.delete(listener);
  }

  onError(listener: DongleErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async destroy(): Promise<void> {
    this.subscriptions.forEach(s => s.remove());
    this.subscriptions = [];
    this.frameListeners.clear();
    this.connectionListeners.clear();
    this.errorListeners.clear();
    await IrDongle.destroy();
    this.initialized = false;
  }
}
