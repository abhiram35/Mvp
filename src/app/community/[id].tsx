import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Button, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components/ui';
import { ActionMenu, type MenuAction } from '../../features/community/ActionMenu';
import {
  communityErrorMessage,
  createReply,
  deletePost,
  deleteReply,
  setSolution,
  useCommunityPost,
  useCommunityReplies,
  wasEdited,
} from '../../features/community/api';
import { plural, timeAgo } from '../../features/community/format';
import { GgButton } from '../../features/community/GgButton';
import { BannedBanner } from '../../features/moderation/BannedBanner';
import { useMyStatus } from '../../features/moderation/useMyStatus';
import { ReplyComposer } from '../../features/community/ReplyComposer';
import { ReplyRow } from '../../features/community/ReplyRow';
import { KindTag, SolvedTag } from '../../features/community/Tags';
import { useGames } from '../../features/games/useGames';
import { openReport } from '../../lib/actions';
import { useLatestRef, useNow } from '../../lib/hooks';
import { COMMUNITY_KIND_LABELS, type CommunityPostSummary, type CommunityReplyItem } from '../../lib/types';
import { useUserId } from '../../providers/AuthProvider';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';

interface MenuState {
  title?: string;
  actions: MenuAction[];
}

export default function CommunityThreadScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const postId = Array.isArray(params.id) ? params.id[0] : params.id;
  const myId = useUserId();
  const t = useTheme();
  const s = useStyles();
  const headerHeight = useHeaderHeight();
  const listRef = useRef<FlatList<CommunityReplyItem>>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const now = useNow();
  const { banned } = useMyStatus();

  const { summary, loading, error, reload: reloadPost } = useCommunityPost(postId);
  const reloadPostQuietly = useCallback(() => void reloadPost(true), [reloadPost]);
  const {
    replies,
    loading: repliesLoading,
    loadingMore,
    error: repliesError,
    hasMore,
    reload: reloadReplies,
    loadMore,
  } = useCommunityReplies(summary ? postId : undefined, reloadPostQuietly);

  // Back from editing: pick up the changes.
  const focusedOnce = useRef(false);
  const reloadRef = useLatestRef(() => {
    void reloadPost(true);
    void reloadReplies(true);
  });
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reloadRef.current();
      focusedOnce.current = true;
    }, [reloadRef]),
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([reloadPost(true), reloadReplies(true)]);
  }, [reloadPost, reloadReplies]);

  const kindLabel = summary ? COMMUNITY_KIND_LABELS[summary.post.kind] : 'Post';
  const header = <Stack.Screen options={{ title: kindLabel }} />;

  const post = summary?.post;
  const isAuthor = !!post && post.author_id === myId;
  const isQuestion = post?.kind === 'question';

  const openPostMenu = () => {
    if (!post) return;
    const actions: MenuAction[] = isAuthor
      ? [
          { label: 'Edit', icon: 'create-outline', onPress: () => router.push({ pathname: '/community/new', params: { edit: post.id } }) },
          {
            label: 'Delete',
            icon: 'trash-outline',
            destructive: true,
            onPress: () =>
              Alert.alert(`Delete this ${kindLabel.toLowerCase()}?`, 'It and all its replies will be removed for everyone.', [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deletePost(post.id);
                      if (router.canGoBack()) router.back();
                      else router.replace('/(tabs)/community');
                    } catch (e) {
                      Alert.alert("Couldn't delete", communityErrorMessage(e));
                    }
                  },
                },
              ]),
          },
        ]
      : [{ label: `Report ${kindLabel.toLowerCase()}`, icon: 'flag-outline', destructive: true, onPress: () => openReport('community_post', post.id) }];
    setMenu({ title: post.title, actions });
  };

  const openReplyMenu = useCallback(
    (item: CommunityReplyItem) => {
      if (!post) return;
      const mine = item.reply.author_id === myId;
      const actions: MenuAction[] = [];
      if (isAuthor && isQuestion) {
        actions.push(
          item.is_solution
            ? {
                label: 'Remove solution',
                icon: 'close-circle-outline',
                onPress: async () => {
                  try {
                    await setSolution(post.id, null);
                    await refreshAll();
                  } catch (e) {
                    Alert.alert("Couldn't update", communityErrorMessage(e));
                  }
                },
              }
            : {
                label: 'Mark as solution',
                icon: 'checkmark-circle-outline',
                onPress: async () => {
                  try {
                    await setSolution(post.id, item.reply.id);
                    await refreshAll();
                    listRef.current?.scrollToOffset({ offset: 0, animated: true });
                  } catch (e) {
                    Alert.alert("Couldn't update", communityErrorMessage(e));
                  }
                },
              },
        );
      }
      if (mine || isAuthor) {
        actions.push({
          label: 'Delete reply',
          icon: 'trash-outline',
          destructive: true,
          onPress: () =>
            Alert.alert('Delete this reply?', mine ? undefined : `${item.author.display_name}'s reply will be removed for everyone.`, [
              { text: 'Keep', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteReply(item.reply.id);
                    await refreshAll();
                  } catch (e) {
                    Alert.alert("Couldn't delete", communityErrorMessage(e));
                  }
                },
              },
            ]),
        });
      }
      if (!mine) {
        actions.push({ label: 'Report reply', icon: 'flag-outline', destructive: true, onPress: () => openReport('community_reply', item.reply.id) });
      }
      setMenu({ title: mine ? 'Your reply' : `Reply by ${item.author.display_name}`, actions });
    },
    [post, myId, isAuthor, isQuestion, refreshAll],
  );

  const sendReply = useCallback(
    async (text: string) => {
      if (!postId) return;
      try {
        await createReply(postId, text);
      } catch (e) {
        Alert.alert('Reply not posted', communityErrorMessage(e));
        throw e;
      }
      await refreshAll();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    },
    [postId, refreshAll],
  );

  if (loading && !summary) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <LoadingState />
      </Screen>
    );
  }
  if (error && !summary) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <ErrorState message={error} onRetry={() => void reloadPost()} />
      </Screen>
    );
  }
  if (!summary || !post) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <EmptyState
          icon="document-outline"
          title="This post isn't available"
          message="It may have been deleted, or it's from a player you can't see."
          action={
            <Button
              title={`Back to ${t.words.community.toLowerCase()}`}
              variant="secondary"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/community'))}
            />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} padded={false}>
      {header}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // Edge-to-edge on Android means the window doesn't resize: 'padding' on both platforms.
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
      >
        <FlatList
          ref={listRef}
          data={replies}
          keyExtractor={(r) => r.reply.id}
          renderItem={({ item }) => <ReplyRow item={item} mine={item.reply.author_id === myId} now={now} onMenu={openReplyMenu} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={s.list}
          onEndReached={() => {
            if (hasMore) void loadMore();
          }}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            <PostBlock summary={summary} myId={myId} now={now} onMenu={openPostMenu} />
          }
          ListEmptyComponent={
            repliesLoading ? (
              <View style={s.state}>
                <ActivityIndicator color={t.colors.primary} />
              </View>
            ) : repliesError ? (
              <View style={s.state}>
                <Text variant="label" style={{ textAlign: 'center' }}>
                  Couldn&apos;t load replies. {repliesError}
                </Text>
                <Button title="Try again" variant="ghost" size="sm" onPress={() => void reloadReplies()} />
              </View>
            ) : (
              <View style={s.state}>
                <Ionicons name={isQuestion ? 'help-buoy-outline' : 'chatbubbles-outline'} size={32} color={t.colors.textFaint} />
                <Text variant="label" style={{ textAlign: 'center' }}>
                  {isQuestion
                    ? isAuthor
                      ? 'No answers yet. Players who know the fix will reply here.'
                      : 'No answers yet. Know the fix? Help them out.'
                    : 'No replies yet. Add yours — keep it friendly.'}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={s.state}>
                <ActivityIndicator color={t.colors.primary} />
              </View>
            ) : undefined
          }
        />
        {banned ? (
          <BannedBanner force />
        ) : (
          <ReplyComposer onSend={sendReply} placeholder={isQuestion ? 'Share a fix or a tip' : 'Add your reply'} />
        )}
      </KeyboardAvoidingView>
      <ActionMenu visible={!!menu} title={menu?.title} actions={menu?.actions ?? []} onClose={() => setMenu(null)} />
    </Screen>
  );
}

function PostBlock({
  summary,
  myId,
  now,
  onMenu,
}: {
  summary: CommunityPostSummary;
  myId: string;
  now: number;
  onMenu: () => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const { byId } = useGames();
  const { post, author, is_solved } = summary;
  const game = byId(post.game_id);
  const name = author.display_name || author.username || 'Player';
  const own = post.author_id === myId;

  return (
    <View style={s.post}>
      <View style={s.tags}>
        <KindTag kind={post.kind} />
        {is_solved ? <SolvedTag /> : null}
        <Text style={s.game} numberOfLines={1}>
          {game ? `${game.emoji} ${game.name}` : 'General'}
        </Text>
      </View>

      <Text variant="display" style={s.title} accessibilityRole="header">
        {post.title}
      </Text>

      <View style={s.authorRow}>
        <Pressable
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: author.id } })}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}'s profile`}
          style={({ pressed }) => [s.author, pressed && { opacity: 0.7 }]}
        >
          <Avatar uri={author.avatar_url} name={name} size={36} />
          <View style={{ flexShrink: 1 }}>
            <Text style={s.name} numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {author.username ? `@${author.username} · ` : ''}
              {timeAgo(post.created_at, now)}
              {wasEdited(post) ? ' · edited' : ''}
            </Text>
          </View>
        </Pressable>
      </View>

      <Text style={s.body} selectable>
        {post.body}
      </Text>

      <View style={s.actionBar}>
        <GgButton target="post" id={post.id} base={{ has_gg: summary.has_gg, gg_count: post.gg_count }} own={own} />
        <View style={s.replyCount} accessible accessibilityLabel={plural(post.reply_count, 'reply', 'replies')}>
          <Ionicons name="chatbubble-outline" size={16} color={t.colors.textMuted} />
          <Text variant="label">{plural(post.reply_count, 'reply', 'replies')}</Text>
        </View>
        <Pressable
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel="Post options"
          style={({ pressed }) => [s.more, pressed && { backgroundColor: t.colors.surfaceRaised }]}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={t.colors.textMuted} />
        </Pressable>
      </View>

      <Text variant="heading" style={s.repliesHeading}>
        {post.kind === 'question' ? 'Answers' : 'Replies'}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    list: { paddingBottom: spacing.xl, flexGrow: 1 },
    state: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
    post: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    tags: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    game: {
      flexShrink: 1,
      fontFamily: t.fonts.heading,
      fontSize: fontSize.sm,
      color: t.colors.textMuted,
      letterSpacing: t.shape.headingLetterSpacing,
      textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
    },
    title: { fontSize: 34, lineHeight: 38, marginTop: spacing.md },
    authorRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
    author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, flexShrink: 1 },
    name: { fontFamily: t.fonts.bodyBold, fontSize: fontSize.md, color: t.colors.text },
    body: {
      fontFamily: t.fonts.body,
      fontSize: fontSize.md,
      lineHeight: 24,
      color: t.colors.text,
      marginTop: spacing.lg,
    },
    actionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      marginTop: spacing.lg,
      paddingBottom: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    replyCount: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    more: {
      marginLeft: 'auto',
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.sm,
    },
    repliesHeading: {
      fontSize: fontSize.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
  }),
);
