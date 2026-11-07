import { StyleSheet, View } from 'react-native';
import { Card, Divider, Stat, Text } from '../../components/ui';
import type { BetaMetrics } from '../../lib/types';
import { makeStyles, spacing, useTheme } from '../../theme';

function pct(v: number | null): string {
  return v === null || !Number.isFinite(v) ? '—' : `${Math.round(v * 100)}%`;
}

function n(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-IN') : '0';
}

function dayLabel(day: string): string {
  const d = new Date(day.length <= 10 ? `${day}T00:00:00` : day);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : day;
}

const CHART_HEIGHT = 96;

/** Daily active players as a row of themed bars (plain Views, no chart library). */
function DailyActiveChart({ points }: { points: BetaMetrics['daily_active'] }) {
  const t = useTheme();
  const s = useStyles();
  if (!points.length) return <Text muted>No activity yet.</Text>;
  const max = Math.max(1, ...points.map((p) => p.players));
  const last = points[points.length - 1];
  const summary = points.map((p) => `${dayLabel(p.day)}: ${p.players}`).join(', ');
  return (
    <View accessible accessibilityLabel={`Daily active players. ${summary}`}>
      <View style={s.chart}>
        {points.map((p, i) => {
          const h = p.players > 0 ? Math.max(3, Math.round((p.players / max) * CHART_HEIGHT)) : 2;
          return (
            <View key={p.day} style={s.barSlot}>
              <View style={{ height: h, backgroundColor: i === points.length - 1 ? t.colors.primary : p.players > 0 ? t.colors.info : t.colors.border }} />
            </View>
          );
        })}
      </View>
      <View style={s.axis}>
        <Text variant="caption">{dayLabel(points[0].day)}</Text>
        <Text variant="caption">peak {max}</Text>
        <Text variant="caption">{dayLabel(last.day)} · {last.players}</Text>
      </View>
    </View>
  );
}

function StatGrid({ items }: { items: { label: string; value: string; highlight?: boolean }[] }) {
  const s = useStyles();
  return (
    <View style={s.grid}>
      {items.map((it) => (
        <View key={it.label} style={s.cell}>
          <Stat value={it.value} label={it.label} highlight={it.highlight} />
        </View>
      ))}
    </View>
  );
}

export function BetaStats({ metrics }: { metrics: BetaMetrics }) {
  const s = useStyles();
  return (
    <View style={s.wrap}>
      <Text variant="label">Last {metrics.days} days</Text>
      <Card>
        <Text variant="heading" style={s.cardTitle}>Daily active</Text>
        <DailyActiveChart points={metrics.daily_active} />
      </Card>
      <Card>
        <Text variant="heading" style={s.cardTitle}>Players</Text>
        <StatGrid
          items={[
            { label: 'Players (all time)', value: n(metrics.total_players), highlight: true },
            { label: 'New players', value: n(metrics.new_players) },
            { label: 'D1 retention', value: pct(metrics.day1_retention) },
            { label: 'D7 retention', value: pct(metrics.day7_retention) },
          ]}
        />
        <Divider />
        <Text variant="heading" style={s.cardTitle}>Activity</Text>
        <StatGrid
          items={[
            { label: 'Lobbies', value: n(metrics.lobbies_created) },
            { label: 'Join requests', value: n(metrics.join_requests) },
            { label: 'Squads formed', value: n(metrics.squads_formed) },
            { label: 'Messages', value: n(metrics.messages_sent) },
            { label: 'Posts', value: n(metrics.community_posts) },
            { label: 'Ratings', value: n(metrics.ratings_given) },
          ]}
        />
        <Divider />
        <StatGrid items={[{ label: 'App errors (last 24h)', value: n(metrics.errors_last_24h), highlight: metrics.errors_last_24h > 0 }]} />
      </Card>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    wrap: { gap: spacing.md },
    cardTitle: { marginBottom: spacing.md },
    chart: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT, gap: 3, borderBottomWidth: 1, borderBottomColor: t.colors.border },
    barSlot: { flex: 1, justifyContent: 'flex-end' },
    axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
    cell: { width: '50%', paddingRight: spacing.md },
  }),
);
