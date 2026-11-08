import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Text } from '../../components/ui';
import { isSquadable } from '../games/art';
import { useGames } from '../games/useGames';
import { spacing } from '../../theme';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/** A single-select row of chips that scrolls sideways instead of wrapping. */
export function HorizontalChips<T extends string>({
  options,
  value,
  onChange,
  allLabel,
  label,
  allowDeselect,
}: {
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (v: T | null) => void;
  /** When set, a leading "all" chip selects null. */
  allLabel?: string;
  label?: string;
  /** Tapping the selected chip clears it (for optional filters without an "all" chip). */
  allowDeselect?: boolean;
}) {
  return (
    <View>
      {label ? (
        <Text variant="label" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {allLabel ? <Chip label={allLabel} selected={value === null} onPress={() => onChange(null)} /> : null}
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={value === o.value}
            onPress={() => onChange(allowDeselect && value === o.value ? null : o.value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** Compact sideways-scrolling game selector built on useGames. */
export function GameChipScroller({
  value,
  onChange,
  allowAll,
  label,
  squadOnly,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  allowAll?: boolean;
  label?: string;
  /** Only games you can team up in (hides single-player story games). */
  squadOnly?: boolean;
}) {
  const { games: all, loading, error } = useGames();
  const games = squadOnly ? all.filter(isSquadable) : all;
  if (loading) return <Text muted style={styles.label}>Loading games…</Text>;
  if (error) return <Text style={styles.label} muted>Couldn&apos;t load games: {error}</Text>;
  return (
    <HorizontalChips
      label={label}
      options={games.map((g) => ({ value: g.id, label: `${g.emoji} ${g.name}` }))}
      value={value}
      onChange={onChange}
      allLabel={allowAll ? 'All games' : undefined}
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  label: { marginBottom: spacing.xs },
});
