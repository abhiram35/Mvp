import { Text, Screen } from '../../components/ui';
import { ThemePickerList } from '../../features/profile/ThemeOptionCard';
import { spacing, useThemeSwitcher } from '../../theme';

/** Theme picker: Protocol / Defuse / Ronin. Tapping a card re-themes the whole app instantly. */
export default function ThemeScreen() {
  const { themeId, setThemeId } = useThemeSwitcher();
  return (
    <Screen scroll edges={['bottom']}>
      <Text muted style={{ marginTop: spacing.lg, marginBottom: spacing.lg }}>
        Pick the look of your GG. Saved on this phone, and you can switch any time.
      </Text>
      <ThemePickerList themeId={themeId} onSelect={setThemeId} />
    </Screen>
  );
}
