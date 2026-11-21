// Lobby tab pieces: avatar with reputation ring, header icon button, party slots, incoming
// invite banner, invite sheet, mode tile and the live ticker. Colours come from the theme only.
import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Text as RNText, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import { Avatar, Badge, Button, Card, GlyphTile, ListRow, Text, type IconName } from '../../components/ui';
import { designTokens, ensureContrast, fontSize, makeStyles, spacing, useDesign, useTheme } from '../../theme';
import type { MemberProfile } from '../chat/useConversation';
import { useLoop, usePausableLoop, useScreenReaderEnabled } from '../duo/motion';
import { expiresInLabel, inviteExpiresAt, slotA11yLabel, slotLabel } from '../party/logic';
import type { IncomingPartyInvite, PartySlot } from '../party/types';
import { sheetSlotsLeft, tickerA11yLabel, type TickerItem } from './logic';

// ── Avatar + reputation ring ────────────────────────────────────────────────
/** Avatar inside a progress ring (XP into the current level). Ring shape follows the avatar's corners. */
export function AvatarRing({ uri, name, progress, size = 56 }: { uri: string | null; name: string; progress: number; size?: number }) {
  const t = useTheme();
  const d = useDesign();
  const stroke = 3;
  const gap = 3;
  const outer = size + (stroke + gap) * 2;
  const round = !!t.shape.round;
  const inner = outer - stroke;
  const rx = round ? inner / 2 : Math.min(t.radius.sm + gap + stroke, inner / 2);
  // Perimeter of a rounded rect: straight sides + the four quarter circles.
  const perimeter = 4 * (inner - 2 * rx) + 2 * Math.PI * rx;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={outer} height={outer} style={StyleSheet.absoluteFill}>
        <Rect x={stroke / 2} y={stroke / 2} width={inner} height={inner} rx={rx} ry={rx} fill="none" stroke={d.track} strokeWidth={stroke} />
        {p > 0 ? (
          <Rect
            x={stroke / 2}
            y={stroke / 2}
            width={inner}
            height={inner}
            rx={rx}
            ry={rx}
            fill="none"
            stroke={t.colors.primary}
            strokeWidth={stroke}
            strokeDasharray={`${perimeter * p} ${perimeter}`}
            strokeLinecap={round ? 'round' : 'butt'}
          />
        ) : null}
      </Svg>
      <Avatar uri={uri} name={name} size={size} />
    </View>
  );
}

// ── Header icon button with badge ───────────────────────────────────────────
export function IconBadgeButton({ icon, count, label, onPress }: { icon: IconName; count: number; label: string; onPress: () => void }) {
  const t = useTheme();
  const s = useStyles();
  const active = count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? `${label}, ${count} unread` : label}
      hitSlop={6}
      style={({ pressed }) => [s.iconButton, pressed && { backgroundColor: t.colors.surfaceRaised }]}
    >
      <Ionicons name={(active ? icon : `${icon}-outline`) as IconName} size={20} color={active ? t.colors.text : t.colors.textMuted} />
      {active ? (
        <View style={s.iconBadge} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Badge count={count} style={s.iconBadgeInner} />
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Party slots ─────────────────────────────────────────────────────────────
const SLOT_AVATAR = 52;

function PulsingPlus({ reduced, disabled }: { reduced: boolean; disabled: boolean }) {
  const t = useTheme();
  const d = useDesign();
  const s = useStyles();
  const pulse = useLoop(1600, { reduced, enabled: !disabled, rest: 0 });
  const scale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.75, 1, 0.75] });
  return (
    <Animated.View
      style={[
        s.emptyTile,
        { borderRadius: t.shape.round ? SLOT_AVATAR / 2 : t.radius.sm, borderColor: disabled ? d.hairline : t.colors.primary },
        !disabled && !reduced ? { transform: [{ scale }], opacity } : null,
      ]}
    >
      <Ionicons name="add" size={26} color={disabled ? t.colors.textFaint : d.primaryText} />
    </Animated.View>
  );
}

export function PartySlots({
  slots,
  reduced,
  canInvite,
  onPressSlot,
}: {
  slots: PartySlot[];
  reduced: boolean;
  canInvite: boolean;
  onPressSlot: (slot: PartySlot, index: number) => void;
}) {
  const t = useTheme();
  const d = useDesign();
  const s = useStyles();
  const ready = ensureContrast(t.colors.accent, [t.colors.bg], 4.5);
  return (
    <View style={s.slots}>
      {slots.map((slot, i) => {
        const label = slotLabel(slot);
        const color =
          slot.kind === 'member' && slot.leader ? d.primaryText : slot.kind === 'member' && slot.member.ready ? ready : t.colors.textMuted;
        const name = slot.kind === 'member' ? (slot.me ? 'You' : slot.member.display_name) : slot.kind === 'invited' ? slot.invite.display_name : 'Invite';
        return (
          <Pressable
            key={slot.kind === 'member' ? slot.member.profile_id : slot.kind === 'invited' ? slot.invite.id : `empty-${i}`}
            onPress={() => onPressSlot(slot, i)}
            accessibilityRole="button"
            accessibilityLabel={slotA11yLabel(slot)}
            accessibilityState={{ disabled: slot.kind === 'empty' && !canInvite }}
            style={({ pressed }) => [s.slot, pressed && { opacity: 0.7 }]}
          >
            <View style={s.slotAvatar}>
              {slot.kind === 'member' ? (
                <View>
                  <Avatar uri={slot.member.avatar_url} name={slot.member.display_name} size={SLOT_AVATAR} highlight={slot.me && !slot.member.avatar_url} />
                  {slot.member.ready ? (
                    <View style={[s.readyDot, { backgroundColor: ready, borderRadius: t.shape.round ? 9 : 2 }]}>
                      <Ionicons name="checkmark" size={12} color={t.colors.bg} />
                    </View>
                  ) : null}
                </View>
              ) : slot.kind === 'invited' ? (
                <View style={{ opacity: 0.5 }}>
                  <Avatar uri={slot.invite.avatar_url} name={slot.invite.display_name} size={SLOT_AVATAR} />
                </View>
              ) : (
                <PulsingPlus reduced={reduced} disabled={!canInvite} />
              )}
            </View>
            <Text numberOfLines={1} style={s.slotName}>
              {name}
            </Text>
            <RNText numberOfLines={1} style={[s.slotStatus, { color }]}>
              {label || ' '}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Incoming invite banner ──────────────────────────────────────────────────
export function InviteBanner({
  invite,
  now,
  busy,
  onJoin,
  onDecline,
}: {
  invite: IncomingPartyInvite;
  now: number;
  busy: 'join' | 'decline' | null;
  onJoin: () => void;
  onDecline: () => void;
}) {
  const t = useTheme();
  const s = useStyles();
  const name = invite.from.display_name || 'A player';
  return (
    <Card accent style={s.banner} accessibilityLabel={`${name} invited you to their party`}>
      <View style={s.bannerTop}>
        <Avatar uri={invite.from.avatar_url} name={name} size={40} backdrop={t.colors.surface} />
        <View style={{ flex: 1 }}>
          <Text variant="strong" numberOfLines={2}>
            {name} invited you to their party
          </Text>
          <Text variant="caption">{expiresInLabel(inviteExpiresAt(invite), now)}</Text>
        </View>
      </View>
      <View style={s.bannerActions}>
        <Button title="Decline" size="sm" variant="secondary" onPress={onDecline} loading={busy === 'decline'} disabled={!!busy} backdrop={t.colors.surface} style={{ flex: 1 }} />
        <Button title="Join" size="sm" icon="enter-outline" onPress={onJoin} loading={busy === 'join'} disabled={!!busy} backdrop={t.colors.surface} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

// ── Invite sheet ────────────────────────────────────────────────────────────
/**
 * Pick friends to invite. `slotsLeft` and `invitedIds` come from the server's party (the lobby
 * reloads it after each invite), so an invite only counts against the slots locally until the
 * reload shows it: no double counting, and a solo player can fill all 4 free slots.
 */
export function InviteSheet({
  visible,
  friends,
  invitedIds,
  loading,
  slotsLeft,
  reduced,
  onClose,
  onInvite,
}: {
  visible: boolean;
  /** Friends who aren't in the party (already-invited ones show as "Invited"). */
  friends: MemberProfile[];
  /** Players with a live pending invite from my party, per the last server read. */
  invitedIds: ReadonlySet<string>;
  loading: boolean;
  /** Free slots per the last server read (expired invites already freed). */
  slotsLeft: number;
  /** Reduce Motion: fade instead of sliding up. */
  reduced: boolean;
  onClose: () => void;
  /** Resolves on success; rejects with a friendly message. */
  onInvite: (friend: MemberProfile) => Promise<void>;
}) {
  const t = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set());
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const left = sheetSlotsLeft(slotsLeft, sent, invitedIds);

  const invite = async (f: MemberProfile) => {
    setBusyId(f.id);
    setRowError(null);
    try {
      await onInvite(f);
      setSent((prev) => new Set(prev).add(f.id));
    } catch (e) {
      setRowError({ id: f.id, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
    }
  };

  const close = () => {
    setSent(new Set());
    setRowError(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType={reduced ? 'fade' : 'slide'} onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={s.sheetRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} accessibilityViewIsModal>
          <View style={s.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text variant="heading" accessibilityRole="header">
                Invite to your {t.words.squad}
              </Text>
              <Text variant="caption" style={{ marginTop: 2 }}>
                {left === 0 ? 'Your party is full.' : `${left} ${left === 1 ? 'slot' : 'slots'} left · invites expire after 1 hour`}
              </Text>
            </View>
            <Pressable
              onPress={close}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [s.close, pressed && { backgroundColor: t.colors.surfaceRaised }]}
            >
              <Ionicons name="close" size={22} color={t.colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: spacing.md }}>
            {loading && friends.length === 0 ? (
              <View style={s.sheetState}>
                <ActivityIndicator color={t.colors.primary} />
              </View>
            ) : friends.length === 0 ? (
              <View style={s.sheetState}>
                <Text muted style={{ textAlign: 'center' }}>
                  No friends to invite yet. Add players you&apos;ve played with to invite them here.
                </Text>
                <Button
                  title="Find friends"
                  size="sm"
                  variant="secondary"
                  icon="people-outline"
                  backdrop={t.colors.surface}
                  style={{ marginTop: spacing.md }}
                  onPress={() => {
                    close();
                    router.push('/friends');
                  }}
                />
              </View>
            ) : (
              friends.map((f) => {
                const done = sent.has(f.id) || invitedIds.has(f.id);
                return (
                  <View key={f.id}>
                    <ListRow
                      title={f.display_name}
                      subtitle={f.username ? `@${f.username}` : undefined}
                      leading={<Avatar uri={f.avatar_url} name={f.display_name} size={40} backdrop={t.colors.surface} />}
                      trailing={
                        <Button
                          title={done ? 'Invited' : 'Invite'}
                          size="sm"
                          variant={done ? 'ghost' : 'primary'}
                          icon={done ? 'checkmark' : 'add'}
                          loading={busyId === f.id}
                          disabled={done || !!busyId || left === 0}
                          backdrop={t.colors.surface}
                          accessibilityLabel={done ? `${f.display_name} invited` : `Invite ${f.display_name}`}
                          onPress={() => void invite(f)}
                        />
                      }
                      chevron={false}
                    />
                    {rowError?.id === f.id ? (
                      <Text variant="caption" style={s.rowError} accessibilityRole="alert">
                        {rowError.message}
                      </Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Mode tile ───────────────────────────────────────────────────────────────
export function ModeTile({ icon, title, subtitle, live, onPress }: { icon: IconName; title: string; subtitle: string; live?: boolean; onPress: () => void }) {
  const s = useStyles();
  return (
    <Card onPress={onPress} style={s.tile} accessibilityLabel={`${title}. ${subtitle}`}>
      <GlyphTile icon={icon} size={36} tone={live ? 'primary' : 'muted'} />
      <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit style={s.tileTitle}>
        {title}
      </Text>
      <Text variant="caption" numberOfLines={1} style={s.tileSub}>
        {subtitle}
      </Text>
    </Card>
  );
}

// ── Live ticker ─────────────────────────────────────────────────────────────
/** px per second for the marquee. */
const TICKER_SPEED = 36;

function TickerChip({ item }: { item: TickerItem }) {
  const t = useTheme();
  const s = useStyles();
  const live = ensureContrast(t.colors.primary, [t.colors.panel], 3);
  return (
    <Pressable
      onPress={() => router.push(item.route)}
      accessibilityRole="link"
      accessibilityLabel={item.text}
      hitSlop={{ top: 8, bottom: 8 }}
      style={({ pressed }) => [s.tickItem, pressed && { opacity: 0.7 }]}
    >
      {item.tone === 'live' ? (
        <View style={[s.tickDot, { backgroundColor: live, borderRadius: t.shape.round ? 4 : 0 }]} />
      ) : (
        <Ionicons name="time-outline" size={13} color={t.colors.onPanel} />
      )}
      <RNText numberOfLines={1} style={s.tickText}>
        {item.text}
      </RNText>
      <RNText style={s.tickSep}>/</RNText>
    </Pressable>
  );
}

/**
 * Scrolling strip of live items. A static, swipeable row under Reduce Motion or while a screen
 * reader is on (moving targets can't be focused). The marquee pauses while it's touched and
 * while its screen isn't focused. Renders nothing when empty.
 */
export function LiveTicker({ items, reduced }: { items: TickerItem[]; reduced: boolean }) {
  const t = useTheme();
  const s = useStyles();
  const screenReader = useScreenReaderEnabled();
  const focused = useIsFocused();
  const [held, setHeld] = useState(false);
  const [width, setWidth] = useState(0);
  const [boxWidth, setBoxWidth] = useState(0);
  const still = reduced || screenReader;
  // Only scroll when the content doesn't fit.
  const scrolls = !still && width > 0 && boxWidth > 0 && width > boxWidth - 80;
  const loop = usePausableLoop(Math.max(6000, Math.round((width / TICKER_SPEED) * 1000)), scrolls && focused && !held);
  const translateX = useMemo(() => loop.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.max(1, width)] }), [loop, width]);
  const label = tickerA11yLabel(items);
  if (items.length === 0) return null;

  const onRow = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const hold = () => setHeld(true);
  const release = () => setHeld(false);
  const tag = t.shape.headingUppercase ? 'LIVE' : 'Live';
  return (
    <View style={s.ticker} onLayout={(e) => setBoxWidth(Math.round(e.nativeEvent.layout.width))} accessibilityLabel={label}>
      <View style={[s.tickTag, { backgroundColor: t.colors.primary }]}>
        <RNText style={[s.tickTagText, { color: t.colors.onPrimary }]}>{tag}</RNText>
      </View>
      {still ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tickRow}>
          {items.map((i) => (
            <TickerChip key={i.key} item={i} />
          ))}
        </ScrollView>
      ) : (
        // Touch events bubble here from the chips: hold the marquee still while pressed.
        <View style={s.tickClip} onTouchStart={hold} onTouchEnd={release} onTouchCancel={release}>
          <Animated.View style={[s.tickTrack, scrolls ? { transform: [{ translateX }] } : null]}>
            <View style={s.tickRow} onLayout={onRow}>
              {items.map((i) => (
                <TickerChip key={i.key} item={i} />
              ))}
            </View>
            {/* Second copy so the loop is seamless (hidden from screen readers). */}
            {scrolls ? (
              <View style={s.tickRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {items.map((i) => (
                  <TickerChip key={`dup-${i.key}`} item={i} />
                ))}
              </View>
            ) : null}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => {
  const d = designTokens(t);
  const soft = d.lang.corner === 'soft';
  return StyleSheet.create({
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: soft ? 22 : t.radius.md,
      backgroundColor: d.chip.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBadge: { position: 'absolute', top: 2, right: 0 },
    iconBadgeInner: { minWidth: 18, height: 18, paddingHorizontal: 4 },

    slots: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
    slot: { flex: 1, alignItems: 'center', minHeight: 44, paddingVertical: spacing.xs },
    slotAvatar: { height: SLOT_AVATAR + 4, justifyContent: 'center' },
    slotName: { marginTop: spacing.xs, fontFamily: t.fonts.bodyMedium, fontSize: fontSize.xs + 1, color: t.colors.text, maxWidth: '100%' },
    slotStatus: { fontFamily: t.fonts.bodyBold, fontSize: 10, letterSpacing: 1, marginTop: 1 },
    readyDot: {
      position: 'absolute',
      right: -4,
      bottom: -4,
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: t.colors.bg,
    },
    emptyTile: {
      width: SLOT_AVATAR,
      height: SLOT_AVATAR,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: d.surface.raised,
    },

    banner: { marginBottom: spacing.md },
    bannerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    bannerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },

    sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.colors.overlay },
    sheet: {
      backgroundColor: t.colors.surface,
      borderTopLeftRadius: t.radius.lg,
      borderTopRightRadius: t.radius.lg,
      maxHeight: '80%',
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: d.hairline,
    },
    close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.md, marginTop: -spacing.sm, marginRight: -spacing.sm },
    sheetState: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
    rowError: { color: t.colors.danger, paddingHorizontal: spacing.lg, marginTop: -spacing.xs, marginBottom: spacing.sm },

    tile: { flex: 1, padding: spacing.md, minHeight: 112, gap: 2 },
    tileTitle: { fontSize: fontSize.lg, marginTop: spacing.sm },
    tileSub: { color: t.colors.textMuted },

    ticker: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 36,
      backgroundColor: t.colors.panel,
      borderRadius: soft ? t.radius.md : 0,
      overflow: 'hidden',
    },
    tickTag: { height: '100%', paddingHorizontal: spacing.md, justifyContent: 'center' },
    tickTagText: { fontFamily: t.fonts.heading, fontSize: fontSize.xs, letterSpacing: Math.min(1.5, t.shape.headingLetterSpacing + 1) },
    tickClip: { flex: 1, overflow: 'hidden' },
    tickTrack: { flexDirection: 'row' },
    tickRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md },
    tickItem: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36 },
    tickDot: { width: 8, height: 8 },
    tickText: { color: t.colors.onPanel, fontFamily: t.fonts.bodyMedium, fontSize: fontSize.xs + 1 },
    tickSep: { color: t.colors.onPanel, opacity: 0.4, marginHorizontal: spacing.md, fontFamily: t.fonts.body },
  });
});
