import React from 'react';
import {Text, View, StyleSheet} from 'react-native';
import {TapSurface} from './TapSurface';
import {useTheme} from '../theme/ThemeProvider';

interface Props {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({message, onRetry}: Props): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, {color: theme.colors.danger}]}>Something went wrong</Text>
      <Text style={[styles.message, {color: theme.colors.textSecondary}]}>{message}</Text>
      {onRetry ? (
        <TapSurface
          accessibilityRole="button"
          onPress={onRetry}
          style={[styles.btn, {backgroundColor: theme.colors.primary}]}>
          <Text style={{color: theme.colors.primaryContrast, fontWeight: '700'}}>Retry</Text>
        </TapSurface>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {padding: 24, alignItems: 'center'},
  title: {fontSize: 18, fontWeight: '700', marginBottom: 8},
  message: {fontSize: 15, textAlign: 'center', marginBottom: 16},
  btn: {paddingHorizontal: 16, paddingVertical: 12, borderRadius: 4},
});
