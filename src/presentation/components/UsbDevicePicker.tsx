import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {getContainer} from '@di/container';
import type {UsbDeviceInfo} from '@domain/entities/types';
import {toUserMessage} from '@shared/errors/AppError';
import {useTheme} from '../theme/ThemeProvider';
import {PrimaryButton} from './PrimaryButton';
import {ErrorState} from './ErrorState';

export function UsbDevicePicker({focused}: {focused: boolean}): React.JSX.Element {
  const theme = useTheme();
  const service = getContainer().dongle;
  const [devices, setDevices] = useState<UsbDeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const requestGeneration = useRef(0);
  const selectionPending = useRef(false);

  const refresh = useCallback(
    async (clearError = false) => {
      const generation = ++requestGeneration.current;
      setLoading(true);
      try {
        const next = await service.listUsbDevices();
        if (mounted.current && generation === requestGeneration.current) {
          setDevices(next);
          if (clearError) setError(null);
        }
      } catch (failure) {
        if (mounted.current && generation === requestGeneration.current) {
          setError(toUserMessage(failure));
        }
      } finally {
        if (mounted.current && generation === requestGeneration.current) setLoading(false);
      }
    },
    [service],
  );

  useEffect(() => {
    if (!focused) return;
    mounted.current = true;
    const unsubscribeDevices = service.onUsbDevicesChanged(next => {
      requestGeneration.current += 1;
      setDevices(next);
      setLoading(false);
    });
    let connectionKey: string | null = null;
    const unsubscribeConnection = service.onConnectionChange(state => {
      const dongle = 'dongle' in state ? state.dongle : null;
      const status =
        state.status === 'receiving' || state.status === 'ready' ? 'listening' : state.status;
      const nextKey = `${status}:${dongle?.vendorId}:${dongle?.productId}:${dongle?.deviceName}`;
      if (nextKey !== connectionKey) {
        connectionKey = nextKey;
        void refresh();
      }
    });
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
      unsubscribeDevices();
      unsubscribeConnection();
    };
  }, [focused, refresh, service]);

  const select = async (device: UsbDeviceInfo) => {
    if (!mounted.current || selectionPending.current) return;
    selectionPending.current = true;
    setSelecting(device.deviceName);
    setError(null);
    try {
      await service.selectUsbDevice(device.deviceName);
      if (mounted.current) await refresh(true);
    } catch (failure) {
      if (mounted.current) setError(toUserMessage(failure));
    } finally {
      selectionPending.current = false;
      if (mounted.current) setSelecting(null);
    }
  };

  return (
    <View
      style={[
        styles.section,
        {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
      ]}
      testID="usb-device-picker">
      <Text style={[styles.title, {color: theme.colors.text}]}>Connected USB devices</Text>
      <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
        Select your IR dongle, then allow USB access. Unlisted models can use generic raw input
        endpoints, but may need an OEM driver or receive command. USB identification does not
        confirm IR capability. Do not select keyboards, storage or unrelated equipment.
      </Text>
      <PrimaryButton
        label="Refresh USB devices"
        variant="ghost"
        loading={loading}
        disabled={!focused || selecting !== null}
        onPress={() => void refresh(true)}
      />
      {error ? <ErrorState message={error} /> : null}
      {!loading && !devices.length && !error ? (
        <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
          No USB devices attached. Connect the dongle using a USB OTG-capable adapter and refresh.
        </Text>
      ) : null}
      {devices.map(device => (
        <View
          key={device.deviceName}
          style={[
            styles.device,
            {borderColor: device.selected ? theme.colors.primary : theme.colors.border},
          ]}>
          <Text style={[styles.deviceTitle, {color: theme.colors.text}]}>{device.displayName}</Text>
          <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
            {device.manufacturerName ?? 'Manufacturer not reported'} · VID:PID{' '}
            {device.vendorId.toString(16).padStart(4, '0').toUpperCase()}:
            {device.productId.toString(16).padStart(4, '0').toUpperCase()}
          </Text>
          <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
            {device.knownProfile ? 'Known USB profile' : 'Unrecognized USB profile'} ·{' '}
            {device.readableEndpointCount} readable input endpoint(s)
            {'\n'}
            {device.hasPermission ? 'USB permission granted' : 'USB permission required'}
            {device.selected ? ' · Selected receiver' : ''}
          </Text>
          {!device.readableEndpointCount ? (
            <Text style={[styles.description, {color: theme.colors.danger}]}>
              Unsupported transport: no bulk/interrupt input endpoint. This device needs a specific
              driver.
            </Text>
          ) : (
            <PrimaryButton
              label={`${device.selected ? 'Use selected' : 'Use'} ${device.displayName}`}
              loading={selecting === device.deviceName}
              disabled={!focused || loading || selecting !== null}
              onPress={() =>
                Alert.alert(
                  'Use this USB device as an IR receiver?',
                  'Only select hardware you recognize as your IR dongle. Selecting another receiver closes the previous capture. Generic USB input is attempted; reception and appliance decoding are not guaranteed.',
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {text: 'Use device', onPress: () => void select(device)},
                  ],
                )
              }
            />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {borderWidth: 1, borderRadius: 4, padding: 16, gap: 12, marginVertical: 16},
  title: {fontSize: 18, fontWeight: '700'},
  description: {fontSize: 13, lineHeight: 20},
  device: {borderWidth: 1, borderRadius: 4, padding: 14, gap: 8},
  deviceTitle: {fontSize: 16, fontWeight: '700'},
});
