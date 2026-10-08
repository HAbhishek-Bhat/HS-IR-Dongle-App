import React, {useEffect, useState} from 'react';
import {Alert, FlatList, StyleSheet, Text, View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {DongleBanner} from '../../components/DongleBanner';
import {PrimaryButton} from '../../components/PrimaryButton';
import {EmptyState} from '../../components/EmptyState';
import {ErrorState} from '../../components/ErrorState';
import {useTheme} from '../../theme/ThemeProvider';
import {getContainer} from '@di/container';
import {toUserMessage} from '@shared/errors/AppError';
import type {AedSession} from '@domain/entities/types';
import {getReportedAedSerialNumber} from '@domain/parsers/aed/aedIdentity';
import type {HomeStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'AedSession'>;

export function AedSessionScreen({route, navigation}: Props): React.JSX.Element {
  const {sessionId, signatureKey, displayName} = route.params;
  const theme = useTheme();
  const focused = useIsFocused();
  const [session, setSession] = useState<AedSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const {aed, aedSessions} = getContainer();
    const refresh = async () => {
      try {
        const next = sessionId
          ? await aedSessions.getById(sessionId)
          : ((await aedSessions.list()).find(item => item.signature.key === signatureKey) ?? null);
        if (!cancelled) {
          setSession(next);
          setError(null);
        }
      } catch (failure) {
        if (!cancelled) setError(toUserMessage(failure));
      }
    };
    const unsubscribe = aed.onSessionsChanged(() => {
      void refresh();
    });
    void refresh();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId, signatureKey]);

  const exportSession = async () => {
    if (!session) return;
    try {
      await getContainer().export.shareAedSession(session, 'json');
    } catch (failure) {
      Alert.alert('Export', toUserMessage(failure));
    }
  };

  return (
    <View
      style={[styles.root, {backgroundColor: theme.colors.background}]}
      testID="aed-session-screen">
      <DongleBanner
        captureScreen={focused}
        onDiagnostics={() => navigation.navigate('UsbDiagnostics')}
      />
      <View style={styles.header}>
        <Text style={[styles.title, {color: theme.colors.text}]}>{displayName}</Text>
        <Text selectable style={[styles.serial, {color: theme.colors.primary}]}>
          Serial number:{' '}
          {session
            ? (getReportedAedSerialNumber(session.events) ?? 'Not reported')
            : 'Not reported'}
        </Text>
        <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
          {session?.endedAt ? 'Saved session' : 'Automatic reception'} | Raw bytes are retained
          regardless of parsing.
        </Text>
        {session ? (
          <PrimaryButton label="Export raw session" onPress={() => void exportSession()} />
        ) : null}
      </View>
      {error ? <ErrorState message={error} /> : null}
      <FlatList
        data={session?.events ?? []}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="No events yet"
            message="No manual retrieval step is needed. Point the AED at the dongle."
          />
        }
        renderItem={({item}) => (
          <View
            style={[
              styles.event,
              {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
            ]}>
            <Text style={[styles.eventTitle, {color: theme.colors.text}]}>{item.label}</Text>
            <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
              {new Date(item.timestamp).toLocaleTimeString()} | {item.type}
            </Text>
            <Text selectable style={[styles.raw, {color: theme.colors.textSecondary}]}>
              Hex: {item.rawFrame.frameBytesHex ?? 'not reported'}
            </Text>
            <Text selectable style={[styles.raw, {color: theme.colors.textSecondary}]}>
              Timings:{' '}
              {item.rawFrame.timingsUs.length ? item.rawFrame.timingsUs.join(', ') : 'not reported'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {padding: 16},
  title: {fontSize: 22, fontWeight: '800'},
  serial: {fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 8},
  meta: {fontSize: 13, marginTop: 4},
  list: {paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1},
  event: {borderWidth: 1, borderRadius: 4, padding: 16, marginBottom: 12},
  eventTitle: {fontSize: 16, fontWeight: '700'},
  raw: {fontFamily: 'monospace', fontSize: 11, marginTop: 6},
});
