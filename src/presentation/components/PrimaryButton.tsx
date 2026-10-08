import React from 'react';
import {ActivityIndicator, Text, StyleSheet} from 'react-native';
import {TapSurface} from './TapSurface';
import {useTheme} from '../theme/ThemeProvider';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'danger' | 'ghost';
  accessibilityHint?: string;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  accessibilityHint,
}: Props): React.JSX.Element {
  const theme = useTheme();

  const bg =
    variant === 'danger'
      ? theme.colors.danger
      : variant === 'ghost'
        ? 'transparent'
        : theme.colors.primary;
  const color = variant === 'ghost' ? theme.colors.primary : theme.colors.primaryContrast;

  return (
    <TapSurface
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{disabled: !!disabled || !!loading}}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.45 : 1,
          borderWidth: variant === 'ghost' ? 1 : 0,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.label, {color}]}>{label}</Text>
      )}
    </TapSurface>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: {fontSize: 16, fontWeight: '700'},
});
