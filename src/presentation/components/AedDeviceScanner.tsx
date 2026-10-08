import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {getContainer} from '@di/container';
import type {DetectedDevice} from '@domain/entities/types';
import {toUserMessage} from '@shared/errors/AppError';
import {useIsDongleConnected} from '../hooks/useDongle';
import {useTheme} from '../theme/ThemeProvider';
import {PrimaryButton} from './PrimaryButton';
import {ErrorState} from './ErrorState';

const SCAN_DURATION_MS = 15_000;

export function AedDeviceScanner({focused}: {focused: boolean}): React.JSX.Element {
  const theme = useTheme();
  const connected = useIsDongleConnected();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DetectedDevice[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanning) return;
    if (!focused || !connected) {
      setScanning(false);
      if (!connected) setError('Receiver disconnected. Reconnect it before scanning again.');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const {aed} = getContainer();
    const unsubscribe = aed.onAedsChanged(next => {
      if (!cancelled) {
        setDevices(next.filter(device => new Date(device.lastSeenAt).getTime() >= startedAt));
      }
    });
    void aed.startListeningForAeds().then(
      () => {
        if (!cancelled) timer = setTimeout(() => setScanning(false), SCAN_DURATION_MS);
      },
      failure => {
        if (!cancelled) {
          setError(toUserMessage(failure));
          setScanning(false);
        }
      },
    );
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      // Ending a UI scan must not stop app-wide AED recording.
    };
  }, [scanning, connected, focused]);

  return (
    <View
      style={[
        styles.card,
        {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
      ]}>
      <Text style={[styles.eyebrow, {color: theme.colors.primary}]}>DEVICE DISCOVERY</Text>
      <Text style={[styles.title, {color: theme.colors.text}]}>Scan for AED devices</Text>
      <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
        Align the AED infrared port with the receiver and start its data transfer. This passive
        IR/IrDA scan listens for 15 seconds; it does not send discovery commands.
      </Text>
      <PrimaryButton
        label={scanning ? 'Stop scan' : hasScanned ? 'Scan again' : 'Scan for AED devices'}
        disabled={!connected || !focused}
        onPress={() => {
          if (scanning) {
            setScanning(false);
          } else {
            setDevices([]);
            setError(null);
            setHasScanned(true);
            setScanning(true);
          }
        }}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.status, {color: theme.colors.textSecondary}]}>
        {!connected
          ? 'Connect an IR receiver and grant USB permission to scan.'
          : scanning
            ? `Scanning for incoming data... ${devices.length} signal source(s) seen.`
            : hasScanned
              ? `Scan ended. ${devices.length} signal source(s) seen. Automatic capture continues.`
              : 'Automatic event capture continues independently of scanning.'}
      </Text>
      {error ? <ErrorState message={error} /> : null}
      {hasScanned && !scanning && !devices.length && !error ? (
        <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
          No incoming signals detected. Check alignment and enable AED data transfer, then scan
          again.
        </Text>
      ) : null}
      {devices.map(device => (
        <View
          key={device.serialNumber ?? device.signature.key}
          style={[styles.device, {backgroundColor: theme.colors.surfaceAlt}]}>
          <Text style={[styles.deviceTitle, {color: theme.colors.text}]}>
            {device.serialNumber ? 'AED identity reported' : 'Unidentified IR source'}
          </Text>
          <Text selectable style={[styles.serial, {color: theme.colors.primary}]}>
            Serial number: {device.serialNumber ?? 'Not reported'}
          </Text>
          <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
            Last received: {new Date(device.lastSeenAt).toLocaleTimeString()}
          </Text>
          {!device.serialNumber ? (
            <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
              A validated OEM parser is required to identify this AED. A signal signature is not a
              serial number.
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {borderWidth: 1, borderRadius: 4, padding: 20, gap: 12, marginBottom: 24},
  eyebrow: {fontSize: 11, fontWeight: '800', letterSpacing: 1.5},
  title: {fontSize: 21, fontWeight: '800'},
  description: {fontSize: 13, lineHeight: 20},
  status: {fontSize: 12, lineHeight: 18},
  device: {borderRadius: 2, padding: 14, gap: 6},
  deviceTitle: {fontSize: 14, fontWeight: '700'},
  serial: {fontSize: 16, fontWeight: '800'},
});
