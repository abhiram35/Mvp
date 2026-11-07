import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, TextField } from '../../components/ui';
import { SPEC_LIMITS, makeStyles, spacing, useTheme } from '../../theme';

/** Small centred dialog to rename a saved custom theme (Alert.prompt is iOS-only). */
export function RenameThemeModal({
  visible,
  initialName,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initialName: string;
  onCancel: () => void;
  /** Resolve to close; throw (Error with a message) to show it under the field. */
  onSave: (name: string) => Promise<void>;
}) {
  const s = useStyles();
  const t = useTheme();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setError(null);
      setSaving(false);
    }
  }, [visible, initialName]);

  const clean = name.replace(/\s+/g, ' ').trim();
  const valid = clean.length >= SPEC_LIMITS.nameMin && clean.length <= SPEC_LIMITS.nameMax;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(clean);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename. Try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={s.sheet} accessibilityViewIsModal>
          <Text variant="heading" accessibilityRole="header">Rename theme</Text>
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            maxLength={SPEC_LIMITS.nameMax}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={save}
            error={error ?? (clean.length > 0 && clean.length < SPEC_LIMITS.nameMin ? `At least ${SPEC_LIMITS.nameMin} characters.` : null)}
            hint={`${clean.length}/${SPEC_LIMITS.nameMax}`}
          />
          <View style={s.row}>
            <Button title="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
            <Button title="Save" onPress={save} disabled={!valid} loading={saving} style={{ flex: 1 }} backdrop={t.colors.surface} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'center', padding: spacing.xl },
    sheet: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.lg,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: spacing.lg,
      gap: spacing.md,
    },
    row: { flexDirection: 'row', gap: spacing.md },
  }),
);
