import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Card, Chip, ChipRow, PanelFrame, Stat, Text } from '../../components/ui';
import { PLAY_STYLE_LABELS, PLAY_TIME_LABELS, REGION_LABELS, type Profile } from '../../lib/types';
import { makeStyles, spacing, useTheme } from '../../theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 2026" from an ISO date, or null when it can't be parsed. */
function memberSince(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The player card: a dark media band with avatar, big name, @username and region,
 * then real stats (games, member since), bio and preference chips.
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
  return (
    <View style={s.wrap}>
      <Card tone="panel" style={s.band}>
        <View style={s.top}>
          <Avatar uri={profile.avatar_url} name={profile.display_name} size={76} highlight={own} backdrop={t.colors.panel} />
          <View style={s.names}>
            <Text variant="display" style={s.name} numberOfLines={2} accessibilityRole="header">
              {profile.display_name}
            </Text>
            <Text variant="label" style={s.meta} numberOfLines={1}>
              @{profile.username} · {REGION_LABELS[profile.region]}
            </Text>
          </View>
        </View>
        <PanelFrame />
      </Card>

      <View style={s.stats}>
        <Stat value={String(gamesCount)} label={gamesCount === 1 ? 'Game' : 'Games'} highlight />
        {since ? <Stat value={since} label="Member since" /> : null}
      </View>

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
    wrap: { paddingTop: spacing.md, paddingBottom: spacing.sm },
    band: { paddingVertical: spacing.xl, paddingHorizontal: spacing.xl },
    top: { flexDirection: 'row', alignItems: 'center' },
    names: { marginLeft: spacing.lg, flex: 1 },
    name: { fontSize: 40, lineHeight: 44, color: t.colors.onPanel },
    meta: { color: t.colors.onPanel, opacity: 0.8, marginTop: spacing.xs },
    stats: {
      flexDirection: 'row',
      gap: spacing.xxl,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
  }),
);
