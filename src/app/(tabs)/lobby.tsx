// Game Lobby tab (docs/CLIPS_AND_PARTY.md): player bar, live ticker, your party (5 slots),
// the FIND A DUO hero, and the Scrims / Cups / Lobbies mode tiles.
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AngledEdge,
  Button,
  Card,
  displayLineHeight,
  GradientFill,
  Kicker,
  PanelFrame,
  Screen,
  SectionHeader,
  Text,
} from '../../components/ui';
import { useConversationList } from '../../features/chat/useConversationList';
import { useReducedMotion } from '../../features/duo/motion';
import { useFriends, useIncomingRequestCount } from '../../features/friends/hooks';
import { gameArtUrl, isSquadable } from '../../features/games/art';
import { useGames } from '../../features/games/useGames';
import { fetchModeCounts, fetchTickerData } from '../../features/lobby/api';
import { AvatarRing, IconBadgeButton, InviteBanner, InviteSheet, LiveTicker, ModeTile, PartySlots } from '../../features/lobby/components';
import { buildTicker, levelProgress, modeSubtitles, pickMainGame, reputationLine } from '../../features/lobby/logic';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import {
  cancelPartyInvite,
  inviteToParty,
  leaveParty,
  removePartyMember,
  respondPartyInvite,
  setPartyReady,
  useParty,
} from '../../features/party/api';
import {
  activeIncomingInvites,
  buildSlots,
  canInvite as canInviteFn,
  invitableFriends,
  isLeader,
  isReady,
  memberCount,
  partyErrorMessage,
  partyHeadcount,
} from '../../features/party/logic';
import { PARTY_SIZE, type PartySlot } from '../../features/party/types';
import { usePlayerStats } from '../../features/reputation/api';
import { fetchMyGameIds } from '../../features/squad/api';
import { useLoader } from '../../features/scrims/api';
import { useNow } from '../../lib/hooks';
import { useAuth, useUserId } from '../../providers/AuthProvider';
import { makeStyles, spacing, useDesign, useTheme } from '../../theme';

const openProfile = (id: string) => router.push({ pathname: '/user/[id]', params: { id } });

export default function LobbyScreen() {
  const t = useTheme();
  const d = useDesign();
  const s = useStyles();
  const reduced = useReducedMotion();
  const myId = useUserId();
  const { profile } = useAuth();
  const now = useNow(30_000);
  const { byId } = useGames();

  // ── Data ──────────────────────────────────────────────────────────────────
  const { stats, reload: reloadStats } = usePlayerStats(myId);
  const partyState = useParty(myId);
  const { party, incoming, patch } = partyState;
  const { friends, loading: friendsLoading } = useFriends();
  const { conversations, load: loadChats } = useConversationList();
  const { count: requestCount, reload: reloadRequests } = useIncomingRequestCount();
  const myGames = useLoader(() => (myId ? fetchMyGameIds(myId) : Promise.resolve<string[]>([])), `games:${myId}`);
  const counts = useLoader(fetchModeCounts, 'mode-counts');
  const ticker = useLoader(() => (myId ? fetchTickerData(myId) : Promise.resolve(null)), `ticker:${myId}`);

  useFocusEffect(
    useCallback(() => {
      void loadChats('silent');
      void reloadRequests();
    }, [loadChats, reloadRequests]),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([partyState.reload(), counts.reload(), ticker.reload(), myGames.reload(), reloadStats(), loadChats('silent'), reloadRequests()]);
    setRefreshing(false);
  }, [partyState, counts, ticker, myGames, reloadStats, loadChats, reloadRequests]);

  const me = useMemo(
    () => ({ id: myId, username: profile?.username ?? '', display_name: profile?.display_name ?? 'You', avatar_url: profile?.avatar_url ?? null }),
    [myId, profile],
  );
  const slots = useMemo(() => buildSlots(party, me), [party, me]);
  const leader = isLeader(party, myId);
  const canInvite = canInviteFn(party, myId) && !partyState.unavailable;
  const inParty = !!party && party.members.length > 0;
  const ready = isReady(party, myId);
  const invites = useMemo(() => activeIncomingInvites(incoming, party?.party_id ?? null, now), [incoming, party, now]);
  const friendChoices = useMemo(() => invitableFriends(friends.map((f) => f.profile), party, myId), [friends, party, myId]);
  const unreadChats = conversations.filter((c) => c.unread_count > 0).length + requestCount;

  const mainGame = pickMainGame(myGames.data ?? [], byId, isSquadable);
  const art = gameArtUrl(mainGame);
  const tickerItems = useMemo(
    () => (ticker.data ? buildTicker({ ...ticker.data, gameName: (id) => byId(id)?.name }, now) : []),
    [ticker.data, byId, now],
  );
  const sub = modeSubtitles(counts.data);

  // ── Party actions ─────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>, failTitle: string) => {
      setBusy(key);
      try {
        await fn();
        await partyState.reload();
      } catch (e) {
        Alert.alert(failTitle, partyErrorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [partyState],
  );

  const toggleReady = () => {
    const next = !ready;
    // Optimistic: flip my flag straight away; reload() replaces it with the server's state.
    patch((p) => (p ? { ...p, members: p.members.map((m) => (m.profile_id === myId ? { ...m, ready: next } : m)) } : p));
    void run('ready', () => setPartyReady(next), "Couldn't update ready");
  };

  const confirmLeave = () =>
    Alert.alert(
      'Leave party?',
      leader && (party?.members.length ?? 0) > 1 ? 'The longest-standing member becomes the leader.' : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => void run('leave', leaveParty, "Couldn't leave the party") },
      ],
    );

  const onPressSlot = (slot: PartySlot) => {
    if (slot.kind === 'empty') {
      if (partyState.unavailable) return;
      if (!leader) {
        Alert.alert('Only the leader invites', 'Ask your party leader to invite more players.');
        return;
      }
      if (!canInvite) return;
      setSheetOpen(true);
      return;
    }
    if (slot.kind === 'invited') {
      const name = slot.invite.display_name;
      Alert.alert(name, 'Invited · waiting for an answer', [
        { text: 'Close', style: 'cancel' },
        { text: 'View profile', onPress: () => openProfile(slot.invite.to_id) },
        ...(leader
          ? [{ text: 'Cancel invite', style: 'destructive' as const, onPress: () => void run(`cancel:${slot.invite.id}`, () => cancelPartyInvite(slot.invite.id), "Couldn't cancel the invite") }]
          : []),
      ]);
      return;
    }
    if (slot.me) {
      router.navigate('/profile');
      return;
    }
    const id = slot.member.profile_id;
    const name = slot.member.display_name;
    if (!leader) {
      openProfile(id);
      return;
    }
    Alert.alert(name, slot.member.ready ? 'Ready' : 'In party', [
      { text: 'Close', style: 'cancel' },
      { text: 'View profile', onPress: () => openProfile(id) },
      {
        text: 'Remove from party',
        style: 'destructive',
        onPress: () => void run(`remove:${id}`, () => removePartyMember(id), `Couldn't remove ${name}`),
      },
    ]);
  };

  const respond = (inviteId: string, accept: boolean) => {
    const go = () => void run(`${accept ? 'join' : 'decline'}:${inviteId}`, () => respondPartyInvite(inviteId, accept), accept ? "Couldn't join" : "Couldn't decline");
    if (accept && inParty && (party?.members.length ?? 0) > 1) {
      Alert.alert('Switch party?', "You'll leave your current party to join this one.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Join', onPress: go },
      ]);
    } else go();
  };

  const onInvite = async (friend: { id: string }) => {
    try {
      await inviteToParty(friend.id);
    } catch (e) {
      throw new Error(partyErrorMessage(e));
    }
    void partyState.reload();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const n = memberCount(party);
  const partyNote = partyState.unavailable
    ? partyState.error
    : partyState.error && !partyState.loading
      ? partyState.error
      : !inParty
        ? `Tap + to invite friends. Up to ${PARTY_SIZE} can play together.`
        : !leader
          ? 'Only the leader can invite or remove players.'
          : null;
  const repLine = reputationLine(stats);
  const heroTitleSize = d.lang.header === 'ink' ? 34 : 44;

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={t.colors.primary}
            colors={[t.colors.primary]}
            progressBackgroundColor={t.colors.surface}
          />
        }
      >
        {/* Player bar */}
        <View style={s.playerBar}>
          <Pressable
            onPress={() => router.navigate('/profile')}
            accessibilityRole="button"
            accessibilityLabel={`Your profile, ${me.display_name}${repLine ? `, ${repLine}` : ''}`}
            style={({ pressed }) => [s.playerMain, pressed && { opacity: 0.8 }]}
          >
            <AvatarRing uri={me.avatar_url} name={me.display_name} progress={levelProgress(stats)} size={48} />
            <View style={{ flex: 1 }}>
              <Text variant="heading" numberOfLines={1}>
                {me.display_name}
              </Text>
              <Text variant="label" numberOfLines={1}>
                {repLine ?? ' '}
              </Text>
            </View>
          </Pressable>
          <NotificationBell />
          <IconBadgeButton icon="chatbubbles" count={unreadChats} label="Chats" onPress={() => router.push('/chats')} />
        </View>

        {tickerItems.length > 0 ? (
          <View style={s.tickerWrap}>
            <LiveTicker items={tickerItems} reduced={reduced} />
          </View>
        ) : null}

        <View style={s.padded}>
          {/* Incoming party invites */}
          {invites.length > 0 ? (
            <View style={{ marginTop: spacing.lg }}>
              {invites.map((inv) => (
                <InviteBanner
                  key={inv.id}
                  invite={inv}
                  now={now}
                  busy={busy === `join:${inv.id}` ? 'join' : busy === `decline:${inv.id}` ? 'decline' : null}
                  onJoin={() => respond(inv.id, true)}
                  onDecline={() => respond(inv.id, false)}
                />
              ))}
            </View>
          ) : null}

          {/* Your squad */}
          <SectionHeader index={1} kicker="Party" title={`Your ${t.words.squad} · ${n}/${PARTY_SIZE}`} />
          <PartySlots slots={slots} reduced={reduced} canInvite={canInvite} onPressSlot={onPressSlot} />
          {partyNote ? (
            <Text variant="caption" style={s.partyNote}>
              {partyNote}
            </Text>
          ) : null}
          {partyState.error && !partyState.unavailable ? (
            <Button title="Try again" size="sm" variant="ghost" icon="refresh" onPress={() => void partyState.reload()} style={{ alignSelf: 'flex-start' }} />
          ) : null}
          {inParty ? (
            <View style={s.partyActions}>
              <Button
                title={ready ? 'Ready' : 'Ready up'}
                icon={ready ? 'checkmark-circle' : 'radio-button-off'}
                variant={ready ? 'secondary' : 'primary'}
                onPress={toggleReady}
                loading={busy === 'ready'}
                disabled={!!busy && busy !== 'ready'}
                accessibilityLabel={ready ? 'You are ready. Tap to mark not ready' : 'Mark yourself ready'}
                style={{ flex: 1 }}
              />
              {leader && canInvite ? <Button title="Invite" icon="person-add-outline" variant="secondary" onPress={() => setSheetOpen(true)} style={{ flex: 1 }} /> : null}
              <Button title="Leave" variant="ghost" icon="exit-outline" onPress={confirmLeave} loading={busy === 'leave'} disabled={!!busy && busy !== 'leave'} />
            </View>
          ) : null}

          {/* Find a duo */}
          <SectionHeader index={2} kicker={mainGame ? mainGame.name : 'Duo finder'} title="Play now" />
          <Card variant="hero" onPress={() => router.navigate('/squad')} accessibilityLabel="Find a duo. Queue up in the duo finder" style={s.hero} padded={false}>
            {art ? <Image source={{ uri: art }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors /> : null}
            {/* Wash the art with the hero gradient so onPanel text keeps its contrast. */}
            <GradientFill from={d.hero.from} to={d.hero.to} direction="vertical" fromOpacity={art ? 0.55 : 1} toOpacity={art ? 0.96 : 1} style={StyleSheet.absoluteFill} />
            <View style={[s.heroBody, { paddingBottom: spacing.lg + d.lang.heroAngle }]}>
              <Kicker tone="onPanel">{mainGame ? `${mainGame.name} · ${partyHeadcount(party) > 1 ? 'with your party' : 'solo queue'}` : 'Match on game, rank & vibe'}</Kicker>
              <Text
                style={{
                  fontFamily: t.fonts.display,
                  fontSize: heroTitleSize,
                  lineHeight: displayLineHeight(t, heroTitleSize),
                  color: t.colors.onPanel,
                  letterSpacing: t.shape.headingUppercase ? Math.min(t.shape.headingLetterSpacing, 1) : t.shape.headingLetterSpacing,
                  textTransform: t.shape.headingUppercase ? 'uppercase' : 'none',
                  marginTop: spacing.xs,
                }}
              >
                Find a duo
              </Text>
              <Text variant="label" style={{ color: t.colors.onPanel, opacity: 0.9, marginBottom: spacing.md }}>
                Get matched with a teammate who plays like you.
              </Text>
              <Button title="Queue up" icon="flash" onPress={() => router.navigate('/squad')} backdrop={t.colors.panel} style={{ alignSelf: 'flex-start' }} />
            </View>
            {d.lang.heroAngle ? <AngledEdge color={t.colors.bg} /> : <PanelFrame />}
          </Card>

          {/* Modes */}
          <SectionHeader index={3} kicker="Modes" title="Compete" />
          <View style={s.tiles}>
            <ModeTile icon="flag-outline" title="Scrims" subtitle={sub.scrims} live={(counts.data?.scrims ?? 0) > 0} onPress={() => router.push('/scrims')} />
            <ModeTile
              icon="trophy-outline"
              title="Cups"
              subtitle={sub.cups}
              live={(counts.data?.cups ?? 0) > 0}
              onPress={() => router.push({ pathname: '/scrims', params: { tab: 'tournaments' } })}
            />
            <ModeTile icon="flash-outline" title={t.words.lobbies} subtitle={sub.lobbies} live={(counts.data?.lobbies ?? 0) > 0} onPress={() => router.push('/lfg')} />
          </View>
        </View>
      </ScrollView>

      <InviteSheet
        key={sheetOpen ? 'open' : 'closed'}
        visible={sheetOpen}
        friends={friendChoices}
        loading={friendsLoading}
        slotsLeft={Math.max(0, PARTY_SIZE - partyHeadcount(party))}
        onClose={() => setSheetOpen(false)}
        onInvite={onInvite}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    content: { paddingBottom: spacing.section + spacing.xl },
    padded: { paddingHorizontal: spacing.lg },
    playerBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
    playerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
    tickerWrap: { marginTop: spacing.sm, paddingHorizontal: t.shape.round ? spacing.lg : 0 },
    partyNote: { marginTop: spacing.sm, color: t.colors.textMuted },
    partyActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' },
    hero: { minHeight: 220, justifyContent: 'flex-end' },
    heroBody: { padding: spacing.lg, paddingTop: spacing.xl },
    tiles: { flexDirection: 'row', gap: spacing.sm },
  }),
);
