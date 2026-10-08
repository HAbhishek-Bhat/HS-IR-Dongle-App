import React, {useEffect, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useRoute, type RouteProp} from '@react-navigation/native';
import {format} from 'date-fns';
import {LoadingState} from '../../components/LoadingState';
import {ErrorState} from '../../components/ErrorState';
import {PrimaryButton} from '../../components/PrimaryButton';
import {WaveformView} from '../../components/WaveformView';
import {useTheme} from '../../theme/ThemeProvider';
import {getContainer} from '@di/container';
import type {RecordingSession} from '@domain/entities/types';
import {toUserMessage} from '@shared/errors/AppError';
import type {HomeStackParamList} from '../../navigation/types';

export function RecordingDetailScreen(): React.JSX.Element {
  const route = useRoute<RouteProp<HomeStackParamList, 'RecordingDetail'>>();
  const {id} = route.params;
  const theme = useTheme();
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const found = await getContainer().recordings.getById(id);
        setSession(found);
        if (!found) {
          setError('Recording not found.');
        }
      } catch (e) {
        setError(toUserMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return <LoadingState />;
  }
  if (error || !session) {
    return <ErrorState message={error ?? 'Not found'} />;
  }

  const firstTimings = session.rawFrames[0]?.timingsUs.slice() ?? [];

  return (
    <ScrollView
      style={{backgroundColor: theme.colors.background}}
      contentContainerStyle={styles.content}
      testID="recording-detail-screen">
      <Text style={[styles.title, {color: theme.colors.text}]}>
        {session.signature.displayName}
      </Text>
      <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
        {session.source === 'ALL_DEVICES' || session.source === 'REMOTE_TEST'
          ? 'All Devices'
          : 'AED'}{' '}
        · {format(new Date(session.startedAt), 'yyyy-MM-dd HH:mm:ss')} · {session.durationMs} ms ·
        sync {session.syncStatus}
      </Text>
      {session.isPartial ? (
        <Text style={{color: theme.colors.warning, marginTop: 8}}>
          Partial session (dongle removed)
        </Text>
      ) : null}

      <Text style={[styles.section, {color: theme.colors.text}]}>Waveform (first frame)</Text>
      <WaveformView timingsUs={firstTimings} />

      <Text style={[styles.section, {color: theme.colors.text}]}>
        Raw frames ({session.rawFrames.length})
      </Text>
      {session.rawFrames.slice(0, 5).map((frame, idx) => (
        <View
          key={`${frame.receivedAtMs}-${idx}`}
          style={[styles.block, {backgroundColor: theme.colors.surfaceAlt}]}>
          <Text style={[styles.mono, {color: theme.colors.textSecondary}]}>
            #{idx} carrier={frame.carrierHz ?? 'n/a'}
            {'\n'}
            Hex: {frame.frameBytesHex?.slice(0, 1024) ?? 'not supplied'}
            {'\n'}
            Timings: {frame.timingsUs.slice(0, 128).join(',')}
          </Text>
        </View>
      ))}

      <Text style={[styles.section, {color: theme.colors.text}]}>Decoded snapshots</Text>
      <Text style={[styles.mono, {color: theme.colors.textSecondary}]}>
        {JSON.stringify(session.decodedSnapshots.slice(0, 3), null, 2)}
      </Text>

      <View style={styles.actions}>
        <PrimaryButton
          label="Export JSON"
          onPress={() => {
            void getContainer()
              .export.shareRecording(session, 'json')
              .catch(e => Alert.alert('Export', toUserMessage(e)));
          }}
        />
        <View style={{height: 12}} />
        <PrimaryButton
          label="Export CSV"
          variant="ghost"
          onPress={() => {
            void getContainer()
              .export.shareRecording(session, 'csv')
              .catch(e => Alert.alert('Export', toUserMessage(e)));
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {padding: 16, paddingBottom: 40},
  title: {fontSize: 22, fontWeight: '800'},
  meta: {fontSize: 13, marginTop: 4},
  section: {marginTop: 20, marginBottom: 8, fontWeight: '700', fontSize: 16},
  block: {padding: 12, borderRadius: 4, marginBottom: 8},
  mono: {fontFamily: 'monospace', fontSize: 11, lineHeight: 16},
  actions: {marginTop: 24},
});
