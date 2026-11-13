// Right action rail buttons over the (dark) clip media.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import type { IconName } from '../../components/ui';
import { useDesign, useTheme } from '../../theme';
import { MEDIA_CONTROL, ON_MEDIA, TEXT_SHADOW } from './ClipMedia';

export function RailButton({
  icon,
  label,
  count,
  onPress,
  active,
  accessibilityLabel,
  accessibilityHint,
  pop,
  reduced,
}: {
  icon: IconName;
  /** Text under the icon (a count or a word). */
  label?: string;
  count?: string;
  onPress: () => void;
  /** Filled with the theme's primary (my GG). */
  active?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Changes to this value (when it becomes true) play the pop animation. */
  pop?: boolean;
  reduced?: boolean;
}) {
  const t = useTheme();
  const d = useDesign();
  const scale = useState(() => new Animated.Value(1))[0];
  const burst = useState(() => new Animated.Value(0))[0];
  const prev = useRef(pop);

  useEffect(() => {
    const was = prev.current;
    prev.current = pop;
    if (!pop || was || reduced) return;
    scale.setValue(0.82);
    burst.setValue(0);
    const a = Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.28, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      ]),
      Animated.timing(burst, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [pop, reduced, scale, burst]);

  const radius = d.lang.corner === 'soft' ? 26 : Math.max(t.radius.md, 4);
  const fg = active ? t.colors.onPrimary : ON_MEDIA;
  const text = count ?? label;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      hitSlop={4}
      style={styles.wrap}
    >
      {({ pressed }) => (
        <>
          <View style={styles.iconBox}>
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: radius,
                  borderWidth: 2,
                  borderColor: t.colors.primary,
                  opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }),
                  transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.icon,
                {
                  borderRadius: radius,
                  backgroundColor: active ? (pressed ? t.colors.primaryPressed : t.colors.primary) : pressed ? 'rgba(0,0,0,0.7)' : MEDIA_CONTROL,
                  transform: [{ scale }],
                },
              ]}
            >
              <Ionicons name={icon} size={26} color={fg} />
            </Animated.View>
          </View>
          {text ? (
            <RNText style={[styles.label, { fontFamily: t.fonts.bodyBold }]} numberOfLines={1}>
              {text}
            </RNText>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', minWidth: 56, minHeight: 56 },
  iconBox: { width: 52, height: 52 },
  icon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  label: { color: ON_MEDIA, fontSize: 13, marginTop: 4, ...TEXT_SHADOW },
});
