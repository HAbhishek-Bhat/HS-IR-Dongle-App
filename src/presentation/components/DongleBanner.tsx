import React from 'react';
import {Text, View, StyleSheet, Pressable} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {useAppStore} from '../store/appStore';
import {getContainer} from '@di/container';

export function DongleBanner(): React.JSX.Element {
  const theme = useTheme();
  const connection = useAppStore(s => s.connection);
  const connected = connection.status === 'connected';
  const dongle = 'dongle' in connection ? connection.dongle : null;

  const backgroundColor = connected
    ? theme.colors.bannerConnected
    : theme.colors.bannerDisconnected;
  const title =
    connection.status === 'permission_required'
      ? 'USB Permission Required'
      : connection.status === 'unsupported'
        ? 'Unsupported Dongle'
        : connected
          ? 'IR Dongle Connected'
          : 'No Dongle Connected';

  const subtitle = dongle
    ? `${dongle.deviceName} · VID ${dongle.vendorId.toString(16).toUpperCase()} / PID ${dongle.productId
        .toString(16)
        .toUpperCase()}`
    : 'Plug in a USB-C IR receiver to enable capture';

  return (
    <View
      style={[styles.wrap, {backgroundColor, borderColor: theme.colors.border}]}
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${subtitle}`}>
      <View style={styles.row}>
        <View
          style={[
            styles.dot,
            {backgroundColor: connected ? theme.colors.success : theme.colors.danger},
          ]}
        />
        <View style={styles.textCol}>
          <Text style={[styles.title, {color: theme.colors.text}]}>{title}</Text>
          <Text style={[styles.sub, {color: theme.colors.textSecondary}]}>{subtitle}</Text>
        </View>
        {connection.status === 'permission_required' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Grant USB permission"
            onPress={() => {
              void getContainer().dongle.requestPermission();
            }}
            style={[styles.btn, {backgroundColor: theme.colors.primary}]}>
            <Text style={{color: theme.colors.primaryContrast, fontWeight: '700'}}>Allow</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  dot: {width: 10, height: 10, borderRadius: 5},
  textCol: {flex: 1},
  title: {fontSize: 15, fontWeight: '700'},
  sub: {fontSize: 12, marginTop: 2},
  btn: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8},
});
