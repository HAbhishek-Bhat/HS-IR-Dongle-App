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
      <DongleBanner onDiagnostics={() => navigation.navigate('UsbDiagnostics')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.brand, {color: theme.colors.primary}]}>HS IR Capture</Text>
        <Text style={[styles.sub, {color: theme.colors.textSecondary}]}>
          Physical infrared reception, organized by workflow.
        </Text>
        <View
          style={[
            styles.summary,
            {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
          ]}>
          <Text style={[styles.overline, {color: theme.colors.primary}]}>CAPTURE WORKSPACE</Text>
          <Text style={[styles.summaryTitle, {color: theme.colors.text}]}>
            {connected ? 'Receiver connected' : 'Connect your IR receiver'}
          </Text>
          <Text style={[styles.summaryText, {color: theme.colors.textSecondary}]}>
            USB connection is not proof of IR compatibility. Open a workflow to inspect actual
            incoming data.
          </Text>
        </View>

        {lastError ? (
          <Text
            style={[styles.error, {color: theme.colors.danger}]}
            accessibilityLiveRegion="polite">
            {lastError}
          </Text>
        ) : null}

        <SectionCard
          testID="card-all-devices"
          title="All Devices"
          description="Receive appliance and remote-control IR data. Inspect raw bytes, timings and decoded commands, then label and save captures."
          onPress={() => {
            haptic.impact();
            navigation.navigate('AllDevices');
          }}
        />
        <SectionCard
          testID="card-aed"
          title="AED Event Capture"
          description="Listen for AED transfers, inspect reported identity and preserve every received frame."
          onPress={() => {
            haptic.impact();
            navigation.navigate('AedList');
          }}
        />
        <SectionCard
          testID="card-usb-diagnostics"
          title="USB Devices & Diagnostics"
          description="Identify attached USB devices, select your IR receiver, grant permission and inspect actual data activity."
          onPress={() => navigation.navigate('UsbDiagnostics')}
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
  summary: {borderWidth: 1, borderLeftWidth: 4, borderRadius: 4, padding: 18, marginBottom: 24},
  overline: {fontSize: 11, fontWeight: '800', letterSpacing: 1.4},
  summaryTitle: {fontSize: 18, fontWeight: '700', marginTop: 8},
  summaryText: {fontSize: 13, lineHeight: 20, marginTop: 6},
});
