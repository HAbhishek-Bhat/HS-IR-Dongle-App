import {
  createIrDongleEventEmitter,
  IrDongle,
  IrDongleEvents,
  toRawIrFrame,
  type IrDongleNativeModule,
  type IrDongleEventSource,
} from '@native/IrDongleBridge';
import type {DongleConnectionState, RawIrFrame} from '../entities/types';
import {AppError, ErrorMessages, type AppErrorCode} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';

export type FrameListener = (frame: RawIrFrame) => void;
export type ConnectionListener = (state: DongleConnectionState) => void;
export type DongleErrorListener = (error: AppError) => void;

export function isDongleReady(state: DongleConnectionState): boolean {
  return state.status === 'ready' || state.status === 'receiving';
}

function errorCode(code: string): AppErrorCode {
  switch (code) {
    case 'DONGLE_REMOVED':
    case 'PERMISSION_DENIED':
    case 'RECEIVE_PROTOCOL_UNVERIFIED':
    case 'USB_OPERATION_FAILED':
      return code;
    case 'NO_DONGLE':
      return 'NOT_CONNECTED';
    default:
      return 'UNKNOWN';
  }
}

/** The same bridge contract serves physical identification, simulator and test fakes. */
export class DongleService {
  private readonly frameListeners = new Set<FrameListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly errorListeners = new Set<DongleErrorListener>();
  private subscriptions: Array<{remove(): void}> = [];
  private currentState: DongleConnectionState = {status: 'disconnected'};
  private initialization: Promise<void> | null = null;
  private lifecycle = Promise.resolve();

  constructor(
    private readonly bridge: IrDongleNativeModule = IrDongle,
    private readonly emitter: IrDongleEventSource = createIrDongleEventEmitter(),
  ) {}

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    const operation = this.lifecycle.then(async () => {
      this.subscriptions = [
        this.emitter.addListener(IrDongleEvents.CONNECTION_CHANGED, state => this.setState(state)),
        this.emitter.addListener(IrDongleEvents.FRAME_RECEIVED, payload => {
          if (!this.isConnected()) return;
          const frame = toRawIrFrame(payload);
          this.frameListeners.forEach(listener => listener(frame));
        }),
        this.emitter.addListener(IrDongleEvents.ERROR, payload => {
          const code = errorCode(payload.code);
          const error = new AppError(
            code,
            payload.message,
            ErrorMessages[code],
            code !== 'RECEIVE_PROTOCOL_UNVERIFIED',
          );
          logger.warn('Dongle transport error', {code});
          this.errorListeners.forEach(listener => listener(error));
        }),
      ];
      try {
        await this.invoke(() => this.bridge.initialize());
        this.setState(await this.invoke(() => this.bridge.getConnectionState()));
        logger.info('DongleService initialized', {status: this.currentState.status});
      } catch (error) {
        this.removeSubscriptions();
        logger.error('Dongle initialization failed', error);
        throw error;
      }
    });
    this.initialization = operation;
    this.lifecycle = operation.catch(error => {
      if (this.initialization === operation) this.initialization = null;
      logger.warn('USB initialization queue released after failure', {
        failed: error instanceof Error,
      });
    });
    return operation;
  }

  private setState(state: DongleConnectionState): void {
    this.currentState = state;
    this.connectionListeners.forEach(listener => listener(state));
  }

  private async invoke<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AppError) throw error;
      const nativeCode =
        typeof error === 'object' &&
        error != null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'UNKNOWN';
      const code = errorCode(nativeCode);
      logger.warn('USB bridge operation failed', {code});
      throw new AppError(
        code,
        ErrorMessages[code],
        ErrorMessages[code],
        code !== 'RECEIVE_PROTOCOL_UNVERIFIED',
      );
    }
  }

  getConnectionState(): DongleConnectionState {
    return this.currentState;
  }

  isConnected(): boolean {
    return isDongleReady(this.currentState);
  }

  async reconnect(): Promise<void> {
    await this.initialize();
    await this.invoke(() => this.bridge.reconnect());
    this.setState(await this.invoke(() => this.bridge.getConnectionState()));
  }

  async requestPermission(): Promise<boolean> {
    await this.initialize();
    const granted = await this.invoke(() => this.bridge.requestPermission());
    this.setState(await this.invoke(() => this.bridge.getConnectionState()));
    return granted;
  }

  async startListening(): Promise<void> {
    if (this.currentState.status === 'error') {
      const code = errorCode(this.currentState.code);
      throw new AppError(code, this.currentState.message, ErrorMessages[code], false);
    }
    if (
      !this.isConnected() &&
      !('dongle' in this.currentState && this.currentState.dongle?.simulated)
    ) {
      throw new AppError('NOT_CONNECTED', 'not ready', ErrorMessages.NOT_CONNECTED, false);
    }
    await this.invoke(() => this.bridge.startListening());
    this.setState(await this.invoke(() => this.bridge.getConnectionState()));
  }

  async stopListening(): Promise<void> {
    await this.invoke(() => this.bridge.stopListening());
    this.setState(await this.invoke(() => this.bridge.getConnectionState()));
  }

  async setSimulatorMode(enabled: boolean): Promise<void> {
    await this.initialize();
    await this.invoke(() => this.bridge.setSimulatorMode(enabled));
    this.setState(await this.invoke(() => this.bridge.getConnectionState()));
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

  private removeSubscriptions(): void {
    this.subscriptions.forEach(subscription => subscription.remove());
    this.subscriptions = [];
  }

  destroy(): Promise<void> {
    this.initialization = null;
    const operation = this.lifecycle.then(async () => {
      this.removeSubscriptions();
      this.setState({status: 'disconnected'});
      await this.invoke(() => this.bridge.destroy());
    });
    this.lifecycle = operation.catch(error => {
      logger.error('Dongle teardown failed', error);
    });
    return operation;
  }
}
