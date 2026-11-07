import { StyleSheet, View } from 'react-native';
import { Card, Text } from '../../components/ui';
import type { ProfileGame } from '../../lib/types';
import { font, spacing } from '../../theme';
import { useGames } from '../games/useGames';

export function ProfileGamesList({ games }: { games: ProfileGame[] }) {
  const { byId } = useGames();
  return (
    <View>
      <Text variant="heading" style={{ marginBottom: spacing.md }}>Games</Text>
      {games.length === 0 ? (
        <Text muted>No games added yet.</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {games.map((pg) => {
            const game = byId(pg.game_id);
            const details = [pg.rank, pg.role].filter(Boolean).join(' · ');
            return (
              <Card key={pg.game_id} style={styles.row}>
                <Text style={styles.emoji}>{game?.emoji ?? '🎮'}</Text>
                <View style={{ flex: 1 }}>
                  <Text variant="heading">{game?.name ?? pg.game_id}</Text>
                  {details ? <Text muted>{details}</Text> : null}
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  emoji: { fontSize: font.size.xxl, marginRight: spacing.md },
});
