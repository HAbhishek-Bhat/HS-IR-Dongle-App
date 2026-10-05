import React, {useState} from 'react';
import {ActivityIndicator, Text, View, StyleSheet, Pressable} from 'react-native';
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
  ready: 'Ready to receive',
  receiving: 'Receiving',
  unsupported: 'Unsupported dongle',
  error: 'Error',
};

export function DongleBanner(): React.JSX.Element {
  const theme = useTheme();
  const connection = useAppStore(s => s.connection);
  const setLastError = useAppStore(s => s.setLastError);
  const [busy, setBusy] = useState(false);
  const ready = isDongleReady(connection);
  const dongle = 'dongle' in connection ? connection.dongle : null;
  const gated = connection.status === 'error' && connection.code === 'RECEIVE_PROTOCOL_UNVERIFIED';
  const permissionNeeded =
    connection.status === 'permission_required' || connection.status === 'permission_denied';
  const title = gated ? 'Receive protocol unverified' : TITLES[connection.status];
  const deviceId = dongle
    ? `${dongle.vendorId.toString(16).padStart(4, '0')}:${dongle.productId.toString(16).padStart(4, '0')}`.toUpperCase()
    : null;
  const subtitle = dongle
    ? `${dongle.deviceName} | ${dongle.manufacturerName ?? 'Manufacturer unavailable'} | ${deviceId}`
    : 'Plug in the IR dongle';
  const message =
    connection.status === 'error'
      ? connection.message
      : permissionNeeded
        ? 'Tap Grant permission, then Allow on the USB permission prompt.'
        : connection.status === 'disconnected'
          ? 'Dongle disconnected, reconnect to continue.'
          : dongle?.simulated
            ? 'SIMULATOR - test data, not physical AED reception.'
            : 'USB identified. Receive support must be verified before capture.';
  const lastReceived = 'lastReceivedAtMs' in connection ? connection.lastReceivedAtMs : undefined;

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
      <View style={styles.row}>
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
          {lastReceived != null ? (
            <Text style={[styles.sub, {color: theme.colors.textSecondary}]}>
              Last received: {new Date(lastReceived).toLocaleTimeString()}
            </Text>
          ) : null}
        </View>
      </View>
      {!ready ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={permissionNeeded ? 'Grant USB permission' : 'Reconnect IR dongle'}
          accessibilityState={{disabled: busy}}
          testID={permissionNeeded ? 'dongle-grant-permission' : 'dongle-reconnect'}
          disabled={busy}
          onPress={() => void performAction()}
          style={[styles.btn, {backgroundColor: theme.colors.primary}]}>
          <Text style={{color: theme.colors.primaryContrast, fontWeight: '700'}}>
            {busy
              ? 'Please wait...'
              : permissionNeeded
                ? 'Grant permission'
                : gated
                  ? 'Rescan USB'
                  : 'Retry / Reconnect'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  textCol: {flex: 1},
  title: {fontSize: 16, fontWeight: '800'},
  sub: {fontSize: 12, marginTop: 4},
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
});
