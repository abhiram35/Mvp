import { Chip, ChipRow, Text } from '../../components/ui';
import { GAME_CATEGORY_LABELS } from '../../lib/types';
import { spacing } from '../../theme';
import { View } from 'react-native';
import { groupByCategory } from './art';
import { useGames } from './useGames';

/**
 * Pick one game (value: string | null) or several (multiple + values: string[]).
 * Games are grouped into Competitive / Co-op & Casual / Story sections.
 */
export function GamePicker(
  props:
    | { multiple?: false; value: string | null; onChange: (id: string | null) => void; allowAll?: boolean; label?: string }
    | { multiple: true; values: string[]; onChange: (ids: string[]) => void; label?: string },
) {
  const { games, loading } = useGames();
  if (loading) return <Text muted>Loading games…</Text>;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {props.label ? <Text variant="label" style={{ marginBottom: spacing.sm }}>{props.label}</Text> : null}
      {!props.multiple && props.allowAll ? (
        <ChipRow>
          <Chip label="All games" selected={props.value === null} onPress={() => props.onChange(null)} />
        </ChipRow>
      ) : null}
      {groupByCategory(games).map((group) => (
        <View key={group.category} style={{ marginTop: spacing.md }}>
          <Text variant="caption" muted style={{ marginBottom: spacing.xs }} accessibilityRole="header">
            {GAME_CATEGORY_LABELS[group.category]}
          </Text>
          <ChipRow>
            {group.games.map((g) => {
              const selected = props.multiple ? props.values.includes(g.id) : props.value === g.id;
              return (
                <Chip
                  key={g.id}
                  label={`${g.emoji} ${g.name}`}
                  selected={selected}
                  onPress={() => {
                    if (props.multiple) {
                      props.onChange(selected ? props.values.filter((v) => v !== g.id) : [...props.values, g.id]);
                    } else {
                      props.onChange(g.id);
                    }
                  }}
                />
              );
            })}
          </ChipRow>
        </View>
      ))}
    </View>
  );
}
