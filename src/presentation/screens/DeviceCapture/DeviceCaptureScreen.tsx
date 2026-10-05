import React, {useEffect, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {formatDistanceToNow} from 'date-fns';
import {useIsFocused} from '@react-navigation/native';
import {DongleBanner} from '../../components/DongleBanner';
import {PrimaryButton} from '../../components/PrimaryButton';
import {EmptyState} from '../../components/EmptyState';
import {LoadingState} from '../../components/LoadingState';
import {ErrorState} from '../../components/ErrorState';
import {useTheme} from '../../theme/ThemeProvider';
import {useAppStore} from '../../store/appStore';
import {getContainer} from '@di/container';
import {toUserMessage} from '@shared/errors/AppError';
import {useIsDongleConnected} from '../../hooks/useDongle';
import type {HomeStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'DeviceCapture'>;

export function DeviceCaptureScreen({navigation}: Props): React.JSX.Element {
  const theme = useTheme();
  const connected = useIsDongleConnected();
  const focused = useIsFocused();
  const devices = useAppStore(s => s.detectedDevices);
  const setDetectedDevices = useAppStore(s => s.setDetectedDevices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      setError(
        'A verified IR receiver must be ready before scanning. Check the dongle status above.',
      );
      return;
    }
    const {capture} = getContainer();
    let unsub = () => {};
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await capture.startDeviceScan();
        unsub = capture.onDevicesChanged(setDetectedDevices);
      } catch (e) {
        setError(toUserMessage(e));
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      unsub();
      void capture.stopDeviceScan();
    };
  }, [connected, setDetectedDevices]);

  return (
    <View
      style={[styles.root, {backgroundColor: theme.colors.background}]}
      testID="device-capture-screen">
      <DongleBanner
        captureScreen={focused}
        onDiagnostics={() => navigation.navigate('UsbDiagnostics')}
      />
      <View style={styles.shortcuts}>
        <PrimaryButton
          label="Remote Test"
          disabled={!connected}
          onPress={() => navigation.navigate('RemoteTest')}
        />
        <PrimaryButton
          label="USB Diagnostics"
          variant="ghost"
          onPress={() => navigation.navigate('UsbDiagnostics')}
        />
      </View>
      {loading ? <LoadingState label="Listening for IR devices..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      <FlatList
        data={devices}
        keyExtractor={item => item.signature.key}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="No devices detected yet"
            message="Point an IR remote or AED transmitter at the dongle. Distinct signal signatures appear here."
          />
        }
        renderItem={({item}) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.signature.displayName}`}
            onPress={() =>
              navigation.navigate('Recording', {
                signatureKey: item.signature.key,
                displayName: item.signature.displayName,
              })
            }
            style={[
              styles.row,
              {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
            ]}>
            <View style={{flex: 1}}>
              <Text style={[styles.title, {color: theme.colors.text}]}>
                {item.signature.displayName}
              </Text>
              <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
                {item.signature.protocol}
                {item.signature.carrierHz ? ` · ${item.signature.carrierHz} Hz` : ''}
                {' · '}
                last seen {formatDistanceToNow(new Date(item.lastSeenAt), {addSuffix: true})}
              </Text>
            </View>
            <Text style={[styles.strength, {color: theme.colors.accent}]}>
              {Math.round(item.signalStrength * 100)}%
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  shortcuts: {padding: 16, gap: 8},
  list: {padding: 16, flexGrow: 1},
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {fontSize: 16, fontWeight: '700'},
  meta: {fontSize: 12, marginTop: 4},
  strength: {fontWeight: '800', marginLeft: 8},
});
