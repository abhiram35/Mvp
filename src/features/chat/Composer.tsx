import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../../components/ui';
import { colors, font, radius, spacing } from '../../theme';
import { MAX_MESSAGE_LENGTH } from './useMessages';

/** Multiline message box + send button. `onSend` should throw on failure (text is restored). */
export function Composer({ onSend }: { onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_MESSAGE_LENGTH && !sending;
  const nearLimit = text.length > MAX_MESSAGE_LENGTH - 200;

  const submit = async () => {
    if (!canSend) return;
    const draft = text;
    setSending(true);
    setText('');
    try {
      await onSend(trimmed);
    } catch {
      // Restore the draft so nothing is lost (the caller shows the error).
      setText((current) => (current.length === 0 ? draft : current));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      {nearLimit ? (
        <Text variant="caption" style={[styles.counter, text.length > MAX_MESSAGE_LENGTH && { color: colors.danger }]}>
          {text.length}/{MAX_MESSAGE_LENGTH}
        </Text>
      ) : null}
      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          style={styles.input}
          accessibilityLabel="Message"
          editable={!sending}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend, busy: sending }}
          disabled={!canSend}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: canSend ? (pressed ? colors.primaryPressed : colors.primary) : colors.surfaceRaised },
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Ionicons name="send" size={18} color={canSend ? colors.onPrimary : colors.textFaint} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    color: colors.text,
    fontSize: font.size.md,
    textAlignVertical: 'top',
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  counter: { textAlign: 'right', marginBottom: spacing.xs },
});
