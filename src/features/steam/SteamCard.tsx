import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Text } from '../../components/ui';
import { useLatestRef } from '../../lib/hooks';
import type { SteamAccount } from '../../lib/types';
import { errorMessage } from '../../lib/supabase';
import { makeStyles, spacing, useTheme } from '../../theme';
import { steamHeaderUrl } from '../games/art';
import { useGames } from '../games/useGames';
import {
  addProfileGames,
  claimSteamOutcome,
  formatHours,
  linkSteam,
  matchCatalog,
  STEAM_LINK_SUPPORTED,
  subscribeSteamChanges,
  syncSteam,
  unlinkSteam,
} from './api';

const COLLAPSED_COUNT = 6;
const STEAM_PROFILE_PREFIX = 'https://steamcommunity.com/';
/** Same rule as in-game IDs (steam_accounts RLS → gg_can_see_game_ids). */
export const STEAM_PRIVACY_COPY =
  "Only you, your friends, your squadmates and people who've messaged you can see your Steam name, profile and games.";

/** Only real Steam Community pages are opened. */
export function safeSteamProfileUrl(url: string | null | undefined): string | null {
  return typeof url === 'string' && url.startsWith(STEAM_PROFILE_PREFIX) ? url : null;
}

/** Steam header art with a fallback when it fails to load (same pattern as GameLogo). */
function SteamArt({ appid }: { appid: number }) {
  const t = useTheme();
  const s = useStyles();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[s.art, s.artFallback]}>
        <Ionicons name="logo-steam" size={16} color={t.colors.textMuted} />
      </View>
    );
  }
  return (
    <Image
      source={steamHeaderUrl(appid)}
      style={s.art}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={String(appid)}
      onError={() => setFailed(true)}
      accessible={false}
    />
  );
}

/**
 * Steam section of a profile.
 * Own profile: link / refresh / unlink, and add matching games to your Vinq profile.
 * Someone else's: their verified Steam account and top games (hidden when not linked).
 */
export function SteamCard({
  account,
  own,
  profileId,
  myGameIds = [],
  onChanged,
  loadError = false,
  onRetry,
}: {
  account: SteamAccount | null;
  own?: boolean;
  profileId: string;
  myGameIds?: string[];
  onChanged?: () => void;
  /** Loading the Steam account failed (so "not linked" is unknown). */
  loadError?: boolean;
  onRetry?: () => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const { games: catalog } = useGames();
  const [busy, setBusy] = useState<'link' | 'sync' | 'unlink' | 'add' | null>(null);
  const [expanded, setExpanded] = useState(false);
  const onChangedRef = useLatestRef(onChanged);

  // The /steam-linked route may finish a link after the browser closed (Android): refresh then too.
  useEffect(() => {
    if (!own) return;
    return subscribeSteamChanges(() => onChangedRef.current?.());
  }, [own, onChangedRef]);

  if (!account && !own) return null;
  // Every action is disabled while one runs (e.g. a Refresh finishing after Unlink would re-link).
  const locked = busy !== null;

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Steam', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const link = () =>
    run('link', async () => {
      try {
        const res = await linkSteam();
        if (res.status === 'error' && claimSteamOutcome()) Alert.alert("Couldn't link Steam", res.message);
      } finally {
        // Whatever the result, the card re-reads the account once the browser has closed.
        onChanged?.();
      }
    });

  const openProfile = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert('Steam', "Couldn't open the Steam profile."));
  };

  if (!account && loadError) {
    return (
      <Card style={s.card}>
        <View style={s.headRow}>
          <Ionicons name="logo-steam" size={22} color={t.colors.text} />
          <Text variant="heading">Steam</Text>
        </View>
        <Text muted style={{ marginVertical: spacing.sm }}>Couldn&apos;t load your Steam account.</Text>
        {onRetry ? <Button title="Try again" icon="refresh" variant="secondary" size="sm" onPress={onRetry} /> : null}
      </Card>
    );
  }

  if (!account) {
    if (!STEAM_LINK_SUPPORTED) return null;
    return (
      <Card style={s.card}>
        <View style={s.headRow}>
          <Ionicons name="logo-steam" size={22} color={t.colors.text} />
          <Text variant="heading">Steam</Text>
        </View>
        <Text muted style={{ marginTop: spacing.sm }}>
          Link your Steam account to show your library and add your games in one tap. You sign in on Steam&apos;s own
          page, so Vinq never sees your password.
        </Text>
        <Text variant="caption" muted style={{ marginTop: spacing.xs, marginBottom: spacing.sm }}>
          {STEAM_PRIVACY_COPY}
        </Text>
        <Button
          title="Sign in through Steam"
          icon="logo-steam"
          backdrop={t.colors.surface}
          onPress={() => void link()}
          loading={busy === 'link'}
          disabled={locked}
        />
      </Card>
    );
  }

  const matched = matchCatalog(account.games, catalog);
  const toAdd = matched.filter((m) => !myGameIds.includes(m.game.id));
  const shown = expanded ? account.games : account.games.slice(0, COLLAPSED_COUNT);
  const profileUrl = safeSteamProfileUrl(account.profile_url);

  const unlink = () =>
    Alert.alert('Unlink Steam?', 'Your Steam library will be removed from your Vinq profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink',
        style: 'destructive',
        onPress: () =>
          void run('unlink', async () => {
            await unlinkSteam(profileId);
            onChanged?.();
          }),
      },
    ]);

  return (
    <Card style={s.card}>
      <View style={s.headRow}>
        <Avatar uri={account.avatar_url} name={account.persona_name ?? 'Steam'} size={40} />
        <View style={{ flex: 1 }}>
          <Text variant="heading" numberOfLines={1}>{account.persona_name ?? 'Steam player'}</Text>
          <View style={s.verified}>
            <Ionicons name="checkmark-circle" size={14} color={t.colors.accent} />
            <Text variant="caption" style={{ color: t.colors.accent }}>Verified Steam account</Text>
          </View>
        </View>
        {profileUrl ? (
          <Button
            title="Open"
            icon="open-outline"
            variant="ghost"
            size="sm"
            onPress={() => openProfile(profileUrl)}
            accessibilityLabel="Open Steam profile"
          />
        ) : null}
      </View>

      {!account.library_public ? (
        <Text muted style={{ marginTop: spacing.md }}>
          {own
            ? 'Your Steam game library is private. In Steam go to Profile → Edit Profile → Privacy Settings, set "Game details" to Public, then tap Refresh.'
            : 'Their Steam library is private.'}
        </Text>
      ) : account.games.length === 0 ? (
        <Text muted style={{ marginTop: spacing.md }}>
          {own
            ? 'No played games showing on Steam yet. Play something, then tap Refresh.'
            : 'No played games showing on Steam yet.'}
        </Text>
      ) : (
        <>
          <Text variant="label" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
            {account.game_count} games · most played
          </Text>
          {shown.map((g) => (
            <View key={g.appid} style={s.gameRow} accessible accessibilityLabel={`${g.name}, ${formatHours(g.playtime_hours)} played`}>
              <SteamArt appid={g.appid} />
              <Text style={{ flex: 1 }} numberOfLines={1}>{g.name}</Text>
              <Text variant="caption" muted>{formatHours(g.playtime_hours)}</Text>
            </View>
          ))}
          {account.games.length > COLLAPSED_COUNT ? (
            <Button
              title={expanded ? 'Show less' : `Show ${account.games.length - COLLAPSED_COUNT} more`}
              variant="ghost"
              size="sm"
              onPress={() => setExpanded((e) => !e)}
            />
          ) : null}
        </>
      )}

      {own ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text variant="caption" muted>
            {STEAM_PRIVACY_COPY}
          </Text>
          {toAdd.length > 0 ? (
            <Button
              title={`Add ${toAdd.length} Steam ${toAdd.length === 1 ? 'game' : 'games'} to my profile`}
              icon="add-circle-outline"
              backdrop={t.colors.surface}
              onPress={() =>
                void run('add', async () => {
                  await addProfileGames(profileId, toAdd.map((m) => m.game.id));
                  onChanged?.();
                })
              }
              loading={busy === 'add'}
              disabled={locked}
            />
          ) : null}
          <View style={s.actions}>
            <Button
              title="Refresh"
              icon="refresh"
              variant="secondary"
              size="sm"
              style={{ flex: 1 }}
              loading={busy === 'sync'}
              disabled={locked}
              onPress={() =>
                void run('sync', async () => {
                  await syncSteam();
                  onChanged?.();
                })
              }
            />
            <Button
              title="Unlink"
              variant="ghost"
              size="sm"
              style={{ flex: 1 }}
              loading={busy === 'unlink'}
              disabled={locked}
              onPress={unlink}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: { marginTop: spacing.lg },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    verified: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
    gameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xs,
      minHeight: 44,
    },
    art: { width: 64, height: 30, borderRadius: Math.min(t.radius.sm, 6), backgroundColor: t.colors.surfaceRaised },
    artFallback: { alignItems: 'center', justifyContent: 'center' },
    actions: { flexDirection: 'row', gap: spacing.sm },
  }),
);
