import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Button, Text } from '../../components/ui';
import { PLAY_STYLE_LABELS, REGION_LABELS, type SquadmateMatch } from '../../lib/types';
import { colors, font, radius, spacing } from '../../theme';

export const SquadmateCard = memo(function SquadmateCard({
  match,
  onPress,
  onMessage,
}: {
  match: SquadmateMatch;
  onPress: () => void;
  onMessage: () => void;
}) {
  const { profile, game, match_score, shared_languages } = match;
  const name = profile.display_name || profile.username;
  const shared = new Set(shared_languages);
  const rankRole = [game.rank, game.role].filter(Boolean).join(' · ');

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${match_score}% match${rankRole ? `, ${rankRole}` : ''}. View profile.`}
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.8 }]}
      >
        <View style={styles.topRow}>
          <Avatar uri={profile.avatar_url} name={name} size={52} />
          <View style={styles.identity}>
            <Text variant="heading" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              @{profile.username}
            </Text>
            {rankRole ? (
              <View style={styles.rankRow}>
                <Ionicons name="trophy-outline" size={13} color={colors.warning} />
                <Text variant="caption" style={styles.rankText} numberOfLines={1}>
                  {rankRole}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreValue}>{match_score}%</Text>
            <Text style={styles.scoreLabel}>match</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.meta}>
            <Ionicons name="globe-outline" size={13} color={colors.textMuted} />
            <Text variant="caption" style={styles.metaText}>
              {REGION_LABELS[profile.region] ?? profile.region}
            </Text>
          </View>
          <View style={styles.meta}>
            <Ionicons name="game-controller-outline" size={13} color={colors.textMuted} />
            <Text variant="caption" style={styles.metaText}>
              {PLAY_STYLE_LABELS[profile.play_style] ?? profile.play_style}
            </Text>
          </View>
          <View style={styles.meta} accessible accessibilityLabel={profile.has_mic ? 'Has a mic' : 'No mic'}>
            <Ionicons name={profile.has_mic ? 'mic' : 'mic-off-outline'} size={13} color={profile.has_mic ? colors.accent : colors.textFaint} />
            <Text variant="caption" style={[styles.metaText, profile.has_mic && { color: colors.accent }]}>
              {profile.has_mic ? 'Mic' : 'No mic'}
            </Text>
          </View>
        </View>

        {profile.languages.length > 0 ? (
          <View style={styles.langRow}>
            {profile.languages.map((l) => {
              const isShared = shared.has(l);
              return (
                <View key={l} style={[styles.lang, isShared && styles.langShared]}>
                  <Text style={[styles.langText, isShared && styles.langTextShared]}>
                    {isShared ? '✓ ' : ''}
                    {l}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </Pressable>

      <Button title="Message" icon="chatbubble-ellipses-outline" variant="secondary" size="sm" onPress={onMessage} style={styles.message} />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  main: {},
  topRow: { flexDirection: 'row', alignItems: 'center' },
  identity: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  rankRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  rankText: { marginLeft: 3, color: colors.text },
  scoreBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
  },
  scoreValue: { color: colors.accent, fontSize: font.size.xl, fontWeight: font.weight.bold },
  scoreLabel: { color: colors.accent, fontSize: 10, fontWeight: font.weight.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center' },
  metaText: { marginLeft: 3, color: colors.textMuted },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  lang: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langShared: { borderColor: colors.accent, backgroundColor: colors.bg },
  langText: { fontSize: font.size.xs, color: colors.textFaint },
  langTextShared: { color: colors.accent, fontWeight: font.weight.semibold },
  message: { marginTop: spacing.md, minHeight: 44 },
});
