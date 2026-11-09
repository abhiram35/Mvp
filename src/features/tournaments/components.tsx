import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Card, Text } from '../../components/ui';
import { regionLabel } from '../lfg/format';
import { formatScrimTime } from '../scrims/logic';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { groupRounds, PHASE_LABELS, roundName, slotsLabel, tournamentPhase, type Phase } from './logic';
import type { Tournament, TournamentMatch } from './types';

/** Small pill for a tournament's phase. Live is loud, finished is quiet. */
export function PhasePill({ phase }: { phase: Phase }) {
  const t = useTheme();
  const loud = phase === 'live' || phase === 'checkin';
  const strong = phase === 'registration' || phase === 'starting';
  const bg = loud ? t.colors.danger : strong ? t.colors.primary : t.colors.surfaceRaised;
  const fg = loud ? '#FFFFFF' : strong ? t.colors.onPrimary : t.colors.textMuted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: t.radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
      {phase === 'live' ? <Ionicons name="radio" size={12} color={fg} /> : null}
      <RNText style={{ fontFamily: t.fonts.bodyBold, fontSize: fontSize.xs, color: fg, letterSpacing: 0.5, textTransform: 'uppercase' }}>{PHASE_LABELS[phase]}</RNText>
    </View>
  );
}

/** "✓ Org name" verified-organiser byline. */
export function OrganiserByline({ name, onPanel }: { name: string | null | undefined; onPanel?: boolean }) {
  const t = useTheme();
  const color = onPanel ? t.colors.onPanel : t.colors.textMuted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`Hosted by ${name ?? 'a verified organiser'}, verified organiser`}>
      <Ionicons name="checkmark-circle" size={14} color={t.colors.primary} />
      <RNText style={{ fontFamily: t.fonts.bodyMedium, fontSize: fontSize.sm, color }} numberOfLines={1}>
        {name ?? 'Verified organiser'}
      </RNText>
    </View>
  );
}

export const TournamentCard = memo(function TournamentCard({
  tournament,
  gameName,
  registered,
  now,
  onPress,
}: {
  tournament: Tournament;
  gameName?: string;
  registered: number;
  now: number;
  onPress: () => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const phase = tournamentPhase(tournament, now);
  return (
    <Card onPress={onPress} style={s.card} accessibilityLabel={`${tournament.name}, ${PHASE_LABELS[phase]}, ${formatScrimTime(tournament.starts_at, now)}, ${slotsLabel(registered, tournament.max_teams)}`}>
      <View style={s.top}>
        <Text variant="label" style={s.kicker}>
          {[gameName, tournament.region ? regionLabel(tournament.region) : 'All regions'].filter(Boolean).join(' · ')}
        </Text>
        <PhasePill phase={phase} />
      </View>
      <Text variant="heading" numberOfLines={2} style={s.name}>
        {tournament.name}
      </Text>
      <OrganiserByline name={tournament.organiser?.org_name} />
      <View style={s.metaRow}>
        <Meta icon="calendar-outline" text={formatScrimTime(tournament.starts_at, now)} />
        <Meta icon="people-outline" text={slotsLabel(registered, tournament.max_teams)} />
        <Meta icon="videocam-outline" text="Streamed" />
      </View>
      {tournament.prize ? (
        <View style={s.prize}>
          <Ionicons name="trophy" size={14} color={t.colors.primary} />
          <Text variant="caption" numberOfLines={1} style={{ flex: 1, color: t.colors.text }}>
            {tournament.prize}
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={14} color={t.colors.textMuted} />
      <Text variant="caption">{text}</Text>
    </View>
  );
}

// ── Bracket ─────────────────────────────────────────────────────────────────
const COL_W = 196;
const GAP = 36;
const MATCH_H = 76;
const ROW_H = MATCH_H + 20;

/** Horizontal single-elimination bracket with connector lines. Tap a match to open it. */
export function Bracket({
  matches,
  myTeamId,
  featuredMatchId,
  onOpen,
}: {
  matches: TournamentMatch[];
  myTeamId: string | null;
  featuredMatchId: string | null;
  onOpen: (m: TournamentMatch) => void;
}) {
  const t = useTheme();
  const rounds = groupRounds(matches);
  if (rounds.length === 0) return null;
  const firstCount = rounds[0].length;
  const height = Math.max(1, firstCount) * ROW_H;
  const centerY = (i: number, n: number) => (height * (2 * i + 1)) / (2 * n);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: spacing.sm }}>
      {rounds.map((list, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          <View style={{ width: COL_W }}>
            <Text variant="label" style={{ marginBottom: spacing.sm, fontFamily: t.fonts.heading, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              {roundName(r + 1, rounds.length)}
            </Text>
            <View style={{ height }}>
              {list.map((m, i) => (
                <View key={m.id} style={{ position: 'absolute', left: 0, right: 0, top: centerY(i, list.length) - MATCH_H / 2 }}>
                  <BracketMatch match={m} myTeamId={myTeamId} featured={m.id === featuredMatchId} onPress={() => onOpen(m)} />
                </View>
              ))}
            </View>
          </View>
          {r < rounds.length - 1 ? (
            <View style={{ width: GAP, marginTop: 28 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Svg width={GAP} height={height}>
                {Array.from({ length: Math.ceil(list.length / 2) }, (_, j) => {
                  const y1 = centerY(2 * j, list.length);
                  const y2 = 2 * j + 1 < list.length ? centerY(2 * j + 1, list.length) : y1;
                  const ym = centerY(j, rounds[r + 1].length);
                  const mid = GAP / 2;
                  return (
                    <Path
                      key={j}
                      d={`M0 ${y1} H${mid} V${y2} H0 M${mid} ${ym} H${GAP}`}
                      stroke={t.colors.border}
                      strokeWidth={1.5}
                      fill="none"
                    />
                  );
                })}
              </Svg>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function BracketMatch({ match, myTeamId, featured, onPress }: { match: TournamentMatch; myTeamId: string | null; featured: boolean; onPress: () => void }) {
  const t = useTheme();
  const mine = !!myTeamId && (match.team_a_id === myTeamId || match.team_b_id === myTeamId);
  const live = match.status === 'ready' || match.status === 'disputed';
  const label = `${match.team_a?.name ?? 'TBD'} versus ${match.team_b?.name ?? (match.status === 'bye' ? 'bye' : 'TBD')}${
    match.status === 'completed' ? `, ${match.a_score} to ${match.b_score}` : ''
  }${featured ? ', on stream' : ''}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={match.status === 'pending' || match.status === 'bye'}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        height: MATCH_H,
        borderRadius: t.radius.md,
        backgroundColor: t.colors.surface,
        borderWidth: mine || featured ? 2 : StyleSheet.hairlineWidth,
        borderColor: mine ? t.colors.primary : featured ? t.colors.danger : t.colors.border,
        overflow: 'hidden',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <TeamLine name={match.team_a?.tag ? `[${match.team_a.tag}] ${match.team_a.name}` : null} score={match.a_score} won={!!match.winner_team_id && match.winner_team_id === match.team_a_id} done={match.status === 'completed'} />
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border }} />
      <TeamLine
        name={match.team_b?.tag ? `[${match.team_b.tag}] ${match.team_b.name}` : match.status === 'bye' ? 'Bye' : null}
        score={match.b_score}
        won={!!match.winner_team_id && match.winner_team_id === match.team_b_id}
        done={match.status === 'completed'}
      />
      {live || featured ? (
        <View style={{ position: 'absolute', right: 6, top: 4, flexDirection: 'row', gap: 4 }}>
          {featured ? <Ionicons name="videocam" size={12} color={t.colors.danger} /> : null}
          {match.status === 'disputed' ? <Ionicons name="alert-circle" size={12} color={t.colors.danger} /> : live ? <Ionicons name="ellipse" size={8} color={t.colors.accent} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function TeamLine({ name, score, won, done }: { name: string | null; score: number | null; won: boolean; done: boolean }) {
  const t = useTheme();
  const loser = done && !won;
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, gap: spacing.sm }}>
      <RNText
        numberOfLines={1}
        style={{ flex: 1, fontFamily: won ? t.fonts.bodyBold : t.fonts.body, fontSize: fontSize.sm, color: name ? (loser ? t.colors.textMuted : t.colors.text) : t.colors.textFaint }}
      >
        {name ?? 'TBD'}
      </RNText>
      {done && score !== null ? (
        <RNText style={{ fontFamily: t.fonts.display, fontSize: fontSize.md, color: won ? t.colors.primary : t.colors.textMuted }}>{score}</RNText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: { marginBottom: spacing.md, gap: spacing.sm },
    top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    kicker: { fontFamily: t.fonts.bodyBold, letterSpacing: 1, textTransform: 'uppercase' },
    name: { marginTop: spacing.xs },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
    prize: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  }),
);
