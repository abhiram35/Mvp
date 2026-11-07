import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Button, Chip, Divider, ErrorState, LoadingState, Screen, Text, TextField } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import { createLfgPost } from '../../features/lfg/api';
import { DURATION_OPTIONS, LFG_LIMITS, REGIONS, regionLabel } from '../../features/lfg/format';
import { GameChipScroller, HorizontalChips } from '../../features/lfg/HorizontalChips';
import { errorMessage } from '../../lib/supabase';
import { LANGUAGES, type Region } from '../../lib/types';
import { useAuth, useUserId } from '../../providers/AuthProvider';
import { colors, font, radius, spacing } from '../../theme';

const REGION_OPTIONS = REGIONS.map((r) => ({ value: r, label: regionLabel(r) }));

function Section({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <View style={styles.section}>
      <Text variant="label" style={styles.sectionLabel}>
        {label}
      </Text>
      {children}
      {hint ? (
        <Text variant="caption" style={{ marginTop: spacing.xs }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function Stepper({ value, onChange, min, max }: { value: number; onChange: (n: number) => void; min: number; max: number }) {
  const btn = (icon: 'remove' | 'add', next: number, disabled: boolean, label: string) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.stepBtn, pressed && { backgroundColor: colors.surfaceRaised }, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Players needed"
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + 1));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - 1));
      }}
    >
      {btn('remove', Math.max(min, value - 1), value <= min, 'One fewer player')}
      <Text style={styles.stepValue}>{value}</Text>
      {btn('add', Math.min(max, value + 1), value >= max, 'One more player')}
    </View>
  );
}

export default function NewLfgPostScreen() {
  const { profile } = useAuth();
  const myId = useUserId();
  const { byId, loading: gamesLoading, error: gamesError } = useGames();

  const [gameId, setGameId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rank, setRank] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>(profile?.region ?? 'india_north');
  const [language, setLanguage] = useState<string>(profile?.languages?.[0] ?? 'English');
  const [slots, setSlots] = useState(1);
  const [micRequired, setMicRequired] = useState(false);
  const [durationHours, setDurationHours] = useState<number>(3);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const game = byId(gameId);

  // Rank options depend on the game; clear a rank that doesn't belong to the new game.
  useEffect(() => {
    setRank(null);
  }, [gameId]);

  // My languages first, then the rest.
  const languageOptions = Array.from(new Set([...(profile?.languages ?? []), ...LANGUAGES])).map((l) => ({ value: l, label: l }));

  const trimmedTitle = title.trim();
  const gameError = touched && !gameId ? 'Pick a game' : null;
  const titleError = touched && trimmedTitle.length === 0 ? 'Give your post a title' : null;

  const submit = async () => {
    setTouched(true);
    if (!gameId || trimmedTitle.length === 0 || !myId) return;
    setSubmitting(true);
    try {
      const id = await createLfgPost(myId, {
        game_id: gameId,
        title: trimmedTitle.slice(0, LFG_LIMITS.title),
        description: description.trim() ? description.trim().slice(0, LFG_LIMITS.description) : null,
        rank,
        region,
        language,
        slots_needed: slots,
        mic_required: micRequired,
        durationHours,
      });
      router.replace({ pathname: '/lfg/[id]', params: { id } });
    } catch (e) {
      Alert.alert("Couldn't post", errorMessage(e));
      setSubmitting(false);
    }
  };

  if (gamesLoading) {
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  }
  if (gamesError) {
    return (
      <Screen edges={[]}>
        <ErrorState message={gamesError} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll edges={['bottom']}>
        <View style={{ height: spacing.lg }} />

        <Section label="Game *">
          <GameChipScroller value={gameId} onChange={setGameId} />
          {gameError ? <Text variant="caption" style={styles.error}>{gameError}</Text> : null}
        </Section>

        <TextField
          label="Title *"
          placeholder="e.g. Need 2 for ranked push tonight"
          value={title}
          onChangeText={setTitle}
          maxLength={LFG_LIMITS.title}
          error={titleError}
          hint={`${title.length}/${LFG_LIMITS.title}`}
          returnKeyType="next"
        />

        <TextField
          label="Details (optional)"
          placeholder="What are you playing, what's the vibe, any requirements?"
          value={description}
          onChangeText={setDescription}
          maxLength={LFG_LIMITS.description}
          multiline
          hint={`${description.length}/${LFG_LIMITS.description}`}
        />

        {game && game.ranks.length > 0 ? (
          <Section label="Rank wanted (optional)">
            <HorizontalChips
              options={game.ranks.map((r) => ({ value: r, label: r }))}
              value={rank}
              onChange={setRank}
              allLabel="Any rank"
            />
          </Section>
        ) : null}

        <Section label="Region">
          <HorizontalChips options={REGION_OPTIONS} value={region} onChange={(r) => r && setRegion(r)} />
        </Section>

        <Section label="Language">
          <HorizontalChips options={languageOptions} value={language} onChange={(l) => l && setLanguage(l)} />
        </Section>

        <Divider />

        <View style={styles.inlineRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body">Players needed</Text>
            <Text variant="caption">How many more teammates?</Text>
          </View>
          <Stepper value={slots} onChange={setSlots} min={LFG_LIMITS.minSlots} max={LFG_LIMITS.maxSlots} />
        </View>

        <View style={styles.inlineRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body">Mic required</Text>
            <Text variant="caption">Only players with a mic should ask</Text>
          </View>
          <Switch
            value={micRequired}
            onValueChange={setMicRequired}
            accessibilityLabel="Mic required"
            trackColor={{ false: colors.surfaceRaised, true: colors.primary }}
            thumbColor={colors.text}
          />
        </View>

        <Divider />

        <Section label="Post stays up for">
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((d) => (
              <Chip key={d.hours} label={d.label} selected={durationHours === d.hours} onPress={() => setDurationHours(d.hours)} />
            ))}
          </View>
        </Section>

        <Text variant="caption" style={styles.guidelines}>
          Keep it friendly. Toxic, hateful or spam posts get removed and can lead to a ban.
        </Text>

        <Button title="Post to LFG board" icon="flash" onPress={submit} loading={submitting} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionLabel: { marginBottom: spacing.xs },
  error: { color: colors.danger, marginTop: spacing.xs },
  inlineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, minHeight: 56 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  stepValue: { minWidth: 28, textAlign: 'center', fontSize: font.size.lg, fontWeight: font.weight.bold },
  durationRow: { flexDirection: 'row', gap: spacing.sm },
  guidelines: { marginBottom: spacing.md, textAlign: 'center' },
});
