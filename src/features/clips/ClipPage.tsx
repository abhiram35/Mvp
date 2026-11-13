// One full-screen clip: dark media, right action rail (GG, comments, share), caption block
// bottom-left (author, game tag, title, caption, "Squad up with <name>") and a thin progress line.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Avatar } from '../../components/ui';
import type { Game } from '../../lib/types';
import { spacing, useDesign, useTheme } from '../../theme';
import { useLiveClip } from './api';
import { ClipMedia, MEDIA_CHIP, ON_MEDIA, ON_MEDIA_MUTED, TEXT_SHADOW, useMediaPalette } from './ClipMedia';
import { firstName, formatCount, timeAgo } from './logic';
import { RailButton } from './RailButton';
import type { Clip } from './types';
import type { SquadUpState } from './useClipActions';

export interface ClipPageActions {
  play: (clip: Clip) => void;
  gg: (clip: Clip) => void;
  comments: (clip: Clip) => void;
  share: (clip: Clip) => void;
  squadUp: (clip: Clip) => void;
  more: (clip: Clip) => void;
  openAuthor: (clip: Clip) => void;
}

const CAPTION_BLOCK = 190;

export const ClipPage = memo(function ClipPage({
  clip: baseClip,
  height,
  game,
  mine,
  progress,
  squadState,
  actions,
  reduced,
  now,
}: {
  clip: Clip;
  height: number;
  game?: Game;
  mine: boolean;
  /** 0–1 position of this clip in the loaded feed (thin line at the bottom). Omit to hide. */
  progress?: number;
  squadState?: SquadUpState;
  actions: ClipPageActions;
  reduced: boolean;
  now: number;
}) {
  const t = useTheme();
  const d = useDesign();
  const { base } = useMediaPalette();
  const clip = useLiveClip(baseClip);
  if (!clip) return <View style={{ height, backgroundColor: base }} />;

  const name = clip.author.display_name;
  const pillRadius = d.lang.corner === 'soft' ? 22 : t.radius.md;

  return (
    <View style={{ height, backgroundColor: base, overflow: 'hidden' }}>
      <ClipMedia clip={clip} game={game} onPlay={() => actions.play(clip)} playOffset={CAPTION_BLOCK / 2} />

      {/* Right rail */}
      <View style={styles.rail}>
        <RailButton
          icon={clip.my_gg ? 'ribbon' : 'ribbon-outline'}
          count={formatCount(clip.gg_count)}
          active={clip.my_gg}
          pop={clip.my_gg}
          reduced={reduced}
          onPress={() => actions.gg(clip)}
          accessibilityLabel={`${clip.gg_count} ${t.words.gg}`}
          accessibilityHint={clip.my_gg ? `Takes back your ${t.words.gg}` : `Gives this clip ${t.words.gg}`}
        />
        <RailButton
          icon="chatbubble-ellipses-outline"
          count={formatCount(clip.comment_count)}
          onPress={() => actions.comments(clip)}
          accessibilityLabel={`${clip.comment_count} comments`}
          accessibilityHint="Opens the comments"
        />
        <RailButton icon="arrow-redo-outline" label="Share" onPress={() => actions.share(clip)} accessibilityLabel="Share clip" />
        {mine ? (
          <RailButton icon="ellipsis-horizontal" onPress={() => actions.more(clip)} accessibilityLabel="More options" accessibilityHint="Delete your clip" />
        ) : (
          <RailButton
            icon="flag-outline"
            onPress={() => router.push({ pathname: '/report', params: { type: 'clip', id: clip.id } })}
            accessibilityLabel="Report clip"
          />
        )}
      </View>

      {/* Caption block */}
      <View style={styles.caption}>
        <Pressable
          onPress={() => actions.openAuthor(clip)}
          accessibilityRole="button"
          accessibilityLabel={`${name}, @${clip.author.username}, posted ${timeAgo(clip.created_at, now)}`}
          accessibilityHint="Opens their profile"
          style={styles.authorRow}
          hitSlop={4}
        >
          <Avatar uri={clip.author.avatar_url} name={name} size={36} backdrop={base} />
          <View style={{ marginLeft: spacing.sm, flexShrink: 1 }}>
            <RNText style={[styles.author, { fontFamily: t.fonts.bodyBold }]} numberOfLines={1}>
              {name}
            </RNText>
            <RNText style={[styles.meta, { fontFamily: t.fonts.body }]} numberOfLines={1}>
              @{clip.author.username || 'player'} · {timeAgo(clip.created_at, now)}
            </RNText>
          </View>
        </Pressable>

        <View style={styles.tags}>
          {game ? (
            <View style={[styles.tag, { borderRadius: pillRadius }]}>
              <RNText style={[styles.tagText, { fontFamily: t.fonts.bodyMedium }]} numberOfLines={1}>
                {game.emoji} {game.name}
              </RNText>
            </View>
          ) : null}
          {clip.tournament_id ? (
            <Pressable
              onPress={() => router.push({ pathname: '/tournaments/[id]', params: { id: clip.tournament_id as string } })}
              accessibilityRole="button"
              accessibilityLabel="Cup clip. Opens the tournament"
              hitSlop={{ top: 8, bottom: 8 }}
              style={[styles.tag, { borderRadius: pillRadius, flexDirection: 'row', alignItems: 'center' }]}
            >
              <Ionicons name="trophy" size={13} color={ON_MEDIA} style={{ marginRight: 4 }} />
              <RNText style={[styles.tagText, { fontFamily: t.fonts.bodyMedium }]}>Cup</RNText>
            </Pressable>
          ) : null}
        </View>

        <RNText
          accessibilityRole="header"
          numberOfLines={2}
          style={[
            styles.title,
            {
              fontFamily: t.fonts.heading,
              letterSpacing: t.shape.headingLetterSpacing,
              textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
            },
          ]}
        >
          {clip.title}
        </RNText>
        {clip.caption ? (
          <RNText style={[styles.body, { fontFamily: t.fonts.body }]} numberOfLines={3}>
            {clip.caption}
          </RNText>
        ) : null}

        {!mine ? (
          <Pressable
            onPress={() => actions.squadUp(clip)}
            disabled={!!squadState}
            accessibilityRole="button"
            accessibilityLabel={squadState === 'sent' ? `Invite sent to ${name}` : `${t.words.squadUp} with ${name}`}
            accessibilityHint={squadState ? undefined : 'Invites them to your party'}
            accessibilityState={{ disabled: !!squadState, busy: squadState === 'sending' }}
            style={({ pressed }) => [
              styles.squad,
              { borderRadius: pillRadius },
              squadState === 'sent'
                ? { backgroundColor: MEDIA_CHIP }
                : { backgroundColor: pressed ? t.colors.primaryPressed : t.colors.primary },
            ]}
          >
            {squadState === 'sending' ? (
              <ActivityIndicator color={t.colors.onPrimary} />
            ) : (
              <>
                <Ionicons
                  name={squadState === 'sent' ? 'checkmark-circle' : 'people'}
                  size={18}
                  color={squadState === 'sent' ? ON_MEDIA : t.colors.onPrimary}
                  style={{ marginRight: spacing.sm }}
                />
                <RNText
                  numberOfLines={1}
                  style={{
                    color: squadState === 'sent' ? ON_MEDIA : t.colors.onPrimary,
                    fontFamily: t.fonts.heading,
                    fontSize: 16,
                    letterSpacing: t.shape.headingLetterSpacing,
                    textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
                  }}
                >
                  {squadState === 'sent' ? 'Invite sent' : `${t.words.squadUp} with ${firstName(name)}`}
                </RNText>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {progress !== undefined ? (
        <View style={styles.progressTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`, height: '100%', backgroundColor: t.colors.primary }} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  rail: { position: 'absolute', right: spacing.md, bottom: spacing.xl + 8, alignItems: 'center', gap: spacing.lg },
  caption: { position: 'absolute', left: spacing.lg, right: 84, bottom: spacing.xl },
  authorRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 44 },
  author: { color: ON_MEDIA, fontSize: 16, ...TEXT_SHADOW },
  meta: { color: ON_MEDIA_MUTED, fontSize: 13, ...TEXT_SHADOW },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  tag: { backgroundColor: MEDIA_CHIP, paddingHorizontal: 10, paddingVertical: 5, minHeight: 28, justifyContent: 'center' },
  tagText: { color: ON_MEDIA, fontSize: 13 },
  title: { color: ON_MEDIA, fontSize: 24, lineHeight: 28, marginTop: spacing.sm, ...TEXT_SHADOW },
  body: { color: ON_MEDIA_MUTED, fontSize: 15, lineHeight: 21, marginTop: spacing.xs, ...TEXT_SHADOW },
  squad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    maxWidth: '100%',
  },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
});
