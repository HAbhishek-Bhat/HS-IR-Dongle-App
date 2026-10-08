import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {AedDeviceScanner} from '@presentation/components/AedDeviceScanner';
import {ThemeProvider} from '@presentation/theme/ThemeProvider';
import {useAppStore} from '@presentation/store/appStore';
import type {DetectedDevice} from '@domain/entities/types';
import type {AedRetrievalService} from '@domain/services/AedRetrievalService';
import {getReportedAedSerialNumber} from '@domain/parsers/aed/aedIdentity';

let mockAed: Pick<AedRetrievalService, 'onAedsChanged' | 'startListeningForAeds'>;
jest.mock('@di/container', () => ({getContainer: () => ({aed: mockAed})}));

const device: DetectedDevice = {
  signature: {
    key: 'source',
    displayName: 'IR Device SOURCE',
    protocol: 'RAW',
    address: null,
    carrierHz: null,
    deviceIdCode: null,
  },
  serialNumber: 'AED-123',
  firstSeenAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  signalStrength: 1,
  hitCount: 1,
};

describe('passive AED scan', () => {
  let listener: (devices: DetectedDevice[]) => void;
  let aed: Pick<AedRetrievalService, 'onAedsChanged' | 'startListeningForAeds'>;
  const unsubscribe = jest.fn();
  const connected = {
    status: 'listening' as const,
    dongle: {
      deviceName: 'Receiver',
      vendorId: 1,
      productId: 2,
      manufacturerName: null,
      serialNumber: 'USB-NOT-AED',
      connected: true,
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    useAppStore.setState({connection: connected});
    aed = {
      onAedsChanged: jest.fn(next => {
        listener = next;
        next([{...device, lastSeenAt: new Date(Date.now() - 60_000).toISOString()}]);
        return unsubscribe;
      }),
      startListeningForAeds: jest.fn(async () => {}),
    };
    mockAed = aed;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function mount(focused = true) {
    return render(
      <ThemeProvider>
        <AedDeviceScanner focused={focused} />
      </ThemeProvider>,
    );
  }

  it('only shows new scan observations and stops at exactly fifteen seconds', async () => {
    const screen = mount();
    fireEvent.press(screen.getByLabelText('Scan for AED devices'));
    await act(async () => {});
    expect(aed.startListeningForAeds).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Serial number: AED-123')).toBeNull();
    act(() => listener([{...device, lastSeenAt: new Date().toISOString()}]));
    expect(screen.getByText('Serial number: AED-123')).toBeTruthy();
    expect(screen.queryByText(/USB-NOT-AED/)).toBeNull();
    act(() => jest.advanceTimersByTime(14_999));
    expect(screen.getByLabelText('Stop scan')).toBeTruthy();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByLabelText('Scan again')).toBeTruthy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Automatic capture continues/)).toBeTruthy();
    screen.unmount();
  });

  it('shows unknown identity honestly and clears previous results on rescan', async () => {
    const screen = mount();
    fireEvent.press(screen.getByLabelText('Scan for AED devices'));
    await act(async () => {});
    act(() => listener([{...device, serialNumber: null, lastSeenAt: new Date().toISOString()}]));
    expect(screen.getByText('Serial number: Not reported')).toBeTruthy();
    expect(screen.getByText('Unidentified IR source')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Stop scan'));
    fireEvent.press(screen.getByLabelText('Scan again'));
    await act(async () => {});
    expect(screen.queryByText('Serial number: Not reported')).toBeNull();
    screen.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('blocks disconnected scans and ends a scan on disconnect', async () => {
    useAppStore.setState({connection: {status: 'disconnected'}});
    const screen = mount();
    fireEvent.press(screen.getByLabelText('Scan for AED devices'));
    expect(aed.startListeningForAeds).not.toHaveBeenCalled();
    act(() => useAppStore.setState({connection: connected}));
    fireEvent.press(screen.getByLabelText('Scan for AED devices'));
    await act(async () => {});
    act(() => useAppStore.setState({connection: {status: 'disconnected'}}));
    expect(screen.getByText(/Receiver disconnected/)).toBeTruthy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    screen.unmount();
  });

  it('surfaces start errors and releases the scan subscription', async () => {
    jest.mocked(aed.startListeningForAeds).mockRejectedValueOnce(new Error('Scan failed'));
    const screen = mount();
    fireEvent.press(screen.getByLabelText('Scan for AED devices'));
    await act(async () => {});
    expect(screen.getByLabelText('Scan again')).toBeTruthy();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    screen.unmount();
  });

  it('cleans up when focus is lost even if receiver startup is still pending', async () => {
    let resolveStart: (() => void) | undefined;
    jest.mocked(aed.startListeningForAeds).mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          resolveStart = resolve;
        }),
    );
    const screen = mount();
    fireEvent.press(screen.getByLabelText('Scan for AED devices'));
    screen.rerender(
      <ThemeProvider>
        <AedDeviceScanner focused={false} />
      </ThemeProvider>,
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await act(async () => resolveStart?.());
    expect(jest.getTimerCount()).toBe(0);
    screen.unmount();
  });

  it('reports an empty scan without inventing an AED device', async () => {
    const screen = mount();
    fireEvent.press(screen.getByLabelText('Scan for AED devices'));
    await act(async () => {});
    act(() => jest.advanceTimersByTime(15_000));
    expect(screen.getByText(/No incoming signals detected/)).toBeTruthy();
    screen.unmount();
  });
});

describe('AED serial provenance', () => {
  it.each(['raw-capture', 'hs-aed-v1', ''])('rejects identity from %s', parserId => {
    expect(
      getReportedAedSerialNumber([{metadata: {parserId, serialNumber: 'not-a-serial'}}]),
    ).toBeNull();
  });

  it('returns the latest reported OEM identity without inventing missing identity', () => {
    expect(getReportedAedSerialNumber([])).toBeNull();
    expect(
      getReportedAedSerialNumber([
        {metadata: {parserId: 'oem', serialNumber: ' AED-123 '}},
        {metadata: {parserId: 'oem', serialNumber: null}},
      ]),
    ).toBe('AED-123');
  });
});
