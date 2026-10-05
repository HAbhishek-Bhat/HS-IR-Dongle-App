import React from 'react';
import {act, render, renderHook, waitFor} from '@testing-library/react-native';
import {DongleService} from '@domain/services/DongleService';
import type {DongleConnectionState, DongleInfo, RawIrFrame} from '@domain/entities/types';
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

  it('handles detect, deny, retry and protocol gate without claiming readiness', async () => {
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
        status: 'error',
        dongle: physical,
        code: 'RECEIVE_PROTOCOL_UNVERIFIED',
        message: 'Receive protocol unverified',
      });
      return true;
    });
    expect(await service.requestPermission()).toBe(true);
    expect(service.isConnected()).toBe(false);
    await expect(service.startListening()).rejects.toMatchObject({
      code: 'RECEIVE_PROTOCOL_UNVERIFIED',
    });
    expect(bridge.startListening).not.toHaveBeenCalled();
    bridge.publish({status: 'disconnected'});
    bridge.physicalState = {status: 'detected', dongle: physical};
    await service.reconnect();
    expect(service.getConnectionState().status).toBe('detected');
  });

  it('forwards immutable simulator frames only in ready/receiving states', async () => {
    await service.initialize();
    const frames: RawIrFrame[] = [];
    service.onFrame(frame => frames.push(frame));
    const payload = {
      receivedAtMs: 123,
      carrierHz: 38000,
      timingsUs: [560, -560],
      frameBytesHex: 'AA5500',
    };
    bridge.emit(IrDongleEvents.FRAME_RECEIVED, payload);
    expect(frames).toHaveLength(0);
    await service.setSimulatorMode(true);
    expect(service.isConnected()).toBe(true);
    bridge.publish({status: 'receiving', dongle: simulated, lastReceivedAtMs: 123});
    bridge.emit(IrDongleEvents.FRAME_RECEIVED, payload);
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

  it('shows real USB identity and receive gate, never a false ready state', () => {
    useAppStore.setState({
      connection: {
        status: 'error',
        dongle: physical,
        code: 'RECEIVE_PROTOCOL_UNVERIFIED',
        message: 'Receive protocol unverified',
      },
    });
    const screen = render(
      <ThemeProvider>
        <DongleBanner />
      </ThemeProvider>,
    );
    expect(screen.getByText(/Smart IR Blaster.*ELKSMART.*045C:0132/)).toBeTruthy();
    expect(screen.getByTestId('dongle-status').props.children).toBe('Receive protocol unverified');
    expect(screen.queryByText('Ready to receive')).toBeNull();
    expect(screen.getByTestId('dongle-reconnect')).toBeTruthy();
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
