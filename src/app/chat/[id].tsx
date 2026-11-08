import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  View,
  type AlertButton,
} from 'react-native';
import { Avatar, EmptyState, ErrorState, LoadingState, Screen, Text, textStyle } from '../../components/ui';
import { openReport } from '../../lib/actions';
import { errorMessage } from '../../lib/supabase';
import { useUserId } from '../../providers/AuthProvider';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { Composer } from '../../features/chat/Composer';
import { bubbleLayout } from '../../features/chat/layout';
import { MessageBubble } from '../../features/chat/MessageBubble';
import { useConversation, type MemberProfile } from '../../features/chat/useConversation';
import { useMessages, type ChatMessage } from '../../features/chat/useMessages';
import { useBlockedIds } from '../../features/safety/blocks';
import { ActionMenu } from '../../features/community/ActionMenu';
import { BannedBanner } from '../../features/moderation/BannedBanner';
import { useMyStatus } from '../../features/moderation/useMyStatus';
import { isRatingWindowOpen } from '../../features/reputation/api';
import { RateSquadSheet } from '../../features/reputation/RateSquadSheet';
import { useNow } from '../../lib/hooks';

export default function ChatScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(params.id) ? params.id[0] : params.id;
  const myId = useUserId();
  const headerHeight = useHeaderHeight();
  const { blockedIds } = useBlockedIds();
  const t = useTheme();
  const styles = useStyles();
  const groupFallback = `${t.words.squad.charAt(0).toUpperCase()}${t.words.squad.slice(1)} chat`;

  const { conversation, members, membersById, partner, loading: convLoading, error: convError, reload: reloadConv } =
    useConversation(conversationId, myId);
  const { messages, loading: msgLoading, loadingOlder, hasMore, error: msgError, reload: reloadMsgs, loadOlder, send } =
    useMessages(conversationId, myId, membersById);

  const isGroup = conversation?.is_group ?? false;
  const now = useNow();
  // The squad chat is created on the first accept, so it is never older than its lobby:
  // once the chat is past the rating window, the lobby's window has closed too.
  const lfgPostId = conversation?.lfg_post_id ?? null;
  const canRate = !!lfgPostId && isRatingWindowOpen(conversation?.created_at, now);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const partnerBlocked = !!partner && blockedIds.has(partner.id);
  const { banned } = useMyStatus();

  const visible = useMemo(() => messages.filter((m) => !blockedIds.has(m.sender_id)), [messages, blockedIds]);

  const handleSend = useCallback(
    async (text: string) => {
      try {
        await send(text);
      } catch (err) {
        Alert.alert('Message not sent', errorMessage(err));
        throw err;
      }
    },
    [send],
  );

  const handleLongPress = useCallback(
    (message: ChatMessage) => {
      if (message.pending) return;
      const buttons: AlertButton[] = [
        {
          text: 'Copy',
          onPress: () => void Clipboard.setStringAsync(message.body),
        },
      ];
      if (message.sender_id !== myId) {
        buttons.push({ text: 'Report message', style: 'destructive', onPress: () => openReport('message', message.id) });
      }
      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert(message.sender_id === myId ? 'Your message' : (message.sender?.display_name ?? 'Message'), undefined, buttons);
    },
    [myId],
  );

  const header = (
    <Stack.Screen
      options={{
        title: isGroup ? (conversation?.title ?? groupFallback) : (partner?.display_name ?? 'Chat'),
        headerTitle:
          !isGroup && partner
            ? () => <DmHeader partner={partner} />
            : isGroup
              ? () => <GroupHeader title={conversation?.title ?? groupFallback} memberCount={members.length} />
              : undefined,
        // Squad chats (from a lobby) get a menu with "Rate your squad".
        headerRight: canRate
          ? () => (
              <Pressable
                onPress={() => setMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${groupFallback} options`}
                hitSlop={8}
                style={({ pressed }) => [styles.menuButton, pressed && { backgroundColor: t.colors.surfaceRaised }]}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={t.colors.text} />
              </Pressable>
            )
          : undefined,
      }}
    />
  );

  if (convLoading && !conversation) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <LoadingState />
      </Screen>
    );
  }

  if (convError || !conversation) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <ErrorState message={convError ?? "Couldn't open this chat."} onRetry={() => void reloadConv()} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} padded={false}>
      {header}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // Expo apps are edge-to-edge on Android, so the window no longer resizes for the
        // keyboard: 'padding' is the recommended behavior on both platforms.
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
      >
        {msgLoading && visible.length === 0 ? (
          <LoadingState />
        ) : msgError && visible.length === 0 ? (
          <ErrorState message={msgError} onRetry={() => void reloadMsgs()} />
        ) : (
          <FlatList
            inverted
            data={visible}
            keyExtractor={(m) => m.id}
            renderItem={({ item, index }) => (
              <MessageBubble
                message={item}
                mine={item.sender_id === myId}
                layout={bubbleLayout(visible, index, isGroup)}
                onLongPress={handleLongPress}
              />
            )}
            onEndReached={() => {
              if (hasMore) void loadOlder();
            }}
            onEndReachedThreshold={0.3}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.list, visible.length === 0 && { flexGrow: 1 }]}
            // Inverted list: the footer renders at the top (oldest end).
            ListFooterComponent={
              loadingOlder ? (
                <View style={styles.older}>
                  <ActivityIndicator color={t.colors.primary} />
                </View>
              ) : !hasMore && visible.length > 0 ? (
                <Text variant="caption" style={styles.beginning}>This is the start of your chat</Text>
              ) : undefined
            }
            ListEmptyComponent={
              // VirtualizedList re-inverts the empty component itself, so no manual flip here.
              <View style={{ flex: 1 }}>
                <EmptyState
                  icon="chatbubble-ellipses-outline"
                  title="Say hi 👋"
                  message={isGroup ? `Plan your next match with the ${t.words.squad}.` : 'Start the conversation — keep it friendly.'}
                />
              </View>
            }
          />
        )}

        {partnerBlocked ? (
          <View style={styles.blockedBanner} accessibilityRole="alert">
            <Ionicons name="ban-outline" size={20} color={t.colors.danger} />
            <Text variant="label" style={styles.blockedText}>
              You blocked this player. Unblock them in Settings → Blocked players to send messages.
            </Text>
          </View>
        ) : banned ? (
          <BannedBanner force />
        ) : (
          <Composer onSend={handleSend} />
        )}
      </KeyboardAvoidingView>
      {lfgPostId ? (
        <>
          <ActionMenu
            visible={menuOpen}
            title={conversation.title ?? groupFallback}
            onClose={() => setMenuOpen(false)}
            actions={[{ label: `Rate your ${t.words.squad}`, icon: 'star-outline', onPress: () => setRateOpen(true) }]}
          />
          <RateSquadSheet visible={rateOpen} lfgPostId={lfgPostId} onClose={() => setRateOpen(false)} />
        </>
      ) : null}
    </Screen>
  );
}

function DmHeader({ partner }: { partner: MemberProfile }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${partner.display_name}'s profile`}
      onPress={() => router.push({ pathname: '/user/[id]', params: { id: partner.id } })}
      hitSlop={8}
      style={styles.headerTitle}
    >
      <Avatar uri={partner.avatar_url} name={partner.display_name} size={32} />
      <View style={{ marginLeft: spacing.sm, flexShrink: 1 }}>
        <Text style={styles.headerName} numberOfLines={1}>{partner.display_name}</Text>
        {partner.username ? (
          <Text variant="caption" numberOfLines={1}>@{partner.username}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function GroupHeader({ title, memberCount }: { title: string; memberCount: number }) {
  const styles = useStyles();
  return (
    <View style={styles.headerTitle} accessible accessibilityLabel={`${title}, ${memberCount} members`}>
      <Avatar name={title} size={32} highlight icon="people" />
      <View style={{ marginLeft: spacing.sm, flexShrink: 1 }}>
        <Text style={styles.headerName} numberOfLines={1}>{title}</Text>
        <Text variant="caption" numberOfLines={1}>{memberCount} {memberCount === 1 ? 'member' : 'members'}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    list: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    older: { paddingVertical: spacing.lg, alignItems: 'center' },
    beginning: { textAlign: 'center', paddingVertical: spacing.lg },
    blockedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: spacing.md,
      padding: spacing.md,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderLeftWidth: 3,
      borderLeftColor: t.colors.danger,
    },
    blockedText: { flex: 1, marginLeft: spacing.sm, color: t.colors.textMuted, lineHeight: 20 },
    headerTitle: { flexDirection: 'row', alignItems: 'center', minHeight: 44, maxWidth: 260 },
    menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.md },
    headerName: { ...textStyle(t, 'heading'), fontSize: fontSize.lg, lineHeight: 22 },
  }),
);
