import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Chip, ChipRow, Text } from '../../components/ui';
import { PUBLIC_RATING_TAGS, RATING_TAG_LABELS, type PublicRatingTag, type RatingTag } from '../../lib/types';
import { fontSize, makeStyles, spacing, useTheme } from '../../theme';
import { rateTeammate, useRateableTeammates } from './api';

const MAX_PRAISE = 4;
const SUCCESS = 'Thanks — ratings help keep GG chill.';

function sameTags(a: RatingTag[], b: RatingTag[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/**
 * Bottom sheet for rating teammates from one lobby: public praise chips (multi-select, max 4)
 * or a private, mutually exclusive "Report as toxic" toggle. Errors are shown inline — no
 * Alerts from inside the Modal (iOS drops an Alert presented while a Modal animates).
 */
export function RateSquadSheet({ visible, lfgPostId, onClose }: { visible: boolean; lfgPostId: string; onClose: () => void }) {
  const t = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { teammates, loading, error, reload } = useRateableTeammates(lfgPostId, visible);

  // Ratings saved in this session, and unsaved edits, layered over the server's my_tags.
  const [savedLocal, setSavedLocal] = useState<Record<string, RatingTag[]>>({});
  const [draftsLocal, setDraftsLocal] = useState<Record<string, RatingTag[]>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const saved = useMemo(() => {
    const map: Record<string, RatingTag[]> = {};
    for (const tm of teammates) map[tm.profile.id] = savedLocal[tm.profile.id] ?? tm.my_tags;
    return map;
  }, [teammates, savedLocal]);
  const drafts = useMemo(() => {
    const map: Record<string, RatingTag[]> = {};
    for (const id of Object.keys(saved)) map[id] = draftsLocal[id] ?? saved[id];
    return map;
  }, [saved, draftsLocal]);

  const close = () => {
    if (submitting) return;
    setDraftsLocal({});
    setRowErrors({});
    setDone(null);
    onClose();
  };

  const changedIds = useMemo(
    () => teammates.map((tm) => tm.profile.id).filter((id) => (drafts[id]?.length ?? 0) > 0 && !sameTags(drafts[id] ?? [], saved[id] ?? [])),
    [teammates, drafts, saved],
  );

  const update = (id: string, next: RatingTag[]) => {
    setDraftsLocal((d) => ({ ...d, [id]: next }));
    setDone(null);
    setRowErrors((e) => {
      if (!e[id]) return e;
      const rest = { ...e };
      delete rest[id];
      return rest;
    });
  };

  const togglePraise = (id: string, tag: PublicRatingTag) => {
    const cur = (drafts[id] ?? []).filter((x) => x !== 'toxic');
    if (cur.includes(tag)) update(id, cur.filter((x) => x !== tag));
    else if (cur.length < MAX_PRAISE) update(id, [...cur, tag]);
  };

  const toggleToxic = (id: string) => {
    const isToxic = (drafts[id] ?? []).includes('toxic');
    // Turning it on clears praise; turning it off goes back to the saved praise (or nothing).
    update(id, isToxic ? (saved[id] ?? []).filter((x) => x !== 'toxic') : ['toxic']);
  };

  const submit = async () => {
    if (changedIds.length === 0 || submitting) return;
    setSubmitting(true);
    setDone(null);
    const errors: Record<string, string> = {};
    const ok: Record<string, RatingTag[]> = {};
    for (const id of changedIds) {
      const tags = drafts[id] ?? [];
      try {
        await rateTeammate(lfgPostId, id, tags);
        ok[id] = tags;
      } catch (e) {
        errors[id] = e instanceof Error ? e.message : "Couldn't save that rating.";
      }
    }
    setSavedLocal((prev) => ({ ...prev, ...ok }));
    setRowErrors(errors);
    setSubmitting(false);
    if (Object.keys(errors).length === 0) setDone(SUCCESS);
  };

  const squad = t.words.squad;

  let content;
  if (loading && teammates.length === 0) {
    content = (
      <View style={s.state}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  } else if (error && teammates.length === 0) {
    content = (
      <View style={s.state}>
        <Text muted style={s.center}>
          {error}
        </Text>
        <Button title="Try again" variant="secondary" size="sm" onPress={() => void reload()} style={{ marginTop: spacing.md }} />
      </View>
    );
  } else if (teammates.length === 0) {
    content = (
      <View style={s.state}>
        <Ionicons name="people-outline" size={36} color={t.colors.textFaint} />
        <Text muted style={[s.center, { marginTop: spacing.sm }]}>
          Nobody to rate here. You can rate players who were in this {squad} chat with you, for 7 days after the lobby.
        </Text>
      </View>
    );
  } else {
    content = teammates.map((tm) => {
      const id = tm.profile.id;
      const draft = drafts[id] ?? [];
      const toxic = draft.includes('toxic');
      const name = tm.profile.display_name || tm.profile.username || 'Player';
      const isSaved = (saved[id]?.length ?? 0) > 0;
      const dirty = changedIds.includes(id);
      return (
        <View key={id} style={s.mate}>
          <View style={s.mateTop}>
            <Avatar uri={tm.profile.avatar_url} name={name} size={40} backdrop={t.colors.surface} />
            <View style={s.mateNames}>
              <Text variant="strong" numberOfLines={1}>
                {name}
              </Text>
              {tm.profile.username ? (
                <Text variant="caption" numberOfLines={1}>
                  @{tm.profile.username}
                </Text>
              ) : null}
            </View>
            {isSaved && !dirty ? (
              <View style={s.ratedTag}>
                <Ionicons name="checkmark" size={12} color={t.colors.accent} />
                <Text variant="caption" style={s.ratedText}>
                  Rated
                </Text>
              </View>
            ) : null}
          </View>

          <View style={[s.chips, toxic && s.dimmed]} accessibilityLabel={`Praise for ${name}`}>
            <ChipRow>
              {PUBLIC_RATING_TAGS.map((tag) => (
                <Chip
                  key={tag}
                  label={RATING_TAG_LABELS[tag]}
                  selected={!toxic && draft.includes(tag)}
                  icon={!toxic && draft.includes(tag) ? 'checkmark' : undefined}
                  onPress={() => togglePraise(id, tag)}
                />
              ))}
            </ChipRow>
          </View>

          <Pressable
            onPress={() => toggleToxic(id)}
            accessibilityRole="switch"
            accessibilityState={{ checked: toxic }}
            accessibilityLabel={`Report ${name} as toxic. Private.`}
            accessibilityHint="Clears any praise for this player. Never shown on their profile."
            style={({ pressed }) => [s.toxicRow, toxic && s.toxicOn, pressed && { backgroundColor: t.colors.surfaceRaised }]}
          >
            <Ionicons name={toxic ? 'flag' : 'flag-outline'} size={16} color={toxic ? t.colors.danger : t.colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text variant="label" style={toxic ? { color: t.colors.danger } : undefined}>
                Report as toxic (private)
              </Text>
              {toxic ? (
                <Text variant="caption">Never shown on their profile. Repeated reports reach the moderators.</Text>
              ) : null}
            </View>
            <View style={[s.box, toxic && s.boxOn]}>{toxic ? <Ionicons name="checkmark" size={14} color={t.colors.onPrimary} /> : null}</View>
          </Pressable>

          {rowErrors[id] ? (
            <Text variant="caption" style={s.rowError} accessibilityRole="alert">
              {rowErrors[id]}
            </Text>
          ) : null}
        </View>
      );
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={s.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} accessibilityViewIsModal>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text variant="heading" accessibilityRole="header">
                Rate your {squad}
              </Text>
              <Text variant="caption" style={{ marginTop: 2 }}>
                Praise shows on their player card. Toxic reports stay private.
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

          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>

          {teammates.length > 0 ? (
            <View style={s.footer}>
              {done ? (
                <View style={s.doneRow} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <Ionicons name="checkmark-circle" size={18} color={t.colors.accent} />
                  <Text variant="label" style={{ color: t.colors.accent, flex: 1 }}>
                    {done}
                  </Text>
                </View>
              ) : null}
              <Button
                title={done && changedIds.length === 0 ? 'Done' : 'Submit ratings'}
                icon={done && changedIds.length === 0 ? undefined : 'star-outline'}
                onPress={done && changedIds.length === 0 ? close : () => void submit()}
                loading={submitting}
                disabled={!done && changedIds.length === 0}
                backdrop={t.colors.surface}
                accessibilityLabel={
                  done && changedIds.length === 0
                    ? 'Done'
                    : `Submit ratings${changedIds.length ? ` for ${changedIds.length} ${changedIds.length === 1 ? 'teammate' : 'teammates'}` : ''}`
                }
              />
              {!done && changedIds.length === 0 ? (
                <Text variant="caption" style={[s.center, { marginTop: spacing.xs }]}>
                  Pick tags for a teammate to rate them.
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.colors.overlay },
    sheet: {
      backgroundColor: t.colors.surface,
      borderTopLeftRadius: t.radius.lg,
      borderTopRightRadius: t.radius.lg,
      borderTopWidth: 1,
      borderColor: t.colors.border,
      maxHeight: '88%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.md, marginTop: -spacing.sm, marginRight: -spacing.sm },
    scroll: { flexGrow: 0 },
    scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    state: { alignItems: 'center', paddingVertical: spacing.xl },
    center: { textAlign: 'center' },
    mate: {
      paddingVertical: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    mateTop: { flexDirection: 'row', alignItems: 'center' },
    mateNames: { flex: 1, marginLeft: spacing.md },
    ratedTag: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    ratedText: { color: t.colors.accent, fontFamily: t.fonts.bodyBold },
    chips: { marginTop: spacing.md },
    dimmed: { opacity: 0.45 },
    toxicRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 44,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.colors.border,
    },
    toxicOn: { borderStyle: 'solid', borderColor: t.colors.danger },
    box: {
      width: 22,
      height: 22,
      borderRadius: t.radius.sm,
      borderWidth: 1.5,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: { backgroundColor: t.colors.danger, borderColor: t.colors.danger },
    rowError: { color: t.colors.danger, marginTop: spacing.sm, fontSize: fontSize.sm },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
    },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  }),
);
