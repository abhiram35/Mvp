import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Avatar, Button, Text } from '../../components/ui';
import type { Profile, SquadmateMatch } from '../../lib/types';
import { makeStyles, spacing, useTheme } from '../../theme';
import { useEntrance } from './motion';
import { matchReasons } from './queue';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 96;
const RING_R = 40;
const CIRC = 2 * Math.PI * RING_R;

/** Ring that fills to the match percentage. */
function MatchRing({ pct: raw, reduced, playKey }: { pct: number; reduced: boolean; playKey: number }) {
  const t = useTheme();
  const pct = Math.round(Math.max(0, Math.min(100, raw)));
  const target = CIRC * (1 - pct / 100);
  const off = useState(() => new Animated.Value(reduced ? target : CIRC))[0];
  useEffect(() => {
    if (reduced) {
      off.setValue(target);
      return;
    }
    off.setValue(CIRC);
    const a = Animated.timing(off, { toValue: target, duration: 1000, delay: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [off, target, reduced, playKey]);
  return (
    <View style={{ width: RING, height: RING }} accessible accessibilityLabel={`${pct}% match`}>
      <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={t.colors.surfaceRaised} strokeWidth={8} fill="none" />
        <AnimatedCircle
          cx={RING / 2}
          cy={RING / 2}
          r={RING_R}
          stroke={t.colors.primary}
          strokeWidth={8}
          fill="none"
          strokeLinecap={t.shape.round ? 'round' : 'butt'}
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={off}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <RNText style={{ fontFamily: t.fonts.display, fontSize: 26, color: t.colors.text }}>{pct}%</RNText>
        <RNText style={{ fontFamily: t.fonts.bodyBold, fontSize: 10, letterSpacing: 1.5, color: t.colors.textMuted }}>MATCH</RNText>
      </View>
    </View>
  );
}

function Reason({ text, index, reduced, playKey }: { text: string; index: number; reduced: boolean; playKey: number }) {
  const t = useTheme();
  const v = useEntrance(playKey, { duration: 320, delay: 700 + index * 110, reduced });
  return (
    <Animated.View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      <Ionicons name="checkmark" size={16} color={t.dark ? t.colors.primary : t.colors.text} />
      <Text style={{ flexShrink: 1 }} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

/** "DUO FOUND": you + the matched player side by side, the match ring and why you were matched. */
export function DuoReveal({
  me,
  match,
  index,
  total,
  revealKey,
  gameName,
  onMessage,
  onProfile,
  onNext,
  onBack,
  onSeeAll,
  hidden,
  reduced,
}: {
  me: Profile | null;
  match: SquadmateMatch;
  index: number;
  total: number;
  revealKey: number;
  gameName: string;
  onMessage: () => void;
  onProfile: () => void;
  onNext: () => void;
  onBack: () => void;
  onSeeAll: () => void;
  /** Covered by another view (the "All results" list): hide from screen readers. */
  hidden?: boolean;
  reduced: boolean;
}) {
  const t = useTheme();
  const c = t.colors;
  const s = useStyles();
  const first = useState(() => revealKey)[0];
  // Flash + "DUO FOUND" pop play once, when the reveal opens; the player card re-animates on Next.
  const flash = useEntrance(first, { duration: 700, reduced });
  const pop = useEntrance(first, { duration: 560, reduced });
  const card = useEntrance(revealKey, { duration: 480, delay: revealKey === first ? 250 : 0, reduced });

  const name = match.profile.display_name || match.profile.username;
  const myName = me?.display_name || me?.username || 'You';
  const reasons = matchReasons(match, { gameName, myRegion: me?.region ?? null });

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}
      accessibilityViewIsModal={!hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={!!hidden}
    >
      {!reduced ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: c.primary, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0], extrapolate: 'clamp' }) }]}
        />
      ) : null}
      <ScrollView contentContainerStyle={s.content}>
        <Animated.View
          style={{
            alignItems: 'center',
            opacity: pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          }}
          accessibilityLiveRegion="polite"
        >
          <RNText style={s.banner} accessibilityRole="header">
            DUO FOUND
          </RNText>
          <Text variant="label">
            {gameName} · player {index + 1} of {total}
          </Text>
        </Animated.View>

        <View style={s.slots}>
          <View style={[s.slot, { borderColor: c.border }]}>
            <Avatar uri={me?.avatar_url} name={myName} size={72} highlight backdrop={c.surface} />
            <RNText style={s.slotName} numberOfLines={1}>
              You
            </RNText>
            <Text variant="caption" numberOfLines={1}>
              @{me?.username ?? 'you'}
            </Text>
          </View>
          <RNText style={[s.plus, { color: t.dark ? c.primary : c.text }]} accessibilityElementsHidden>
            +
          </RNText>
          <Animated.View
            style={[
              s.slot,
              { borderColor: c.primary, borderWidth: 2 },
              {
                opacity: card.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
                transform: [
                  { translateX: card.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }) },
                  { rotate: card.interpolate({ inputRange: [0, 1], outputRange: ['4deg', '0deg'] }) },
                ],
              },
            ]}
          >
            <Pressable onPress={onProfile} accessibilityRole="button" accessibilityLabel={`${name}. View profile`} style={s.slotPress}>
              <Avatar uri={match.profile.avatar_url} name={name} size={72} backdrop={c.surface} />
              <RNText style={s.slotName} numberOfLines={1}>
                {name}
              </RNText>
              <Text variant="caption" numberOfLines={1}>
                @{match.profile.username}
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        <View style={s.whyRow}>
          <MatchRing pct={match.match_score} reduced={reduced} playKey={revealKey} />
          <View style={{ flex: 1, gap: 7 }}>
            {reasons.map((r, i) => (
              <Reason key={`${revealKey}-${r}`} text={r} index={i} reduced={reduced} playKey={revealKey} />
            ))}
          </View>
        </View>

        <View style={s.actions}>
          <Button title={`Message ${name}`} icon="chatbubble-ellipses" onPress={onMessage} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {total > 1 ? <Button title="Next player" variant="secondary" icon="arrow-forward" onPress={onNext} style={{ flex: 1 }} /> : null}
            <Button title={total > 1 ? `All ${total}` : 'Profile'} variant="secondary" onPress={total > 1 ? onSeeAll : onProfile} style={{ flex: 1 }} />
          </View>
          <Button title="Back to lobby" variant="ghost" onPress={onBack} />
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    content: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.xl },
    banner: {
      fontFamily: t.fonts.display,
      fontSize: 52,
      lineHeight: 56,
      color: t.dark ? t.colors.primary : t.colors.text,
      letterSpacing: 2,
      textAlign: 'center',
    },
    slots: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    slot: {
      flex: 1,
      minHeight: 190,
      borderRadius: t.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: t.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.md,
    },
    slotPress: { alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
    slotName: {
      fontFamily: t.fonts.heading,
      fontSize: 20,
      color: t.colors.text,
      letterSpacing: t.shape.headingLetterSpacing,
    },
    plus: { fontFamily: t.fonts.display, fontSize: 26 },
    whyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    actions: { gap: spacing.sm },
  }),
);
