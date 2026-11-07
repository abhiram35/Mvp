import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Text } from '../../components/ui';
import { REPORT_REASON_LABELS, type ReportQueueItem } from '../../lib/types';
import { makeStyles, spacing, useTheme } from '../../theme';
import { timeAgo } from '../community/format';
import { REPORT_TARGET_LABELS } from './api';

export type ReportCardAction = { kind: 'dismiss' } | { kind: 'remove' } | { kind: 'ban'; days: 1 | 7 | 30 } | { kind: 'unban' };

const BAN_OPTIONS = [1, 7, 30] as const;

/** One report in the moderation queue, with the moderator actions available for its status. */
export function ReportCard({
  item,
  busy,
  onAction,
}: {
  item: ReportQueueItem;
  /** An action for this report is running: disable all buttons. */
  busy: boolean;
  onAction: (item: ReportQueueItem, action: ReportCardAction) => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const { report, reporter, target_user: target } = item;
  const canRemove = report.target_type !== 'profile' && item.target_preview !== null;
  const open = report.status !== 'actioned';
  const targetName = target ? target.display_name || target.username : null;

  return (
    <Card style={s.card}>
      <View style={s.headRow}>
        <Text variant="heading" style={s.flex} numberOfLines={2}>{REPORT_REASON_LABELS[report.reason] ?? report.reason}</Text>
        <Text variant="caption">{timeAgo(report.created_at)}</Text>
      </View>
      <Text variant="label">{REPORT_TARGET_LABELS[report.target_type] ?? report.target_type}</Text>

      {report.details ? (
        <Text selectable style={s.details}>“{report.details}”</Text>
      ) : null}

      <View style={s.preview}>
        {item.target_preview !== null ? (
          <Text selectable>{item.target_preview}</Text>
        ) : (
          <Text muted>Content already deleted.</Text>
        )}
      </View>

      {target ? (
        <Pressable
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: target.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Reported player ${targetName}, @${target.username}. Open profile`}
          style={({ pressed }) => [s.userRow, pressed && { backgroundColor: t.colors.surfaceRaised }]}
        >
          <Avatar uri={target.avatar_url} name={targetName} size={36} backdrop={t.colors.surface} />
          <View style={s.flex}>
            <Text variant="strong" numberOfLines={1}>{targetName}</Text>
            <Text variant="caption" numberOfLines={1}>@{target.username}</Text>
          </View>
          <Text variant="label" style={{ color: t.colors.primary }}>Profile</Text>
        </Pressable>
      ) : (
        <Text muted style={s.userRow}>Reported player not found (account deleted).</Text>
      )}

      <Text variant="caption">Reported by {reporter.display_name || reporter.username} (@{reporter.username})</Text>
      <View style={s.counts}>
        <Text variant="label">Open reports against this user: <Text variant="strong">{item.open_reports_against_user}</Text></Text>
        <Text variant="label">
          Toxic flags (30 days):{' '}
          <Text variant="strong" style={item.toxic_flags_30d >= 3 ? { color: t.colors.danger } : undefined}>{item.toxic_flags_30d}</Text>
        </Text>
      </View>

      {open ? (
        <View style={s.actions}>
          {report.status === 'open' ? (
            <Button size="sm" variant="secondary" title="Dismiss" disabled={busy} onPress={() => onAction(item, { kind: 'dismiss' })} backdrop={t.colors.surface} />
          ) : null}
          {canRemove ? (
            <Button size="sm" variant="secondary" title="Remove content" icon="trash-outline" disabled={busy} onPress={() => onAction(item, { kind: 'remove' })} backdrop={t.colors.surface} />
          ) : null}
          {target
            ? BAN_OPTIONS.map((days) => (
                <Button
                  key={days}
                  size="sm"
                  variant="danger"
                  title={`Ban ${days}d`}
                  accessibilityLabel={`Ban for ${days} ${days === 1 ? 'day' : 'days'}`}
                  disabled={busy}
                  onPress={() => onAction(item, { kind: 'ban', days })}
                  backdrop={t.colors.surface}
                />
              ))
            : null}
        </View>
      ) : target ? (
        <View style={s.actions}>
          <Button size="sm" variant="ghost" title="Lift ban" icon="lock-open-outline" disabled={busy} onPress={() => onAction(item, { kind: 'unban' })} />
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: { gap: spacing.sm, marginBottom: spacing.md },
    headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    flex: { flex: 1 },
    details: { color: t.colors.textMuted, fontFamily: t.fonts.body },
    preview: {
      backgroundColor: t.colors.bg,
      borderLeftWidth: 3,
      borderLeftColor: t.colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingVertical: spacing.xs },
    counts: { gap: 2 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  }),
);
