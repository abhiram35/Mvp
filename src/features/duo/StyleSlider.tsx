import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../components/ui';
import type { PlayStyle } from '../../lib/types';
import { makeStyles, spacing, useTheme } from '../../theme';
import { SPRING } from './motion';
import { STYLE_STOPS, styleStopIndex } from './queue';
import { RollingText } from './RollingText';

const KNOB = 28;

/** Chill ↔ Sweaty bar with three stops (casual / any / competitive). The knob springs between stops. */
export function StyleSlider({ value, onChange, reduced }: { value: PlayStyle | null; onChange: (v: PlayStyle | null) => void; reduced: boolean }) {
  const t = useTheme();
  const s = useStyles();
  const [width, setWidth] = useState(0);
  const index = styleStopIndex(value);
  const pos = useState(() => new Animated.Value(index))[0];

  useEffect(() => {
    if (reduced) pos.setValue(index);
    else Animated.spring(pos, { ...SPRING, toValue: index }).start();
  }, [index, reduced, pos]);

  const n = STYLE_STOPS.length;
  // Stops sit at the centre of n equal cells.
  const centers = STYLE_STOPS.map((_, i) => ((i + 0.5) / n) * width);
  const inputRange = STYLE_STOPS.map((_, i) => i);
  const knobX = width > 0 ? pos.interpolate({ inputRange, outputRange: centers.map((x) => x - KNOB / 2) }) : 0;
  const fillScale = width > 0 ? pos.interpolate({ inputRange, outputRange: centers.map((x) => x / width) }) : 0;
  const stop = STYLE_STOPS[index];

  const step = (d: number) => {
    const next = Math.max(0, Math.min(n - 1, index + d));
    if (next !== index) onChange(STYLE_STOPS[next].value);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={s.headRow}>
        <Text variant="label" style={s.kicker}>
          Play style
        </Text>
        <RollingText value={stop.label} reduced={reduced} style={[s.value, { color: t.dark ? t.colors.primary : t.colors.text }]} />
      </View>
      <View
        style={s.track}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Play style"
        accessibilityValue={{ text: stop.a11y }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      >
        <View style={[s.bar, { backgroundColor: t.colors.surfaceRaised }]} />
        <Animated.View style={[s.bar, s.fill, { transform: [{ scaleX: fillScale }] }]}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="duo-style-fill" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={t.colors.primary} stopOpacity={0.25} />
                <Stop offset="1" stopColor={t.colors.primary} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#duo-style-fill)" />
          </Svg>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            s.knob,
            {
              backgroundColor: t.colors.text,
              borderColor: t.colors.primary,
              borderRadius: t.shape.round ? KNOB / 2 : t.radius.sm + 2,
              transform: [{ translateX: knobX }],
            },
          ]}
        />
        <View style={s.cells} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {STYLE_STOPS.map((st, i) => (
            <Pressable key={st.label} style={s.cell} onPress={() => onChange(STYLE_STOPS[i].value)} />
          ))}
        </View>
      </View>
      <View style={s.ends}>
        <Text variant="caption" style={s.end}>
          Chill
        </Text>
        <Text variant="caption" style={s.end}>
          Sweaty
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    kicker: { fontFamily: t.fonts.heading, letterSpacing: 2, textTransform: 'uppercase' },
    value: {
      fontFamily: t.fonts.display,
      fontSize: 22,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    track: { height: 44, justifyContent: 'center' },
    bar: { position: 'absolute', left: 0, right: 0, top: 17, height: 10, borderRadius: 5, overflow: 'hidden' },
    fill: { transformOrigin: 'left' },
    knob: { position: 'absolute', left: 0, top: 8, width: KNOB, height: KNOB, borderWidth: 5 },
    cells: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
    cell: { flex: 1 },
    ends: { flexDirection: 'row', justifyContent: 'space-between' },
    end: { color: t.colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: t.fonts.bodyBold },
  }),
);
