import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Notch } from '../../components/ui';
import type { Game } from '../../lib/types';
import { spacing, useTheme } from '../../theme';
import { gameArtUrl } from '../games/art';
import { SPRING } from './motion';

const CARD_W = 126;
const CARD_H = 168;

/** Swipeable row of tall game cards. The selected card springs forward with an accent frame. */
export function GameCarousel({
  games,
  value,
  onChange,
  reduced,
}: {
  games: Game[];
  value: string | null;
  onChange: (id: string) => void;
  reduced: boolean;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={CARD_W + spacing.md}
      decelerationRate="fast"
      contentContainerStyle={styles.row}
      style={styles.scroller}
      accessibilityRole="radiogroup"
      accessibilityLabel="Pick your game"
    >
      {games.map((g, i) => (
        <GameCard key={g.id} game={g} index={i} selected={g.id === value} onPick={onChange} reduced={reduced} />
      ))}
    </ScrollView>
  );
}

const GameCard = memo(function GameCard({
  game,
  index,
  selected,
  onPick,
  reduced,
}: {
  game: Game;
  index: number;
  selected: boolean;
  onPick: (id: string) => void;
  reduced: boolean;
}) {
  const t = useTheme();
  const c = t.colors;
  const lift = useState(() => new Animated.Value(selected ? 1 : 0))[0];
  useEffect(() => {
    if (reduced) lift.setValue(selected ? 1 : 0);
    else Animated.spring(lift, { ...SPRING, toValue: selected ? 1 : 0 }).start();
  }, [selected, reduced, lift]);

  const art = gameArtUrl(game);
  const radius = t.radius.lg;
  const gradId = `duo-card-${game.id}`;
  // Alternate the tint between the theme's primary and info colours so the row has rhythm
  // but never leaves the active theme's palette (works for custom AI themes too).
  const tint = index % 2 === 0 ? c.primary : c.info;

  return (
    <Animated.View
      style={{
        transform: [
          { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
          { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
        ],
        opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0.74, 1] }),
      }}
    >
      <Pressable
        onPress={() => onPick(game.id)}
        accessibilityRole="radio"
        accessibilityState={{ selected, checked: selected }}
        accessibilityLabel={game.name}
        style={[
          styles.card,
          { borderRadius: radius, backgroundColor: c.panel, borderColor: selected ? c.primary : 'transparent' },
        ]}
      >
        {art ? (
          <Image source={{ uri: art }} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
        ) : (
          <RNText style={styles.emoji} accessibilityElementsHidden importantForAccessibility="no">
            {game.emoji}
          </RNText>
        )}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={tint} stopOpacity={0.4} />
              <Stop offset="0.55" stopColor={c.panel} stopOpacity={0.35} />
              <Stop offset="1" stopColor={c.panel} stopOpacity={0.95} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradId})`} />
        </Svg>
        {selected ? (
          <View style={[styles.check, { backgroundColor: c.primary, borderRadius: t.shape.round ? 12 : t.radius.sm }]}>
            <Ionicons name="checkmark" size={15} color={c.onPrimary} />
          </View>
        ) : null}
        <View style={styles.caption}>
          <RNText
            numberOfLines={2}
            style={{
              fontFamily: t.fonts.heading,
              fontSize: 19,
              lineHeight: 20,
              color: c.onPanel,
              letterSpacing: t.shape.headingLetterSpacing,
              textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
            }}
          >
            {game.name}
          </RNText>
        </View>
        <Notch corner="topRight" color={c.bg} size={Math.round(t.shape.cut * 0.8)} />
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  scroller: { marginHorizontal: -spacing.lg },
  row: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  card: { width: CARD_W, height: CARD_H, overflow: 'hidden', borderWidth: 2 },
  emoji: { position: 'absolute', top: 14, right: 12, fontSize: 52, opacity: 0.9 },
  check: { position: 'absolute', top: 10, left: 10, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  caption: { position: 'absolute', left: 10, right: 10, bottom: 10 },
});
