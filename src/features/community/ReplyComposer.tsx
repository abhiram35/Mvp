import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Notch, Text } from '../../components/ui';
import { designTokens, fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { COMMUNITY_LIMITS } from './format';

/** Reply box pinned under a thread. `onSend` should throw on failure (the draft is restored). */
export function ReplyComposer({ onSend, placeholder = 'Write a reply' }: { onSend: (text: string) => Promise<void>; placeholder?: string }) {
  const t = useTheme();
  const s = useStyles();
  const max = COMMUNITY_LIMITS.replyMax;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= max && !sending;
  const over = text.length > max;

  const submit = async () => {
    if (!canSend) return;
    const draft = text;
    setSending(true);
    setText('');
    try {
      await onSend(trimmed);
    } catch {
      setText((current) => (current.length === 0 ? draft : current));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={s.container}>
      {text.length > 0 ? (
        <Text variant="caption" style={[s.counter, over && { color: t.colors.danger }]} accessibilityLiveRegion="polite">
          {text.length}/{max}
        </Text>
      ) : null}
      <View style={s.row}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={t.colors.textFaint}
          selectionColor={t.colors.primary}
          cursorColor={t.colors.primary}
          multiline
          maxLength={max}
          style={s.input}
          accessibilityLabel="Reply"
          editable={!sending}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post reply"
          accessibilityState={{ disabled: !canSend, busy: sending }}
          disabled={!canSend}
          onPress={() => void submit()}
          style={({ pressed }) => [
            s.send,
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
      maxHeight: 160,
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
