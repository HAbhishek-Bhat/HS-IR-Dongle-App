import React, {useCallback, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {PrimaryButton} from '../../components/PrimaryButton';
import {useTheme} from '../../theme/ThemeProvider';
import {getContainer} from '@di/container';
import {useAppStore} from '../../store/appStore';
import {toUserMessage} from '@shared/errors/AppError';

export function SyncStatusScreen(): React.JSX.Element {
  const theme = useTheme();
  const syncBusy = useAppStore(s => s.syncBusy);
  const setSyncBusy = useAppStore(s => s.setSyncBusy);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [synced, setSynced] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const {recordings, aedSessions} = getContainer();
    const recs = await recordings.list();
    const aeds = await aedSessions.list();
    const all = [...recs.map(r => r.syncStatus), ...aeds.map(a => a.syncStatus)];
    setPending(all.filter(s => s === 'pending').length);
    setFailed(all.filter(s => s === 'failed').length);
    setSynced(all.filter(s => s === 'synced').length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const runSync = async () => {
    setSyncBusy(true);
    setMessage(null);
    try {
      const result = await getContainer().sync.syncPending();
      setMessage(`Synced ${result.synced}, failed ${result.failed}`);
      await refresh();
    } catch (error) {
      setMessage(toUserMessage(error));
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]} testID="sync-screen">
      <Text style={[styles.title, {color: theme.colors.text}]}>Sync status</Text>
      <View
        style={[
          styles.card,
          {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
        ]}>
        <Text style={[styles.row, {color: theme.colors.text}]}>Pending: {pending}</Text>
        <Text style={[styles.row, {color: theme.colors.text}]}>Failed: {failed}</Text>
        <Text style={[styles.row, {color: theme.colors.text}]}>Synced: {synced}</Text>
      </View>
      {message ? (
        <Text style={{color: theme.colors.textSecondary, marginBottom: 12}}>{message}</Text>
      ) : null}
      <PrimaryButton label="Sync now" onPress={() => void runSync()} loading={syncBusy} />
      <Text style={[styles.hint, {color: theme.colors.textSecondary}]}>
        Offline-first: records stay local with pending/synced/failed status. Retries use exponential
        backoff.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, padding: 20},
  title: {fontSize: 24, fontWeight: '800', marginBottom: 16},
  card: {borderWidth: 1, borderRadius: 4, padding: 16, marginBottom: 20},
  row: {fontSize: 16, marginBottom: 8, fontWeight: '600'},
  hint: {marginTop: 16, fontSize: 13, lineHeight: 20},
});
