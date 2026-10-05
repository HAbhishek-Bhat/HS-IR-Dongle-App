import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {DongleBanner} from '../../components/DongleBanner';
import {SectionCard} from '../../components/SectionCard';
import {useTheme} from '../../theme/ThemeProvider';
import {useIsDongleConnected} from '../../hooks/useDongle';
import {useHaptic} from '../../hooks/useHaptic';
import {useAppStore} from '../../store/appStore';
import type {HomeStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'HomeMain'>;

export function HomeScreen({navigation}: Props): React.JSX.Element {
  const theme = useTheme();
  const connected = useIsDongleConnected();
  const haptic = useHaptic();
  const lastError = useAppStore(s => s.lastError);

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.background}]} testID="home-screen">
      <DongleBanner />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.brand, {color: theme.colors.primary}]}>HS IR Capture</Text>
        <Text style={[styles.sub, {color: theme.colors.textSecondary}]}>
          Choose a workflow. Capture unlocks only when a verified receiver is ready.
        </Text>

        {lastError ? (
          <Text
            style={[styles.error, {color: theme.colors.danger}]}
            accessibilityLiveRegion="polite">
            {lastError}
          </Text>
        ) : null}

        <SectionCard
          testID="card-device-capture"
          title="Device Capture"
          description="Listen for IR remotes and devices, inspect live waveforms, and save exact raw timings."
          disabled={!connected}
          onPress={() => {
            haptic.impact();
            navigation.navigate('DeviceCapture');
          }}
        />
        <SectionCard
          testID="card-aed"
          title="AED Data Retrieval"
          description="Detect AED IR streams, retrieve labeled clinical events, and retain exact raw frames."
          disabled={!connected}
          onPress={() => {
            haptic.impact();
            navigation.navigate('AedList');
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {padding: 20, paddingBottom: 40},
  brand: {fontSize: 30, fontWeight: '800', letterSpacing: -0.4},
  sub: {fontSize: 15, marginTop: 8, marginBottom: 20, lineHeight: 22},
  error: {marginBottom: 12, fontSize: 14},
});
