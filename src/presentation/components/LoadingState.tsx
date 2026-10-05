import React from 'react';
import {ActivityIndicator, Text, View, StyleSheet} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';

export function LoadingState({label = 'Loading…'}: {label?: string}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.wrap} accessibilityLabel={label}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={[styles.label, {color: theme.colors.textSecondary}]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  label: {marginTop: 12, fontSize: 15},
});
