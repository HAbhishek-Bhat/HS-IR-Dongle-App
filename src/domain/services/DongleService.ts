import {
  createIrDongleEventEmitter,
  IrDongle,
  IrDongleEvents,
  toRawIrFrame,
  type IrDongleNativeModule,
  type IrDongleEventSource,
} from '@native/IrDongleBridge';
import type {
  DongleConnectionState,
  RawIrFrame,
  RecordingSource,
  UsbDeviceInfo,
} from '../entities/types';
import {AppError, ErrorMessages, type AppErrorCode} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';

export type FrameListener = (frame: RawIrFrame) => void | Promise<void>;
export type ConnectionListener = (state: DongleConnectionState) => void;
export type DongleErrorListener = (error: AppError) => void;

export function isDongleReady(state: DongleConnectionState): boolean {
  return state.status === 'listening' || state.status === 'ready' || state.status === 'receiving';
}

function errorCode(code: string): AppErrorCode {
  switch (code) {
    case 'DONGLE_REMOVED':
    case 'PERMISSION_DENIED':
    case 'UNSUPPORTED_DONGLE':
    case 'RECEIVE_PROTOCOL_UNVERIFIED':
    case 'USB_OPERATION_FAILED':
    case 'STORAGE_ERROR':
      return code;
    case 'NO_DONGLE':
      return 'NOT_CONNECTED';
    default:
      return code.startsWith('USB_') ? 'USB_OPERATION_FAILED' : 'UNKNOWN';
  }
}

/** The same bridge contract serves physical identification, simulator and test fakes. */
export class DongleService {
  private readonly frameListeners = new Set<FrameListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly errorListeners = new Set<DongleErrorListener>();
  private readonly usbDeviceListeners = new Set<(devices: UsbDeviceInfo[]) => void>();
  private subscriptions: Array<{remove(): void}> = [];
  private currentState: DongleConnectionState = {status: 'disconnected'};
  private initialization: Promise<void> | null = null;
  private lifecycle = Promise.resolve();
  private captureSource: RecordingSource = 'AED';
  private frameQueue = Promise.resolve();

  constructor(
    private readonly bridge: IrDongleNativeModule = IrDongle,
    private readonly emitter: IrDongleEventSource = createIrDongleEventEmitter(),
    private readonly beforeReceiverSelection: () => Promise<void> = async () => {},
  ) {}

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    const operation = this.lifecycle.then(async () => {
      this.subscriptions = [
        this.emitter.addListener(IrDongleEvents.CONNECTION_CHANGED, state => this.setState(state)),
        this.emitter.addListener(IrDongleEvents.USB_DEVICES_CHANGED, payload => {
          this.usbDeviceListeners.forEach(listener => listener(payload.devices));
        }),
        this.emitter.addListener(IrDongleEvents.FRAME_RECEIVED, payload => {
          if (!this.isConnected() && payload.deliveryId == null) return;
          const frame = toRawIrFrame(payload);
          const listeners = Array.from(this.frameListeners);
          this.frameQueue = this.frameQueue
            .then(async () => {
              await Promise.all(listeners.map(listener => listener(frame)));
              if (payload.deliveryId != null) this.bridge.acknowledgeFrame(payload.deliveryId);
            })
            .catch(() => {
              const error = new AppError(
                'STORAGE_ERROR',
                'Received bytes could not be stored. Reception is paused; reconnect after resolving storage.',
                ErrorMessages.STORAGE_ERROR,
                false,
              );
              logger.warn('Capture persistence failed; USB delivery not acknowledged', {
                code: error.code,
              });
              this.setState({status: 'error', code: error.code, message: error.userMessage});
              this.errorListeners.forEach(listener => listener(error));
            });
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

  setCaptureSource(source: RecordingSource): void {
    this.captureSource = source;
  }

  getCaptureSource(): RecordingSource {
    return this.captureSource;
  }

  getDiagnostics(): Promise<string> {
    return this.invoke(() => this.bridge.getDiagnostics());
  }

  async listUsbDevices(): Promise<UsbDeviceInfo[]> {
    await this.initialize();
    if (typeof this.bridge.listUsbDevices !== 'function') {
      throw new AppError(
        'USB_OPERATION_FAILED',
        'USB picker native API missing',
        'Rebuild and reinstall the Android app to enable USB device selection.',
      );
    }
    return this.invoke(() => this.bridge.listUsbDevices());
  }

  async selectUsbDevice(deviceName: string): Promise<void> {
    await this.initialize();
    if (typeof this.bridge.selectUsbDevice !== 'function') {
      throw new AppError(
        'USB_OPERATION_FAILED',
        'USB picker native API missing',
        'Rebuild and reinstall the Android app to enable USB device selection.',
      );
    }
    await this.flushFrames();
    await this.beforeReceiverSelection();
    try {
      await this.invoke(() => this.bridge.selectUsbDevice(deviceName));
    } finally {
      this.setState(await this.invoke(() => this.bridge.getConnectionState()));
    }
  }

  onUsbDevicesChanged(listener: (devices: UsbDeviceInfo[]) => void): () => void {
    this.usbDeviceListeners.add(listener);
    return () => this.usbDeviceListeners.delete(listener);
  }

  async flushFrames(): Promise<void> {
    await this.frameQueue;
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
      await this.flushFrames();
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
