import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from '../../components/ui';
import { spacing, useTheme } from '../../theme';
import { useLoop } from './motion';
import { formatQueueTime } from './queue';

const SIZE = 250;
const R = SIZE / 2;
const SWEEP_MS = 2200;
/** Blips: angle (deg, clockwise from 12 o'clock) and distance from the centre (0–1). */
const BLIPS = [
  { a: 40, d: 0.62 },
  { a: 110, d: 0.4 },
  { a: 165, d: 0.78 },
  { a: 230, d: 0.55 },
  { a: 310, d: 0.7 },
];

/** Blip opacity peaks as the sweep's leading edge passes it, then fades over most of a turn. */
function blipRange(angle: number) {
  const p = angle / 360;
  const peak = Math.min(0.999, p + 0.03);
  const fade = 0.6;
  const at = (v: number) => {
    const since = (v - peak + 1) % 1; // fraction of a turn since the peak
    return Math.max(0.12, 1 - (since / fade) * 0.88);
  };
  return { inputRange: [0, p, peak, 1], outputRange: [at(0), 0.12, 1, at(0.9999)] };
}

/** Wedge from 12 o'clock back 90° (anticlockwise): the fading trail behind the sweep's leading edge. */
const WEDGE = `M ${R} ${R} L ${R} 0 A ${R} ${R} 0 0 0 0 ${R} Z`;

/** Ticking mm:ss. Its own component so the once-a-second re-render doesn't touch the radar. */
function QueueTimer() {
  const t = useTheme();
  // Wall-clock based, so it stays right after the app was in the background.
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const secs = Math.floor((now - started) / 1000);
  return (
    <RNText
      style={{ fontFamily: t.fonts.display, fontSize: 64, lineHeight: 70, color: t.colors.text, fontVariant: ['tabular-nums'] }}
      accessibilityLabel={`Searching for ${secs} seconds`}
    >
      {formatQueueTime(secs)}
    </RNText>
  );
}

/** Full-screen "searching" state: timer, rotating radar and a cancel button. */
export function RadarSearch({ summary, onCancel, reduced }: { summary: string; onCancel: () => void; reduced: boolean }) {
  const t = useTheme();
  const c = t.colors;
  const sweep = useLoop(SWEEP_MS, { reduced });
  const breathe = useLoop(1500, { reduced, rest: 0.5 });
  const rotate = useMemo(() => sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }), [sweep]);
  const blipOpacity = useMemo(() => BLIPS.map((b) => sweep.interpolate(blipRange(b.a))), [sweep]);
  const breatheOpacity = useMemo(() => breathe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 1, 0.45] }), [breathe]);

  return (
    <View style={[styles.fill, { backgroundColor: c.bg }]} accessibilityViewIsModal>
      <View style={{ alignItems: 'center' }}>
        <Animated.Text
          style={{
            fontFamily: t.fonts.heading,
            fontSize: 16,
            letterSpacing: 6,
            color: t.dark ? c.primary : c.text,
            opacity: breatheOpacity,
          }}
          accessibilityRole="header"
        >
          SEARCHING
        </Animated.Text>
        <QueueTimer />
      </View>

      <View style={{ width: SIZE, height: SIZE }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
          {[1, 0.66, 0.33].map((k) => (
            <Circle key={k} cx={R} cy={R} r={R * k - 1} stroke={c.border} strokeWidth={1} fill="none" />
          ))}
          <Line x1={R} y1={0} x2={R} y2={SIZE} stroke={c.border} strokeWidth={1} />
          <Line x1={0} y1={R} x2={SIZE} y2={R} stroke={c.border} strokeWidth={1} />
        </Svg>
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}
        >
          <Svg width={SIZE} height={SIZE}>
            <Defs>
              <LinearGradient id="duo-sweep" x1="1" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.primary} stopOpacity={0.55} />
                <Stop offset="1" stopColor={c.primary} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={WEDGE} fill="url(#duo-sweep)" />
            <Line x1={R} y1={R} x2={R} y2={0} stroke={c.primary} strokeWidth={2} />
          </Svg>
        </Animated.View>
        {BLIPS.map((b, i) => {
          const rad = (b.a * Math.PI) / 180;
          const x = R + Math.sin(rad) * R * b.d;
          const y = R - Math.cos(rad) * R * b.d;
          return (
            <Animated.View
              key={b.a}
              style={[
                styles.blip,
                {
                  left: x - 5,
                  top: y - 5,
                  backgroundColor: c.primary,
                  borderRadius: t.shape.round ? 5 : 1,
                  opacity: reduced ? 0.8 : blipOpacity[i],
                },
              ]}
            />
          );
        })}
        <View style={[styles.center, { backgroundColor: c.text, borderColor: c.primary }]} />
      </View>

      <Text muted style={{ textAlign: 'center', maxWidth: 300 }}>
        {summary}
      </Text>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel search"
        style={({ pressed }) => [styles.cancel, { borderColor: c.border, borderRadius: t.radius.md }, pressed && { backgroundColor: c.surfaceRaised }]}
      >
        <RNText style={{ fontFamily: t.fonts.heading, fontSize: 18, letterSpacing: 3, color: c.text }}>CANCEL</RNText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  blip: { position: 'absolute', width: 10, height: 10 },
  center: { position: 'absolute', left: R - 8, top: R - 8, width: 16, height: 16, borderRadius: 8, borderWidth: 4 },
  cancel: { minHeight: 48, paddingHorizontal: spacing.xxl, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
