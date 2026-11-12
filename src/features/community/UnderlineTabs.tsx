import { SegmentedControl } from '../../components/ui';

/**
 * Underline segmented control: heading-font labels over a hairline with a sliding primary bar.
 * Thin wrapper over the kit's SegmentedControl (variant "underline"); kept for existing callers.
 */
export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return <SegmentedControl variant="underline" options={options} value={value} onChange={onChange} />;
}
