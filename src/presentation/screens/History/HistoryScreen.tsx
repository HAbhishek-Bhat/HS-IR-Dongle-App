import React, {useCallback, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {format} from 'date-fns';
import {EmptyState} from '../../components/EmptyState';
import {LoadingState} from '../../components/LoadingState';
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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const list = await getContainer().recordings.list({query: query || undefined});
        if (active) {
          setRecordings(list);
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [query, setRecordings]),
  );

  if (loading) {
    return <LoadingState label="Loading recordings…" />;
  }

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]} testID="history-screen">
      <TextInput
        accessibilityLabel="Search recordings"
        placeholder="Search by protocol, notes, id…"
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
      <FlatList
        data={recordings}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState title="No recordings" message="Saved device capture sessions will appear here." />
        }
        renderItem={({item}) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('RecordingDetail', {id: item.id})}
            style={[styles.row, {backgroundColor: theme.colors.surface, borderColor: theme.colors.border}]}>
            <Text style={[styles.title, {color: theme.colors.text}]}>{item.signature.displayName}</Text>
            <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
              {format(new Date(item.startedAt), 'yyyy-MM-dd HH:mm')} · {item.rawFrames.length} frames ·{' '}
              {item.syncStatus}
              {item.isPartial ? ' · partial' : ''}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
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
