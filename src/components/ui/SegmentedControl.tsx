// SegmentedControl: switch between 2–4 views of the same screen ("Practice | Tournaments",
// "Friends | Requests | Sent", "Hot | New | Unanswered").
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../features/duo/motion';
import { fontSize, spacing, useDesign, useTheme } from '../../theme';
import { Notch, Text } from './base';
import { Badge } from './decor';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Count shown after the label (e.g. pending requests). 0 / undefined hides it. */
  badge?: number;
  /** Screen reader label; defaults to the label plus the badge count. */
  accessibilityLabel?: string;
}

/**
 * Tabs for one screen. `pill` (default): a tonal track with a sliding selected thumb — ink on
 * light themes, primary on dark themes, notched in Protocol. `underline`: heading-font labels
 * over a hairline with a sliding primary bar (sits flush under a header).
 * The slide respects Reduce Motion. Every segment is ≥ 44pt tall.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  variant = 'pill',
  accessibilityLabel,
  style,
}: {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  variant?: 'pill' | 'underline';
  /** Describes the whole control for screen readers (e.g. "Scrims view"). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const d = useDesign();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const [pos] = useState(() => new Animated.Value(index));
  const first = useRef(true);

  useEffect(() => {
    if (first.current || reduced) {
      first.current = false;
      pos.setValue(index);
      return;
    }
    const anim = Animated.timing(pos, { toValue: index, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [index, reduced, pos]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const n = Math.max(1, options.length);
  const pad = variant === 'pill' ? 3 : 0;
  const segW = width > 0 ? (width - pad * 2) / n : 0;
  const translateX = pos.interpolate({ inputRange: [0, Math.max(1, n - 1)], outputRange: [0, segW * Math.max(1, n - 1)] });

  const pill = variant === 'pill';
  const radius = d.lang.corner === 'soft' ? 999 : t.radius.md;

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        { flexDirection: 'row', position: 'relative' },
        pill ? { backgroundColor: d.track, padding: pad, borderRadius: radius } : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: d.hairline },
        style,
      ]}
    >
      {segW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', left: pad, width: segW, transform: [{ translateX }] },
            pill
              ? { top: pad, bottom: pad, backgroundColor: d.selected.bg, borderRadius: radius === 999 ? 999 : Math.max(0, radius - 1), overflow: 'hidden' }
              : { bottom: -StyleSheet.hairlineWidth, height: 3, backgroundColor: t.colors.primary },
          ]}
        >
          {pill ? <Notch corner="topRight" color={d.track} size={Math.min(8, t.shape.cut)} /> : null}
        </Animated.View>
      ) : null}
      {options.map((o) => {
        const active = o.value === value;
        const color = pill ? (active ? d.selected.fg : t.colors.textMuted) : active ? t.colors.text : t.colors.textMuted;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.accessibilityLabel ?? (o.badge ? `${o.label}, ${o.badge}` : o.label)}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              { flex: 1, minHeight: pill ? 40 : 48, alignItems: 'center', justifyContent: pill ? 'center' : 'flex-end', flexDirection: 'row', gap: spacing.xs },
              pill ? { paddingHorizontal: spacing.sm } : { paddingBottom: spacing.sm + 2 },
              pressed && !active && { opacity: 0.7 },
            ]}
            // Pill segments are 40 tall inside a 3px track: the slop brings the target to 46.
            hitSlop={pill ? { top: 3, bottom: 3 } : undefined}
          >
            <Text
              numberOfLines={1}
              style={{
                color,
                fontFamily: t.fonts.heading,
                fontSize: pill ? fontSize.sm + 1 : fontSize.md,
                letterSpacing: t.shape.headingLetterSpacing,
                textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
              }}
            >
              {o.label}
            </Text>
            {o.badge ? <Badge count={o.badge} tone={pill && active ? 'inverse' : 'primary'} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
