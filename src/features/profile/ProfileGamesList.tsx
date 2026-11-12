import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SectionHeader, Text } from '../../components/ui';
import { GAME_CATEGORY_LABELS, PLAY_STATUS_LABELS, type Game, type ProfileGame } from '../../lib/types';
import { designTokens, makeStyles, mixHex, spacing, useTheme } from '../../theme';
import { CATEGORY_ORDER, gameCategory } from '../games/art';
import { GameLogo } from '../games/GameLogo';
import { useGames } from '../games/useGames';

/**
 * Games on a player card, grouped into Competitive / Co-op & Casual / Story.
 * Each row: artwork, name, rank/role or story progress, and the in-game ID when visible.
 */
export function ProfileGamesList({ games, gameIds = {} }: { games: ProfileGame[]; gameIds?: Record<string, string> }) {
  const s = useStyles();
  const { byId } = useGames();

  const groups = useMemo(() => {
    const rows = games.map((pg) => ({ pg, game: byId(pg.game_id) }));
    // "Playing now" first inside each group.
    rows.sort((a, b) => Number(b.pg.play_status === 'playing') - Number(a.pg.play_status === 'playing'));
    return CATEGORY_ORDER.map((category) => ({
      category,
      rows: rows.filter((r) => gameCategory(r.game) === category),
    })).filter((g) => g.rows.length > 0);
  }, [games, byId]);

  return (
    <View>
      <SectionHeader index={1} kicker="Loadout" title="Games" style={{ marginTop: 0 }} />
      {games.length === 0 ? (
        <Text muted>No games added yet.</Text>
      ) : (
        groups.map((group) => (
          <View key={group.category} style={s.group}>
            <Text variant="caption" style={s.groupLabel} accessibilityRole="header">
              {GAME_CATEGORY_LABELS[group.category]}
            </Text>
            <View style={s.list}>
              {group.rows.map(({ pg, game }) => (
                <GameRow key={pg.game_id} pg={pg} game={game} inGameId={gameIds[pg.game_id]} />
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function GameRow({ pg, game, inGameId }: { pg: ProfileGame; game: Game | undefined; inGameId?: string }) {
  const t = useTheme();
  const s = useStyles();
  const name = game?.name ?? pg.game_id;
  const details = [pg.rank, pg.role].filter(Boolean).join(' · ');
  const status = pg.play_status ? PLAY_STATUS_LABELS[pg.play_status] : null;

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    if (!inGameId) return;
    let ok = false;
    try {
      ok = await Clipboard.setStringAsync(inGameId);
    } catch {
      ok = false;
    }
    setCopyState(ok ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyState('idle'), 2000);
  };

  const a11y = [name, status, details, inGameId ? `ID ${inGameId}` : null].filter(Boolean).join(', ');

  return (
    <View style={s.row} accessible={!inGameId} accessibilityLabel={a11y}>
      <GameLogo game={game} height={30} />
      <View style={s.text}>
        <Text variant="heading" style={s.name} numberOfLines={1}>{name}</Text>
        {inGameId ? (
          <Pressable
            onPress={() => void copy()}
            accessibilityRole="button"
            accessibilityLabel={`${name} ID ${inGameId}. Tap to copy`}
            accessibilityHint={copyState === 'copied' ? 'Copied' : undefined}
            style={({ pressed }) => [s.idRow, pressed && { backgroundColor: t.colors.surfaceRaised }]}
          >
            <Text variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>ID {inGameId}</Text>
            <Ionicons
              name={copyState === 'copied' ? 'checkmark' : 'copy-outline'}
              size={14}
              color={copyState === 'copied' ? t.colors.accent : t.colors.textMuted}
            />
            {copyState !== 'idle' ? (
              <Text
                variant="caption"
                accessibilityLiveRegion="polite"
                style={{ color: copyState === 'copied' ? t.colors.accent : t.colors.danger }}
              >
                {copyState === 'copied' ? 'Copied' : "Couldn't copy"}
              </Text>
            ) : null}
          </Pressable>
        ) : null}
      </View>
      {status ? (
        <View style={[s.badge, pg.play_status === 'playing' && s.badgePlaying]}>
          <Text variant="caption" style={{ color: pg.play_status === 'playing' ? t.colors.text : t.colors.textMuted, fontFamily: t.fonts.bodyBold }}>
            {status}
          </Text>
        </View>
      ) : details ? (
        <Text variant="label" numberOfLines={1} style={s.details}>{details}</Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    group: { marginBottom: spacing.md },
    groupLabel: { marginBottom: spacing.xs, color: t.colors.textMuted, fontFamily: t.fonts.bodyBold, letterSpacing: 1.4, textTransform: 'uppercase' },
    list: {},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: designTokens(t).hairline,
    },
    text: { flexShrink: 1, flexGrow: 1 },
    name: { flexShrink: 1 },
    // ≥44pt tall tap target; negative margin keeps the row visually compact.
    idRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 44,
      minWidth: 44,
      marginVertical: -8,
      paddingRight: spacing.sm,
      alignSelf: 'flex-start',
      borderRadius: t.radius.sm,
    },
    details: { marginLeft: 'auto', paddingLeft: spacing.sm, flexShrink: 1, textAlign: 'right' },
    badge: {
      marginLeft: 'auto',
      backgroundColor: designTokens(t).chip.bg,
      borderRadius: t.radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    // "Playing now": accent-tinted fill with the plain text colour (always readable).
    badgePlaying: { backgroundColor: mixHex(t.colors.bg, t.colors.accent, t.dark ? 0.28 : 0.22) },
  }),
);
