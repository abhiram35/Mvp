// One clip + its comments (target of `clip_comment` notifications, route /clips/[id]).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useContext, useMemo, useRef } from 'react';
import { KeyboardAvoidingView, Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { Button, EmptyState, ErrorState, LoadingState, Screen } from '../../components/ui';
import { useClip } from '../../features/clips/api';
import { ClipPage, type ClipPageActions } from '../../features/clips/ClipPage';
import { CommentsPanel, type CommentsPanelHandle } from '../../features/clips/Comments';
import { useToast } from '../../features/clips/Toast';
import { useClipActions } from '../../features/clips/useClipActions';
import { useReducedMotion } from '../../features/duo/motion';
import { useGames } from '../../features/games/useGames';
import { useNow } from '../../lib/hooks';
import { useUserId } from '../../providers/AuthProvider';
import { useTheme } from '../../theme';

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default function ClipScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = single(params.id);
  const myId = useUserId();
  const { clip, loading, error, reload } = useClip(id);
  const { byId } = useGames();
  const reduced = useReducedMotion();
  const now = useNow();
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const { width, height } = useWindowDimensions();
  const panel = useRef<CommentsPanelHandle>(null);

  const { show: toast, node: toastNode } = useToast();
  const onDeleted = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  const { play, gg, share, squadUp, more, openAuthor, squad } = useClipActions(toast, { onDeleted });
  const comments = useCallback(() => panel.current?.focusComposer(), []);
  const actions = useMemo<ClipPageActions>(
    () => ({ play, gg, comments, share, squadUp, more, openAuthor }),
    [play, gg, comments, share, squadUp, more, openAuthor],
  );

  const header = <Stack.Screen options={{ title: 'Clip' }} />;

  if (loading && !clip) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <LoadingState />
      </Screen>
    );
  }
  if (error && !clip) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <ErrorState message={error} onRetry={() => void reload()} />
      </Screen>
    );
  }
  if (!clip) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <EmptyState
          icon="film-outline"
          title="Clip not available"
          message="It may have been deleted or removed by a moderator."
          action={<Button title="Back to clips" variant="secondary" onPress={() => router.replace('/')} />}
        />
      </Screen>
    );
  }

  // Tall enough to feel like the feed, short enough to show the first comments.
  const mediaHeight = Math.round(Math.min((height - headerHeight) * 0.68, width * 1.6));

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <CommentsPanel
          ref={panel}
          clip={clip}
          myId={myId}
          bottomInset={insets.bottom}
          header={
            <ClipPage
              clip={clip}
              height={mediaHeight}
              game={clip.game_id ? byId(clip.game_id) : undefined}
              mine={clip.author_id === myId}
              squadState={squad[clip.author_id]}
              actions={actions}
              reduced={reduced}
              now={now}
            />
          }
        />
      </KeyboardAvoidingView>
      {toastNode}
    </View>
  );
}
