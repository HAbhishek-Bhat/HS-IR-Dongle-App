import React, {useEffect, useMemo, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useIsFocused} from '@react-navigation/native';
import {DongleBanner} from '../../components/DongleBanner';
import {PrimaryButton} from '../../components/PrimaryButton';
import {WaveformView} from '../../components/WaveformView';
import {useTheme} from '../../theme/ThemeProvider';
import {useAppStore} from '../../store/appStore';
import {getContainer} from '@di/container';
import {toUserMessage} from '@shared/errors/AppError';
import {useHaptic} from '../../hooks/useHaptic';
import type {HomeStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Recording'>;

export function RecordingScreen({route, navigation}: Props): React.JSX.Element {
  const {signatureKey, displayName} = route.params;
  const theme = useTheme();
  const focused = useIsFocused();
  const haptic = useHaptic();
  const devices = useAppStore(s => s.detectedDevices);
  const setActiveRecordingId = useAppStore(s => s.setActiveRecordingId);
  const [recording, setRecording] = useState(false);
  const [timings, setTimings] = useState<number[]>([]);
  const [decodedText, setDecodedText] = useState('—');
  const [rawPreview, setRawPreview] = useState('—');

  const signature = useMemo(
    () => devices.find(d => d.signature.key === signatureKey)?.signature,
    [devices, signatureKey],
  );

  useEffect(() => {
    const {dongle, capture} = getContainer();
    const unsub = dongle.onFrame(frame => {
      if (!capture.getActiveSessionId()) return;
      setTimings([...frame.timingsUs]);
      setRawPreview(
        frame.timingsUs.slice(0, 24).join(', ') + (frame.timingsUs.length > 24 ? '…' : ''),
      );
      const last = capture.getLiveFrames().at(-1);
      if (last) {
        // decoded snapshots updated inside service; show length as feedback
        setDecodedText(`Frames: ${capture.getLiveFrames().length}`);
      }
    });
    const unsubErr = dongle.onError(error => {
      if (error.code === 'DONGLE_REMOVED') {
        haptic.warning();
        Alert.alert('Dongle removed', error.userMessage, [
          {text: 'OK', onPress: () => navigation.goBack()},
        ]);
      }
    });
    return () => {
      unsub();
      unsubErr();
      if (capture.getActiveSessionId()) {
        void capture.stopRecording(false);
      }
    };
  }, [haptic, navigation]);

  const start = async () => {
    if (!signature) {
      Alert.alert('Recording', 'Device signature not found. Return to the device list.');
      return;
    }
    try {
      const id = await getContainer().capture.startRecording(signature);
      setActiveRecordingId(id);
      setRecording(true);
      haptic.success();
    } catch (error) {
      Alert.alert('Recording', toUserMessage(error));
    }
  };

  const stop = async () => {
    try {
      const session = await getContainer().capture.stopRecording(false);
      setRecording(false);
      setActiveRecordingId(null);
      haptic.success();
      if (session) {
        Alert.alert('Saved', `Recording stored with ${session.rawFrames.length} raw frames.`, [
          {text: 'View', onPress: () => navigation.navigate('RecordingDetail', {id: session.id})},
          {text: 'OK'},
        ]);
      }
    } catch (error) {
      Alert.alert('Recording', toUserMessage(error));
    }
  };

  return (
    <View
      style={[styles.root, {backgroundColor: theme.colors.background}]}
      testID="recording-screen">
      <DongleBanner
        captureScreen={focused}
        onDiagnostics={() => navigation.navigate('UsbDiagnostics')}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, {color: theme.colors.text}]}>{displayName}</Text>
        <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
          {signature?.protocol ?? 'UNKNOWN'}
          {signature?.carrierHz ? ` · ${signature.carrierHz} Hz` : ''}
        </Text>

        <Text style={[styles.section, {color: theme.colors.text}]}>Live signal</Text>
        <WaveformView timingsUs={timings} />

        <Text style={[styles.section, {color: theme.colors.text}]}>Raw timings (µs)</Text>
        <Text
          style={[
            styles.mono,
            {color: theme.colors.textSecondary, backgroundColor: theme.colors.surfaceAlt},
          ]}>
          {rawPreview}
        </Text>

        <Text style={[styles.section, {color: theme.colors.text}]}>Decoded</Text>
        <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>{decodedText}</Text>

        <View style={styles.actions}>
          {!recording ? (
            <PrimaryButton label="Start recording" onPress={() => void start()} />
          ) : (
            <PrimaryButton label="Stop & save" variant="danger" onPress={() => void stop()} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {padding: 16, paddingBottom: 40},
  title: {fontSize: 22, fontWeight: '800'},
  meta: {fontSize: 14, marginTop: 4},
  section: {marginTop: 20, marginBottom: 8, fontSize: 16, fontWeight: '700'},
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
    padding: 12,
    borderRadius: 10,
    lineHeight: 18,
  },
  actions: {marginTop: 28},
});
