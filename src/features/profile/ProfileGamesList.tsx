import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/ui';
import type { ProfileGame } from '../../lib/types';
import { fontSize, makeStyles, spacing } from '../../theme';
import { useGames } from '../games/useGames';

/** Games on a player card as thin ruled rows: game name in the heading font, rank/role muted. */
export function ProfileGamesList({ games }: { games: ProfileGame[] }) {
  const s = useStyles();
  const { byId } = useGames();
  return (
    <View>
      <Text variant="heading" style={{ marginBottom: spacing.sm }}>Games</Text>
      {games.length === 0 ? (
        <Text muted>No games added yet.</Text>
      ) : (
        <View style={s.list}>
          {games.map((pg) => {
            const game = byId(pg.game_id);
            const details = [pg.rank, pg.role].filter(Boolean).join(' · ');
            const name = game?.name ?? pg.game_id;
            return (
              <View key={pg.game_id} style={s.row} accessible accessibilityLabel={details ? `${name}, ${details}` : name}>
                <Text style={s.emoji}>{game?.emoji ?? '🎮'}</Text>
                <Text variant="heading" style={s.name} numberOfLines={1}>{name}</Text>
                {details ? <Text variant="label" numberOfLines={1} style={s.details}>{details}</Text> : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      paddingHorizontal: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    emoji: { fontSize: fontSize.lg, marginRight: spacing.md },
    name: { flexShrink: 1 },
    details: { marginLeft: 'auto', paddingLeft: spacing.md, flexShrink: 1, textAlign: 'right' },
  }),
);
