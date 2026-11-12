import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Notch, Text } from '../../components/ui';
import { designTokens, fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { MAX_MESSAGE_LENGTH } from './useMessages';

/** Multiline message box + send button. `onSend` should throw on failure (text is restored). */
export function Composer({ onSend }: { onSend: (text: string) => Promise<void> }) {
  const t = useTheme();
  const styles = useStyles();
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
        <Text variant="caption" style={[styles.counter, text.length > MAX_MESSAGE_LENGTH && { color: t.colors.danger }]}>
          {text.length}/{MAX_MESSAGE_LENGTH}
        </Text>
      ) : null}
      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={t.colors.textFaint}
          selectionColor={t.colors.primary}
          cursorColor={t.colors.primary}
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
            { backgroundColor: canSend ? (pressed ? t.colors.primaryPressed : t.colors.primary) : t.colors.surfaceRaised },
          ]}
        >
          {sending ? (
            <ActivityIndicator color={t.colors.onPrimary} />
          ) : (
            <Ionicons name="send" size={18} color={canSend ? t.colors.onPrimary : t.colors.textFaint} />
          )}
          {canSend || sending ? <Notch corner="topRight" color={t.colors.bg} size={8} /> : null}
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    container: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.bg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 140,
      backgroundColor: designTokens(t).chip.bg,
      borderRadius: t.radius.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      color: t.colors.text,
      fontFamily: t.fonts.body,
      fontSize: fontSize.md,
      textAlignVertical: 'top',
    },
    send: {
      width: 44,
      height: 44,
      borderRadius: t.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    counter: { textAlign: 'right', marginBottom: spacing.xs },
  }),
);
