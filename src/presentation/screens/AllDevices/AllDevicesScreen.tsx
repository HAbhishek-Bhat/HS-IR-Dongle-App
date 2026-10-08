import React, {useEffect, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {getContainer} from '@di/container';
import type {RecordingSession} from '@domain/entities/types';
import {toUserMessage} from '@shared/errors/AppError';
import {DongleBanner} from '../../components/DongleBanner';
import {PrimaryButton} from '../../components/PrimaryButton';
import {WaveformView} from '../../components/WaveformView';
import {ErrorState} from '../../components/ErrorState';
import {useTheme} from '../../theme/ThemeProvider';
import {useIsDongleConnected} from '../../hooks/useDongle';
import type {HomeStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'AllDevices'>;

export function AllDevicesScreen({navigation}: Props): React.JSX.Element {
  const theme = useTheme();
  const focused = useIsFocused();
  const connected = useIsDongleConnected();
  const service = getContainer().allDevices;
  const [snapshot, setSnapshot] = useState(service.getSnapshot());
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<RecordingSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) return;
    const unsubscribe = service.onChanged(setSnapshot);
    return () => {
      unsubscribe();
      void service.stop().catch(failure => Alert.alert('All Devices', toUserMessage(failure)));
    };
  }, [focused, service]);

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (failure) {
      setError(toUserMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const session = await service.save(label);
    setSaved(session);
    Alert.alert(
      'Capture saved',
      `${session.rawFrames.length} complete frames are available in All Devices history.`,
    );
  };

  const exportCapture = async (format: 'json' | 'csv') => {
    const session = snapshot.count ? await service.save(label) : saved;
    if (!session) {
      Alert.alert('Export', 'Receive and save data before exporting.');
      return;
    }
    setSaved(session);
    await getContainer().export.shareRecording(session, format);
  };

  const last = snapshot.lastFrame;
  const decoded = snapshot.lastDecoded;
  const sectionStyle = [
    styles.section,
    {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
  ];

  return (
    <View
      style={[styles.root, {backgroundColor: theme.colors.background}]}
      testID="all-devices-screen">
      <DongleBanner
        captureScreen={focused}
        onDiagnostics={() => navigation.navigate('UsbDiagnostics')}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={sectionStyle}>
          <Text style={[styles.overline, {color: theme.colors.primary}]}>
            INFRARED DATA CAPTURE
          </Text>
          <Text style={[styles.title, {color: theme.colors.text}]}>All Devices</Text>
          <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
            Receive data from remotes and appliances through the IR dongle. Unknown protocols are
            retained exactly as received. Compatibility depends on the receiver and appliance; this
            does not send commands or perform active discovery.
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.status, {color: theme.colors.primary}]}>
            {snapshot.active ? 'Listening' : 'Stopped'} · {snapshot.count} frames
            {snapshot.isPartial ? ' · interrupted' : ''}
          </Text>
          <PrimaryButton
            label={snapshot.active ? 'Stop listening' : 'Start listening'}
            loading={busy}
            disabled={!focused || (!snapshot.active && !connected)}
            onPress={() => void run(() => (snapshot.active ? service.stop() : service.start()))}
          />
          <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
            While listening, every incoming frame is saved as an All Devices draft, separately from
            AED sessions. Stopping or leaving returns to automatic AED reception.
          </Text>
        </View>
        {error ? <ErrorState message={error} /> : null}
        {snapshot.persistenceError ? (
          <ErrorState message="Capture could not be saved. Data remains buffered; resolve storage and retry Save capture." />
        ) : null}
        <View style={sectionStyle}>
          <Text style={[styles.sectionTitle, {color: theme.colors.text}]}>
            Received signal sources
          </Text>
          <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
            Signal patterns identify logical sources, not appliance models or serial numbers.
          </Text>
          {!snapshot.devices.length ? (
            <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
              No data received yet. Start listening, point the remote or appliance at the receiver
              and press a button or activate data transfer.
            </Text>
          ) : null}
          {snapshot.devices.map(device => (
            <View
              key={device.signature.key}
              style={[styles.source, {backgroundColor: theme.colors.surfaceAlt}]}>
              <Text style={[styles.sourceTitle, {color: theme.colors.text}]}>
                {device.signature.displayName}
              </Text>
              <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
                {device.signature.protocol} · {device.hitCount} frames · Last received{' '}
                {new Date(device.lastSeenAt).toLocaleTimeString()}
              </Text>
            </View>
          ))}
        </View>
        <View style={sectionStyle}>
          <Text style={[styles.sectionTitle, {color: theme.colors.text}]}>Live data</Text>
          <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
            Last received: {last ? new Date(last.receivedAtMs).toLocaleTimeString() : 'No data yet'}
          </Text>
          <WaveformView timingsUs={last?.timingsUs.slice(0, 256) ?? []} />
          <Text
            selectable
            style={[
              styles.raw,
              {color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt},
            ]}>
            Protocol: {decoded?.protocol ?? 'Not decoded'}
            {'\n'}
            Address: {decoded?.address ?? 'Not reported'} · Command:{' '}
            {decoded?.command ?? 'Not reported'}
            {'\n'}
            Carrier: {last?.carrierHz != null ? `${last.carrierHz} Hz` : 'Not reported'}
            {'\n'}
            Hex: {last?.frameBytesHex?.slice(0, 1024) ?? 'Not supplied'}
            {'\n'}
            Timings (µs):{' '}
            {last?.timingsUs.length ? last.timingsUs.slice(0, 128).join(', ') : 'Not supplied'}
          </Text>
          <Text style={[styles.description, {color: theme.colors.textSecondary}]}>
            Previews show up to 256 waveform samples, 128 timings and 1024 hex characters. Saved
            recordings and exports contain the full data. USB bytes alone do not confirm IR
            reception.
          </Text>
        </View>
        <View style={sectionStyle}>
          <Text style={[styles.sectionTitle, {color: theme.colors.text}]}>Save and export</Text>
          <TextInput
            accessibilityLabel="Capture label"
            placeholder="Appliance or capture label (optional)"
            placeholderTextColor={theme.colors.textSecondary}
            value={label}
            onChangeText={setLabel}
            style={[
              styles.input,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          />
          <PrimaryButton
            label="Save capture"
            disabled={busy || !snapshot.count}
            onPress={() => void run(save)}
          />
          <PrimaryButton
            label="New capture"
            variant="ghost"
            disabled={busy || (!snapshot.count && !saved)}
            onPress={() =>
              Alert.alert(
                'New capture',
                'Close the current draft? Its received data remains saved in History.',
                [
                  {text: 'Cancel', style: 'cancel'},
                  {
                    text: 'Continue',
                    onPress: () =>
                      void run(async () => {
                        await service.clear();
                        setSaved(null);
                        setLabel('');
                      }),
                  },
                ],
              )
            }
          />
          <PrimaryButton
            label="Export JSON"
            variant="ghost"
            disabled={busy || (!snapshot.count && !saved)}
            onPress={() => void run(() => exportCapture('json'))}
          />
          <PrimaryButton
            label="Export CSV"
            variant="ghost"
            disabled={busy || (!snapshot.count && !saved)}
            onPress={() => void run(() => exportCapture('csv'))}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {padding: 16, paddingBottom: 40, gap: 16},
  section: {borderWidth: 1, borderRadius: 4, padding: 18, gap: 12},
  overline: {fontSize: 11, fontWeight: '800', letterSpacing: 1.4},
  title: {fontSize: 26, fontWeight: '800'},
  sectionTitle: {fontSize: 18, fontWeight: '700'},
  description: {fontSize: 13, lineHeight: 20},
  status: {fontSize: 17, fontWeight: '700'},
  source: {padding: 12, borderRadius: 2, gap: 4},
  sourceTitle: {fontSize: 14, fontWeight: '700'},
  raw: {fontFamily: 'monospace', fontSize: 12, lineHeight: 20, padding: 12},
  input: {borderWidth: 1, borderRadius: 4, padding: 12, minHeight: 48},
});
