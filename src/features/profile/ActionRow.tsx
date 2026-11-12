import { ListRow, type IconName } from '../../components/ui';

/**
 * A settings row: tonal icon tile, label, optional value and chevron, hairline divider.
 * Thin wrapper over the kit's ListRow (flush, for rows inside a padded Screen).
 */
export function ActionRow({
  icon,
  label,
  value,
  onPress,
  danger,
  disabled,
  last,
}: {
  icon: IconName;
  label: string;
  /** Short current value shown before the chevron (e.g. the active theme). */
  value?: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Omit the bottom rule on the last row of a group. */
  last?: boolean;
}) {
  return (
    <ListRow
      flush
      icon={icon}
      title={label}
      value={value}
      onPress={onPress}
      danger={danger}
      disabled={disabled}
      divider={last ? 'none' : 'inset'}
      accessibilityLabel={value ? `${label}, ${value}` : label}
    />
  );
}
