import React, {useEffect, useState} from 'react';
import {Alert, Clipboard, ScrollView, Share, StyleSheet, Text, View} from 'react-native';
import {getContainer} from '@di/container';
import {toUserMessage} from '@shared/errors/AppError';
import {DongleBanner} from '../../components/DongleBanner';
import {PrimaryButton} from '../../components/PrimaryButton';
import {useTheme} from '../../theme/ThemeProvider';

const PREVIEW_LIMIT = 12000;

export function UsbDiagnosticsScreen(): React.JSX.Element {
  const theme = useTheme();
  const [diagnostics, setDiagnostics] = useState('');
  const [hex, setHex] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const text = await getContainer().dongle.getDiagnostics();
        if (mounted) {
          setDiagnostics(text);
          setError(null);
        }
      } catch (failure) {
        if (mounted) setError(toUserMessage(failure));
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    const unsubscribe = getContainer().dongle.onFrame(frame => {
      setHex((frame.frameBytesHex ?? 'Raw hex not supplied').slice(0, 2048));
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  const share = () => {
    Alert.alert(
      'Share USB diagnostics?',
      'Descriptors may include device identifiers. Only share with someone you trust.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Share',
          onPress: () => {
            void Share.share({title: 'USB diagnostics', message: diagnostics}).catch(failure =>
              Alert.alert('Diagnostics', toUserMessage(failure)),
            );
          },
        },
      ],
    );
  };

  return (
    <View
      style={[styles.root, {backgroundColor: theme.colors.background}]}
      testID="usb-diagnostics-screen">
      <DongleBanner />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, {color: theme.colors.text}]}>USB Diagnostics</Text>
        <Text style={{color: theme.colors.textSecondary}}>
          Live receiver descriptors and state. No raw logs are uploaded automatically.
        </Text>
        {error ? (
          <Text accessibilityLiveRegion="polite" style={{color: theme.colors.danger}}>
            {error}
          </Text>
        ) : null}
        <Text selectable style={[styles.raw, {color: theme.colors.text}]}>
          {diagnostics.slice(0, PREVIEW_LIMIT) || 'Reading diagnostics…'}
        </Text>
        {diagnostics.length > PREVIEW_LIMIT ? (
          <Text style={{color: theme.colors.textSecondary}}>
            Preview truncated. Copy/Share includes the complete diagnostics.
          </Text>
        ) : null}
        <Text selectable style={[styles.raw, {color: theme.colors.text}]}>
          Live last hex (up to 2048 characters):{'\n'}
          {hex || 'No frames received on this screen.'}
        </Text>
        <View style={styles.action}>
          <PrimaryButton
            label="Copy diagnostics"
            disabled={!diagnostics}
            onPress={() => {
              Clipboard.setString(diagnostics);
              Alert.alert('Copied', 'USB diagnostics copied to the system clipboard.');
            }}
          />
        </View>
        <PrimaryButton label="Share diagnostics" disabled={!diagnostics} onPress={share} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {padding: 16, paddingBottom: 40},
  title: {fontSize: 24, fontWeight: '800', marginBottom: 8},
  raw: {fontFamily: 'monospace', fontSize: 12, marginVertical: 16},
  action: {marginBottom: 12},
});
