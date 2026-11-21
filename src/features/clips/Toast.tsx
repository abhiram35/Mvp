// A small themed toast (confirmation line) for the clips screens.
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { Text, type IconName } from '../../components/ui';
import { useReducedMotion } from '../duo/motion';
import { spacing, useDesign, useTheme } from '../../theme';

export interface ToastMessage {
  text: string;
  icon?: IconName;
  tone?: 'ok' | 'error';
}

/** `show(msg)` + the node to render (absolutely positioned at the top of its parent). */
export function useToast(top = spacing.md) {
  const [msg, setMsg] = useState<(ToastMessage & { key: number }) | null>(null);
  const counter = useRef(0);
  const show = useCallback((m: ToastMessage) => {
    counter.current += 1;
    setMsg({ ...m, key: counter.current });
    AccessibilityInfo.announceForAccessibility(m.text);
  }, []);
  const hide = useCallback(() => setMsg(null), []);
  const node = msg ? <Toast key={msg.key} message={msg} onHide={hide} top={top} /> : null;
  return { show, node };
}

function Toast({ message, onHide, top }: { message: ToastMessage; onHide: () => void; top: number }) {
  const t = useTheme();
  const d = useDesign();
  const reduced = useReducedMotion();
  const v = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    const seq = Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: reduced ? 0 : 180, useNativeDriver: true }),
      Animated.delay(2400),
      Animated.timing(v, { toValue: 0, duration: reduced ? 0 : 220, useNativeDriver: true }),
    ]);
    seq.start(({ finished }) => finished && onHide());
    return () => seq.stop();
  }, [v, reduced, onHide]);

  const error = message.tone === 'error';
  return (
    <View pointerEvents="none" style={[styles.host, { top }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          {
            backgroundColor: d.surface.high,
            borderRadius: d.lang.corner === 'soft' ? t.radius.lg : t.radius.md,
            borderLeftColor: error ? t.colors.danger : t.colors.primary,
            opacity: v,
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : -12, 0] }) }],
          },
        ]}
      >
        <Ionicons
          name={message.icon ?? (error ? 'alert-circle' : 'checkmark-circle')}
          size={20}
          color={error ? t.colors.danger : d.primaryText}
          style={{ marginRight: spacing.sm }}
        />
        <Text variant="strong" style={{ flexShrink: 1 }}>
          {message.text}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center', zIndex: 10 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderLeftWidth: 3,
    maxWidth: 420,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
