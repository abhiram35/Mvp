import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { useDesign, useTheme } from '../../theme';

/** Hexagon height (pointy top). */
const SIZE = 64;
/** How far the hexagon's top rises above the tab bar. Exported: the tab bar reserves this space. */
export const PLAY_RAISE = 24;
const RAISE = PLAY_RAISE;
/** Ring in the bar colour around the hexagon, so it reads as cut out of the bar. */
const RING = 4;

/** Pointy-top hexagon in a box of `h` (height) centred at `cx`. */
function hexPoints(h: number, cx: number, cy: number): string {
  const r = h / 2;
  const dx = (Math.sqrt(3) / 2) * r;
  return [
    [cx, cy - r],
    [cx + dx, cy - r / 2],
    [cx + dx, cy + r / 2],
    [cx, cy + r],
    [cx - dx, cy + r / 2],
    [cx - dx, cy - r / 2],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
}

/**
 * The raised hexagon PLAY tab (opens the duo finder). Fill is the theme primary; corners
 * follow the theme: hard joins for Protocol / Defuse, softened (round line joins) for ink themes.
 */
export function PlayTabButton({ onPress, onLongPress, accessibilityState, testID, barBg }: BottomTabBarButtonProps & { barBg: string }) {
  const t = useTheme();
  const d = useDesign();
  const soft = d.lang.corner === 'soft';
  const focused = !!accessibilityState?.selected;
  const box = SIZE + RING * 2;
  const c = box / 2;
  const label = t.shape.headingUppercase ? 'PLAY' : 'Play';
  return (
    <View style={s.slot} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Play: find a duo"
        accessibilityState={{ selected: focused }}
        hitSlop={4}
        // The tab bar is RAISE taller than it looks (transparent strip on top), so the whole
        // hexagon sits inside the bar's bounds and is tappable on Android too.
        style={({ pressed }) => [s.button, { top: -RING + 2, width: box, height: box }, pressed && { transform: [{ scale: 0.95 }] }]}
      >
        {({ pressed }) => (
          <>
            <Svg width={box} height={box} style={StyleSheet.absoluteFill}>
              {/* ring in the bar colour */}
              <Polygon points={hexPoints(SIZE + RING * 2 - (soft ? 4 : 0), c, c)} fill={barBg} stroke={barBg} strokeWidth={soft ? 4 : 0} strokeLinejoin="round" />
              <Polygon
                points={hexPoints(SIZE - (soft ? 6 : 0), c, c)}
                fill={pressed ? t.colors.primaryPressed : t.colors.primary}
                stroke={pressed ? t.colors.primaryPressed : t.colors.primary}
                strokeWidth={soft ? 6 : 0}
                strokeLinejoin="round"
              />
              {/* focused: a thin inner line in onPrimary */}
              {focused ? <Polygon points={hexPoints(SIZE - 14, c, c)} fill="none" stroke={t.colors.onPrimary} strokeOpacity={0.45} strokeWidth={1.5} strokeLinejoin={soft ? 'round' : 'miter'} /> : null}
            </Svg>
            <Ionicons name="game-controller" size={24} color={t.colors.onPrimary} />
            <RNText style={[s.label, { color: t.colors.onPrimary, fontFamily: t.fonts.heading, letterSpacing: Math.min(1, t.shape.headingLetterSpacing) }]} numberOfLines={1}>
              {label}
            </RNText>
          </>
        )}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center', overflow: 'visible' },
  button: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, marginTop: -1 },
});
