import React from 'react';
import {act, render, renderHook, waitFor} from '@testing-library/react-native';
import {DongleService} from '@domain/services/DongleService';
import type {
  AedSession,
  DongleConnectionState,
  DongleInfo,
  RawIrFrame,
  SyncStatus,
} from '@domain/entities/types';
import {
  IrDongleEvents,
  type IrDongleEventPayloads,
  type IrDongleEventSource,
  type IrDongleNativeModule,
} from '@native/IrDongleBridge';
import {useDongleBootstrap, useIsDongleConnected} from '@presentation/hooks/useDongle';
import {useAppStore} from '@presentation/store/appStore';
import {useHaptic} from '@presentation/hooks/useHaptic';
import {logger} from '@shared/logging/logger';
import {DongleBanner} from '@presentation/components/DongleBanner';
import {ThemeProvider} from '@presentation/theme/ThemeProvider';
import {AedRetrievalService} from '@domain/services/AedRetrievalService';
import type {AedSessionRepository} from '@domain/repositories/AedSessionRepository';
import {bootstrapAedParsers, registerAedParser} from '@domain/parsers/aed/aedParserRegistry';

jest.mock('@presentation/hooks/useHaptic', () => ({useHaptic: jest.fn()}));

const physical: DongleInfo = {
  deviceName: 'Smart IR Blaster',
  manufacturerName: 'ELKSMART',
  vendorId: 0x045c,
  productId: 0x0132,
  serialNumber: null,
  connected: true,
  simulated: false,
  receiveProtocolVerified: false,
};
const simulated: DongleInfo = {...physical, deviceName: 'HS IR Simulator', simulated: true};

class FakeBridge implements IrDongleNativeModule, IrDongleEventSource {
  state: DongleConnectionState = {status: 'disconnected'};
  physicalState: DongleConnectionState = {status: 'disconnected'};
  private listeners = new Map<keyof IrDongleEventPayloads, Set<(payload: unknown) => void>>();

  initialize = jest.fn(async () => {});
  startListening = jest.fn(async () => {});
  stopListening = jest.fn(async () => {});
  requestPermission = jest.fn(async () => false);
  getConnectionState = jest.fn(async () => this.state);
  reconnect = jest.fn(async () => {
    this.publish(this.physicalState);
  });
  setSimulatorMode = jest.fn(async (enabled: boolean) => {
    this.publish(enabled ? {status: 'ready', dongle: simulated} : this.physicalState);
  });
  destroy = jest.fn(async () => {});
  getDiagnostics = jest.fn(async () => 'USB descriptors');
  acknowledgeFrame = jest.fn((_deliveryId: number) => {});

  addListener<K extends keyof IrDongleEventPayloads>(
    event: K,
    listener: (payload: IrDongleEventPayloads[K]) => void,
  ): {remove(): void} {
    const listeners = this.listeners.get(event) ?? new Set();
    // emit's generic contract ensures each event supplies its matching payload.
    const callback = (payload: unknown) => listener(payload as IrDongleEventPayloads[K]);
    listeners.add(callback);
    this.listeners.set(event, listeners);
    return {
      remove: () => {
        listeners.delete(callback);
      },
    };
  }

  emit<K extends keyof IrDongleEventPayloads>(event: K, payload: IrDongleEventPayloads[K]): void {
    this.listeners.get(event)?.forEach(listener => listener(payload));
  }

  publish(state: DongleConnectionState): void {
    this.state = state;
    this.emit(IrDongleEvents.CONNECTION_CHANGED, state);
  }

  subscriptionCount(): number {
    return Array.from(this.listeners.values()).reduce(
      (total, listeners) => total + listeners.size,
      0,
    );
  }
}

describe('dongle service and bootstrap', () => {
  let bridge: FakeBridge;
  let service: DongleService;
  const haptic = {impact: jest.fn(), success: jest.fn(), warning: jest.fn()};

  beforeEach(() => {
    bridge = new FakeBridge();
    service = new DongleService(bridge, bridge);
    jest.clearAllMocks();
    jest.mocked(useHaptic).mockReturnValue(haptic);
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    useAppStore.setState({connection: {status: 'disconnected'}, lastError: null});
    useAppStore.getState().updateSettings({mockSimulatorEnabled: false});
  });

  describe('automatic AED persistence and USB backpressure', () => {
    let bridge: FakeBridge;
    let dongle: DongleService;
    let aed: AedRetrievalService;
    let repository: jest.Mocked<AedSessionRepository>;
    const payload = {
      receivedAtMs: 1_790_000_000_000,
      carrierHz: null,
      timingsUs: [],
      frameBytesHex: '0001AA55FF',
      deliveryId: 1,
      interfaceId: 0,
      endpointAddress: 130,
    };

    beforeEach(async () => {
      jest.useFakeTimers();
      jest.spyOn(logger, 'info').mockImplementation(() => {});
      jest.spyOn(logger, 'warn').mockImplementation(() => {});
      bootstrapAedParsers();
      bridge = new FakeBridge();
      dongle = new DongleService(bridge, bridge);
      repository = {
        save: jest.fn(async (_session: AedSession) => {}),
        update: jest.fn(async (_session: AedSession) => {}),
        getById: jest.fn(async (_id: string): Promise<AedSession | null> => null),
        list: jest.fn(async (): Promise<AedSession[]> => []),
        delete: jest.fn(async (_id: string) => {}),
        deleteAll: jest.fn(async () => {}),
        listPendingSync: jest.fn(async (): Promise<AedSession[]> => []),
        setSyncStatus: jest.fn(
          async (_id: string, _status: SyncStatus, _error?: string | null) => {},
        ),
      };
      aed = new AedRetrievalService(dongle, repository);
      aed.initializeAutoCapture();
      await dongle.initialize();
      bridge.publish({status: 'listening', dongle: physical});
    });

    afterEach(async () => {
      await aed.destroy();
      await dongle.destroy();
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('stores unknown bytes automatically before acknowledgement, and closes after inactivity', async () => {
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, payload);
      await dongle.flushFrames();
      const stored = repository.save.mock.calls[0][0];
      expect(stored.source).toBe('AED');
      expect(stored.parserId).toBe('raw-capture');
      expect(stored.rawFrames?.[0]).toMatchObject({
        receivedAtMs: payload.receivedAtMs,
        frameBytesHex: payload.frameBytesHex,
        interfaceId: 0,
        endpointAddress: 130,
      });
      expect(stored.events[0].metadata.rawFrameIndex).toBe(0);
      expect(bridge.acknowledgeFrame).toHaveBeenCalledWith(1);
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, {
        ...payload,
        deliveryId: 2,
        receivedAtMs: payload.receivedAtMs + 10,
      });
      await dongle.flushFrames();
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(repository.update.mock.calls[0][0].rawFrames).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(5_001);
      expect(aed.getActiveSession()).toBeNull();
      expect(repository.update.mock.calls.at(-1)?.[0].endedAt).not.toBeNull();
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, {...payload, deliveryId: 3});
      await dongle.flushFrames();
      expect(repository.save).toHaveBeenCalledTimes(2);
    });

    it('retains raw bytes when an AED parser throws or emits no events', async () => {
      registerAedParser({
        id: 'test-failing-parser',
        manufacturer: 'Unknown',
        model: 'Test',
        description: 'Test only',
        canHandle: (_signature, frame) => frame.frameBytesHex === 'BAD0',
        parseFrame: () => {
          throw new Error('payload must not enter logs');
        },
      });
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, {...payload, frameBytesHex: 'BAD0'});
      await dongle.flushFrames();
      expect(repository.save.mock.calls[0][0].rawFrames?.[0].frameBytesHex).toBe('BAD0');
      expect(repository.save.mock.calls[0][0].events[0].type).toBe('raw_frame');
      expect(logger.warn).toHaveBeenCalledWith('AED parser failed; preserving raw/unparsed frame', {
        code: 'CORRUPTED_FRAME',
      });
      registerAedParser({
        id: 'test-empty-parser',
        manufacturer: 'Unknown',
        model: 'Test',
        description: 'Test only',
        canHandle: (_signature, frame) => frame.frameBytesHex === 'E000',
        parseFrame: () => [],
      });
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, {
        ...payload,
        deliveryId: 2,
        frameBytesHex: 'E000',
      });
      await dongle.flushFrames();
      expect(repository.update.mock.calls[0][0].rawFrames).toHaveLength(2);
      expect(repository.update.mock.calls[0][0].events[1].type).toBe('raw_frame');
    });

    it('never applies the fictional clinical parser to physical data', async () => {
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, {...payload, frameBytesHex: '48533000'});
      await dongle.flushFrames();
      expect(repository.save.mock.calls[0][0].events[0].type).toBe('raw_frame');
      expect(repository.save.mock.calls[0][0].manufacturer).toBeNull();
    });

    it('waits for persistence before acknowledging delivery and surfaces storage failure', async () => {
      let finishSave: (() => void) | undefined;
      repository.save.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            finishSave = resolve;
          }),
      );
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, payload);
      await Promise.resolve();
      await Promise.resolve();
      expect(bridge.acknowledgeFrame).not.toHaveBeenCalled();
      finishSave?.();
      await dongle.flushFrames();
      expect(bridge.acknowledgeFrame).toHaveBeenCalledWith(1);
      repository.update.mockRejectedValueOnce(new Error('disk full'));
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, {...payload, deliveryId: 2});
      await dongle.flushFrames();
      expect(bridge.acknowledgeFrame).not.toHaveBeenCalledWith(2);
      expect(dongle.getConnectionState()).toMatchObject({status: 'error', code: 'STORAGE_ERROR'});
    });

    it('separates remote test routing and marks a detached session partial', async () => {
      dongle.setCaptureSource('REMOTE_TEST');
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, payload);
      await dongle.flushFrames();
      expect(repository.save).not.toHaveBeenCalled();
      dongle.setCaptureSource('AED');
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, {...payload, deliveryId: 2});
      await dongle.flushFrames();
      bridge.publish({status: 'disconnected'});
      await aed.stopListeningForAeds();
      expect(repository.update.mock.calls.at(-1)?.[0].isPartial).toBe(true);
      bridge.publish({status: 'listening', dongle: physical});
      bridge.emit(IrDongleEvents.FRAME_RECEIVED, {...payload, deliveryId: 3});
      await dongle.flushFrames();
      expect(repository.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('no-data hint', () => {
    afterEach(() => jest.useRealTimers());

    it('shows diagnostics only after thirty seconds, without disabling capture', () => {
      jest.useFakeTimers();
      useAppStore.setState({
        connection: {
          status: 'listening',
          dongle: physical,
          byteCount: 0,
          listeningSinceMs: Date.now(),
        },
      });
      const diagnostics = jest.fn();
      const screen = render(
        <ThemeProvider>
          <DongleBanner captureScreen onDiagnostics={diagnostics} />
        </ThemeProvider>,
      );
      act(() => jest.advanceTimersByTime(29_999));
      expect(screen.queryByText('USB Diagnostics')).toBeNull();
      act(() => jest.advanceTimersByTime(1));
      expect(screen.getByText('USB Diagnostics')).toBeTruthy();
      expect(screen.getByTestId('dongle-status').props.children).toBe(
        'Ready: listening for AED data',
      );
      act(() =>
        useAppStore.setState({connection: {status: 'receiving', dongle: physical, byteCount: 1}}),
      );
      expect(screen.queryByText('USB Diagnostics')).toBeNull();
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('coalesces concurrent initialization and publishes the initial native snapshot', async () => {
    bridge.state = {status: 'permission_required', dongle: physical};
    const listener = jest.fn();
    service.onConnectionChange(listener);
    const first = service.initialize();
    expect(service.initialize()).toBe(first);
    await first;
    expect(bridge.initialize).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(bridge.state);
  });

  it('handles detect, deny, retry and physical listening without a verification gate', async () => {
    await service.initialize();
    for (const status of [
      'detected',
      'permission_required',
      'permission_denied',
      'connecting',
    ] as const) {
      bridge.publish({status, dongle: physical});
      expect(service.getConnectionState().status).toBe(status);
      expect(service.isConnected()).toBe(false);
    }
    bridge.requestPermission.mockImplementationOnce(async () => {
      bridge.publish({
        status: 'listening',
        dongle: physical,
        byteCount: 0,
        frameCount: 0,
      });
      return true;
    });
    expect(await service.requestPermission()).toBe(true);
    expect(service.isConnected()).toBe(true);
    await expect(service.startListening()).resolves.toBeUndefined();
    expect(bridge.startListening).toHaveBeenCalled();
    bridge.publish({status: 'disconnected'});
    bridge.physicalState = {status: 'detected', dongle: physical};
    await service.reconnect();
    expect(service.getConnectionState().status).toBe('detected');
  });

  it('forwards immutable simulator frames only in ready/receiving states', async () => {
    await service.initialize();
    const frames: RawIrFrame[] = [];
    service.onFrame(frame => {
      frames.push(frame);
    });
    const payload = {
      receivedAtMs: 123,
      carrierHz: 38000,
      timingsUs: [560, -560],
      frameBytesHex: 'AA5500',
    };
    bridge.emit(IrDongleEvents.FRAME_RECEIVED, payload);
    await service.flushFrames();
    expect(frames).toHaveLength(0);
    await service.setSimulatorMode(true);
    expect(service.isConnected()).toBe(true);
    bridge.publish({status: 'receiving', dongle: simulated, lastReceivedAtMs: 123});
    bridge.emit(IrDongleEvents.FRAME_RECEIVED, payload);
    await service.flushFrames();
    expect(frames[0]).toEqual(payload);
    expect(Object.isFrozen(frames[0].timingsUs)).toBe(true);
    expect(frames[0].timingsUs).not.toBe(payload.timingsUs);
    bridge.publish({status: 'disconnected'});
    expect(service.isConnected()).toBe(false);
  });

  it('maps native failures to AppError without logging descriptor or frame contents', async () => {
    await service.initialize();
    const listener = jest.fn();
    service.onError(listener);
    bridge.emit(IrDongleEvents.ERROR, {code: 'DONGLE_REMOVED', message: 'Disconnected'});
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({code: 'DONGLE_REMOVED'}));
    expect(logger.warn).toHaveBeenCalledWith('Dongle transport error', {code: 'DONGLE_REMOVED'});
  });

  it('removes failed initialization subscriptions and permits retry', async () => {
    bridge.initialize.mockRejectedValueOnce(new Error('initialization failed'));
    await expect(service.initialize()).rejects.toMatchObject({code: 'UNKNOWN'});
    expect(bridge.subscriptionCount()).toBe(0);
    await service.initialize();
    expect(bridge.subscriptionCount()).toBe(3);
  });

  it('maps rejected native operations to actionable AppError values', async () => {
    await service.initialize();
    bridge.requestPermission.mockRejectedValueOnce({code: 'PERMISSION_DENIED'});
    await expect(service.requestPermission()).rejects.toMatchObject({code: 'PERMISSION_DENIED'});
  });

  it('shows physical listening with a non-blocking unverified info chip', () => {
    useAppStore.setState({
      connection: {
        status: 'listening',
        dongle: physical,
      },
    });
    const screen = render(
      <ThemeProvider>
        <DongleBanner />
      </ThemeProvider>,
    );
    expect(screen.getByText(/Smart IR Blaster.*ELKSMART.*045C:0132/)).toBeTruthy();
    expect(screen.getByTestId('dongle-status').props.children).toBe(
      'Ready: listening for AED data',
    );
    expect(screen.getByText(/receive format unverified \(capture is enabled\)/)).toBeTruthy();
    expect(screen.queryByTestId('dongle-reconnect')).toBeNull();
  });

  it('serializes teardown and reinitialization without duplicate subscriptions', async () => {
    const initializing = service.initialize();
    const destroying = service.destroy();
    const restarting = service.initialize();
    await Promise.all([initializing, destroying, restarting]);
    expect(bridge.initialize).toHaveBeenCalledTimes(2);
    expect(bridge.destroy).toHaveBeenCalledTimes(1);
    expect(bridge.subscriptionCount()).toBe(3);
    await service.destroy();
    expect(bridge.subscriptionCount()).toBe(0);
  });

  it('boots in physical mode, updates metadata/error and provides connect/disconnect haptics', async () => {
    bridge.physicalState = {status: 'permission_required', dongle: physical};
    const hook = renderHook(() => {
      useDongleBootstrap(service);
      return useIsDongleConnected();
    });
    await waitFor(() => expect(bridge.setSimulatorMode).toHaveBeenCalledWith(false));
    expect(useAppStore.getState().connection).toEqual(bridge.physicalState);
    expect(hook.result.current).toBe(false);
    expect(haptic.success).toHaveBeenCalledTimes(1);
    act(() =>
      bridge.publish({
        status: 'error',
        dongle: physical,
        code: 'RECEIVE_PROTOCOL_UNVERIFIED',
        message: 'Receive protocol unverified',
      }),
    );
    expect(useAppStore.getState().lastError).toBe('Receive protocol unverified');
    act(() => bridge.publish({status: 'disconnected'}));
    expect(haptic.warning).toHaveBeenCalledTimes(1);
    hook.unmount();
    await waitFor(() => expect(bridge.destroy).toHaveBeenCalledTimes(1));
    expect(bridge.subscriptionCount()).toBe(0);
  });

  it('switches the existing service to simulator and back without recreating subscriptions', async () => {
    const hook = renderHook(() => useDongleBootstrap(service));
    await waitFor(() => expect(bridge.setSimulatorMode).toHaveBeenCalledWith(false));
    act(() => useAppStore.getState().updateSettings({mockSimulatorEnabled: true}));
    await waitFor(() => expect(useAppStore.getState().connection.status).toBe('ready'));
    act(() => useAppStore.getState().updateSettings({mockSimulatorEnabled: false}));
    await waitFor(() => expect(useAppStore.getState().connection.status).toBe('disconnected'));
    expect(bridge.initialize).toHaveBeenCalledTimes(1);
    expect(bridge.subscriptionCount()).toBe(3);
    hook.unmount();
    await waitFor(() => expect(bridge.subscriptionCount()).toBe(0));
  });

  it('does not update the store or enable simulation after an async bootstrap is unmounted', async () => {
    let resolveInitialization: (() => void) | undefined;
    bridge.initialize.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          resolveInitialization = resolve;
        }),
    );
    const hook = renderHook(() => useDongleBootstrap(service));
    await waitFor(() => expect(bridge.initialize).toHaveBeenCalledTimes(1));
    hook.unmount();
    await act(async () => {
      resolveInitialization?.();
    });
    await waitFor(() => expect(bridge.destroy).toHaveBeenCalledTimes(1));
    expect(bridge.setSimulatorMode).not.toHaveBeenCalled();
    expect(useAppStore.getState().connection.status).toBe('disconnected');
  });
});
