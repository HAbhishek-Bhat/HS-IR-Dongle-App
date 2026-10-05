import React, {useEffect, useMemo, useState} from 'react';
import {Alert, FlatList, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {format} from 'date-fns';
import {DongleBanner} from '../../components/DongleBanner';
import {PrimaryButton} from '../../components/PrimaryButton';
import {EmptyState} from '../../components/EmptyState';
import {useTheme} from '../../theme/ThemeProvider';
import {useAppStore} from '../../store/appStore';
import {getContainer} from '@di/container';
import {toUserMessage} from '@shared/errors/AppError';
import {useHaptic} from '../../hooks/useHaptic';
import type {HomeStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'AedSession'>;

export function AedSessionScreen({route, navigation}: Props): React.JSX.Element {
  const {signatureKey, displayName} = route.params;
  const theme = useTheme();
  const haptic = useHaptic();
  const aeds = useAppStore(s => s.detectedAeds);
  const events = useAppStore(s => s.aedEvents);
  const setAedEvents = useAppStore(s => s.setAedEvents);
  const setActiveAedSession = useAppStore(s => s.setActiveAedSession);
  const [active, setActive] = useState(false);

  const signature = useMemo(
    () => aeds.find(d => d.signature.key === signatureKey)?.signature,
    [aeds, signatureKey],
  );

  useEffect(() => {
    const {aed, dongle} = getContainer();
    const unsub = aed.onEventsChanged(setAedEvents);
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
      if (aed.getActiveSession()) {
        void aed.endSession(false);
      }
    };
  }, [haptic, navigation, setAedEvents]);

  const start = async () => {
    if (!signature) {
      Alert.alert('AED', 'Signature not found.');
      return;
    }
    try {
      const session = await getContainer().aed.startSession(signature);
      setActiveAedSession(session);
      setActive(true);
      haptic.success();
    } catch (error) {
      Alert.alert('AED', toUserMessage(error));
    }
  };

  const stop = async () => {
    try {
      const session = await getContainer().aed.endSession(false);
      setActive(false);
      setActiveAedSession(null);
      haptic.success();
      Alert.alert('Saved', `AED session stored with ${session?.events.length ?? 0} events.`);
    } catch (error) {
      Alert.alert('AED', toUserMessage(error));
    }
  };

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]} testID="aed-session-screen">
      <DongleBanner />
      <View style={styles.header}>
        <Text style={[styles.title, {color: theme.colors.text}]}>{displayName}</Text>
        <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
          Timeline of labeled AED events with exact raw frames retained.
        </Text>
        <View style={styles.actions}>
          {!active ? (
            <PrimaryButton label="Start retrieval" onPress={() => void start()} />
          ) : (
            <PrimaryButton label="Stop & save" variant="danger" onPress={() => void stop()} />
          )}
        </View>
      </View>
      <FlatList
        data={events}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState title="No events yet" message="Start retrieval to log pads, analysis, and shock events." />
        }
        renderItem={({item}) => (
          <View style={[styles.event, {backgroundColor: theme.colors.surface, borderColor: theme.colors.border}]}>
            <Text style={[styles.eventTitle, {color: theme.colors.text}]}>{item.label}</Text>
            <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
              {format(new Date(item.timestamp), 'HH:mm:ss.SSS')} · {item.type}
            </Text>
            <Text style={[styles.raw, {color: theme.colors.textSecondary}]}>
              raw timings: {item.rawFrame.timingsUs.slice(0, 12).join(', ')}
              {item.rawFrame.timingsUs.length > 12 ? '…' : ''}
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
  meta: {fontSize: 13, marginTop: 4},
  actions: {marginTop: 16},
  list: {paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1},
  event: {borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 10},
  eventTitle: {fontSize: 16, fontWeight: '700'},
  raw: {fontFamily: 'monospace', fontSize: 11, marginTop: 6},
});
