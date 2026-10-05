import React, {useEffect, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {getContainer} from '@di/container';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {HomeStackParamList} from '../../navigation/types';
import type {RecordingSession} from '@domain/entities/types';
import type {RemoteTestService} from '@domain/services/RemoteTestService';
import {toUserMessage} from '@shared/errors/AppError';
import {DongleBanner} from '../../components/DongleBanner';
import {PrimaryButton} from '../../components/PrimaryButton';
import {WaveformView} from '../../components/WaveformView';
import {useTheme} from '../../theme/ThemeProvider';
import {useIsDongleConnected} from '../../hooks/useDongle';

type Props = NativeStackScreenProps<HomeStackParamList, 'RemoteTest'>;

export function RemoteTestScreen({navigation}: Props): React.JSX.Element {
  const theme = useTheme();
  const connected = useIsDongleConnected();
  const focused = useIsFocused();
  const service: RemoteTestService = getContainer().remoteTest;
  const [snapshot, setSnapshot] = useState(service.getSnapshot());
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<RecordingSession | null>(null);

  useEffect(() => {
    const unsubscribe = service.onChanged(setSnapshot);
    return () => {
      unsubscribe();
      void service.stop().catch(error => Alert.alert('Remote Test', toUserMessage(error)));
    };
  }, [service]);

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      Alert.alert('Remote Test', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const session = await service.save(label);
    setSaved(session);
    Alert.alert('Saved', `${session.rawFrames.length} exact frames saved as Remote Test.`);
  };
  const exportCapture = async (format: 'json' | 'csv') => {
    const session = snapshot.count ? await service.save(label) : saved;
    if (!session) return;
    setSaved(session);
    await getContainer().export.shareRecording(session, format);
  };
  const last = snapshot.lastFrame;
  const decoded = snapshot.lastDecoded;

  return (
    <View
      style={[styles.root, {backgroundColor: theme.colors.background}]}
      testID="remote-test-screen">
      <DongleBanner
        captureScreen={focused}
        onDiagnostics={() => navigation.navigate('UsbDiagnostics')}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, {color: theme.colors.text}]}>Remote Test</Text>
        <Text style={{color: theme.colors.textSecondary}}>
          Start to route received frames to a remote test instead of AED capture. Stop returns to
          default reception; it does not turn off the receiver. Every received frame is
          automatically saved in a draft. Save updates its label; Clear closes the draft without
          deleting it.
        </Text>
        <Text accessibilityLiveRegion="polite" style={[styles.status, {color: theme.colors.text}]}>
          {snapshot.active ? 'Listening' : 'Stopped'} · {snapshot.count} frames
          {snapshot.isPartial ? ' · interrupted' : ''}
        </Text>
        <Text style={{color: theme.colors.textSecondary}}>
          Last received: {last ? `${last.receivedAtMs} ms (receiver clock)` : '—'}
        </Text>
        <View style={styles.actions}>
          <PrimaryButton
            label={snapshot.active ? 'Stop' : 'Start'}
            loading={busy}
            disabled={!snapshot.active && !connected}
            onPress={() => {
              if (snapshot.active) void run(() => service.stop());
              else void run(() => service.start());
            }}
          />
        </View>
        <WaveformView timingsUs={last ? last.timingsUs.slice(0, 256) : []} />
        <Text selectable style={[styles.raw, {color: theme.colors.text}]}>
          Protocol: {decoded?.protocol ?? '—'}
          {'\n'}
          Address: {decoded?.address ?? '—'} · Command: {decoded?.command ?? '—'}
          {'\n'}
          Carrier: {last?.carrierHz ?? 'unknown'} Hz{'\n'}
          Hex: {last?.frameBytesHex?.slice(0, 1024) ?? 'not supplied'}
          {'\n'}
          Timings (µs): {last?.timingsUs.slice(0, 128).join(', ') ?? '—'}
        </Text>
        <Text style={{color: theme.colors.textSecondary}}>
          Preview bounded to 256 waveform samples, 128 timings and 1024 hex characters. Saving and
          exporting retain every complete frame, including unknown protocols.
        </Text>
        {snapshot.persistenceError ? (
          <Text accessibilityLiveRegion="polite" style={{color: theme.colors.danger}}>
            Storage error: {snapshot.persistenceError}. Frames remain buffered; retry Save before
            clearing.
          </Text>
        ) : null}
        <TextInput
          accessibilityLabel="Remote test label"
          placeholder="Label (optional)"
          placeholderTextColor={theme.colors.textSecondary}
          value={label}
          onChangeText={setLabel}
          style={[styles.input, {color: theme.colors.text, borderColor: theme.colors.border}]}
        />
        <View style={styles.actions}>
          <PrimaryButton
            label="Save"
            disabled={!snapshot.count || busy}
            onPress={() => void run(save)}
          />
        </View>
        <View style={styles.actions}>
          <PrimaryButton
            label="Clear"
            variant="ghost"
            disabled={busy || (!snapshot.count && !saved)}
            onPress={() =>
              Alert.alert(
                'Clear test',
                'Close this automatically saved draft? All raw frames remain in History.',
                [
                  {text: 'Cancel', style: 'cancel'},
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      void run(async () => {
                        await service.clear();
                        setSaved(null);
                      });
                    },
                  },
                ],
              )
            }
          />
        </View>
        <View style={styles.actions}>
          <PrimaryButton
            label="Export JSON"
            disabled={busy || (!snapshot.count && !saved)}
            onPress={() => void run(() => exportCapture('json'))}
          />
        </View>
        <PrimaryButton
          label="Export CSV"
          disabled={busy || (!snapshot.count && !saved)}
          onPress={() => void run(() => exportCapture('csv'))}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {padding: 16, paddingBottom: 40},
  title: {fontSize: 24, fontWeight: '800', marginBottom: 8},
  status: {fontSize: 18, marginTop: 16, marginBottom: 4},
  actions: {marginVertical: 8},
  raw: {fontFamily: 'monospace', fontSize: 12, marginVertical: 12},
  input: {borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12},
});
