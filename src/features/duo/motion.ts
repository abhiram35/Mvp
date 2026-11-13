import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/** True when the player turned on "Reduce motion" (iOS) / "Remove animations" (Android). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => active && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => setReduced(v));
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** True while a screen reader (VoiceOver / TalkBack) is on. */
export function useScreenReaderEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => active && setOn(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (v: boolean) => setOn(v));
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return on;
}

/**
 * A 0→1 value that loops linearly while `running`, and PAUSES in place (instead of resetting)
 * when it stops, resuming from where it was. For marquees that pause on touch / blur.
 */
export function usePausableLoop(duration: number, running: boolean) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!running) {
      v.stopAnimation();
      return;
    }
    let cancelled = false;
    let anim: Animated.CompositeAnimation | null = null;
    const run = (from: number) => {
      if (cancelled) return;
      v.setValue(from);
      anim = Animated.timing(v, { toValue: 1, duration: Math.max(1, Math.round((1 - from) * duration)), easing: Easing.linear, useNativeDriver: true });
      anim.start(({ finished }) => {
        if (finished) run(0);
      });
    };
    v.stopAnimation((value) => run(value >= 1 || !Number.isFinite(value) ? 0 : value));
    return () => {
      cancelled = true;
      anim?.stop();
    };
  }, [v, duration, running]);
  return v;
}

/** Springy settle used for selections (slight overshoot, ~350 ms). */
export const SPRING = { friction: 6, tension: 90, useNativeDriver: true } as const;

/**
 * A 0→1 value that loops forever (radar sweep, shine, pulses). Stays at `rest` when reduced
 * motion is on or `enabled` is false.
 */
export function useLoop(duration: number, { enabled = true, reduced = false, rest = 0, easing = Easing.linear } = {}) {
  const v = useState(() => new Animated.Value(rest))[0];
  useEffect(() => {
    if (!enabled || reduced) {
      v.setValue(rest);
      return;
    }
    v.setValue(0);
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, duration, enabled, reduced, rest, easing]);
  return v;
}

/** A 0→1 value that plays once on mount (or whenever `key` changes). Jumps to 1 under reduced motion. */
export function useEntrance(key: unknown, { duration = 380, delay = 0, reduced = false } = {}) {
  const v = useState(() => new Animated.Value(reduced ? 1 : 0))[0];
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, key, duration, delay, reduced]);
  return v;
}
