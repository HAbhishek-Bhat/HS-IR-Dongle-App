import React, {useState} from 'react';
import {Alert, ScrollView, StyleSheet, Switch, Text, View} from 'react-native';
import {useTheme} from '../../theme/ThemeProvider';
import {PrimaryButton} from '../../components/PrimaryButton';
import {useAppStore} from '../../store/appStore';
import {getContainer} from '@di/container';
import {toUserMessage} from '@shared/errors/AppError';

export function SettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);
  const setUser = useAppStore(s => s.setUser);
  const [busy, setBusy] = useState(false);

  const deleteMyData = () => {
    Alert.alert(
      'Delete my data',
      'This permanently deletes local recordings, AED sessions, and signs you out. Remote delete is requested when cloud sync is configured.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const c = getContainer();
                const session = await c.auth.getSession();
                await c.recordings.deleteAll();
                await c.aedSessions.deleteAll();
                if (session) {
                  const token = await c.auth.getAccessToken();
                  if (token && c.settings.cloudProvider !== 'none') {
                    // best-effort remote wipe via sync client path is left to backend contract
                  }
                }
                await c.auth.deleteMyData();
                setUser(null);
                Alert.alert('Deleted', 'Local data removed.');
              } catch (error) {
                Alert.alert('Delete', toUserMessage(error));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{backgroundColor: theme.colors.background}}
      contentContainerStyle={styles.content}
      testID="settings-screen">
      <Text style={[styles.title, {color: theme.colors.text}]}>Settings</Text>

      {__DEV__ ? (
        <View style={[styles.row, {borderColor: theme.colors.border}]}>
          <Text style={[styles.label, {color: theme.colors.text}]}>Mock IR simulator</Text>
          <Switch
            testID="mock-ir-simulator"
            accessibilityLabel="Mock IR simulator"
            value={settings.mockSimulatorEnabled}
            onValueChange={v => updateSettings({mockSimulatorEnabled: v})}
          />
        </View>
      ) : null}
      <View style={[styles.row, {borderColor: theme.colors.border}]}>
        <Text style={[styles.label, {color: theme.colors.text}]}>Haptic feedback</Text>
        <Switch
          value={settings.hapticFeedback}
          onValueChange={v => updateSettings({hapticFeedback: v})}
        />
      </View>
      <View style={[styles.row, {borderColor: theme.colors.border}]}>
        <Text style={[styles.label, {color: theme.colors.text}]}>Auto sync</Text>
        <Switch value={settings.autoSync} onValueChange={v => updateSettings({autoSync: v})} />
      </View>
      <View style={[styles.row, {borderColor: theme.colors.border}]}>
        <Text style={[styles.label, {color: theme.colors.text}]}>Dark mode</Text>
        <Text
          style={{color: theme.colors.primary, fontWeight: '700'}}
          onPress={() => {
            const next =
              settings.darkMode === 'system'
                ? 'light'
                : settings.darkMode === 'light'
                  ? 'dark'
                  : 'system';
            updateSettings({darkMode: next});
          }}
          accessibilityRole="button">
          {settings.darkMode}
        </Text>
      </View>

      <Text style={[styles.meta, {color: theme.colors.textSecondary}]}>
        Cloud provider: {settings.cloudProvider} · {settings.restApiBaseUrl}
      </Text>

      <View style={{height: 24}} />
      <PrimaryButton
        label="Delete my data"
        variant="danger"
        onPress={deleteMyData}
        loading={busy}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {padding: 20, paddingBottom: 40},
  title: {fontSize: 24, fontWeight: '800', marginBottom: 16},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {fontSize: 16, fontWeight: '600'},
  meta: {marginTop: 16, fontSize: 13, lineHeight: 20},
});
