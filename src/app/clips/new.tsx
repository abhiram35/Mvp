// Share a clip: paste a YouTube / Twitch / Medal link, pick the game, add a title and caption.
import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, ErrorState, LoadingState, Screen, Text, TextField } from '../../components/ui';
import { clipErrorMessage, postClip } from '../../features/clips/api';
import { ClipMedia } from '../../features/clips/ClipMedia';
import { CLIP_LIMITS, clipCupChoices, keepCupChoice, parseClipUrl, PLATFORM_LABELS, validateClipDraft } from '../../features/clips/logic';
import { GamePicker } from '../../features/games/GamePicker';
import { HorizontalChips } from '../../features/lfg/HorizontalChips';
import { fetchMyClipTournaments, useLoader } from '../../features/tournaments/api';
import { useNow } from '../../lib/hooks';
import { useUserId } from '../../providers/AuthProvider';
import { useGames } from '../../features/games/useGames';
import { BannedBanner } from '../../features/moderation/BannedBanner';
import { useMyStatus } from '../../features/moderation/useMyStatus';
import { makeStyles, spacing, useDesign, useTheme } from '../../theme';

export default function NewClipScreen() {
  const t = useTheme();
  const d = useDesign();
  const s = useStyles();
  const { byId, loading: gamesLoading, error: gamesError } = useGames();
  const { banned } = useMyStatus();
  const myId = useUserId();
  const now = useNow(60_000);
  // Optional cup link: tournaments one of my teams entered (or I organise). Clips linked to a
  // cup fill the Cups feed; the server checks the same rule.
  const myCups = useLoader(() => (myId ? fetchMyClipTournaments(myId) : Promise.resolve([])), `clip-cups:${myId ?? ''}`);

  const [url, setUrl] = useState('');
  const [gameId, setGameId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [cupPick, setCupPick] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const parsed = useMemo(() => parseClipUrl(url), [url]);
  const errors = validateClipDraft({ url, gameId, title, caption });
  const valid = Object.keys(errors).length === 0;
  // Live link validation: only complain once something was typed (or on submit).
  const urlError = url.trim() || touched ? errors.url : undefined;
  const game = gameId ? byId(gameId) : undefined;
  const cups = useMemo(() => clipCupChoices(myCups.data ?? [], gameId, now), [myCups.data, gameId, now]);
  // Changing the game drops a cup of another game.
  const tournamentId = keepCupChoice(cupPick, cups);

  const paste = async () => {
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (text) setUrl(text);
    } catch {
      // Clipboard unavailable: the field still works.
    }
  };

  const submit = async () => {
    setTouched(true);
    if (!valid || !gameId || submitting || banned) return;
    setSubmitting(true);
    try {
      const id = await postClip({ url, gameId, title, caption, tournamentId });
      router.replace({ pathname: '/clips/[id]', params: { id } });
    } catch (e) {
      Alert.alert("Couldn't share clip", clipErrorMessage(e));
      setSubmitting(false);
    }
  };

  const header = <Stack.Screen options={{ title: 'Share a clip' }} />;
  if (gamesLoading) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <LoadingState />
      </Screen>
    );
  }
  if (gamesError) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <ErrorState message={gamesError} />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom']}>
      {header}
      {banned ? <BannedBanner force /> : null}
      <View style={{ height: spacing.lg }} />

      <Text muted style={{ marginBottom: spacing.lg }}>
        Paste a link from YouTube (videos and Shorts), Twitch or Medal. Vinq links to it; the video stays where it is.
      </Text>

      <TextField
        label="Clip link"
        value={url}
        onChangeText={setUrl}
        placeholder="https://youtu.be/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        textContentType="URL"
        editable={!banned}
        error={urlError}
        hint={parsed ? `${PLATFORM_LABELS[parsed.platform]} link ✓` : 'YouTube, Twitch or Medal · https only'}
      />
      {!url.trim() && !banned ? (
        <Button title="Paste link" icon="clipboard-outline" variant="secondary" size="sm" onPress={() => void paste()} style={{ alignSelf: 'flex-start', marginTop: -spacing.sm, marginBottom: spacing.lg }} />
      ) : null}

      {parsed ? (
        <View
          style={[s.preview, { borderRadius: d.lang.corner === 'soft' ? t.radius.lg : t.radius.md }]}
          accessible
          accessibilityLabel={`Preview: ${PLATFORM_LABELS[parsed.platform]} clip${title.trim() ? `, ${title.trim()}` : ''}`}
        >
          <ClipMedia
            compact
            clip={{ platform: parsed.platform, video_id: parsed.videoId, title: title.trim() || 'Your clip title', game_id: gameId }}
            game={game}
          />
          <View style={s.previewBadge}>
            <Text variant="kicker" style={{ color: '#FFFFFF' }}>
              {PLATFORM_LABELS[parsed.platform]}
            </Text>
          </View>
        </View>
      ) : null}

      <GamePicker label="Game" value={gameId} onChange={setGameId} />
      {touched && errors.game ? (
        <Text variant="caption" style={{ color: t.colors.danger, marginTop: -spacing.md, marginBottom: spacing.lg }}>
          {errors.game}
        </Text>
      ) : null}

      {cups.length > 0 ? (
        <View style={{ marginBottom: spacing.lg }}>
          <HorizontalChips
            label="Tournament (optional)"
            allLabel="None"
            options={cups.map((c) => ({ value: c.id, label: c.name }))}
            value={tournamentId}
            onChange={setCupPick}
          />
          <Text variant="caption" muted style={{ marginTop: spacing.xs }}>
            {tournamentId ? 'This clip will also show in the Cups feed.' : 'Played this in a cup your team entered? Link it to show it in Cups.'}
          </Text>
        </View>
      ) : null}

      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. 1v4 clutch on Ascent"
        maxLength={CLIP_LIMITS.titleMax + 20}
        editable={!banned}
        error={touched || title.trim().length > CLIP_LIMITS.titleMax ? errors.title : undefined}
        hint={`${title.trim().length}/${CLIP_LIMITS.titleMax}`}
      />
      <TextField
        label="Caption (optional)"
        value={caption}
        onChangeText={setCaption}
        placeholder="What happened? Keep it about the game."
        multiline
        maxLength={CLIP_LIMITS.captionMax + 50}
        editable={!banned}
        error={errors.caption}
        hint={`${caption.trim().length}/${CLIP_LIMITS.captionMax}`}
      />

      <Button
        title={banned ? 'Sharing is paused' : 'Share clip'}
        icon="film-outline"
        onPress={() => void submit()}
        loading={submitting}
        disabled={banned || (touched && !valid)}
      />
      {banned ? (
        <Text muted style={{ marginTop: spacing.md, textAlign: 'center' }}>
          Your account is paused, so you can&apos;t share clips right now.
        </Text>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    preview: { height: 200, overflow: 'hidden', marginBottom: spacing.lg },
    previewBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4 },
  }),
);
