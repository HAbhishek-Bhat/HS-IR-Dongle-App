import React from 'react';
import {Pressable, Text, View, StyleSheet} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import {useTheme} from '../theme/ThemeProvider';
import {shadows} from '../theme/tokens';

interface Props {
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export function SectionCard({
  title,
  description,
  onPress,
  disabled,
  testID,
}: Props): React.JSX.Element {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(350)}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{disabled: !!disabled}}
        disabled={disabled}
        onPress={onPress}
        style={[
          styles.card,
          shadows.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: disabled ? 0.5 : 1,
          },
        ]}>
        <View style={[styles.accent, {backgroundColor: theme.colors.accent}]} />
        <Text style={[styles.title, {color: theme.colors.text}]}>{title}</Text>
        <Text style={[styles.desc, {color: theme.colors.textSecondary}]}>{description}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  accent: {position: 'absolute', left: 0, top: 0, bottom: 0, width: 5},
  title: {fontSize: 20, fontWeight: '700', marginBottom: 8},
  desc: {fontSize: 15, lineHeight: 22},
});
