import React, {useEffect} from 'react';
import {Pressable, type PressableProps, type StyleProp, type ViewStyle} from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function TapSurface({
  style,
  children,
  disabled,
  onPressIn,
  onPressOut,
  ...props
}: Props): React.JSX.Element {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  useEffect(() => {
    if (disabled) scale.value = 1;
  }, [disabled, scale]);

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={event => {
        scale.value = withTiming(0.985, {duration: 110, reduceMotion: ReduceMotion.System});
        onPressIn?.(event);
      }}
      onPressOut={event => {
        scale.value = withTiming(1, {duration: 180, reduceMotion: ReduceMotion.System});
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}
