import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Divider, EmptyState, ErrorState, LoadingState, Screen, Text, TextField, type IconName } from '../../components/ui';
import { useGames } from '../../features/games/useGames';
import {
  acceptLfgRequest,
  cancelLfgRequest,
  closeLfgPost,
  declineLfgRequest,
  deleteLfgPost,
  requestToJoin,
  useLfgPost,
  useLfgRequests,
  useMyLfgRequest,
  type LfgRequestWithRequester,
} from '../../features/lfg/api';
import { expiresIn, isExpired, LFG_LIMITS, regionLabel, timeAgo } from '../../features/lfg/format';
import { useBlockedIds } from '../../features/safety/blocks';
import { openDm, openReport } from '../../lib/actions';
import { errorMessage } from '../../lib/supabase';
import type { LfgPostWithAuthor, RequestStatus } from '../../lib/types';
import { useUserId } from '../../providers/AuthProvider';
import { colors, font, radius, spacing } from '../../theme';

function openChat(conversationId: string) {
  router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
}

function openProfile(id: string) {
  router.push({ pathname: '/user/[id]', params: { id } });
}

function Fact({ icon, label, value, tint }: { icon: IconName; label: string; value: string; tint?: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={16} color={tint ?? colors.textMuted} />
      <View style={{ marginLeft: spacing.sm, flexShrink: 1 }}>
        <Text variant="caption">{label}</Text>
        <Text style={[styles.factValue, tint ? { color: tint } : null]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const STATUS_STYLE: Record<RequestStatus, { label: string; color: string; icon: IconName }> = {
  pending: { label: 'Pending', color: colors.warning, icon: 'time-outline' },
  accepted: { label: 'Accepted', color: colors.accent, icon: 'checkmark' },
  declined: { label: 'Declined', color: colors.textFaint, icon: 'close' },
};

function StatusBadge({ status }: { status: RequestStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <View style={[styles.badge, { borderColor: s.color }]}>
      <Ionicons name={s.icon} size={12} color={s.color} />
      <Text variant="caption" style={{ color: s.color, marginLeft: 3, fontWeight: font.weight.semibold }}>
        {s.label}
      </Text>
    </View>
  );
}

// ── Requester view ──────────────────────────────────────────────────────────
function RequesterPanel({
  post,
  myId,
  joinable,
  onPostStale,
}: {
  post: LfgPostWithAuthor;
  myId: string;
  joinable: boolean;
  onPostStale: () => void;
}) {
  const { request, loading, error, reload } = useMyLfgRequest(post.id, myId, true);
  const acceptedWithoutChat = request?.status === 'accepted' && !post.conversation_id;

  // Once I'm accepted the post gets its conversation_id; refetch the post to pick it up.
  useEffect(() => {
    if (acceptedWithoutChat) onPostStale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptedWithoutChat]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await requestToJoin(post.id, myId, message.trim() ? message.trim().slice(0, LFG_LIMITS.requestMessage) : null);
      setMessage('');
      await reload();
    } catch (e) {
      Alert.alert("Couldn't send request", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (!request) return;
    Alert.alert('Cancel request?', 'You can send a new one while the post is open.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await cancelLfgRequest(request.id);
            await reload();
          } catch (e) {
            Alert.alert("Couldn't cancel", errorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  if (request) {
    return (
      <Card style={styles.panel}>
        <View style={styles.rowBetween}>
          <Text variant="heading">Your request</Text>
          <StatusBadge status={request.status} />
        </View>
        {request.message ? (
          <Text muted style={{ marginTop: spacing.sm }}>
            “{request.message}”
          </Text>
        ) : null}
        {request.status === 'pending' ? (
          <>
            <Text variant="caption" style={{ marginTop: spacing.sm }}>
              The host will see your request and can accept or decline it.
            </Text>
            <Button title="Cancel request" variant="ghost" size="sm" onPress={cancel} loading={busy} style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }} />
          </>
        ) : null}
        {request.status === 'accepted' ? (
          post.conversation_id ? (
            <Button
              title="Open squad chat"
              icon="chatbubbles-outline"
              onPress={() => openChat(post.conversation_id!)}
              style={{ marginTop: spacing.md }}
            />
          ) : (
            <Text variant="caption" style={{ marginTop: spacing.sm }}>
              You're in! The squad chat will appear here shortly.
            </Text>
          )
        ) : null}
        {request.status === 'declined' ? (
          <Text variant="caption" style={{ marginTop: spacing.sm }}>
            Not this time — there are plenty of other squads on the board.
          </Text>
        ) : null}
      </Card>
    );
  }

  if (!joinable) {
    return (
      <Card style={styles.panel}>
        <Text muted>This post isn't taking requests any more.</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.panel}>
      <Text variant="heading" style={{ marginBottom: spacing.md }}>
        Want in?
      </Text>
      <TextField
        label="Message to the host (optional)"
        placeholder="e.g. Diamond IGL, mic on, free till midnight"
        value={message}
        onChangeText={setMessage}
        maxLength={LFG_LIMITS.requestMessage}
        multiline
        hint={`${message.length}/${LFG_LIMITS.requestMessage}`}
      />
      <Button title="Request to join" icon="person-add-outline" onPress={send} loading={busy} />
    </Card>
  );
}

// ── Author view ─────────────────────────────────────────────────────────────
function RequestRow({
  req,
  onAccept,
  onDecline,
  busy,
  canAccept,
}: {
  req: LfgRequestWithRequester;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
  canAccept: boolean;
}) {
  const name = req.requester?.display_name || req.requester?.username || 'Player';
  return (
    <View style={styles.requestRow}>
      <Pressable
        onPress={() => openProfile(req.requester_id)}
        accessibilityRole="button"
        accessibilityLabel={`View ${name}'s profile`}
        style={styles.requesterTap}
      >
        <Avatar uri={req.requester?.avatar_url} name={name} size={40} />
        <View style={{ marginLeft: spacing.md, flex: 1 }}>
          <Text numberOfLines={1} style={{ fontWeight: font.weight.semibold }}>
            {name}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            @{req.requester?.username ?? 'unknown'} · {timeAgo(req.created_at)}
          </Text>
        </View>
        {req.status !== 'pending' ? <StatusBadge status={req.status} /> : null}
      </Pressable>
      {req.message ? (
        <Text muted style={styles.requestMessage}>
          “{req.message}”
        </Text>
      ) : null}
      {req.status === 'pending' ? (
        <View style={styles.requestActions}>
          <Button title="Decline" variant="secondary" size="sm" onPress={onDecline} disabled={busy} style={{ flex: 1, minHeight: 44 }} />
          <Button
            title="Accept"
            icon="checkmark"
            size="sm"
            onPress={onAccept}
            loading={busy}
            disabled={!canAccept}
            style={{ flex: 1, minHeight: 44 }}
          />
        </View>
      ) : null}
    </View>
  );
}

function AuthorPanel({ post, joinable, onChanged }: { post: LfgPostWithAuthor; joinable: boolean; onChanged: () => void }) {
  const { requests, loading, error, reload } = useLfgRequests(post.id, true);
  const { blockedIds } = useBlockedIds();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [postBusy, setPostBusy] = useState(false);

  const visible = requests.filter((r) => !blockedIds.has(r.requester_id));
  const pending = visible.filter((r) => r.status === 'pending');
  const decided = visible.filter((r) => r.status !== 'pending');
  const acceptedCount = visible.filter((r) => r.status === 'accepted').length;

  const accept = async (req: LfgRequestWithRequester) => {
    setBusyId(req.id);
    try {
      await acceptLfgRequest(req.id);
      await reload();
      onChanged();
    } catch (e) {
      Alert.alert("Couldn't accept", errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (req: LfgRequestWithRequester) => {
    setBusyId(req.id);
    try {
      await declineLfgRequest(req.id);
      await reload();
    } catch (e) {
      Alert.alert("Couldn't decline", errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const close = () => {
    Alert.alert('Close this post?', 'It will leave the board and stop taking requests. Your squad chat stays.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close post',
        onPress: async () => {
          setPostBusy(true);
          try {
            await closeLfgPost(post.id);
            onChanged();
          } catch (e) {
            Alert.alert("Couldn't close", errorMessage(e));
          } finally {
            setPostBusy(false);
          }
        },
      },
    ]);
  };

  const remove = () => {
    Alert.alert('Delete this post?', 'This removes the post and all its requests. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setPostBusy(true);
          try {
            await deleteLfgPost(post.id);
            if (router.canGoBack()) router.back();
            else router.replace('/');
          } catch (e) {
            Alert.alert("Couldn't delete", errorMessage(e));
            setPostBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <>
      {post.conversation_id ? (
        <Button
          title="Open squad chat"
          icon="chatbubbles-outline"
          onPress={() => openChat(post.conversation_id!)}
          style={{ marginBottom: spacing.lg }}
        />
      ) : null}

      <Card style={styles.panel}>
        <View style={styles.rowBetween}>
          <Text variant="heading">Join requests</Text>
          <Text variant="caption">
            {acceptedCount}/{post.slots_needed} filled
          </Text>
        </View>
        {loading ? (
          <View style={{ paddingVertical: spacing.xl }}>
            <LoadingState />
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : visible.length === 0 ? (
          <View style={{ paddingVertical: spacing.lg }}>
            <EmptyState
              icon="hourglass-outline"
              title="No requests yet"
              message={joinable ? 'Requests show up here live as players ask to join.' : 'This post is no longer taking requests.'}
            />
          </View>
        ) : (
          <>
            {pending.map((r) => (
              <RequestRow
                key={r.id}
                req={r}
                busy={busyId === r.id}
                canAccept={busyId === null && post.status === 'open' && !isExpired(post)}
                onAccept={() => void accept(r)}
                onDecline={() => void decline(r)}
              />
            ))}
            {pending.length > 0 && decided.length > 0 ? <Divider /> : null}
            {decided.map((r) => (
              <RequestRow key={r.id} req={r} busy={false} canAccept={false} onAccept={() => {}} onDecline={() => {}} />
            ))}
          </>
        )}
      </Card>

      <View style={styles.ownerActions}>
        {post.status === 'open' ? (
          <Button title="Close post" icon="lock-closed-outline" variant="secondary" onPress={close} disabled={postBusy} style={{ flex: 1 }} />
        ) : null}
        <Button title="Delete post" icon="trash-outline" variant="danger" onPress={remove} disabled={postBusy} style={{ flex: 1 }} />
      </View>
    </>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────
export default function LfgPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useUserId();
  const { byId } = useGames();
  const { blockedIds } = useBlockedIds();
  const { post, loading, error, reload, retry } = useLfgPost(id);

  let content: ReactNode;
  if (loading) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState message={error} onRetry={retry} />;
  } else if (!post || blockedIds.has(post.author_id)) {
    content = (
      <EmptyState
        icon="search"
        title="Post not found"
        message="It may have been deleted by its author."
        action={<Button title="Back to the board" variant="secondary" onPress={() => router.replace('/')} />}
      />
    );
  } else {
    const game = byId(post.game_id);
    const isAuthor = post.author_id === myId;
    const expired = isExpired(post);
    const joinable = post.status === 'open' && !expired;
    const authorName = post.author?.display_name || post.author?.username || 'Player';

    let banner: { text: string; icon: IconName } | null = null;
    if (post.status === 'closed') banner = { text: 'This post is closed.', icon: 'lock-closed-outline' };
    else if (post.status === 'full') banner = { text: 'Squad is full.', icon: 'people' };
    else if (expired) banner = { text: 'This post has expired.', icon: 'hourglass-outline' };

    content = (
      <Screen scroll edges={['bottom']}>
        <Stack.Screen options={{ title: game?.name ?? 'Squad post' }} />

        {banner ? (
          <View style={styles.banner} accessibilityRole="alert">
            <Ionicons name={banner.icon} size={16} color={colors.warning} />
            <Text style={styles.bannerText}>{banner.text}</Text>
          </View>
        ) : null}

        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{game?.emoji ?? '🎮'}</Text>
          <View style={{ flex: 1 }}>
            <Text variant="label">{game?.name ?? post.game_id}</Text>
            <Text variant="caption">
              Posted {timeAgo(post.created_at)} · {post.status === 'open' ? expiresIn(post.expires_at) : post.status}
            </Text>
          </View>
        </View>

        <Text variant="title" style={styles.title}>
          {post.title}
        </Text>
        {post.description ? <Text style={styles.description}>{post.description}</Text> : null}

        <View style={styles.facts}>
          <Fact icon="people" label="Need" value={`${post.slots_needed} ${post.slots_needed === 1 ? 'player' : 'players'}`} tint={colors.accent} />
          <Fact icon="trophy-outline" label="Rank" value={post.rank ?? 'Any'} />
          <Fact icon="globe-outline" label="Region" value={regionLabel(post.region)} />
          <Fact icon="language-outline" label="Language" value={post.language} />
          <Fact
            icon={post.mic_required ? 'mic' : 'mic-off-outline'}
            label="Mic"
            value={post.mic_required ? 'Required' : 'Optional'}
            tint={post.mic_required ? colors.primary : undefined}
          />
        </View>

        <Pressable
          onPress={() => openProfile(post.author_id)}
          accessibilityRole="button"
          accessibilityLabel={`Posted by ${authorName}. View profile.`}
          style={({ pressed }) => [styles.authorRow, pressed && { backgroundColor: colors.surfaceRaised }]}
        >
          <Avatar uri={post.author?.avatar_url} name={authorName} size={40} />
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={{ fontWeight: font.weight.semibold }}>
              {authorName}
              {isAuthor ? ' (you)' : ''}
            </Text>
            <Text variant="caption">@{post.author?.username ?? 'unknown'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>

        {isAuthor ? (
          <AuthorPanel post={post} joinable={joinable} onChanged={reload} />
        ) : (
          <>
            <RequesterPanel post={post} myId={myId} joinable={joinable} onPostStale={reload} />
            <View style={styles.ownerActions}>
              <Button
                title="Message host"
                icon="chatbubble-ellipses-outline"
                variant="secondary"
                onPress={() => void openDm(post.author_id)}
                style={{ flex: 1 }}
              />
            </View>
            <Button
              title="Report post"
              icon="flag-outline"
              variant="ghost"
              onPress={() => openReport('lfg_post', post.id)}
              style={{ marginTop: spacing.sm }}
            />
          </>
        )}
      </Screen>
    );
    return content;
  }

  return <Screen edges={['bottom']}>{content}</Screen>;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surface,
  },
  bannerText: { color: colors.warning, fontWeight: font.weight.medium },
  hero: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  heroEmoji: { fontSize: 36, marginRight: spacing.md },
  title: { marginTop: spacing.md, fontSize: font.size.xl },
  description: { marginTop: spacing.sm, color: colors.textMuted, lineHeight: 22 },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    rowGap: spacing.md,
  },
  fact: { flexDirection: 'row', alignItems: 'center', width: '50%', paddingRight: spacing.sm },
  factValue: { fontSize: font.size.sm, fontWeight: font.weight.semibold },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.md,
    minHeight: 56,
  },
  panel: { marginBottom: spacing.lg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  requestRow: { marginTop: spacing.md },
  requesterTap: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  requestMessage: { marginTop: spacing.sm, marginLeft: 40 + spacing.md },
  requestActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginLeft: 40 + spacing.md },
  ownerActions: { flexDirection: 'row', gap: spacing.sm },
});
