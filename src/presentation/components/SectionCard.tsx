import React from 'react';
import {Text, View, StyleSheet} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import {useTheme} from '../theme/ThemeProvider';
import {shadows} from '../theme/tokens';
import {TapSurface} from './TapSurface';

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
      <TapSurface
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title}
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
        <View style={styles.heading}>
          <Text style={[styles.title, {color: theme.colors.text}]}>{title}</Text>
          <Text accessibilityElementsHidden style={[styles.arrow, {color: theme.colors.primary}]}>
            {'>'}
          </Text>
        </View>
        <Text style={[styles.desc, {color: theme.colors.textSecondary}]}>{description}</Text>
      </TapSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  accent: {position: 'absolute', left: 0, top: 0, bottom: 0, width: 5},
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {fontSize: 20, fontWeight: '700', flex: 1},
  arrow: {fontSize: 22, fontWeight: '700'},
  desc: {fontSize: 15, lineHeight: 22},
});
