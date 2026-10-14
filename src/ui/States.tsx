/** Loading primitive ported from the source design system. */
import React, { useEffect } from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { duration, timing, useReducedMotion } from './motion';
import { colors, radius } from './tokens';
const PULSE_TO = 0.45;
export function Placeholder({
  height,
  width = '100%',
  pulse = true,
  color = colors.surfaceAlt,
  style,
  testID,
}: {
  height: number;
  width?: DimensionValue;
  pulse?: boolean;
  /** The block's grey: the surface a list sits on by default. A block drawn on that surface itself passes a lighter one. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!pulse || reduced) {
      opacity.value = 1;
      return;
    }
    // `true` reverses, so it breathes rather than snapping back to full at the loop boundary.
    opacity.value = withRepeat(withTiming(PULSE_TO, timing(duration.pulse, reduced)), -1, true);
  }, [pulse, reduced, opacity]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID={testID}
      accessibilityLabel="Loading"
      style={[
        { height, width, borderRadius: radius.square, backgroundColor: color },
        style,
        anim,
      ]}
    />
  );
}

