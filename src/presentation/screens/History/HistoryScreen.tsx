import React, {useCallback, useState} from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {format} from 'date-fns';
import {EmptyState} from '../../components/EmptyState';
import {LoadingState} from '../../components/LoadingState';
import {PrimaryButton} from '../../components/PrimaryButton';
import {ErrorState} from '../../components/ErrorState';
import type {AedSession, RecordingSource} from '@domain/entities/types';
import {toUserMessage} from '@shared/errors/AppError';
import {useTheme} from '../../theme/ThemeProvider';
import {getContainer} from '@di/container';
import {useAppStore} from '../../store/appStore';
import type {HistoryStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<HistoryStackParamList, 'HistoryMain'>;

export function HistoryScreen({navigation}: Props): React.JSX.Element {
  const theme = useTheme();
  const recordings = useAppStore(s => s.recordings);
  const setRecordings = useAppStore(s => s.setRecordings);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<RecordingSource | undefined>();
  const [aedSessions, setAedSessions] = useState<AedSession[]>([]);
  const [selectedAed, setSelectedAed] = useState<AedSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let generation = 0;
      const container = getContainer();
      const refresh = async (initial = false) => {
        const request = ++generation;
        if (initial) setLoading(true);
        try {
          const [list, aeds] = await Promise.all([
            container.recordings.list({query: query || undefined, source}),
            source === 'REMOTE_TEST' ? Promise.resolve([]) : container.aedSessions.list(),
          ]);
          const search = query.toLowerCase();
          if (active && request === generation) {
            setRecordings(list);
            setAedSessions(
              aeds.filter(session =>
                `${session.id} ${session.signature.displayName} ${session.parserId} ${session.manufacturer ?? ''} ${session.model ?? ''}`
                  .toLowerCase()
                  .includes(search),
              ),
            );
            setError(null);
            setSelectedAed(selected =>
              selected ? (aeds.find(session => session.id === selected.id) ?? selected) : null,
            );
          }
        } catch (failure) {
          if (active && request === generation) setError(toUserMessage(failure));
        } finally {
          if (active && request === generation) setLoading(false);
        }
      };
      const unsubscribe = container.aed.onSessionsChanged(() => {
        if (source !== 'REMOTE_TEST') void refresh();
      });
      void refresh(true);
      return () => {
        active = false;
        unsubscribe();
      };
    }, [query, source, setRecordings]),
  );

  const rows = [
    ...recordings.map(session => ({kind: 'recording' as const, session})),
    ...aedSessions.map(session => ({kind: 'aed' as const, session})),
  ].sort((a, b) => Date.parse(b.session.startedAt) - Date.parse(a.session.startedAt));

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]} testID="history-screen">
      <TextInput
        accessibilityLabel="Search recordings"
        placeholder="Search by label, protocol, notes, id…"
        placeholderTextColor={theme.colors.textSecondary}
        value={query}
        onChangeText={setQuery}
        style={[
          styles.search,
          {
            borderColor: theme.colors.border,
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
          },
        ]}
      />
      <View style={styles.filters}>
        {(['All', 'AED', 'Remote Test'] as const).map(title => {
          const value = title === 'All' ? undefined : title === 'AED' ? 'AED' : 'REMOTE_TEST';
          return (
            <Pressable
              key={title}
              accessibilityRole="button"
              accessibilityState={{selected: source === value}}
              onPress={() => setSource(value)}
              style={[
                styles.filter,
                {borderColor: source === value ? theme.colors.primary : theme.colors.border},
              ]}>
              <Text style={{color: theme.colors.text}}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
      {loading ? (
        <LoadingState label="Loading recordings…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => `${item.kind}:${item.session.id}`}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title="No recordings"
              message="Saved AED and Remote Test sessions appear here."
            />
          }
          renderItem={({item}) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (item.kind === 'aed') setSelectedAed(item.session);
                else navigation.navigate('RecordingDetail', {id: item.session.id});
              }}
              style={[
                styles.row,
                {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
              ]}>
              <Text style={[styles.title, {color: theme.colors.text}]}>
                {item.kind === 'recording'
                  ? item.session.label || item.session.signature.displayName
                  : item.session.signature.displayName}
              </Text>
              <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
                {item.kind === 'aed' || item.session.source !== 'REMOTE_TEST'
                  ? 'AED'
                  : 'Remote Test'}{' '}
                · {format(new Date(item.session.startedAt), 'yyyy-MM-dd HH:mm')} ·{' '}
                {item.kind === 'aed'
                  ? `${item.session.events.length} events`
                  : `${item.session.rawFrames.length} frames`}{' '}
                · {item.session.syncStatus}
                {item.session.isPartial ? ' · partial' : ''}
              </Text>
            </Pressable>
          )}
        />
      )}
      <Modal
        visible={!!selectedAed}
        onRequestClose={() => setSelectedAed(null)}
        animationType="slide">
        <ScrollView
          contentContainerStyle={styles.list}
          style={{backgroundColor: theme.colors.background}}>
          <Text style={[styles.title, {color: theme.colors.text}]}>
            {selectedAed?.signature.displayName}
          </Text>
          <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
            Saved AED · {selectedAed?.startedAt} · {selectedAed?.parserId}
          </Text>
          {selectedAed?.events.map(event => (
            <View key={event.id} style={[styles.row, {borderColor: theme.colors.border}]}>
              <Text style={{color: theme.colors.text}}>
                {event.label} · {event.timestamp}
              </Text>
              <Text selectable style={{color: theme.colors.textSecondary}}>
                Hex: {event.rawFrame.frameBytesHex?.slice(0, 1024) ?? 'not supplied'}
                {'\n'}
                Timings: {event.rawFrame.timingsUs.slice(0, 128).join(', ')}
              </Text>
            </View>
          ))}
          {(['json', 'csv'] as const).map(exportFormat => (
            <View key={exportFormat} style={styles.exportAction}>
              <PrimaryButton
                label={`Export ${exportFormat.toUpperCase()}`}
                onPress={() => {
                  if (selectedAed)
                    void getContainer()
                      .export.shareAedSession(selectedAed, exportFormat)
                      .catch(failure => Alert.alert('Export', toUserMessage(failure)));
                }}
              />
            </View>
          ))}
          <PrimaryButton label="Close" variant="ghost" onPress={() => setSelectedAed(null)} />
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  filters: {flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12},
  filter: {padding: 10, borderWidth: 1, borderRadius: 10},
  exportAction: {marginVertical: 8},
  search: {
    margin: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  list: {paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1},
  row: {borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, marginBottom: 10},
  title: {fontSize: 16, fontWeight: '700'},
  meta: {fontSize: 12, marginTop: 4},
});
