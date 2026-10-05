import React from 'react';
import {Alert, Clipboard, Share} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {RemoteTestScreen} from '@presentation/screens/RemoteTest/RemoteTestScreen';
import {HistoryScreen} from '@presentation/screens/History/HistoryScreen';
import {UsbDiagnosticsScreen} from '@presentation/screens/UsbDiagnostics/UsbDiagnosticsScreen';
import {getContainer} from '@di/container';
import {ThemeProvider} from '@presentation/theme/ThemeProvider';
import type {RemoteTestSnapshot} from '@domain/services/RemoteTestService';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {HomeStackParamList, HistoryStackParamList} from '@presentation/navigation/types';

jest.mock('@di/container', () => ({getContainer: jest.fn()}));
jest.mock('@native/IrDongleBridge', () => ({IrDongle: {getDiagnostics: jest.fn()}}));
jest.mock('@presentation/components/DongleBanner', () => ({DongleBanner: () => null}));
jest.mock('@presentation/components/WaveformView', () => ({WaveformView: () => null}));
jest.mock('@presentation/hooks/useDongle', () => ({useIsDongleConnected: () => true}));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
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
};

describe('Remote Test and History UI', () => {
  afterEach(() => jest.restoreAllMocks());

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
      .mockReturnValue({remoteTest: service} as unknown as ReturnType<typeof getContainer>);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const props = {navigation: {navigate: jest.fn()}} as unknown as NativeStackScreenProps<
      HomeStackParamList,
      'RemoteTest'
    >;
    const screen = render(
      <ThemeProvider>
        <RemoteTestScreen {...props} />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByLabelText('Start'));
    await waitFor(() => expect(service.start).toHaveBeenCalledTimes(1));
    act(() =>
      listener({
        ...initial,
        active: true,
        count: 1,
        lastFrame: {receivedAtMs: 10, carrierHz: null, timingsUs: [1, -2], frameBytesHex: '00FF'},
        lastDecoded: {protocol: 'RAW', address: null, command: null, confidence: 0, extras: {}},
      }),
    );
    expect(screen.getByText(/Listening · 1 frames/)).toBeTruthy();
    expect(screen.getByText(/Hex: 00FF/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Remote test label'), 'Living room');
    fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(service.save).toHaveBeenCalledWith('Living room'));
    screen.unmount();
    expect(service.stop).toHaveBeenCalled();
  });

  it('loads AED sessions for AED but does not query or display them for Remote Test', async () => {
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
    fireEvent.press(screen.getByText('Remote Test'));
    await waitFor(() =>
      expect(recordings.list).toHaveBeenLastCalledWith({query: undefined, source: 'REMOTE_TEST'}),
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
});
