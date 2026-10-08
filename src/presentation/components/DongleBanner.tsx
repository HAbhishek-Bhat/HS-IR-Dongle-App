import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Text, View, StyleSheet} from 'react-native';
import {TapSurface} from './TapSurface';
import {useTheme} from '../theme/ThemeProvider';
import {useAppStore} from '../store/appStore';
import {getContainer} from '@di/container';
import {isDongleReady} from '@domain/services/DongleService';
import {logger} from '@shared/logging/logger';
import {toUserMessage} from '@shared/errors/AppError';
import type {DongleConnectionState} from '@domain/entities/types';

const TITLES: Record<DongleConnectionState['status'], string> = {
  disconnected: 'Not connected',
  detected: 'Dongle detected',
  permission_required: 'Permission needed',
  permission_denied: 'Permission denied',
  connecting: 'Connecting',
  listening: 'Ready: listening for IR data',
  ready: 'Ready to receive',
  receiving: 'Receiving',
  unsupported: 'Unsupported dongle',
  error: 'Error',
};

export function DongleBanner({
  captureScreen = false,
  onDiagnostics,
}: {
  captureScreen?: boolean;
  onDiagnostics?: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const connection = useAppStore(s => s.connection);
  const setLastError = useAppStore(s => s.setLastError);
  const [busy, setBusy] = useState(false);
  const ready = isDongleReady(connection);
  const dongle = 'dongle' in connection ? connection.dongle : null;
  const permissionNeeded =
    connection.status === 'permission_required' || connection.status === 'permission_denied';
  const title = TITLES[connection.status];
  const deviceId = dongle
    ? `${dongle.vendorId.toString(16).padStart(4, '0')}:${dongle.productId.toString(16).padStart(4, '0')}`.toUpperCase()
    : null;
  const subtitle = dongle
    ? `${dongle.deviceName} | ${dongle.manufacturerName ?? 'Manufacturer unavailable'} | ${deviceId}`
    : 'Plug in the IR dongle';
  const message =
    connection.status === 'unsupported'
      ? connection.reason
      : connection.status === 'error'
        ? connection.message
        : permissionNeeded
          ? 'Tap Grant permission, then Allow on the USB permission prompt.'
          : connection.status === 'disconnected'
            ? 'Dongle disconnected, reconnect to continue.'
            : dongle?.simulated
              ? 'SIMULATOR - test data, not physical AED reception.'
              : ready
                ? 'Passive USB reception is active. Raw data is stored locally.'
                : 'USB permission and an open input endpoint are required.';
  const lastReceived = 'lastReceivedAtMs' in connection ? connection.lastReceivedAtMs : undefined;
  const byteCount = 'byteCount' in connection ? (connection.byteCount ?? 0) : 0;
  const frameCount = 'frameCount' in connection ? (connection.frameCount ?? 0) : 0;
  const listeningSince = 'listeningSinceMs' in connection ? connection.listeningSinceMs : undefined;
  const [noDataHint, setNoDataHint] = useState(false);

  useEffect(() => {
    setNoDataHint(false);
    if (!captureScreen || !ready || byteCount !== 0) return;
    const since = listeningSince ?? Date.now();
    const timer = setTimeout(() => setNoDataHint(true), Math.max(0, 30_000 - (Date.now() - since)));
    return () => clearTimeout(timer);
  }, [captureScreen, ready, byteCount, listeningSince]);

  const performAction = async () => {
    setBusy(true);
    try {
      const {dongle: service} = getContainer();
      if (permissionNeeded) await service.requestPermission();
      else await service.reconnect();
    } catch (error) {
      logger.error('Dongle action failed', error);
      setLastError(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      testID="dongle-banner"
      style={[
        styles.wrap,
        {
          backgroundColor: ready ? theme.colors.bannerConnected : theme.colors.surfaceAlt,
          borderColor: theme.colors.border,
        },
      ]}>
      <View testID="dongle-status-row" style={styles.row}>
        {connection.status === 'receiving' || connection.status === 'connecting' ? (
          <ActivityIndicator color={theme.colors.primary} accessibilityLabel={title} />
        ) : (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{color: ready ? theme.colors.primary : theme.colors.warning, fontWeight: '800'}}>
            {ready ? '[+]' : '[!]'}
          </Text>
        )}
        <View style={styles.textCol}>
          <Text
            testID="dongle-status"
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            style={[styles.title, {color: ready ? theme.colors.primary : theme.colors.text}]}>
            {title}
          </Text>
          <Text style={[styles.sub, {color: theme.colors.text}]}>{subtitle}</Text>
          <Text style={[styles.sub, {color: theme.colors.textSecondary}]}>{message}</Text>
          {ready && !dongle?.simulated && !dongle?.receiveProtocolVerified ? (
            <Text style={[styles.sub, {color: theme.colors.textSecondary}]}>
              Info: receive format unverified (capture is enabled)
            </Text>
          ) : null}
          {ready ? (
            <Text style={[styles.sub, {color: theme.colors.textSecondary}]}>
              Frames / USB chunks: {frameCount} | Bytes: {byteCount}
            </Text>
          ) : null}
          {lastReceived != null ? (
            <Text style={[styles.sub, {color: theme.colors.textSecondary}]}>
              Last received: {new Date(lastReceived).toLocaleTimeString()}
            </Text>
          ) : null}
        </View>
      </View>
      {noDataHint ? (
        <View testID="dongle-no-data-hint" style={styles.hint}>
          <Text style={[styles.sub, {color: theme.colors.textSecondary}]}>
            No bytes received after 30 seconds. Check alignment; the dongle may be transmit-only or
            the AED may use a different IR type. Capture remains enabled.
          </Text>
          {onDiagnostics ? (
            <TapSurface
              accessibilityRole="button"
              accessibilityLabel="USB Diagnostics"
              style={styles.diagnostics}
              onPress={onDiagnostics}>
              <Text style={[styles.sub, {color: theme.colors.primary}]}>USB Diagnostics</Text>
            </TapSurface>
          ) : null}
        </View>
      ) : null}
      {!ready ? (
        <TapSurface
          accessibilityRole="button"
          accessibilityLabel={permissionNeeded ? 'Grant USB permission' : 'Reconnect IR dongle'}
          accessibilityState={{disabled: busy}}
          testID={permissionNeeded ? 'dongle-grant-permission' : 'dongle-reconnect'}
          disabled={busy}
          onPress={() => void performAction()}
          style={[styles.btn, {backgroundColor: theme.colors.primary}]}>
          <Text style={{color: theme.colors.primaryContrast, fontWeight: '700'}}>
            {busy ? 'Please wait...' : permissionNeeded ? 'Grant permission' : 'Retry / Reconnect'}
          </Text>
        </TapSurface>
      ) : null}
      {onDiagnostics ? (
        <TapSurface
          accessibilityRole="button"
          accessibilityLabel="Choose USB device"
          style={styles.diagnostics}
          onPress={onDiagnostics}>
          <Text style={[styles.sub, {color: theme.colors.primary}]}>Choose USB device</Text>
        </TapSurface>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  textCol: {flex: 1},
  hint: {marginTop: 8},
  diagnostics: {minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start'},
  title: {fontSize: 16, fontWeight: '800'},
  sub: {fontSize: 12, marginTop: 4},
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 4,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
});
