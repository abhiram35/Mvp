import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Chip, ChipRow, LiveDot, Text } from '../../components/ui';
import { PLAY_STYLE_LABELS, REGION_LABELS, type SquadmateMatch } from '../../lib/types';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { ReputationBadges } from '../reputation/PlayerCard';

/** Player card in the Duo finder: identity, big match %, shared languages, actions. */
export const SquadmateCard = memo(function SquadmateCard({
  match,
  onPress,
  onMessage,
}: {
  match: SquadmateMatch;
  onPress: () => void;
  onMessage: () => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const { profile, game, match_score, shared_languages } = match;
  const name = profile.display_name || profile.username;
  const shared = new Set(shared_languages);
  const rankRole = [game.rank, game.role].filter(Boolean).join(' · ');
  const otherLanguages = profile.languages.filter((l) => !shared.has(l));
  const isPlaying = game.play_status === 'playing';

  return (
    <Card style={s.card}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${match_score}% match${rankRole ? `, ${rankRole}` : ''}${isPlaying ? ', playing now' : ''}${match.reputation ? `, level ${match.reputation.level}` : ''}. View profile.`}
        style={({ pressed }) => [pressed && { opacity: 0.8 }]}
      >
        <View style={s.topRow}>
          <Avatar uri={profile.avatar_url} name={name} size={56} />
          <View style={s.identity}>
            <Text style={s.name} numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              @{profile.username}
            </Text>
            {isPlaying ? (
              <View style={{ marginTop: 2 }}>
                <LiveDot label="Playing now" numberOfLines={1} />
              </View>
            ) : rankRole ? (
              <Text variant="label" numberOfLines={1} style={{ marginTop: 2 }}>
                {rankRole}
              </Text>
            ) : null}
            <ReputationBadges reputation={match.reputation} />
          </View>
          <View style={s.score} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Text style={s.scoreValue}>{match_score}%</Text>
            <Text variant="caption" style={s.scoreLabel}>
              match
            </Text>
          </View>
        </View>

        {profile.languages.length > 0 ? (
          <View style={s.langs}>
            <ChipRow>
              {shared_languages.map((l) => (
                <Chip key={l} label={l} icon="checkmark" selected />
              ))}
              {otherLanguages.map((l) => (
                <Chip key={l} label={l} />
              ))}
            </ChipRow>
          </View>
        ) : null}

        <View style={s.metaRow}>
          <View style={s.meta}>
            <Ionicons name="globe-outline" size={13} color={t.colors.textMuted} />
            <Text variant="caption" style={s.metaText}>
              {REGION_LABELS[profile.region] ?? profile.region}
            </Text>
          </View>
          <View style={s.meta}>
            <Ionicons name="game-controller-outline" size={13} color={t.colors.textMuted} />
            <Text variant="caption" style={s.metaText}>
              {PLAY_STYLE_LABELS[profile.play_style] ?? profile.play_style}
            </Text>
          </View>
          <View style={s.meta} accessible accessibilityLabel={profile.has_mic ? 'Has a mic' : 'No mic'}>
            <Ionicons name={profile.has_mic ? 'mic' : 'mic-off-outline'} size={13} color={profile.has_mic ? t.colors.accent : t.colors.textFaint} />
            <Text variant="caption" style={[s.metaText, profile.has_mic && { color: t.colors.accent }]}>
              {profile.has_mic ? 'Mic' : 'No mic'}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={s.actions}>
        <Button
          title="Message"
          icon="chatbubble-ellipses-outline"
          variant="secondary"
          size="sm"
          onPress={onMessage}
          style={s.action}
          accessibilityLabel={`Message ${name}`}
        />
        <Button
          title={t.words.squadUp}
          icon="flash"
          size="sm"
          onPress={onMessage}
          style={s.action}
          backdrop={t.colors.surface}
          accessibilityLabel={`${t.words.squadUp} with ${name}`}
        />
      </View>
    </Card>
  );
});

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: { marginBottom: spacing.md },
    topRow: { flexDirection: 'row', alignItems: 'center' },
    identity: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
    name: {
      fontFamily: t.fonts.heading,
      fontSize: fontSize.xl,
      color: t.colors.text,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    score: { alignItems: 'flex-end', minWidth: 72 },
    scoreValue: { fontFamily: t.fonts.display, fontSize: 40, lineHeight: 44, color: t.colors.primary },
    scoreLabel: {
      color: t.colors.textMuted,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    langs: { marginTop: spacing.md },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
    meta: { flexDirection: 'row', alignItems: 'center' },
    metaText: { marginLeft: 3, color: t.colors.textMuted },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
    },
    action: { flex: 1, minHeight: 44 },
  }),
);
