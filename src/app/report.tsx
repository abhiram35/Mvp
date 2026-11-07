import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Chip, ChipRow, EmptyState, Screen, Text, TextField } from '../components/ui';
import { errorMessage, supabase } from '../lib/supabase';
import { REPORT_REASON_LABELS, type ReportReason, type ReportTarget } from '../lib/types';
import { useUserId } from '../providers/AuthProvider';
import { makeStyles, spacing, useTheme } from '../theme';

const TARGETS: ReportTarget[] = ['profile', 'message', 'lfg_post'];
const DETAILS_MAX = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default function ReportScreen() {
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const type = first(params.type) as ReportTarget | undefined;
  const id = first(params.id);
  const me = useUserId();
  const t = useTheme();
  const styles = useStyles();
  const TARGET_LABELS: Record<ReportTarget, string> = { profile: 'player', message: 'message', lfg_post: `${t.words.squad} post` };
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const valid = !!type && TARGETS.includes(type) && !!id && UUID_RE.test(id);
  if (!valid) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="alert-circle-outline"
          title="Nothing to report"
          message="This report link is missing information."
          action={<Button title="Go back" variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  const submit = async () => {
    if (!reason) {
      setError('Pick a reason');
      return;
    }
    if (details.length > DETAILS_MAX) {
      setError(`Details can be at most ${DETAILS_MAX} characters`);
      return;
    }
    setError(null);
    setSubmitting(true);
    const { error: insErr } = await supabase.from('reports').insert({
      reporter_id: me,
      target_type: type,
      target_id: id,
      reason,
      details: details.trim() ? details.trim() : null,
    });
    setSubmitting(false);
    if (insErr) {
      setError(errorMessage(insErr));
      return;
    }
    Alert.alert('Thanks for reporting', 'Our moderators will review this. You can also block the player to stop seeing them.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <Screen scroll edges={['bottom']}>
      <Text variant="title" style={{ marginTop: spacing.lg }}>Report {TARGET_LABELS[type]}</Text>
      <Text muted style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}>
        Reports are anonymous. Tell us what's wrong and our team will take a look.
      </Text>

      <Text variant="label" style={{ marginBottom: spacing.sm }}>Reason</Text>
      <ChipRow>
        {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((r) => (
          <Chip key={r} label={REPORT_REASON_LABELS[r]} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </ChipRow>
      <View style={{ height: spacing.xl }} />

      <TextField
        label="Details (optional)"
        value={details}
        onChangeText={setDetails}
        placeholder="What happened? Include anything that helps us understand."
        multiline
        maxLength={DETAILS_MAX}
        hint={`${details.length}/${DETAILS_MAX}`}
        style={{ minHeight: 120 }}
      />

      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Button title="Submit report" icon="flag" variant="danger" onPress={submit} loading={submitting} />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    error: { color: t.colors.danger, textAlign: 'center', marginBottom: spacing.md },
  }),
);
