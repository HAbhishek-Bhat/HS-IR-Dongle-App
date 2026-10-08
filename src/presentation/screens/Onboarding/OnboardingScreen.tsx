import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, View, TextInput, Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useTheme} from '../../theme/ThemeProvider';
import {PrimaryButton} from '../../components/PrimaryButton';
import {getContainer} from '@di/container';
import {toUserMessage} from '@shared/errors/AppError';
import {useAppStore} from '../../store/appStore';
import type {RootStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export function OnboardingScreen({navigation}: Props): React.JSX.Element {
  const theme = useTheme();
  const setUser = useAppStore(s => s.setUser);
  const setOnboardingComplete = useAppStore(s => s.setOnboardingComplete);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const complete = async () => {
    setLoading(true);
    try {
      const session = await getContainer().auth.signIn(email, password);
      setUser(session.user);
      await AsyncStorage.setItem('hs.onboarding.complete', '1');
      setOnboardingComplete(true);
      navigation.replace('Privacy');
    } catch (error) {
      Alert.alert('Sign in', toUserMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.wrap, {backgroundColor: theme.colors.background}]}
      keyboardShouldPersistTaps="handled"
      testID="onboarding-screen">
      <Text style={[styles.title, {color: theme.colors.text}]}>Welcome to HS IR Capture</Text>
      <Text style={[styles.body, {color: theme.colors.textSecondary}]}>
        Capture IR signals from a USB-C dongle, retrieve AED event logs, and sync securely. This app
        may process health-related device data — review privacy before continuing.
      </Text>

      <View style={styles.block}>
        <Text style={[styles.label, {color: theme.colors.text}]}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={[
            styles.input,
            {
              borderColor: theme.colors.border,
              color: theme.colors.text,
              backgroundColor: theme.colors.surface,
            },
          ]}
        />
        <Text style={[styles.label, {color: theme.colors.text}]}>Password</Text>
        <TextInput
          accessibilityLabel="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={[
            styles.input,
            {
              borderColor: theme.colors.border,
              color: theme.colors.text,
              backgroundColor: theme.colors.surface,
            },
          ]}
        />
      </View>

      <PrimaryButton label="Continue" onPress={() => void complete()} loading={loading} />
      <Text style={[styles.hint, {color: theme.colors.textSecondary}]}>
        Local demo auth is enabled. Replace with SSO in production deployments.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {flexGrow: 1, padding: 24, justifyContent: 'center'},
  title: {fontSize: 28, fontWeight: '800', marginBottom: 12},
  body: {fontSize: 16, lineHeight: 24, marginBottom: 24},
  block: {marginBottom: 20},
  label: {fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12},
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  hint: {marginTop: 16, fontSize: 13, textAlign: 'center'},
});
