import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, ChipRow, Text, TextField } from '../../components/ui';
import type { ThemeQuota } from '../../lib/types';
import { SPEC_LIMITS, makeStyles, spacing, useCustomThemes, useTheme, useThemeSwitcher, type AppTheme } from '../../theme';
import { ThemePreview } from '../profile/ThemeOptionCard';
import { ThemeGenerationError, cleanPrompt, formatResetDate, generateTheme, isValidPrompt } from './api';

const EXAMPLES = [
  'Cold Norse war, blood and gold',
  'Overgrown ruined city, rust and moss',
  'Neon cyberpunk rain at night',
  'Desert wasteland, sun-bleached',
];

type Phase = { kind: 'idle' } | { kind: 'generating' } | { kind: 'preview'; theme: AppTheme; quota: ThemeQuota | null };

/** "2 of 2 left this month · resets 1 Dec" */
function quotaLine(q: ThemeQuota): string {
  const reset = `resets ${formatResetDate(q.resets_at)}`;
  return q.remaining > 0 ? `${q.remaining} of ${q.limit} left this month · ${reset}` : `None left · ${reset}`;
}

/**
 * "Create with AI": describe a vibe → the generate-theme function designs, saves and
 * counts a theme → preview it → use it now or keep it for later.
 */
export function CreateThemeCard({
  quota,
  quotaLoading,
  quotaError,
  onQuota,
  onRefreshQuota,
}: {
  quota: ThemeQuota | null;
  quotaLoading: boolean;
  quotaError: string | null;
  onQuota: (q: ThemeQuota) => void;
  onRefreshQuota: () => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const { setThemeId } = useThemeSwitcher();
  const { addCustomTheme, refreshCustomThemes } = useCustomThemes();
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const noQuota = !!quota && quota.remaining <= 0;
  const storageFull = !!quota && quota.saved >= quota.saved_limit;
  const valid = isValidPrompt(prompt);
  const length = cleanPrompt(prompt).length;
  const generating = phase.kind === 'generating';

  const generate = async () => {
    if (!valid || noQuota || storageFull || generating) return;
    setError(null);
    setPhase({ kind: 'generating' });
    try {
      const res = await generateTheme(prompt);
      addCustomTheme(res.theme);
      if (res.quota) onQuota(res.quota);
      else onRefreshQuota();
      setPhase({ kind: 'preview', theme: res.theme, quota: res.quota });
    } catch (e) {
      const err = e instanceof ThemeGenerationError ? e : new ThemeGenerationError('internal', 'Something went wrong. Try again in a minute.', null, true);
      setError(err.message);
      setPhase({ kind: 'idle' });
      if (err.quota) onQuota(err.quota);
      if (err.uncertain) {
        onRefreshQuota();
        void refreshCustomThemes();
      }
    }
  };

  const done = (use: boolean) => {
    if (phase.kind !== 'preview') return;
    if (use) setThemeId(phase.theme.id);
    setPrompt('');
    setPhase({ kind: 'idle' });
  };

  if (phase.kind === 'preview') {
    const p = phase.theme;
    const q = phase.quota ?? quota;
    return (
      <Card style={s.card}>
        <View style={s.titleRow}>
          <Ionicons name="sparkles" size={18} color={t.colors.primary} />
          <Text variant="heading" accessibilityRole="header" style={{ flexShrink: 1 }}>Your new theme</Text>
        </View>
        <ThemePreview theme={p} size="lg" />
        <View style={{ gap: 2 }}>
          <Text variant="heading">{p.name}</Text>
          {p.vibe ? <Text variant="label">{p.vibe}</Text> : null}
        </View>
        <Text variant="caption" accessibilityLiveRegion="polite">
          {q
            ? `Used 1 of this month's ${q.limit} AI themes · ${q.remaining > 0 ? `${q.remaining} left` : 'none left'} until ${formatResetDate(q.resets_at)}. It's saved in Your themes.`
            : "Used 1 of this month's 2 AI themes. It's saved in Your themes."}
        </Text>
        <Button title="Use this theme" icon="color-palette-outline" onPress={() => done(true)} backdrop={t.colors.surface} />
        <Button title="Keep for later" variant="secondary" onPress={() => done(false)} />
      </Card>
    );
  }

  let quotaText: string;
  if (quota) quotaText = quotaLine(quota);
  else if (quotaLoading) quotaText = 'Checking how many you have left…';
  else quotaText = quotaError ? "Couldn't check how many you have left." : '2 per month';

  return (
    <Card style={s.card}>
      <View style={s.titleRow}>
        <Ionicons name="sparkles" size={18} color={t.colors.primary} />
        <Text variant="heading" accessibilityRole="header" style={{ flexShrink: 1 }}>Create with AI</Text>
      </View>
      <Text muted>
        Describe a vibe and our AI designer builds a full GG look — colours, fonts, shapes and words. Layouts stay the same.
      </Text>

      <TextField
        label="Describe your theme"
        placeholder="e.g. Cold Norse war, blood and gold"
        value={prompt}
        onChangeText={(v) => {
          setPrompt(v);
          if (error) setError(null);
        }}
        multiline
        maxLength={SPEC_LIMITS.promptMax}
        editable={!generating}
        hint={`${length}/${SPEC_LIMITS.promptMax}`}
        error={length > 0 && length < SPEC_LIMITS.promptMin ? `At least ${SPEC_LIMITS.promptMin} characters.` : null}
      />
      <View style={{ marginTop: -spacing.lg }}>
        <Text variant="caption" style={{ marginBottom: spacing.xs }}>Try one</Text>
        <ChipRow>
          {EXAMPLES.map((ex) => (
            <Chip key={ex} label={ex} selected={cleanPrompt(prompt) === ex} onPress={generating ? undefined : () => setPrompt(ex)} />
          ))}
        </ChipRow>
      </View>

      <View style={s.quotaRow}>
        <Ionicons name="flash-outline" size={14} color={noQuota ? t.colors.danger : t.colors.textMuted} />
        <Text variant="label" style={[{ flexShrink: 1 }, noQuota && { color: t.colors.danger }]}>{quotaText}</Text>
      </View>
      {storageFull ? (
        <Text variant="label" style={{ color: t.colors.danger }}>
          You have {quota?.saved_limit ?? 6} saved themes. Delete one to make room.
        </Text>
      ) : null}

      {generating ? (
        <View style={s.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={t.colors.primary} />
          <Text muted>Designing your theme…</Text>
        </View>
      ) : (
        <Button
          title="Generate"
          icon="sparkles-outline"
          onPress={generate}
          disabled={!valid || noQuota || storageFull}
          backdrop={t.colors.surface}
          accessibilityLabel="Generate theme. Uses 1 of this month's AI themes."
        />
      )}
      {error ? (
        <Text variant="label" style={{ color: t.colors.danger }} accessibilityLiveRegion="assertive">{error}</Text>
      ) : null}

      <Text variant="caption">Uses 1 of your 2 monthly AI themes only when it works. Inspired-by themes only — no official logos or characters.</Text>
    </Card>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    card: { gap: spacing.md },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    quotaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, minHeight: 50 },
  }),
);
