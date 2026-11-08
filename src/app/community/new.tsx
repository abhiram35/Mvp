import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button, EmptyState, ErrorState, LoadingState, Screen, Text, TextField, type IconName } from '../../components/ui';
import { communityErrorMessage, createPost, updatePost, useCommunityPost } from '../../features/community/api';
import { COMMUNITY_LIMITS } from '../../features/community/format';
import { useGames } from '../../features/games/useGames';
import { Checkbox } from '../../features/profile/Checkbox';
import { HorizontalChips } from '../../features/lfg/HorizontalChips';
import { BannedBanner } from '../../features/moderation/BannedBanner';
import { useMyStatus } from '../../features/moderation/useMyStatus';
import type { CommunityPostKind } from '../../lib/types';
import { useUserId } from '../../providers/AuthProvider';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';

const KIND_OPTIONS: { kind: CommunityPostKind; title: string; hint: string; icon: IconName }[] = [
  { kind: 'take', title: 'Share a take', hint: 'Opinions, reviews, tier lists, patch rants', icon: 'megaphone-outline' },
  { kind: 'question', title: 'Ask a question', hint: 'Get help from players: lag, settings, ranked tips', icon: 'help-circle-outline' },
];

const PLACEHOLDERS: Record<CommunityPostKind, { title: string; body: string }> = {
  take: {
    title: 'e.g. The new patch made snipers way too strong',
    body: 'Say what you think and why. Keep it about the game, not the players.',
  },
  question: {
    title: 'e.g. Ping jumps to 200+ every evening on BGMI',
    body: 'Include your device or PC specs, the game mode, and what you already tried. The more detail, the faster someone can help.',
  },
};

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default function NewCommunityPostScreen() {
  const params = useLocalSearchParams<{ edit?: string; kind?: string }>();
  const editId = single(params.edit);
  const presetKind = single(params.kind);
  const editing = !!editId;
  const t = useTheme();
  const s = useStyles();
  const myId = useUserId();
  const { games, loading: gamesLoading, error: gamesError } = useGames();
  const existing = useCommunityPost(editId);

  const [kind, setKind] = useState<CommunityPostKind | null>(
    presetKind === 'take' || presetKind === 'question' ? presetKind : null,
  );
  const [gameId, setGameId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const { banned } = useMyStatus();
  // Paused players can still edit their own posts, but not create new ones.
  const blockedByBan = banned && !editing;

  // Editing: fill the form once the post has loaded (state adjusted during render, not in an effect).
  if (editing && !prefilled && existing.summary) {
    const p = existing.summary.post;
    setKind(p.kind);
    setGameId(p.game_id);
    setTitle(p.title);
    setBody(p.body);
    setSpoiler(p.is_spoiler);
    setPrefilled(true);
  }

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const kindError = touched && !kind ? 'Choose what you are posting' : null;
  const titleError =
    touched && trimmedTitle.length < COMMUNITY_LIMITS.titleMin
      ? `Title needs at least ${COMMUNITY_LIMITS.titleMin} characters`
      : trimmedTitle.length > COMMUNITY_LIMITS.titleMax
        ? `Keep the title under ${COMMUNITY_LIMITS.titleMax} characters`
        : null;
  const bodyError =
    touched && trimmedBody.length < COMMUNITY_LIMITS.bodyMin
      ? kind === 'question'
        ? 'Describe the problem'
        : 'Write something'
      : trimmedBody.length > COMMUNITY_LIMITS.bodyMax
        ? `Keep it under ${COMMUNITY_LIMITS.bodyMax} characters`
        : null;

  const valid =
    !!kind &&
    trimmedTitle.length >= COMMUNITY_LIMITS.titleMin &&
    trimmedTitle.length <= COMMUNITY_LIMITS.titleMax &&
    trimmedBody.length >= COMMUNITY_LIMITS.bodyMin &&
    trimmedBody.length <= COMMUNITY_LIMITS.bodyMax;

  const submit = async () => {
    setTouched(true);
    if (!valid || !kind || submitting) return;
    setSubmitting(true);
    try {
      if (editing && editId) {
        await updatePost(editId, { title: trimmedTitle, body: trimmedBody, game_id: gameId, is_spoiler: spoiler });
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: '/community/[id]', params: { id: editId } });
      } else {
        const id = await createPost({ kind, game_id: gameId, title: trimmedTitle, body: trimmedBody, is_spoiler: spoiler });
        router.replace({ pathname: '/community/[id]', params: { id } });
      }
    } catch (e) {
      Alert.alert(editing ? "Couldn't save changes" : "Couldn't post", communityErrorMessage(e));
      setSubmitting(false);
    }
  };

  const screenTitle = editing ? 'Edit post' : kind === 'question' ? 'Ask a question' : kind === 'take' ? 'Share a take' : 'New post';
  const header = <Stack.Screen options={{ title: screenTitle }} />;

  if (gamesLoading || (editing && existing.loading && !existing.summary)) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <LoadingState />
      </Screen>
    );
  }
  if (editing && existing.error && !existing.summary) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <ErrorState message={existing.error} onRetry={() => void existing.reload()} />
      </Screen>
    );
  }
  if (editing && (!existing.summary || existing.summary.post.author_id !== myId)) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <EmptyState
          icon="lock-closed-outline"
          title="You can't edit this post"
          message="It may have been deleted, or it isn't yours."
          action={<Button title="Go back" variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  const placeholders = PLACEHOLDERS[kind ?? 'take'];
  const submitLabel = editing ? 'Save changes' : kind === 'question' ? 'Ask question' : 'Post take';

  return (
    <>
      <Screen scroll edges={['bottom']}>
        {header}
        {blockedByBan ? <BannedBanner force /> : null}
        <View style={{ height: spacing.lg }} />

        {editing ? null : (
          <View style={s.section}>
            <Text variant="label" style={s.sectionLabel}>
              What are you posting?
            </Text>
            <View style={s.kinds} accessibilityRole="radiogroup">
              {KIND_OPTIONS.map((o) => {
                const selected = kind === o.kind;
                return (
                  <Pressable
                    key={o.kind}
                    onPress={() => setKind(o.kind)}
                    accessibilityRole="radio"
                    accessibilityLabel={`${o.title}. ${o.hint}`}
                    accessibilityState={{ selected, checked: selected }}
                    style={({ pressed }) => [
                      s.kind,
                      selected && s.kindSelected,
                      pressed && !selected && { backgroundColor: t.colors.surfaceRaised },
                    ]}
                  >
                    <Ionicons name={o.icon} size={26} color={selected ? t.colors.primary : t.colors.textMuted} />
                    <Text variant="heading" style={s.kindTitle}>
                      {o.title}
                    </Text>
                    <Text variant="caption" style={s.kindHint}>
                      {o.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {kindError ? (
              <Text variant="caption" style={s.error}>
                {kindError}
              </Text>
            ) : null}
          </View>
        )}

        <View style={s.section}>
          <Text variant="label" style={s.sectionLabel}>
            Game (optional)
          </Text>
          {gamesError ? (
            <Text variant="caption">Couldn&apos;t load games. Your post will go under General.</Text>
          ) : (
            <HorizontalChips
              options={games.map((g) => ({ value: g.id, label: `${g.emoji} ${g.name}` }))}
              value={gameId}
              onChange={(id) => {
                setGameId(id);
                // Story posts are spoiler-tagged by default; the author can turn it off.
                if (!editing && games.find((g) => g.id === id)?.category === 'story') setSpoiler(true);
              }}
              allLabel="General"
            />
          )}
        </View>

        <TextField
          label="Title"
          placeholder={placeholders.title}
          value={title}
          onChangeText={setTitle}
          maxLength={COMMUNITY_LIMITS.titleMax}
          error={titleError}
          hint={`${title.length}/${COMMUNITY_LIMITS.titleMax}`}
          returnKeyType="next"
        />

        <TextField
          label={kind === 'question' ? 'Details' : 'Your take'}
          placeholder={placeholders.body}
          value={body}
          onChangeText={setBody}
          maxLength={COMMUNITY_LIMITS.bodyMax}
          multiline
          error={bodyError}
          hint={`${body.length}/${COMMUNITY_LIMITS.bodyMax}`}
          style={s.bodyInput}
        />

        <Checkbox
          checked={spoiler}
          onChange={setSpoiler}
          accessibilityLabel="Contains spoilers"
          label={
            <View>
              <Text>Contains spoilers</Text>
              <Text variant="caption">The text is hidden until someone taps to read it. Keep spoilers out of the title.</Text>
            </View>
          }
        />

        <Text variant="caption" style={s.guideline}>
          Keep it respectful. Posts that target players get removed.
        </Text>

        <Button title={submitLabel} onPress={() => void submit()} loading={submitting} disabled={(touched && !valid) || blockedByBan} />
      </Screen>
    </>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    section: { marginBottom: spacing.lg },
    sectionLabel: { marginBottom: spacing.sm },
    kinds: { flexDirection: 'row', gap: spacing.md },
    kind: {
      flex: 1,
      minHeight: 120,
      padding: spacing.md,
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.lg,
      backgroundColor: t.colors.surface,
    },
    kindSelected: { borderColor: t.colors.primary, borderWidth: 2, padding: spacing.md - 1, backgroundColor: t.colors.surfaceRaised },
    kindTitle: { fontSize: fontSize.lg, marginTop: spacing.xs },
    kindHint: { color: t.colors.textMuted, lineHeight: 16 },
    error: { color: t.colors.danger, marginTop: spacing.xs },
    bodyInput: { minHeight: 180 },
    guideline: { marginBottom: spacing.lg },
  }),
);
