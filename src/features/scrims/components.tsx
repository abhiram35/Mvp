import { memo } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { Card, Text } from '../../components/ui';
import { regionLabel } from '../lfg/format';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { displayStatus, FORMAT_LABELS, formatScrimTime, startsIn, STATUS_LABELS, type DisplayStatus } from './logic';
import type { Scrim, Team } from './types';

/** Square team tag, e.g. [VNQ]. */
export function TeamTag({ team, size = 44, highlight }: { team: Pick<Team, 'tag'> | null; size?: number; highlight?: boolean }) {
  const t = useTheme();
  const tag = team?.tag ?? '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: t.shape.round ? size / 2 : t.radius.sm,
        backgroundColor: highlight ? t.colors.primary : t.colors.panel,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <RNText
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontFamily: t.fonts.display, fontSize: size * (tag.length > 3 ? 0.3 : 0.38), color: highlight ? t.colors.onPrimary : t.colors.onPanel, paddingHorizontal: 3 }}
      >
        {tag}
      </RNText>
    </View>
  );
}

/** Small coloured status label. */
export function StatusPill({ status }: { status: DisplayStatus }) {
  const t = useTheme();
  const strong = status === 'open' || status === 'live' || status === 'booked';
  const bad = status === 'disputed' || status === 'no_show' || status === 'cancelled';
  const bg = strong ? t.colors.primary : bad ? t.colors.surfaceRaised : t.colors.surfaceRaised;
  const fg = strong ? t.colors.onPrimary : bad ? t.colors.danger : t.colors.textMuted;
  return (
    <View style={{ backgroundColor: bg, borderRadius: t.radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
      <RNText style={{ fontFamily: t.fonts.bodyBold, fontSize: fontSize.xs, color: fg, letterSpacing: 0.5, textTransform: 'uppercase' }}>{STATUS_LABELS[status]}</RNText>
    </View>
  );
}

export function teamLabel(team: Pick<Team, 'name' | 'tag'> | null): string {
  return team ? `${team.name} [${team.tag}]` : 'Open slot';
}

/** A scrim in a list: time, the two teams, format, region, rank range, status. */
export const ScrimCard = memo(function ScrimCard({
  scrim,
  gameName,
  now,
  onPress,
  mine,
}: {
  scrim: Scrim;
  gameName?: string;
  now: number;
  onPress: () => void;
  /** One of my teams is in it: highlight it. */
  mine?: boolean;
}) {
  const s = useStyles();
  const status = displayStatus(scrim, now);
  const ranks = scrim.rank_min || scrim.rank_max ? `${scrim.rank_min ?? 'Any'} – ${scrim.rank_max ?? 'Any'}` : 'Any rank';
  const when = formatScrimTime(scrim.scheduled_at, now);
  return (
    <Card
      onPress={onPress}
      style={s.card}
      accessibilityLabel={`${teamLabel(scrim.host)} versus ${scrim.opponent ? teamLabel(scrim.opponent) : 'open slot'}, ${when}, ${FORMAT_LABELS[scrim.format]}, ${regionLabel(scrim.region)}, ${ranks}, ${STATUS_LABELS[status]}`}
    >
      <View style={s.top}>
        <Text variant="label" style={s.when}>
          {when}
          {status === 'open' || status === 'booked' ? ` · ${startsIn(scrim.scheduled_at, now)}` : ''}
        </Text>
        <StatusPill status={status} />
      </View>
      <View style={s.vsRow}>
        <View style={s.team}>
          <TeamTag team={scrim.host} highlight={mine} />
          <Text variant="strong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {scrim.host?.name ?? 'Team'}
          </Text>
        </View>
        <Text style={s.vs}>{scrim.host_score !== null && scrim.opp_score !== null ? `${scrim.host_score} – ${scrim.opp_score}` : 'VS'}</Text>
        <View style={[s.team, s.teamRight]}>
          <Text variant="strong" numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }} muted={!scrim.opponent}>
            {scrim.opponent?.name ?? 'Open slot'}
          </Text>
          <TeamTag team={scrim.opponent} />
        </View>
      </View>
      <Text variant="caption" style={s.meta}>
        {[gameName, FORMAT_LABELS[scrim.format], regionLabel(scrim.region), ranks].filter(Boolean).join(' · ')}
      </Text>
      {scrim.notes ? (
        <Text variant="caption" numberOfLines={2} style={{ marginTop: spacing.xs }}>
          “{scrim.notes}”
        </Text>
      ) : null}
    </Card>
  );
});

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: { marginBottom: spacing.md },
    top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    when: { color: t.colors.text, fontFamily: t.fonts.bodyBold },
    vsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    team: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
    teamRight: { justifyContent: 'flex-end' },
    vs: { fontFamily: t.fonts.display, fontSize: fontSize.lg, color: t.colors.textMuted, minWidth: 44, textAlign: 'center' },
    meta: { marginTop: spacing.md, color: t.colors.textMuted },
  }),
);
