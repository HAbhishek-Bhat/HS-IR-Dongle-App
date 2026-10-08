import React from 'react';
import {Alert} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {UsbDevicePicker} from '@presentation/components/UsbDevicePicker';
import {ThemeProvider} from '@presentation/theme/ThemeProvider';
import type {DongleService} from '@domain/services/DongleService';
import type {UsbDeviceInfo} from '@domain/entities/types';

let mockDongle: Pick<
  DongleService,
  'listUsbDevices' | 'selectUsbDevice' | 'onUsbDevicesChanged' | 'onConnectionChange'
>;
jest.mock('@di/container', () => ({getContainer: () => ({dongle: mockDongle})}));

const unknown: UsbDeviceInfo = {
  deviceName: 'usb-path-1',
  displayName: 'OEM IR dongle',
  manufacturerName: 'OEM',
  vendorId: 0x1234,
  productId: 0xabcd,
  knownProfile: false,
  hasPermission: false,
  selected: false,
  readableEndpointCount: 1,
};

describe('USB device identification and explicit selection', () => {
  let changed: (devices: UsbDeviceInfo[]) => void;
  let disconnected: () => void;
  const unsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDongle = {
      listUsbDevices: jest.fn(async () => [unknown]),
      selectUsbDevice: jest.fn(async () => {}),
      onUsbDevicesChanged: jest.fn(listener => {
        changed = listener;
        return unsubscribe;
      }),
      onConnectionChange: jest.fn(listener => {
        disconnected = () => listener({status: 'disconnected'});
        listener({
          status: 'detected',
          dongle: {
            deviceName: unknown.displayName,
            manufacturerName: unknown.manufacturerName,
            vendorId: unknown.vendorId,
            productId: unknown.productId,
            serialNumber: null,
            connected: true,
          },
        });
        return unsubscribe;
      }),
    };
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('identifies unknown devices without automatically opening them and requires confirmation', async () => {
    const screen = render(
      <ThemeProvider>
        <UsbDevicePicker focused />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByText('OEM IR dongle')).toBeTruthy());
    expect(screen.getByText(/VID:PID 1234:ABCD/)).toBeTruthy();
    expect(screen.getByText(/Unrecognized USB profile/)).toBeTruthy();
    expect(mockDongle.selectUsbDevice).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Use OEM IR dongle'));
    expect(mockDongle.selectUsbDevice).not.toHaveBeenCalled();
    const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await act(async () => buttons?.find(button => button.text === 'Use device')?.onPress?.());
    expect(mockDongle.selectUsbDevice).toHaveBeenCalledWith('usb-path-1');
    screen.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('shows unsupported endpoints and follows attachments, permissions and detach updates', async () => {
    const screen = render(
      <ThemeProvider>
        <UsbDevicePicker focused />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByText('OEM IR dongle')).toBeTruthy());
    act(() => changed([{...unknown, selected: true, hasPermission: true}]));
    expect(screen.getByText(/USB permission granted/)).toBeTruthy();
    act(() => changed([{...unknown, readableEndpointCount: 0}]));
    expect(screen.getByText(/Unsupported transport/)).toBeTruthy();
    expect(screen.queryByLabelText('Use OEM IR dongle')).toBeNull();
    jest.mocked(mockDongle.listUsbDevices).mockResolvedValueOnce([]);
    act(() => disconnected());
    await waitFor(() => expect(screen.getByText(/No USB devices attached/)).toBeTruthy());
    screen.unmount();
  });

  it('reports selection failures instead of falsely marking a receiver ready', async () => {
    jest.mocked(mockDongle.selectUsbDevice).mockRejectedValueOnce(new Error('unavailable'));
    const screen = render(
      <ThemeProvider>
        <UsbDevicePicker focused />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByText('OEM IR dongle')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Use OEM IR dongle'));
    const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    await act(async () => buttons?.find(button => button.text === 'Use device')?.onPress?.());
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(screen.queryByText(/Selected receiver/)).toBeNull();
    screen.unmount();
  });

  it('surfaces enumeration failures and lets users refresh', async () => {
    jest.mocked(mockDongle.listUsbDevices).mockRejectedValueOnce(new Error('list unavailable'));
    const screen = render(
      <ThemeProvider>
        <UsbDevicePicker focused />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText('Refresh USB devices'));
    await waitFor(() => expect(screen.getByText('OEM IR dongle')).toBeTruthy());
    screen.unmount();
  });
});
