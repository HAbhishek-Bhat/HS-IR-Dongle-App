import React from 'react';
import {Alert, Clipboard, Share, StyleSheet} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {AllDevicesScreen} from '@presentation/screens/AllDevices/AllDevicesScreen';
import {HomeScreen} from '@presentation/screens/Home/HomeScreen';
import {SettingsScreen} from '@presentation/screens/Settings/SettingsScreen';
import {HistoryScreen} from '@presentation/screens/History/HistoryScreen';
import {UsbDiagnosticsScreen} from '@presentation/screens/UsbDiagnostics/UsbDiagnosticsScreen';
import {getContainer} from '@di/container';
import {ThemeProvider} from '@presentation/theme/ThemeProvider';
import type {RemoteTestSnapshot} from '@domain/services/RemoteTestService';
import type {AedSession} from '@domain/entities/types';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {HomeStackParamList, HistoryStackParamList} from '@presentation/navigation/types';

jest.mock('@di/container', () => ({getContainer: jest.fn()}));
jest.mock('@native/IrDongleBridge', () => ({IrDongle: {getDiagnostics: jest.fn()}}));
jest.mock('@presentation/components/DongleBanner', () => ({DongleBanner: () => null}));
jest.mock('@presentation/components/WaveformView', () => ({WaveformView: () => null}));
jest.mock('@presentation/components/UsbDevicePicker', () => ({UsbDevicePicker: () => null}));
jest.mock('@presentation/hooks/useDongle', () => ({useIsDongleConnected: () => true}));
let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
  useFocusEffect: (callback: () => () => void) => {
    const ReactModule = require('react');
    ReactModule.useEffect(callback, [callback]);
  },
}));

const initial: RemoteTestSnapshot = {
  active: false,
  count: 0,
  lastFrame: null,
  lastDecoded: null,
  startedAt: null,
  endedAt: null,
  isPartial: false,
  devices: [],
};

describe('All Devices and History UI', () => {
  beforeEach(() => {
    mockFocused = true;
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows squared workflows without Remote Test or mock controls', () => {
    const navigate = jest.fn();
    const props = {navigation: {navigate}} as unknown as NativeStackScreenProps<
      HomeStackParamList,
      'HomeMain'
    >;
    const home = render(
      <ThemeProvider>
        <HomeScreen {...props} />
      </ThemeProvider>,
    );
    expect(home.queryByText('Remote Test')).toBeNull();
    fireEvent.press(home.getByLabelText('All Devices'));
    expect(navigate).toHaveBeenCalledWith('AllDevices');
    expect(StyleSheet.flatten(home.getByTestId('card-all-devices').props.style).borderRadius).toBe(
      4,
    );
    home.unmount();
    const settings = render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );
    expect(settings.queryByLabelText('Mock IR simulator')).toBeNull();
    expect(settings.queryByTestId('mock-ir-simulator')).toBeNull();
    settings.unmount();
  });

  it('ends capture when the workflow loses focus rather than waiting for unmount', async () => {
    const unsubscribe = jest.fn();
    const service = {
      getSnapshot: () => ({...initial, active: true}),
      onChanged: jest.fn(() => unsubscribe),
      stop: jest.fn(async () => {}),
    };
    jest
      .mocked(getContainer)
      .mockReturnValue({allDevices: service} as unknown as ReturnType<typeof getContainer>);
    const props = {navigation: {navigate: jest.fn()}} as unknown as NativeStackScreenProps<
      HomeStackParamList,
      'AllDevices'
    >;
    const screen = render(
      <ThemeProvider>
        <AllDevicesScreen {...props} />
      </ThemeProvider>,
    );
    mockFocused = false;
    screen.rerender(
      <ThemeProvider>
        <AllDevicesScreen {...props} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(service.stop).toHaveBeenCalledTimes(1));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    screen.unmount();
  });

  it('surfaces receiver startup failures without showing fake received data', async () => {
    const service = {
      getSnapshot: () => initial,
      onChanged: jest.fn(() => jest.fn()),
      start: jest.fn(async () => {
        throw new Error('Receiver unavailable');
      }),
      stop: jest.fn(async () => {}),
    };
    jest
      .mocked(getContainer)
      .mockReturnValue({allDevices: service} as unknown as ReturnType<typeof getContainer>);
    const props = {navigation: {navigate: jest.fn()}} as unknown as NativeStackScreenProps<
      HomeStackParamList,
      'AllDevices'
    >;
    const screen = render(
      <ThemeProvider>
        <AllDevicesScreen {...props} />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByLabelText('Start listening'));
    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy(),
    );
    expect(screen.getByText(/No data received yet/)).toBeTruthy();
    screen.unmount();
  });

  it('starts, renders unknown raw preview, and saves the user label', async () => {
    let listener: (snapshot: RemoteTestSnapshot) => void = () => {};
    const service = {
      getSnapshot: () => initial,
      onChanged: jest.fn((next: typeof listener) => {
        listener = next;
        return jest.fn();
      }),
      start: jest.fn(async () => {}),
      stop: jest.fn(async () => {}),
      clear: jest.fn(async () => {}),
      save: jest.fn(async () => ({id: 'remote', rawFrames: [initial.lastFrame]})),
    };
    jest
      .mocked(getContainer)
      .mockReturnValue({allDevices: service} as unknown as ReturnType<typeof getContainer>);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const props = {navigation: {navigate: jest.fn()}} as unknown as NativeStackScreenProps<
      HomeStackParamList,
      'AllDevices'
    >;
    const screen = render(
      <ThemeProvider>
        <AllDevicesScreen {...props} />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByLabelText('Start listening'));
    await waitFor(() => expect(service.start).toHaveBeenCalledTimes(1));
    act(() =>
      listener({
        ...initial,
        active: true,
        count: 1,
        lastFrame: {receivedAtMs: 10, carrierHz: null, timingsUs: [1, -2], frameBytesHex: '00FF'},
        lastDecoded: {protocol: 'RAW', address: null, command: null, confidence: 0, extras: {}},
        devices: [
          {
            signature: {
              key: 'source',
              protocol: 'RAW',
              carrierHz: null,
              address: null,
              deviceIdCode: null,
              displayName: 'IR Device SOURCE',
            },
            signalStrength: 1,
            firstSeenAt: new Date(10).toISOString(),
            lastSeenAt: new Date(10).toISOString(),
            hitCount: 1,
          },
        ],
      }),
    );
    expect(screen.getByText(/Listening · 1 frames/)).toBeTruthy();
    expect(screen.getByText(/Hex: 00FF/)).toBeTruthy();
    expect(screen.getByText('IR Device SOURCE')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Capture label'), 'Living room');
    fireEvent.press(screen.getByLabelText('Save capture'));
    await waitFor(() => expect(service.save).toHaveBeenCalledWith('Living room'));
    screen.unmount();
    expect(service.stop).toHaveBeenCalled();
  });

  it('loads AED sessions for AED but does not query or display them for All Devices', async () => {
    const recordings = {list: jest.fn(async () => [])};
    const aedSessions = {list: jest.fn(async () => [])};
    let changed = () => {};
    const unsubscribe = jest.fn();
    const aed = {
      onSessionsChanged: jest.fn((listener: () => void) => {
        changed = listener;
        return unsubscribe;
      }),
    };
    jest
      .mocked(getContainer)
      .mockReturnValue({recordings, aedSessions, aed} as unknown as ReturnType<
        typeof getContainer
      >);
    const props = {navigation: {navigate: jest.fn()}} as unknown as NativeStackScreenProps<
      HistoryStackParamList,
      'HistoryMain'
    >;
    const screen = render(
      <ThemeProvider>
        <HistoryScreen {...props} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(aedSessions.list).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByText('All Devices'));
    await waitFor(() =>
      expect(recordings.list).toHaveBeenLastCalledWith({query: undefined, source: 'ALL_DEVICES'}),
    );
    expect(aedSessions.list).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('AED'));
    await waitFor(() =>
      expect(recordings.list).toHaveBeenLastCalledWith({query: undefined, source: 'AED'}),
    );
    expect(aedSessions.list).toHaveBeenCalledTimes(2);
    act(() => changed());
    await waitFor(() => expect(aedSessions.list).toHaveBeenCalledTimes(3));
    screen.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('bounds diagnostic previews and requires explicit Copy/Share actions', async () => {
    const diagnostics = `Receiver descriptor ${'A'.repeat(13000)}`;
    const copy = jest.spyOn(Clipboard, 'setString').mockImplementation(() => {});
    const share = jest.spyOn(Share, 'share').mockResolvedValue({action: Share.sharedAction});
    const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const unsubscribe = jest.fn();
    jest.mocked(getContainer).mockReturnValue({
      dongle: {
        onFrame: jest.fn(() => unsubscribe),
        getDiagnostics: jest.fn(async () => diagnostics),
      },
    } as unknown as ReturnType<typeof getContainer>);
    const screen = render(
      <ThemeProvider>
        <UsbDiagnosticsScreen />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Preview truncated/)).toBeTruthy());
    expect(copy).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Copy diagnostics'));
    expect(copy).toHaveBeenCalledWith(diagnostics);
    fireEvent.press(screen.getByLabelText('Share diagnostics'));
    expect(alerts).toHaveBeenLastCalledWith(
      'Share USB diagnostics?',
      expect.any(String),
      expect.any(Array),
    );
    expect(share).not.toHaveBeenCalled();
    screen.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('displays and searches the OEM serial in saved AED history', async () => {
    const session: AedSession = {
      id: 'aed-identity',
      signature: {
        key: 'aed',
        protocol: 'RAW',
        carrierHz: null,
        address: null,
        deviceIdCode: null,
        displayName: 'Saved AED',
      },
      manufacturer: 'OEM',
      model: 'AED',
      parserId: 'oem',
      startedAt: '2026-10-07T10:00:00.000Z',
      endedAt: '2026-10-07T10:00:01.000Z',
      isPartial: false,
      syncStatus: 'pending',
      syncError: null,
      createdAt: '2026-10-07T10:00:00.000Z',
      updatedAt: '2026-10-07T10:00:01.000Z',
      events: [
        {
          id: 'identity',
          sessionId: 'aed-identity',
          type: 'unknown',
          label: 'Identity',
          timestamp: '2026-10-07T10:00:00.000Z',
          rawFrame: {receivedAtMs: 10, carrierHz: null, timingsUs: [], frameBytesHex: '00'},
          decoded: null,
          metadata: {parserId: 'oem', serialNumber: 'AED-123'},
        },
      ],
    };
    jest.mocked(getContainer).mockReturnValue({
      recordings: {list: jest.fn(async () => [])},
      aedSessions: {list: jest.fn(async () => [session])},
      aed: {onSessionsChanged: jest.fn(() => jest.fn())},
    } as unknown as ReturnType<typeof getContainer>);
    const props = {navigation: {navigate: jest.fn()}} as unknown as NativeStackScreenProps<
      HistoryStackParamList,
      'HistoryMain'
    >;
    const screen = render(
      <ThemeProvider>
        <HistoryScreen {...props} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByText('Serial number: AED-123')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('Search recordings'), 'missing-serial');
    await waitFor(() => expect(screen.queryByText('Serial number: AED-123')).toBeNull());
    fireEvent.changeText(screen.getByLabelText('Search recordings'), 'aed-123');
    await waitFor(() => expect(screen.getByText('Serial number: AED-123')).toBeTruthy());
    fireEvent.press(screen.getByText('Saved AED'));
    expect(screen.getAllByText('Serial number: AED-123')).toHaveLength(2);
    screen.unmount();
  });
});
