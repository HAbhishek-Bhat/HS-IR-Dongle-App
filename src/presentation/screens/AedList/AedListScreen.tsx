import React, {useEffect, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {DongleBanner} from '../../components/DongleBanner';
import {EmptyState} from '../../components/EmptyState';
import {ErrorState} from '../../components/ErrorState';
import {useTheme} from '../../theme/ThemeProvider';
import {getContainer} from '@di/container';
import {toUserMessage} from '@shared/errors/AppError';
import type {AedSession} from '@domain/entities/types';
import type {HomeStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'AedList'>;

export function AedListScreen({navigation}: Props): React.JSX.Element {
  const theme = useTheme();
  const focused = useIsFocused();
  const [sessions, setSessions] = useState<AedSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    const {aed} = getContainer();
    const refresh = async () => {
      try {
        const next = await aed.listSessions();
        if (!cancelled) {
          setSessions(next);
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
  }, [focused]);

  return (
    <View
      style={[styles.root, {backgroundColor: theme.colors.background}]}
      testID="aed-list-screen">
      <DongleBanner
        captureScreen={focused}
        onDiagnostics={() => navigation.navigate('UsbDiagnostics')}
      />
      {error ? <ErrorState message={error} /> : null}
      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="Waiting for AED data"
            message="Reception starts automatically after USB permission. Every incoming byte is saved, including unknown formats. Sessions appear here as data arrives."
          />
        }
        renderItem={({item}) => (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate('AedSession', {
                signatureKey: item.signature.key,
                displayName: item.signature.displayName,
                sessionId: item.id,
              })
            }
            style={[
              styles.row,
              {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
            ]}>
            <Text style={[styles.title, {color: theme.colors.text}]}>
              {item.signature.displayName}
            </Text>
            <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
              {item.endedAt ? 'Saved' : 'Live'} | {item.rawFrames?.length ?? item.events.length} raw
              frames | {item.parserId === 'raw-capture' ? 'raw/unparsed' : item.parserId}
            </Text>
            <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
              {new Date(item.startedAt).toLocaleString()}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  list: {padding: 16, flexGrow: 1},
  row: {borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, marginBottom: 10},
  title: {fontSize: 16, fontWeight: '700'},
  meta: {fontSize: 12, marginTop: 4},
});
