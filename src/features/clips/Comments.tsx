// Clip comments: list + composer (CommentsPanel), and the bottom sheet the feed opens.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { forwardRef, memo, useCallback, useImperativeHandle, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Text } from '../../components/ui';
import { useNow } from '../../lib/hooks';
import { PAUSED_MESSAGE } from '../../lib/supabase';
import { useMyStatus } from '../moderation/useMyStatus';
import { useReducedMotion } from '../duo/motion';
import { fontSize, makeStyles, spacing, useDesign, useTheme } from '../../theme';
import { addClipComment, clipErrorMessage, deleteClipComment, useClipComments, useLiveClip } from './api';
import { CLIP_LIMITS, formatCount, timeAgo, validateComment } from './logic';
import type { Clip, ClipComment } from './types';

export interface CommentsPanelHandle {
  focusComposer: () => void;
}

const CommentRow = memo(function CommentRow({
  comment,
  canDelete,
  mine,
  onDelete,
  now,
}: {
  comment: ClipComment;
  canDelete: boolean;
  /** My own comment (no Report button). */
  mine: boolean;
  onDelete: (c: ClipComment) => void;
  now: number;
}) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={s.row}>
      <Pressable
        onPress={() => router.push({ pathname: '/user/[id]', params: { id: comment.author_id } })}
        accessibilityRole="button"
        accessibilityLabel={`${comment.author.display_name}'s profile`}
        hitSlop={6}
      >
        <Avatar uri={comment.author.avatar_url} name={comment.author.display_name} size={36} backdrop={t.colors.surface} />
      </Pressable>
      <View style={{ flex: 1, marginLeft: spacing.md }} accessible accessibilityLabel={`${comment.author.display_name}, ${timeAgo(comment.created_at, now)}: ${comment.body}`}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text variant="strong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {comment.author.display_name}
          </Text>
          <Text variant="caption" style={{ marginLeft: spacing.sm }}>
            {timeAgo(comment.created_at, now)}
          </Text>
        </View>
        <Text style={{ marginTop: 2 }}>{comment.body}</Text>
      </View>
      {!mine ? (
        <Pressable
          onPress={() => router.push({ pathname: '/report', params: { type: 'clip_comment', id: comment.id } })}
          accessibilityRole="button"
          accessibilityLabel="Report comment"
          hitSlop={4}
          style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: t.colors.surfaceRaised }]}
        >
          <Ionicons name="flag-outline" size={18} color={t.colors.textMuted} />
        </Pressable>
      ) : null}
      {canDelete ? (
        <Pressable
          onPress={() => onDelete(comment)}
          accessibilityRole="button"
          accessibilityLabel="Delete comment"
          hitSlop={4}
          style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: t.colors.surfaceRaised }]}
        >
          <Ionicons name="trash-outline" size={18} color={t.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
});

/**
 * Comments of a clip, oldest first, with a composer pinned at the bottom.
 * `header` renders above the list (the single-clip screen puts the clip there).
 */
export const CommentsPanel = forwardRef<
  CommentsPanelHandle,
  { clip: Clip; myId: string | null; header?: ReactElement; bottomInset?: number; emptyHint?: boolean }
>(function CommentsPanel({ clip: baseClip, myId, header, bottomInset = 0, emptyHint = true }, ref) {
  const t = useTheme();
  const d = useDesign();
  const s = useStyles();
  const now = useNow();
  const { banned } = useMyStatus();
  const clip = useLiveClip(baseClip) ?? baseClip;
  const { comments, loading, error, reload } = useClipComments(clip.id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const list = useRef<FlatList<ClipComment>>(null);

  useImperativeHandle(ref, () => ({ focusComposer: () => input.current?.focus() }), []);

  const tooLong = draft.trim().length > CLIP_LIMITS.commentMax;
  const canSend = !banned && !sending && validateComment(draft) === null;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await addClipComment(clip, draft);
      setDraft('');
      await reload();
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      Alert.alert("Couldn't post comment", clipErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const onDelete = useCallback(
    (c: ClipComment) => {
      Alert.alert('Delete comment?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteClipComment(clip, c.id).then(
              () => void reload(),
              (e: unknown) => Alert.alert("Couldn't delete", clipErrorMessage(e)),
            );
          },
        },
      ]);
    },
    [clip, reload],
  );

  const mineClip = clip.author_id === myId;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        data={comments}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <CommentRow comment={item} canDelete={item.author_id === myId || mineClip} mine={item.author_id === myId} onDelete={onDelete} now={now} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <View style={s.empty}>
              <ActivityIndicator color={t.colors.primary} />
            </View>
          ) : error ? (
            <View style={s.empty}>
              <Text muted style={{ textAlign: 'center' }}>{error}</Text>
              <Pressable onPress={() => void reload()} accessibilityRole="button" style={s.retry}>
                <Text variant="strong" style={{ color: d.primaryText }}>Try again</Text>
              </Pressable>
            </View>
          ) : emptyHint ? (
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={32} color={t.colors.textMuted} />
              <Text variant="heading" style={{ marginTop: spacing.sm }}>No comments yet</Text>
              <Text muted style={{ textAlign: 'center', marginTop: spacing.xs }}>Say GG, ask how they pulled it off. Keep it friendly.</Text>
            </View>
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        ItemSeparatorComponent={Separator}
      />

      <View style={[s.composer, { paddingBottom: spacing.sm + bottomInset }]}>
        {banned ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
            <Ionicons name="pause-circle-outline" size={20} color={t.colors.textMuted} style={{ marginRight: spacing.sm }} />
            <Text muted style={{ flex: 1 }}>{PAUSED_MESSAGE}</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <TextInput
              ref={input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment…"
              placeholderTextColor={t.colors.textFaint}
              selectionColor={t.colors.primary}
              cursorColor={t.colors.primary}
              multiline
              maxLength={CLIP_LIMITS.commentMax + 50}
              accessibilityLabel="Comment"
              accessibilityHint={tooLong ? `Keep it under ${CLIP_LIMITS.commentMax} characters` : undefined}
              style={[
                s.input,
                { borderRadius: d.lang.corner === 'soft' ? t.radius.lg : t.radius.md, borderColor: tooLong ? t.colors.danger : 'transparent' },
              ]}
            />
            <Pressable
              onPress={() => void send()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              accessibilityState={{ disabled: !canSend, busy: sending }}
              style={({ pressed }) => [
                s.send,
                { borderRadius: d.lang.corner === 'soft' ? 22 : t.radius.md, backgroundColor: canSend ? (pressed ? t.colors.primaryPressed : t.colors.primary) : d.chip.bg },
              ]}
            >
              {sending ? (
                <ActivityIndicator color={t.colors.onPrimary} />
              ) : (
                <Ionicons name="send" size={18} color={canSend ? t.colors.onPrimary : t.colors.textMuted} />
              )}
            </Pressable>
          </View>
        )}
        {tooLong ? (
          <Text variant="caption" style={{ color: t.colors.danger, marginTop: spacing.xs }}>
            Keep it under {CLIP_LIMITS.commentMax} characters
          </Text>
        ) : null}
      </View>
    </View>
  );
});

function Separator() {
  const d = useDesign();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: d.hairline, marginLeft: spacing.lg + 36 + spacing.md }} />;
}

/** Bottom sheet with the comments of `clip` (null = closed). */
export function CommentsSheet({ clip, myId, onClose }: { clip: Clip | null; myId: string | null; onClose: () => void }) {
  const t = useTheme();
  const d = useDesign();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const live = useLiveClip(clip);
  const shown = live ?? clip;

  return (
    <Modal
      visible={!!clip}
      transparent
      animationType={reduced ? 'fade' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.overlay }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close comments" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.sheetHost} pointerEvents="box-none">
          <View
            style={[
              s.sheet,
              {
                backgroundColor: d.surface.raised,
                borderTopLeftRadius: d.lang.corner === 'soft' ? t.radius.lg + 8 : t.radius.md,
                borderTopRightRadius: d.lang.corner === 'soft' ? t.radius.lg + 8 : t.radius.md,
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={s.handle} />
            <View style={s.sheetHeader}>
              <Text variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
                Comments{shown ? ` · ${formatCount(shown.comment_count)}` : ''}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close comments"
                style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: t.colors.surfaceRaised }]}
              >
                <Ionicons name="close" size={22} color={t.colors.text} />
              </Pressable>
            </View>
            {shown ? <CommentsPanel clip={shown} myId={myId} bottomInset={insets.bottom} /> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.md },
    empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, minHeight: 160 },
    retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.sm },
    composer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: spacing.md,
      paddingTop: 11,
      paddingBottom: 11,
      backgroundColor: t.colors.bg,
      color: t.colors.text,
      fontFamily: t.fonts.body,
      fontSize: fontSize.md,
      borderWidth: 1,
      marginRight: spacing.sm,
    },
    send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    sheetHost: { flex: 1, justifyContent: 'flex-end' },
    sheet: { height: '72%', overflow: 'hidden' },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.border, marginTop: spacing.sm },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.xs },
  }),
);
