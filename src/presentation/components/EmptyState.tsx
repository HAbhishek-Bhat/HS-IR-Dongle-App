import React from 'react';
import {Text, View, StyleSheet} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';

interface Props {
  title: string;
  message: string;
}

export function EmptyState({title, message}: Props): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="text">
      <Text style={[styles.title, {color: theme.colors.text}]}>{title}</Text>
      <Text style={[styles.message, {color: theme.colors.textSecondary}]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {padding: 24, alignItems: 'center'},
  title: {fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center'},
  message: {fontSize: 15, textAlign: 'center', lineHeight: 22},
});
