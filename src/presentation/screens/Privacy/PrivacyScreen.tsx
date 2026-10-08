import React, {useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useTheme} from '../../theme/ThemeProvider';
import {PrimaryButton} from '../../components/PrimaryButton';
import {getContainer} from '@di/container';
import {useAppStore} from '../../store/appStore';
import {toUserMessage} from '@shared/errors/AppError';
import type {RootStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Privacy'>;

export function PrivacyScreen({navigation}: Props): React.JSX.Element {
  const theme = useTheme();
  const user = useAppStore(s => s.user);
  const setUser = useAppStore(s => s.setUser);
  const [loading, setLoading] = useState(false);
  const privacyVersion = getContainer().auth.getPrivacyVersion();

  const accept = async () => {
    if (!user) {
      navigation.replace('Onboarding');
      return;
    }
    setLoading(true);
    try {
      const updated = await getContainer().auth.acceptConsent(user.id);
      setUser(updated);
      navigation.replace('Main');
    } catch (error) {
      Alert.alert('Privacy', toUserMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.wrap, {backgroundColor: theme.colors.background}]}>
      <Text style={[styles.title, {color: theme.colors.text}]}>Privacy & Consent</Text>
      <View
        style={[
          styles.card,
          {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
        ]}>
        <Text style={[styles.body, {color: theme.colors.textSecondary}]}>
          HS IR Capture stores IR and AED device event data locally in an encrypted database on this
          device. When cloud sync is enabled, data is transmitted over TLS to your configured
          backend. We design for HIPAA/GDPR principles: minimize data, no PII in diagnostic logs,
          access control via authentication, and a delete-my-data control in Settings.
        </Text>
        <Text style={[styles.body, {color: theme.colors.textSecondary, marginTop: 12}]}>
          AED transmissions may include health-related operational events. Do not include patient
          identifiers in notes or filenames. You may export or permanently delete your data at any
          time.
        </Text>
        <Text style={[styles.version, {color: theme.colors.text}]}>
          Policy version: {privacyVersion}
        </Text>
      </View>
      <PrimaryButton
        label="I understand and consent"
        onPress={() => void accept()}
        loading={loading}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {padding: 24, flexGrow: 1},
  title: {fontSize: 26, fontWeight: '800', marginBottom: 16},
  card: {borderWidth: 1, borderRadius: 4, padding: 16, marginBottom: 24},
  body: {fontSize: 15, lineHeight: 22},
  version: {marginTop: 16, fontWeight: '700'},
});
