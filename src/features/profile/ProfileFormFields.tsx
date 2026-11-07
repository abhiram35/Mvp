// Field groups shared by onboarding (one group per step) and the edit-profile screen.
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Chip, ChipRow, Text, TextField } from '../../components/ui';
import {
  LANGUAGES,
  PLAY_STYLE_LABELS,
  PLAY_TIME_LABELS,
  REGION_LABELS,
  type PlayStyle,
  type PlayTime,
  type Region,
} from '../../lib/types';
import { makeStyles, spacing, useTheme } from '../../theme';
import { GamePicker } from '../games/GamePicker';
import { useGames } from '../games/useGames';
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  ROLE_MAX,
  normaliseUsername,
  type AboutValues,
  type FieldErrors,
  type GameEntry,
  type IdentityValues,
  type PrefsValues,
} from './form';
import type { UsernameStatus } from './useUsernameAvailability';

function FieldError({ message }: { message?: string }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <Text variant="caption" style={{ color: t.colors.danger, marginTop: spacing.xs }} accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}

function Section({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text variant="label" style={{ marginBottom: spacing.sm }}>{label}</Text>
      {children}
      <FieldError message={error} />
    </View>
  );
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// ── Step 1: username + display name ─────────────────────────────────────────
const USERNAME_HINTS: Record<UsernameStatus, string | null> = {
  idle: '3–20 characters: lowercase letters, numbers or _',
  invalid: null,
  checking: 'Checking…',
  available: '✓ Available',
  taken: null,
  error: null,
};

export function IdentityFields({
  values,
  onChange,
  errors,
  usernameStatus,
}: {
  values: IdentityValues;
  onChange: (patch: Partial<IdentityValues>) => void;
  errors: FieldErrors;
  usernameStatus: UsernameStatus;
}) {
  const theme = useTheme();
  const statusError =
    usernameStatus === 'taken'
      ? 'That username is taken'
      : usernameStatus === 'error'
        ? "Couldn't check username. Check your connection."
        : null;
  return (
    <View>
      <TextField
        label="Username"
        value={values.username}
        onChangeText={(t) => onChange({ username: normaliseUsername(t) })}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        placeholder="e.g. clutch_king"
        maxLength={20}
        error={statusError ?? errors.username}
        hint={USERNAME_HINTS[usernameStatus] ?? undefined}
      />
      <TextField
        label="Display name"
        value={values.display_name}
        onChangeText={(t) => onChange({ display_name: t })}
        placeholder={`What ${theme.words.squad}mates call you`}
        maxLength={DISPLAY_NAME_MAX}
        error={errors.display_name}
      />
    </View>
  );
}

// ── Step 2: region, languages, style, mic, play times ───────────────────────
export function PrefsFields({
  values,
  onChange,
  errors,
}: {
  values: PrefsValues;
  onChange: (patch: Partial<PrefsValues>) => void;
  errors: FieldErrors;
}) {
  return (
    <View>
      <Section label="Region" error={errors.region}>
        <ChipRow>
          {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
            <Chip key={r} label={REGION_LABELS[r]} selected={values.region === r} onPress={() => onChange({ region: r })} />
          ))}
        </ChipRow>
      </Section>
      <Section label="Languages you speak" error={errors.languages}>
        <ChipRow>
          {LANGUAGES.map((l) => (
            <Chip
              key={l}
              label={l}
              selected={values.languages.includes(l)}
              onPress={() => onChange({ languages: toggle(values.languages, l) })}
            />
          ))}
        </ChipRow>
      </Section>
      <Section label="Play style" error={errors.play_style}>
        <ChipRow>
          {(Object.keys(PLAY_STYLE_LABELS) as PlayStyle[]).map((s) => (
            <Chip key={s} label={PLAY_STYLE_LABELS[s]} selected={values.play_style === s} onPress={() => onChange({ play_style: s })} />
          ))}
        </ChipRow>
      </Section>
      <Section label="Do you use a mic?" error={errors.has_mic}>
        <ChipRow>
          <Chip icon="mic-outline" label="Yes, mic on" selected={values.has_mic === true} onPress={() => onChange({ has_mic: true })} />
          <Chip icon="mic-off-outline" label="No mic" selected={values.has_mic === false} onPress={() => onChange({ has_mic: false })} />
        </ChipRow>
      </Section>
      <Section label="When do you usually play?" error={errors.play_times}>
        <ChipRow>
          {(Object.keys(PLAY_TIME_LABELS) as PlayTime[]).map((t) => (
            <Chip
              key={t}
              label={PLAY_TIME_LABELS[t]}
              selected={values.play_times.includes(t)}
              onPress={() => onChange({ play_times: toggle(values.play_times, t) })}
            />
          ))}
        </ChipRow>
      </Section>
    </View>
  );
}

// ── Step 3: games + optional rank/role ──────────────────────────────────────
export function GamesFields({
  games,
  onChange,
  errors,
}: {
  games: GameEntry[];
  onChange: (games: GameEntry[]) => void;
  errors: FieldErrors;
}) {
  const { byId, error: gamesError } = useGames();
  const ids = games.map((g) => g.game_id);

  const setIds = (next: string[]) => {
    onChange(next.map((id) => games.find((g) => g.game_id === id) ?? { game_id: id, rank: null, role: '' }));
  };
  const patch = (id: string, p: Partial<GameEntry>) => onChange(games.map((g) => (g.game_id === id ? { ...g, ...p } : g)));

  return (
    <View>
      {gamesError ? <FieldError message={`Couldn't load games: ${gamesError}`} /> : null}
      <GamePicker multiple values={ids} onChange={setIds} label="Games you play" />
      <FieldError message={errors.games} />
      {games.map((entry) => {
        const game = byId(entry.game_id);
        if (!game) return null;
        return (
          <Card key={entry.game_id} style={{ marginTop: spacing.md }}>
            <Text variant="heading" style={{ marginBottom: spacing.md }}>
              {game.emoji} {game.name}
            </Text>
            {game.ranks.length > 0 ? (
              <View style={{ marginBottom: spacing.lg }}>
                <Text variant="label" style={{ marginBottom: spacing.sm }}>Rank (optional)</Text>
                <ChipRow>
                  {game.ranks.map((r) => (
                    <Chip
                      key={r}
                      label={r}
                      selected={entry.rank === r}
                      onPress={() => patch(entry.game_id, { rank: entry.rank === r ? null : r })}
                    />
                  ))}
                </ChipRow>
              </View>
            ) : null}
            <TextField
              label="Role (optional)"
              value={entry.role}
              onChangeText={(t) => patch(entry.game_id, { role: t })}
              placeholder="e.g. IGL, Sniper, Duelist"
              maxLength={ROLE_MAX}
              error={errors[`role_${entry.game_id}`]}
            />
          </Card>
        );
      })}
    </View>
  );
}

// ── Step 4: avatar + bio ────────────────────────────────────────────────────
export function AboutFields({
  values,
  onChange,
  errors,
  displayName,
}: {
  values: AboutValues;
  onChange: (patch: Partial<AboutValues>) => void;
  errors: FieldErrors;
  displayName: string;
}) {
  const t = useTheme();
  const styles = useStyles();
  const [picking, setPicking] = useState(false);
  const shownUri = values.localAvatarUri ?? values.avatar_url;

  const pick = async () => {
    setPicking(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access in Settings to choose a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) onChange({ localAvatarUri: result.assets[0].uri });
    } catch {
      Alert.alert("Couldn't open photos", 'Please try again.');
    } finally {
      setPicking(false);
    }
  };

  const remove = () => onChange({ localAvatarUri: null, avatar_url: null });

  return (
    <View>
      <Section label="Profile picture (optional)">
        <View style={styles.avatarRow}>
          <Pressable
            onPress={pick}
            accessibilityRole="button"
            accessibilityLabel="Choose profile picture"
            style={styles.avatarPress}
          >
            <Avatar uri={shownUri} name={displayName || '?'} size={88} />
            <View style={styles.avatarBadge}>
              <Ionicons name="camera" size={16} color={t.colors.onPrimary} />
            </View>
          </Pressable>
          <View style={{ marginLeft: spacing.lg, gap: spacing.sm, flex: 1 }}>
            <Button title={shownUri ? 'Change photo' : 'Choose photo'} variant="secondary" size="sm" onPress={pick} loading={picking} />
            {shownUri ? <Button title="Remove" variant="ghost" size="sm" onPress={remove} /> : null}
          </View>
        </View>
      </Section>
      <TextField
        label="Bio (optional)"
        value={values.bio}
        onChangeText={(t) => onChange({ bio: t })}
        placeholder={`Main game, best clutch, what ${t.words.squad} you're looking for…`}
        multiline
        maxLength={BIO_MAX}
        error={errors.bio}
        hint={`${values.bio.length}/${BIO_MAX}`}
      />
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarPress: { width: 88, height: 88 },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: t.id === 'ronin' ? 15 : t.radius.sm,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.colors.bg,
  },
  }),
);
