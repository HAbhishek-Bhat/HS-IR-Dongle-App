import React from 'react';
import {FlatList} from 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {AedSession, DetectedDevice} from '@domain/entities/types';
import type {AedRetrievalService} from '@domain/services/AedRetrievalService';
import {AedListScreen} from '@presentation/screens/AedList/AedListScreen';
import type {HomeStackParamList} from '@presentation/navigation/types';
import {ThemeProvider} from '@presentation/theme/ThemeProvider';
import {useAppStore} from '@presentation/store/appStore';

let mockAed: Pick<
  AedRetrievalService,
  'listSessions' | 'onSessionsChanged' | 'onAedsChanged' | 'startListeningForAeds'
>;
jest.mock('@di/container', () => ({getContainer: () => ({aed: mockAed})}));
jest.mock('@react-navigation/native', () => ({useIsFocused: () => true}));

describe('AED capture screen layout and scan controls', () => {
  let devicesChanged: (devices: DetectedDevice[]) => void;
  let sessionsChanged: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    useAppStore.setState({
      connection: {
        status: 'listening',
        dongle: {
          deviceName: 'IR receiver',
          manufacturerName: null,
          serialNumber: null,
          vendorId: 1,
          productId: 2,
          connected: true,
        },
        listeningSinceMs: Date.now(),
        byteCount: 0,
      },
    });
    mockAed = {
      listSessions: jest.fn(async (): Promise<AedSession[]> => []),
      onSessionsChanged: jest.fn(listener => {
        sessionsChanged = listener;
        return jest.fn();
      }),
      onAedsChanged: jest.fn(listener => {
        devicesChanged = listener;
        listener([]);
        return jest.fn();
      }),
      startListeningForAeds: jest.fn(async () => {}),
    };
  });

  afterEach(() => jest.useRealTimers());

  it('keeps Stop and Scan again available across the no-data hint and live header updates', async () => {
    const navigate = jest.fn();
    const props = {navigation: {navigate}} as unknown as NativeStackScreenProps<
      HomeStackParamList,
      'AedList'
    >;
    const screen = render(
      <ThemeProvider>
        <AedListScreen {...props} />
      </ThemeProvider>,
    );
    await act(async () => {});
    const list = screen.UNSAFE_getByType(FlatList);
    expect(list.props.removeClippedSubviews).toBe(false);
    expect(list.props.ListHeaderComponent).toBeTruthy();

    act(() => jest.advanceTimersByTime(30_000));
    expect(screen.getByTestId('dongle-no-data-hint')).toBeTruthy();
    expect(
      screen
        .getByTestId('dongle-status-row')
        .findAll(node => node.props.testID === 'dongle-no-data-hint'),
    ).toHaveLength(0);

    fireEvent.press(screen.getByLabelText('Scan for AED devices'));
    await act(async () => {});
    expect(screen.getByLabelText('Stop scan')).toBeTruthy();
    act(() => devicesChanged([]));
    await act(async () => sessionsChanged());
    expect(screen.getByLabelText('Stop scan')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Stop scan'));
    expect(screen.getByLabelText('Scan again')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Scan again'));
    await act(async () => {});
    expect(screen.getByLabelText('Stop scan')).toBeTruthy();
    act(() => jest.advanceTimersByTime(15_000));
    expect(screen.getByLabelText('Scan again')).toBeTruthy();
    expect(screen.getByText(/No incoming signals detected/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('USB Diagnostics'));
    expect(navigate).toHaveBeenCalledWith('UsbDiagnostics');
    screen.unmount();
  });
});
