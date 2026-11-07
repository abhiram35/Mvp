import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Button, Screen, Text } from '../../components/ui';
import { ThemeOptionCard, ThemePickerList } from '../../features/profile/ThemeOptionCard';
import { CreateThemeCard } from '../../features/themes/CreateThemeCard';
import { RenameThemeModal } from '../../features/themes/RenameThemeModal';
import { deleteTheme, renameTheme, useThemeQuota } from '../../features/themes/api';
import { customRowId, spacing, useCustomThemes, useTheme, useThemeSwitcher, type AppTheme } from '../../theme';

/** Theme picker: the three built-ins, the player's saved AI themes, and "Create with AI". */
export default function ThemeScreen() {
  const t = useTheme();
  const { themeId, setThemeId } = useThemeSwitcher();
  const { customThemes, customStatus, refreshCustomThemes, removeCustomTheme, renameCustomTheme } = useCustomThemes();
  const { quota, loading: quotaLoading, error: quotaError, refresh: refreshQuota, setQuota } = useThemeQuota();
  const [renaming, setRenaming] = useState<AppTheme | null>(null);

  const confirmDelete = (theme: AppTheme) => {
    const rowId = customRowId(theme.id);
    if (!rowId) return;
    Alert.alert(`Delete ${theme.name}?`, "This can't be undone, and it won't give back this month's AI theme.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTheme(rowId);
            removeCustomTheme(theme.id);
            void refreshQuota();
          } catch (e) {
            Alert.alert("Couldn't delete", e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  const openOptions = (theme: AppTheme) => {
    Alert.alert(theme.name, undefined, [
      { text: 'Rename', onPress: () => setRenaming(theme) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(theme) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const saveRename = async (name: string) => {
    const theme = renaming;
    const rowId = theme ? customRowId(theme.id) : null;
    if (!theme || !rowId) return;
    const saved = await renameTheme(rowId, name);
    renameCustomTheme(theme.id, saved);
    setRenaming(null);
  };

  const savedLimit = quota?.saved_limit ?? 6;

  return (
    <Screen scroll edges={['bottom']}>
      <Text muted style={{ marginTop: spacing.lg, marginBottom: spacing.lg }}>
        Pick the look of your GG. Your choice is saved on this phone, and switching is always free.
      </Text>

      <Text variant="heading" accessibilityRole="header" style={{ marginBottom: spacing.md }}>Built-in</Text>
      <ThemePickerList themeId={themeId} onSelect={setThemeId} />

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md }}>
        <Text variant="heading" accessibilityRole="header">Your themes</Text>
        {customStatus === 'loaded' ? <Text variant="caption">{customThemes.length}/{savedLimit} saved</Text> : null}
      </View>
      {customStatus === 'loading' && customThemes.length === 0 ? (
        <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
          <ActivityIndicator color={t.colors.primary} />
        </View>
      ) : customStatus === 'error' && customThemes.length === 0 ? (
        <View style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
          <Text muted>Couldn't load your saved themes.</Text>
          <Button title="Try again" variant="secondary" size="sm" onPress={() => void refreshCustomThemes()} />
        </View>
      ) : customThemes.length === 0 ? (
        <Text muted>No AI themes yet. Describe a vibe below and we'll design one for you.</Text>
      ) : (
        <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
          {customThemes.map((ct) => (
            <ThemeOptionCard
              key={ct.id}
              theme={ct}
              selected={themeId === ct.id}
              onPress={() => setThemeId(ct.id)}
              onMore={() => openOptions(ct)}
            />
          ))}
        </View>
      )}

      <View style={{ marginTop: spacing.xl }}>
        <CreateThemeCard
          quota={quota}
          quotaLoading={quotaLoading}
          quotaError={quotaError}
          onQuota={setQuota}
          onRefreshQuota={() => void refreshQuota()}
        />
      </View>

      <RenameThemeModal
        visible={!!renaming}
        initialName={renaming?.name ?? ''}
        onCancel={() => setRenaming(null)}
        onSave={saveRename}
      />
    </Screen>
  );
}
