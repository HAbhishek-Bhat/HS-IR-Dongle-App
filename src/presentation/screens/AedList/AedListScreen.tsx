import React, {useEffect, useState} from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {TapSurface} from '../../components/TapSurface';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {DongleBanner} from '../../components/DongleBanner';
import {EmptyState} from '../../components/EmptyState';
import {ErrorState} from '../../components/ErrorState';
import {AedDeviceScanner} from '../../components/AedDeviceScanner';
import {getReportedAedSerialNumber} from '@domain/parsers/aed/aedIdentity';
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
      <FlatList
        style={styles.scroll}
        removeClippedSubviews={false}
        data={sessions}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <DongleBanner
              captureScreen={focused}
              onDiagnostics={() => navigation.navigate('UsbDiagnostics')}
            />
            {error ? <ErrorState message={error} /> : null}
            <View style={styles.header}>
              <View style={[styles.hero, {backgroundColor: theme.colors.primary}]}>
                <Text style={[styles.heroTitle, {color: theme.colors.primaryContrast}]}>
                  AED Event Capture
                </Text>
                <Text style={[styles.heroDescription, {color: theme.colors.primaryContrast}]}>
                  Discover incoming signals. Preserve every event.
                </Text>
              </View>
              <AedDeviceScanner focused={focused} />
              <Text style={[styles.sectionTitle, {color: theme.colors.text}]}>
                Captured sessions ({sessions.length})
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Waiting for AED data"
            message="Reception starts automatically after USB permission. Every incoming byte is saved, including unknown formats. Sessions appear here as data arrives."
          />
        }
        renderItem={({item}) => (
          <TapSurface
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
            <Text selectable style={[styles.serial, {color: theme.colors.primary}]}>
              Serial number: {getReportedAedSerialNumber(item.events) ?? 'Not reported'}
            </Text>
            <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
              {item.endedAt ? 'Saved' : 'Live'} | {item.rawFrames?.length ?? item.events.length} raw
              frames | {item.parserId === 'raw-capture' ? 'raw/unparsed' : item.parserId}
            </Text>
            <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
              {new Date(item.startedAt).toLocaleString()}
            </Text>
          </TapSurface>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  scroll: {flex: 1},
  list: {paddingBottom: 24, flexGrow: 1},
  header: {padding: 16, paddingBottom: 0},
  hero: {padding: 22, borderRadius: 4, marginBottom: 16},
  heroTitle: {fontSize: 26, fontWeight: '800'},
  heroDescription: {fontSize: 14, lineHeight: 21, marginTop: 8},
  sectionTitle: {fontSize: 18, fontWeight: '800', marginBottom: 14},
  row: {borderWidth: 1, borderRadius: 4, padding: 18, marginHorizontal: 16, marginBottom: 12},
  title: {fontSize: 16, fontWeight: '700'},
  serial: {fontSize: 14, fontWeight: '700', marginTop: 8},
  meta: {fontSize: 12, marginTop: 4},
});
