import { supabase } from '../../lib/supabase';
import type { Profile, ProfileGame } from '../../lib/types';
import type { ProfileFormValues } from './form';

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

function gameRows(userId: string, v: ProfileFormValues): ProfileGame[] {
  return v.games.map((g) => ({
    profile_id: userId,
    game_id: g.game_id,
    rank: g.rank,
    role: g.role.trim() ? g.role.trim() : null,
  }));
}

async function resolveAvatar(userId: string, v: ProfileFormValues): Promise<string | null> {
  return v.localAvatarUri ? uploadAvatar(userId, v.localAvatarUri) : v.avatar_url;
}

/**
 * Onboarding: insert the profile row, then the profile_games rows.
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
  const rows = gameRows(userId, v);
  if (rows.length) {
    const { error: gErr } = await supabase.from('profile_games').insert(rows);
    if (gErr) throw gErr;
  }
}

/** Edit profile: update the profile row and replace the user's profile_games. */
export async function updateProfile(userId: string, v: ProfileFormValues): Promise<void> {
  const avatarUrl = await resolveAvatar(userId, v);
  const { id: _id, ...fields } = profileRow(userId, v, avatarUrl);
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
  if (error) {
    if (error.code === '23505') throw new Error('That username is taken. Pick another one.');
    throw error;
  }
  const { error: delErr } = await supabase.from('profile_games').delete().eq('profile_id', userId);
  if (delErr) throw delErr;
  const rows = gameRows(userId, v);
  if (rows.length) {
    const { error: gErr } = await supabase.from('profile_games').insert(rows);
    if (gErr) throw gErr;
  }
}
