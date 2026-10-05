import React, {useMemo} from 'react';
import {View, StyleSheet} from 'react-native';
import Svg, {Polyline} from 'react-native-svg';
import {useTheme} from '../theme/ThemeProvider';

interface Props {
  timingsUs: number[];
  height?: number;
}

/** Renders a live pulse/space waveform from µs timings. */
export function WaveformView({timingsUs, height = 120}: Props): React.JSX.Element {
  const theme = useTheme();
  const width = 340;

  const points = useMemo(() => {
    if (timingsUs.length === 0) {
      return `0,${height / 2} ${width},${height / 2}`;
    }
    const abs = timingsUs.map(Math.abs);
    const total = abs.reduce((a, b) => a + b, 0) || 1;
    let x = 0;
    const coords: string[] = [];
    let level = 1;
    coords.push(`0,${height * 0.75}`);
    timingsUs.forEach((t, i) => {
      const w = (Math.abs(t) / total) * width;
      const y = t > 0 ? height * 0.2 : height * 0.75;
      coords.push(`${x},${y}`);
      x += w;
      coords.push(`${x},${y}`);
      level = t > 0 ? 0 : 1;
      if (i === timingsUs.length - 1) {
        coords.push(`${x},${height * (level === 1 ? 0.75 : 0.2)}`);
      }
    });
    return coords.join(' ');
  }, [timingsUs, height]);

  return (
    <View
      style={[styles.wrap, {backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border}]}
      accessibilityLabel="Live IR waveform">
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polyline
          points={points}
          fill="none"
          stroke={theme.colors.accent}
          strokeWidth={2}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingVertical: 8,
  },
});
