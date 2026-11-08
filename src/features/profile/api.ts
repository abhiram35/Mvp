import { supabase } from '../../lib/supabase';
import type { Profile } from '../../lib/types';
import { buildSaveGamesInput, type ProfileFormValues } from './form';

/** Calls the `is_username_available` RPC. */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', { p_username: username });
  if (error) throw error;
  return data === true;
}

/**
 * Uploads a local image to `avatars/<userId>/avatar.jpg` (upsert) and returns its public URL.
 * A cache-busting query is appended so a changed avatar shows immediately.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const body = await response.arrayBuffer();
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, body, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

function profileRow(userId: string, v: ProfileFormValues, avatarUrl: string | null) {
  if (!v.region || !v.play_style || v.has_mic === null) throw new Error('Please complete your profile first.');
  return {
    id: userId,
    username: v.username,
    display_name: v.display_name.trim(),
    avatar_url: avatarUrl,
    bio: v.bio.trim() ? v.bio.trim() : null,
    region: v.region,
    languages: v.languages,
    play_style: v.play_style,
    has_mic: v.has_mic,
    play_times: v.play_times,
  } satisfies Omit<Profile, 'created_at'>;
}

/**
 * Replaces my games and in-game IDs in one transaction (RPC `save_profile_games`).
 * With keepInGameIds every in_game_id is sent as null, meaning "keep what's stored".
 */
export async function saveProfileGames(v: Pick<ProfileFormValues, 'games'>, opts: { keepInGameIds?: boolean } = {}): Promise<void> {
  const { error } = await supabase.rpc('save_profile_games', { p_games: buildSaveGamesInput(v.games, opts) });
  if (error) throw error;
}

async function resolveAvatar(userId: string, v: ProfileFormValues): Promise<string | null> {
  return v.localAvatarUri ? uploadAvatar(userId, v.localAvatarUri) : v.avatar_url;
}

export interface SaveOptions {
  /** In-game IDs couldn't be loaded: leave the stored ones untouched. */
  keepInGameIds?: boolean;
}

/**
 * Onboarding: insert the profile row, then the games (save_profile_games).
 * If a previous attempt already created the profile row (e.g. the games insert failed),
 * fall back to updating it so the user can simply retry.
 */
export async function createProfile(userId: string, v: ProfileFormValues): Promise<void> {
  const avatarUrl = await resolveAvatar(userId, v);
  const row = profileRow(userId, v, avatarUrl);
  const { error } = await supabase.from('profiles').insert(row);
  if (error) {
    const { data: existing } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!existing) {
      // 23505 = unique violation: someone grabbed this username in the meantime.
      if (error.code === '23505') throw new Error('That username was just taken. Go back and pick another one.');
      throw error;
    }
    await updateProfile(userId, { ...v, localAvatarUri: null, avatar_url: avatarUrl });
    return;
  }
  await saveProfileGames(v);
}

/** Edit profile: update the profile row, then atomically replace the games and in-game IDs. */
export async function updateProfile(userId: string, v: ProfileFormValues, opts: SaveOptions = {}): Promise<void> {
  const avatarUrl = await resolveAvatar(userId, v);
  const { id: _id, ...fields } = profileRow(userId, v, avatarUrl);
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
  if (error) {
    if (error.code === '23505') throw new Error('That username is taken. Pick another one.');
    throw error;
  }
  await saveProfileGames(v, opts);
}
