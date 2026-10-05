import React, {useEffect, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {formatDistanceToNow} from 'date-fns';
import {DongleBanner} from '../../components/DongleBanner';
import {EmptyState} from '../../components/EmptyState';
import {LoadingState} from '../../components/LoadingState';
import {ErrorState} from '../../components/ErrorState';
import {useTheme} from '../../theme/ThemeProvider';
import {useAppStore} from '../../store/appStore';
import {getContainer} from '@di/container';
import {toUserMessage} from '@shared/errors/AppError';
import {useIsDongleConnected} from '../../hooks/useDongle';
import type {HomeStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'AedList'>;

export function AedListScreen({navigation}: Props): React.JSX.Element {
  const theme = useTheme();
  const connected = useIsDongleConnected();
  const aeds = useAppStore(s => s.detectedAeds);
  const setDetectedAeds = useAppStore(s => s.setDetectedAeds);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      setError('Connect an IR dongle to detect AEDs.');
      return;
    }
    const {aed} = getContainer();
    let unsub = () => {};
    (async () => {
      try {
        setLoading(true);
        await aed.startListeningForAeds();
        unsub = aed.onAedsChanged(setDetectedAeds);
      } catch (e) {
        setError(toUserMessage(e));
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      unsub();
      void aed.stopListeningForAeds();
    };
  }, [connected, setDetectedAeds]);

  if (loading) {
    return <LoadingState label="Listening for AED IR…" />;
  }

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]} testID="aed-list-screen">
      <DongleBanner />
      {error ? <ErrorState message={error} /> : null}
      <FlatList
        data={aeds}
        keyExtractor={item => item.signature.key}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="No AEDs detected"
            message="When an AED transmits IR status frames, it will appear here by signal signature. Unknown models use raw capture mode."
          />
        }
        renderItem={({item}) => (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate('AedSession', {
                signatureKey: item.signature.key,
                displayName: item.signature.displayName,
              })
            }
            style={[styles.row, {backgroundColor: theme.colors.surface, borderColor: theme.colors.border}]}>
            <Text style={[styles.title, {color: theme.colors.text}]}>{item.signature.displayName}</Text>
            <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
              {item.signature.protocol} · last seen{' '}
              {formatDistanceToNow(new Date(item.lastSeenAt), {addSuffix: true})}
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
