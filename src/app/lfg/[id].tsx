import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingState, PanelFrame, Screen, SegmentBar, Text, TextField, type IconName } from '../../components/ui';
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
import { fontSize, makeStyles, spacing, useTheme, type AppTheme } from '../../theme';

function openChat(conversationId: string) {
  router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
}

function openProfile(id: string) {
  router.push({ pathname: '/user/[id]', params: { id } });
}

/** A fact inside the dark hero panel (onPanel colours). */
function Fact({ icon, label, value, highlight }: { icon: IconName; label: string; value: string; highlight?: boolean }) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={16} color={highlight ? t.colors.primary : t.colors.onPanel} style={{ opacity: highlight ? 1 : 0.75 }} />
      <View style={{ marginLeft: spacing.sm, flexShrink: 1 }}>
        <Text variant="caption" style={styles.factLabel}>
          {label}
        </Text>
        <Text style={styles.factValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function statusStyle(t: AppTheme, status: RequestStatus): { label: string; color: string; icon: IconName } {
  switch (status) {
    case 'pending':
      return { label: 'Pending', color: t.colors.warning, icon: 'time-outline' };
    case 'accepted':
      return { label: 'Accepted', color: t.colors.accent, icon: 'checkmark' };
    case 'declined':
      return { label: 'Declined', color: t.colors.textFaint, icon: 'close' };
  }
}

function StatusBadge({ status }: { status: RequestStatus }) {
  const t = useTheme();
  const styles = useStyles();
  const st = statusStyle(t, status);
  return (
    <View style={[styles.badge, { borderColor: st.color }]}>
      <Ionicons name={st.icon} size={12} color={st.color} />
      <Text variant="caption" style={{ color: st.color, marginLeft: 3, fontFamily: t.fonts.bodyBold }}>
        {st.label}
      </Text>
    </View>
  );
}

/** A ruled section: hairline on top, heading, optional right-side content. */
function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.rowBetween}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
      {children}
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
  const t = useTheme();
  const styles = useStyles();
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
      <Section title="Your request" right={<StatusBadge status={request.status} />}>
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
              title={`Open ${t.words.squad} chat`}
              icon="chatbubbles-outline"
              onPress={() => openChat(post.conversation_id!)}
              style={{ marginTop: spacing.md }}
            />
          ) : (
            <Text variant="caption" style={{ marginTop: spacing.sm }}>
              You're in! The {t.words.squad} chat will appear here shortly.
            </Text>
          )
        ) : null}
        {request.status === 'declined' ? (
          <Text variant="caption" style={{ marginTop: spacing.sm }}>
            Not this time — there are plenty of other open {t.words.lobbies === 'Lobbies' ? 'lobbies' : `posts in the ${t.words.lobbies}`}.
          </Text>
        ) : null}
      </Section>
    );
  }

  if (!joinable) {
    return (
      <View style={styles.section}>
        <Text muted>This post isn't taking requests any more.</Text>
      </View>
    );
  }

  return (
    <Section title="Want in?">
      <View style={{ height: spacing.md }} />
      <TextField
        label="Message to the host (optional)"
        placeholder="e.g. Diamond IGL, mic on, free till midnight"
        value={message}
        onChangeText={setMessage}
        maxLength={LFG_LIMITS.requestMessage}
        multiline
        hint={`${message.length}/${LFG_LIMITS.requestMessage}`}
      />
      <Button
        title={t.words.squadUp}
        accessibilityLabel={`${t.words.squadUp}: request to join`}
        icon="person-add-outline"
        onPress={send}
        loading={busy}
      />
    </Section>
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
  const styles = useStyles();
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
          <Text variant="strong" numberOfLines={1}>
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
  const t = useTheme();
  const styles = useStyles();
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
    Alert.alert('Close this post?', `It will leave the board and stop taking requests. Your ${t.words.squad} chat stays.`, [
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
          title={`Open ${t.words.squad} chat`}
          icon="chatbubbles-outline"
          onPress={() => openChat(post.conversation_id!)}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      <Section
        title="Join requests"
        right={
          <Text variant="caption" style={{ color: t.colors.textMuted }}>
            {acceptedCount}/{post.slots_needed} filled
          </Text>
        }
      >
        <View style={styles.segment}>
          <SegmentBar filled={Math.min(acceptedCount, post.slots_needed)} total={post.slots_needed} />
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
            {pending.length > 0 && decided.length > 0 ? <View style={styles.rule} /> : null}
            {decided.map((r) => (
              <RequestRow key={r.id} req={r} busy={false} canAccept={false} onAccept={() => {}} onDecline={() => {}} />
            ))}
          </>
        )}
      </Section>

      <View style={[styles.ownerActions, styles.section]}>
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
  const t = useTheme();
  const styles = useStyles();
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
        action={<Button title={`Back to ${t.words.lobbies}`} variant="secondary" onPress={() => router.replace('/')} />}
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
    else if (post.status === 'full') banner = { text: `${t.words.squad.charAt(0).toUpperCase()}${t.words.squad.slice(1)} is full.`, icon: 'people' };
    else if (expired) banner = { text: 'This post has expired.', icon: 'hourglass-outline' };

    content = (
      <Screen scroll edges={['bottom']}>
        <Stack.Screen options={{ title: game?.name ?? 'Lobby' }} />

        {banner ? (
          <View style={styles.banner} accessibilityRole="alert">
            <Ionicons name={banner.icon} size={16} color={t.colors.warning} />
            <Text style={styles.bannerText}>{banner.text}</Text>
          </View>
        ) : null}

        <Card tone="panel" style={styles.hero}>
          <Text style={styles.heroGame} numberOfLines={1}>
            {game?.emoji ? `${game.emoji}  ` : ''}
            {game?.name ?? post.game_id}
          </Text>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {post.title}
          </Text>
          <Text variant="caption" style={styles.heroMeta}>
            Posted {timeAgo(post.created_at)} · {post.status === 'open' ? expiresIn(post.expires_at) : post.status}
          </Text>

          <View style={styles.facts}>
            <Fact icon="people" label="Need" value={`${post.slots_needed} ${post.slots_needed === 1 ? 'player' : 'players'}`} highlight />
            <Fact icon="trophy-outline" label="Rank" value={post.rank ?? 'Any'} />
            <Fact icon="globe-outline" label="Region" value={regionLabel(post.region)} />
            <Fact icon="language-outline" label="Language" value={post.language} />
            <Fact
              icon={post.mic_required ? 'mic' : 'mic-off-outline'}
              label="Mic"
              value={post.mic_required ? 'Required' : 'Optional'}
              highlight={post.mic_required}
            />
          </View>
          <PanelFrame />
        </Card>

        {post.description ? (
          <View style={styles.section}>
            <Text variant="heading" accessibilityRole="header">
              Details
            </Text>
            <Text style={styles.description}>{post.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text variant="label" style={{ marginBottom: spacing.xs }}>
            Host
          </Text>
          <Pressable
            onPress={() => openProfile(post.author_id)}
            accessibilityRole="button"
            accessibilityLabel={`Posted by ${authorName}. View profile.`}
            style={({ pressed }) => [styles.authorRow, pressed && { backgroundColor: t.colors.surfaceRaised }]}
          >
            <Avatar uri={post.author?.avatar_url} name={authorName} size={44} />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text variant="strong">
                {authorName}
                {isAuthor ? ' (you)' : ''}
              </Text>
              <Text variant="caption">@{post.author?.username ?? 'unknown'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
          </Pressable>
        </View>

        {isAuthor ? (
          <AuthorPanel post={post} joinable={joinable} onChanged={reload} />
        ) : (
          <>
            <RequesterPanel post={post} myId={myId} joinable={joinable} onPostStale={reload} />
            <View style={[styles.ownerActions, styles.section]}>
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

const useStyles = makeStyles((t) => {
  const heading = {
    letterSpacing: t.shape.headingLetterSpacing,
    textTransform: t.shape.headingUppercase ? ('uppercase' as const) : ('none' as const),
  };
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.colors.warning,
      backgroundColor: t.colors.surface,
    },
    bannerText: { color: t.colors.warning, fontFamily: t.fonts.bodyMedium },
    hero: { marginTop: spacing.lg, padding: spacing.xl },
    heroGame: { ...heading, fontFamily: t.fonts.heading, fontSize: fontSize.sm, color: t.colors.onPanel, opacity: 0.75 },
    heroTitle: {
      ...heading,
      fontFamily: t.fonts.display,
      fontSize: 44,
      lineHeight: 46,
      color: t.colors.onPanel,
      marginTop: spacing.sm,
    },
    heroMeta: { color: t.colors.onPanel, opacity: 0.75, marginTop: spacing.sm },
    facts: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg, rowGap: spacing.md },
    fact: { flexDirection: 'row', alignItems: 'center', width: '50%', paddingRight: spacing.sm },
    factLabel: { color: t.colors.onPanel, opacity: 0.7 },
    factValue: { fontSize: fontSize.sm, fontFamily: t.fonts.bodyBold, color: t.colors.onPanel },
    section: {
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
    },
    rule: { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border, marginTop: spacing.md },
    segment: { marginTop: spacing.md },
    description: { marginTop: spacing.sm, color: t.colors.textMuted, lineHeight: 22 },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderRadius: t.radius.md,
      minHeight: 56,
    },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: t.radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    requestRow: { marginTop: spacing.md },
    requesterTap: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
    requestMessage: { marginTop: spacing.sm, marginLeft: 40 + spacing.md },
    requestActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginLeft: 40 + spacing.md },
    ownerActions: { flexDirection: 'row', gap: spacing.sm },
  });
});
