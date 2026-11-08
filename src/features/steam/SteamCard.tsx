import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Text } from '../../components/ui';
import type { SteamAccount } from '../../lib/types';
import { errorMessage } from '../../lib/supabase';
import { makeStyles, spacing, useTheme } from '../../theme';
import { steamHeaderUrl } from '../games/art';
import { useGames } from '../games/useGames';
import { addProfileGames, formatHours, linkSteam, matchCatalog, syncSteam, unlinkSteam } from './api';

const COLLAPSED_COUNT = 6;

/**
 * Steam section of a profile.
 * Own profile: link / refresh / unlink, and add matching games to your GG profile.
 * Someone else's: their verified Steam account and top games (hidden when not linked).
 */
export function SteamCard({
  account,
  own,
  profileId,
  myGameIds = [],
  onChanged,
}: {
  account: SteamAccount | null;
  own?: boolean;
  profileId: string;
  myGameIds?: string[];
  onChanged?: () => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const { games: catalog } = useGames();
  const [busy, setBusy] = useState<'link' | 'sync' | 'unlink' | 'add' | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (!account && !own) return null;

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
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
      const res = await linkSteam();
      if (res.status === 'error') Alert.alert("Couldn't link Steam", res.message);
      if (res.status === 'linked') onChanged?.();
    });

  if (!account) {
    return (
      <Card style={s.card}>
        <View style={s.headRow}>
          <Ionicons name="logo-steam" size={22} color={t.colors.text} />
          <Text variant="heading">Steam</Text>
        </View>
        <Text muted style={{ marginVertical: spacing.sm }}>
          Link your Steam account to show your library and add your games in one tap. You sign in on Steam&apos;s own
          page, so GG never sees your password.
        </Text>
        <Button title="Sign in through Steam" icon="logo-steam" backdrop={t.colors.surface} onPress={() => void link()} loading={busy === 'link'} />
      </Card>
    );
  }

  const matched = matchCatalog(account.games, catalog);
  const toAdd = matched.filter((m) => !myGameIds.includes(m.game.id));
  const shown = expanded ? account.games : account.games.slice(0, COLLAPSED_COUNT);

  const unlink = () =>
    Alert.alert('Unlink Steam?', 'Your Steam library will be removed from your GG profile.', [
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
        {account.profile_url ? (
          <Button
            title="Open"
            icon="open-outline"
            variant="ghost"
            size="sm"
            onPress={() => void Linking.openURL(account.profile_url as string)}
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
      ) : (
        <>
          <Text variant="label" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
            {account.game_count} games · most played
          </Text>
          {shown.map((g) => (
            <View key={g.appid} style={s.gameRow} accessible accessibilityLabel={`${g.name}, ${formatHours(g.playtime_hours)} played`}>
              <Image source={steamHeaderUrl(g.appid)} style={s.art} contentFit="cover" cachePolicy="memory-disk" recyclingKey={String(g.appid)} />
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
              onPress={() =>
                void run('sync', async () => {
                  await syncSteam();
                  onChanged?.();
                })
              }
            />
            <Button title="Unlink" variant="ghost" size="sm" style={{ flex: 1 }} loading={busy === 'unlink'} onPress={unlink} />
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
    actions: { flexDirection: 'row', gap: spacing.sm },
  }),
);
