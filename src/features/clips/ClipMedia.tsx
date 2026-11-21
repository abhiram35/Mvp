// The clip's media area: always dark (it's video), whatever the theme.
// YouTube → the real thumbnail; others → a theme-derived game-art gradient with a big title.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { GradientFill } from '../../components/ui';
import type { Game } from '../../lib/types';
import { useTheme } from '../../theme';
import { artGradient, mediaBase, PLATFORM_LABELS, thumbnailFor, watchLabel } from './logic';
import type { Clip } from './types';

/** Text colours over media (with the scrims below they stay ≥ 4.5:1). */
export const ON_MEDIA = '#FFFFFF';
export const ON_MEDIA_MUTED = '#E4E4E7';
/** Translucent control fill over media. */
export const MEDIA_CONTROL = 'rgba(0,0,0,0.48)';
export const MEDIA_CHIP = 'rgba(255,255,255,0.16)';
/** Shadow behind text over a busy thumbnail (on top of the scrim). */
export const TEXT_SHADOW = { textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 } as const;

/** The dark base + accent options for game art, derived from the active theme. */
export function useMediaPalette() {
  const t = useTheme();
  return useMemo(() => {
    const base = mediaBase(t.colors.panel);
    return { base, accents: [t.colors.primary, t.colors.info, t.colors.accent, t.colors.warning] as const };
  }, [t]);
}

type MediaClip = Pick<Clip, 'platform' | 'video_id' | 'title' | 'game_id'>;

export const ClipMedia = memo(function ClipMedia({
  clip,
  game,
  onPlay,
  compact,
  playOffset = 0,
}: {
  clip: MediaClip;
  game?: Game;
  /** Shows the big play button. */
  onPlay?: () => void;
  /** Smaller poster type (link preview). */
  compact?: boolean;
  /** Moves the play button up (px), to sit above the caption block. */
  playOffset?: number;
}) {
  const t = useTheme();
  const { base, accents } = useMediaPalette();
  const thumb = thumbnailFor(clip);
  const art = useMemo(() => artGradient(base, accents, clip.game_id ?? clip.title), [base, accents, clip.game_id, clip.title]);
  const titleSize = compact ? 26 : 44;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]}>
      {thumb ? (
        <Image
          source={{ uri: thumb }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          recyclingKey={clip.video_id}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      ) : (
        <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <GradientFill from={art.from} to={art.to} direction="diagonal" />
          {game?.emoji ? (
            <RNText style={[styles.emoji, { fontSize: compact ? 90 : 200 }]} numberOfLines={1}>
              {game.emoji}
            </RNText>
          ) : null}
          <View style={[styles.poster, compact && { paddingHorizontal: 16, top: '14%' }]}>
            {game ? (
              <RNText style={[styles.posterKicker, { fontFamily: t.fonts.heading }]} numberOfLines={1}>
                {game.name} · {PLATFORM_LABELS[clip.platform]}
              </RNText>
            ) : null}
            <RNText
              numberOfLines={compact ? 2 : 4}
              style={{
                color: ON_MEDIA,
                fontFamily: t.fonts.display,
                fontSize: titleSize,
                lineHeight: Math.round(titleSize * (t.shape.headingUppercase ? 1.0 : 1.2)),
                letterSpacing: t.shape.headingLetterSpacing,
                textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
                ...TEXT_SHADOW,
              }}
            >
              {clip.title}
            </RNText>
          </View>
        </View>
      )}

      {/* Scrims: keep the header area and the caption block readable on any thumbnail. */}
      <GradientFill from="#000000" to="#000000" fromOpacity={0.55} toOpacity={0} direction="vertical" style={styles.topScrim} />
      <GradientFill from="#000000" to="#000000" fromOpacity={0} toOpacity={0.9} direction="vertical" style={styles.bottomScrim} />

      {onPlay ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { paddingBottom: playOffset }]} pointerEvents="box-none">
          <Pressable
            onPress={onPlay}
            accessibilityRole="button"
            accessibilityLabel={`Play “${clip.title}”`}
            accessibilityHint={`Opens the clip: ${watchLabel(clip.platform)}`}
            hitSlop={12}
            style={({ pressed }) => [styles.play, compact && styles.playCompact, pressed && { backgroundColor: 'rgba(0,0,0,0.7)', transform: [{ scale: 0.96 }] }]}
          >
            <Ionicons name="play" size={compact ? 28 : 40} color={ON_MEDIA} style={{ marginLeft: compact ? 3 : 5 }} />
          </Pressable>
          {!compact ? (
            <RNText style={[styles.watch, { fontFamily: t.fonts.heading }]} accessibilityElementsHidden importantForAccessibility="no">
              {watchLabel(clip.platform)}
            </RNText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  emoji: { position: 'absolute', right: -24, top: '8%', opacity: 0.16 },
  poster: { position: 'absolute', left: 0, right: 0, top: '16%', paddingHorizontal: 24 },
  posterKicker: { color: ON_MEDIA_MUTED, fontSize: 14, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, ...TEXT_SHADOW },
  topScrim: { top: 0, bottom: undefined, height: '22%' },
  bottomScrim: { top: undefined, bottom: 0, height: '62%' },
  play: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: MEDIA_CONTROL,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCompact: { width: 56, height: 56, borderRadius: 28 },
  watch: { color: ON_MEDIA, marginTop: 10, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', ...TEXT_SHADOW },
});
