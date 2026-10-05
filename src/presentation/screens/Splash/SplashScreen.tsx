import React, {useEffect} from 'react';
import {StyleSheet, Text} from 'react-native';
import Animated, {FadeIn, FadeOut} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useTheme} from '../../theme/ThemeProvider';
import {useAppStore} from '../../store/appStore';
import {getContainer} from '@di/container';
import type {RootStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export function SplashScreen({navigation}: Props): React.JSX.Element {
  const theme = useTheme();
  const setHydrated = useAppStore(s => s.setHydrated);
  const setOnboardingComplete = useAppStore(s => s.setOnboardingComplete);
  const setUser = useAppStore(s => s.setUser);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const onboarding = await AsyncStorage.getItem('hs.onboarding.complete');
      const session = await getContainer().auth.getSession().catch(() => null);
      if (cancelled) return;
      setOnboardingComplete(onboarding === '1');
      setUser(session?.user ?? null);
      setHydrated(true);
      if (onboarding !== '1') {
        navigation.replace('Onboarding');
      } else if (!session?.user?.consentAcceptedAt) {
        navigation.replace('Privacy');
      } else {
        navigation.replace('Main');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigation, setHydrated, setOnboardingComplete, setUser]);

  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      style={[styles.wrap, {backgroundColor: theme.colors.primary}]}
      testID="splash-screen">
      <Text style={styles.brand}>HS IR Capture</Text>
      <Text style={styles.tag}>Professional IR & AED data logging</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  brand: {color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: -0.5},
  tag: {color: '#D1FAE5', marginTop: 10, fontSize: 15},
});
