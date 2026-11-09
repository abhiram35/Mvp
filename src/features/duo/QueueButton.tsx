import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Notch } from '../../components/ui';
import { useTheme } from '../../theme';
import { useLoop } from './motion';

const SHINE_EASING = Easing.inOut(Easing.quad);

/** The big "QUEUE UP" call to action, with a light sweep that runs across it every few seconds. */
export function QueueButton({ title, onPress, disabled, reduced }: { title: string; onPress: () => void; disabled?: boolean; reduced: boolean }) {
  const t = useTheme();
  const c = t.colors;
  const [w, setW] = useState(0);
  const shine = useLoop(3000, { enabled: !disabled && w > 0, reduced, easing: SHINE_EASING });
  const press = useState(() => new Animated.Value(1))[0];
  const to = (v: number) => Animated.spring(press, { toValue: v, friction: 7, tension: 200, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale: press }] }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => !reduced && to(0.97)}
        onPressOut={() => to(1)}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !!disabled }}
        style={[styles.btn, { backgroundColor: c.primary, borderRadius: t.radius.md, opacity: disabled ? 0.5 : 1 }]}
      >
        {!reduced && !disabled && w > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shine,
              {
                transform: [
                  // Sweep across during the first 55% of each loop, then rest off-screen.
                  { translateX: shine.interpolate({ inputRange: [0, 0.55, 1], outputRange: [-w * 0.4, w * 1.2, w * 1.2] }) },
                  { skewX: '-20deg' },
                ],
              },
            ]}
          />
        ) : null}
        <View style={styles.row}>
          <Ionicons name="locate" size={24} color={c.onPrimary} />
          <RNText
            style={{
              fontFamily: t.fonts.display,
              fontSize: 24,
              color: c.onPrimary,
              letterSpacing: Math.max(2, t.shape.headingLetterSpacing),
              textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
            }}
          >
            {title}
          </RNText>
        </View>
        <Notch corner="topRight" color={c.bg} />
        <Notch corner="bottomLeft" color={c.bg} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 60, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shine: { position: 'absolute', top: -10, bottom: -10, left: 0, width: 60, backgroundColor: 'rgba(255,255,255,0.28)' },
});
