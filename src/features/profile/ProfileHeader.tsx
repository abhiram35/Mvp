import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AngledEdge, Avatar, Card, Chip, ChipRow, displayLineHeight, Kicker, PanelFrame, Stat, Text } from '../../components/ui';
import { PLAY_STYLE_LABELS, PLAY_TIME_LABELS, REGION_LABELS, type Profile } from '../../lib/types';
import { usePlayerStats } from '../reputation/api';
import { formatCount, PanelLevel, ReputationDetails } from '../reputation/PlayerCard';
import { designTokens, makeStyles, spacing, useTheme } from '../../theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 2026" from an ISO date, or null when it can't be parsed. */
function memberSince(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The player card: a full-bleed hero band (panel + the theme's gradient, angled bottom edge in
 * Protocol, brackets / frame elsewhere) with avatar, display-size name, @username and region,
 * level + XP bar; then a divided stat strip (games, member since, solutions), teammate rating
 * and praise badges, bio and preference chips. Expects to sit in a padded Screen.
 */
export function ProfileHeader({
  profile,
  gamesCount,
  own,
  children,
}: {
  profile: Profile;
  gamesCount: number;
  /** Own profile: the avatar gets the highlight treatment. */
  own?: boolean;
  /** Optional actions rendered under the stats (e.g. Friend / Message buttons). */
  children?: ReactNode;
}) {
  const s = useStyles();
  const t = useTheme();
  const since = memberSince(profile.created_at);
  const { stats } = usePlayerStats(profile.id);
  const angled = designTokens(t).lang.heroAngle > 0;
  return (
    <View style={s.wrap}>
      <Card variant="hero" style={s.band}>
        <Kicker tone="onPanel">{own ? 'Your player card' : 'Player card'}</Kicker>
        <View style={s.top}>
          <Avatar uri={profile.avatar_url} name={profile.display_name} size={84} highlight={own} backdrop={t.colors.panel} />
          <View style={s.names}>
            <Text variant="display" style={s.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityRole="header">
              {profile.display_name}
            </Text>
            <Text variant="label" style={s.meta} numberOfLines={1}>
              @{profile.username} · {REGION_LABELS[profile.region]}
            </Text>
          </View>
        </View>
        <PanelLevel stats={stats} />
        {angled ? <AngledEdge color={t.colors.bg} /> : <PanelFrame />}
      </Card>

      <View style={s.stats}>
        <View style={s.statCell}>
          <Stat value={String(gamesCount)} label={gamesCount === 1 ? 'Game' : 'Games'} highlight />
        </View>
        {since ? (
          <View style={[s.statCell, s.statRule]}>
            <Stat value={since} label="Member since" />
          </View>
        ) : null}
        {stats ? (
          <View style={[s.statCell, s.statRule]}>
            <Stat value={formatCount(stats.solutions)} label={stats.solutions === 1 ? 'Solution' : 'Solutions'} />
          </View>
        ) : null}
      </View>

      <ReputationDetails stats={stats} />

      {children ? <View style={{ marginTop: spacing.lg }}>{children}</View> : null}

      {profile.bio ? <Text style={{ marginTop: spacing.lg }}>{profile.bio}</Text> : null}

      <View style={{ marginTop: spacing.lg }}>
        <ChipRow>
          <Chip icon="trophy-outline" label={PLAY_STYLE_LABELS[profile.play_style]} />
          <Chip icon={profile.has_mic ? 'mic-outline' : 'mic-off-outline'} label={profile.has_mic ? 'Mic on' : 'No mic'} />
          {profile.languages.map((l) => (
            <Chip key={l} icon="language-outline" label={l} />
          ))}
          {profile.play_times.map((pt) => (
            <Chip key={pt} icon="time-outline" label={PLAY_TIME_LABELS[pt]} />
          ))}
        </ChipRow>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    wrap: { paddingBottom: spacing.sm },
    // Full-bleed: cancels the Screen's horizontal padding.
    band: {
      marginHorizontal: -spacing.lg,
      borderRadius: 0,
      paddingTop: spacing.xl,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl + designTokens(t).lang.heroAngle,
      gap: spacing.md,
    },
    top: { flexDirection: 'row', alignItems: 'center' },
    names: { marginLeft: spacing.lg, flex: 1 },
    name: { fontSize: 44, lineHeight: displayLineHeight(t, 44), color: t.colors.onPanel },
    meta: { color: t.colors.onPanel, opacity: 0.85, marginTop: spacing.xs },
    stats: {
      flexDirection: 'row',
      paddingVertical: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: designTokens(t).hairline,
    },
    statCell: { flex: 1, paddingHorizontal: spacing.sm },
    statRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: designTokens(t).hairline, paddingLeft: spacing.md },
  }),
);
