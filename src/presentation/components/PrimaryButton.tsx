import React from 'react';
import {ActivityIndicator, Pressable, Text, StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {useTheme} from '../theme/ThemeProvider';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'danger' | 'ghost';
  accessibilityHint?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  accessibilityHint,
}: Props): React.JSX.Element {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  const bg =
    variant === 'danger'
      ? theme.colors.danger
      : variant === 'ghost'
        ? 'transparent'
        : theme.colors.primary;
  const color =
    variant === 'ghost' ? theme.colors.primary : theme.colors.primaryContrast;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{disabled: !!disabled || !!loading}}
      disabled={disabled || loading}
      onPressIn={() => {
        scale.value = withTiming(0.97, {duration: 80});
      }}
      onPressOut={() => {
        scale.value = withTiming(1, {duration: 120});
      }}
      onPress={onPress}
      style={[
        styles.btn,
        animatedStyle,
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
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: {fontSize: 16, fontWeight: '700'},
});
