// Shared form model + validation for onboarding and edit-profile.
import type { PlayStyle, PlayTime, Profile, ProfileGame, Region } from '../../lib/types';

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const DISPLAY_NAME_MAX = 40;
export const BIO_MAX = 280;
export const ROLE_MAX = 30;

export interface GameEntry {
  game_id: string;
  rank: string | null;
  role: string; // '' = none
}

export interface IdentityValues {
  username: string;
  display_name: string;
}

export interface PrefsValues {
  region: Region | null;
  languages: string[];
  play_style: PlayStyle | null;
  has_mic: boolean | null;
  play_times: PlayTime[];
}

export interface AboutValues {
  /** Existing public URL (edit) or null. */
  avatar_url: string | null;
  /** Locally picked image that still needs uploading. */
  localAvatarUri: string | null;
  bio: string;
}

export interface ProfileFormValues extends IdentityValues, PrefsValues, AboutValues {
  games: GameEntry[];
}

export type FieldErrors = Partial<Record<string, string>>;

export const emptyForm: ProfileFormValues = {
  username: '',
  display_name: '',
  region: null,
  languages: [],
  play_style: null,
  has_mic: null,
  play_times: [],
  games: [],
  avatar_url: null,
  localAvatarUri: null,
  bio: '',
};

export function formFromProfile(profile: Profile, games: ProfileGame[]): ProfileFormValues {
  return {
    username: profile.username,
    display_name: profile.display_name,
    region: profile.region,
    languages: [...profile.languages],
    play_style: profile.play_style,
    has_mic: profile.has_mic,
    play_times: [...profile.play_times],
    games: games.map((g) => ({ game_id: g.game_id, rank: g.rank, role: g.role ?? '' })),
    avatar_url: profile.avatar_url,
    localAvatarUri: null,
    bio: profile.bio ?? '',
  };
}

/** Normalises what the user types into a valid-looking username. */
export function normaliseUsername(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

export function validateIdentity(v: IdentityValues): FieldErrors {
  const e: FieldErrors = {};
  if (!USERNAME_RE.test(v.username)) e.username = '3–20 characters: lowercase letters, numbers or _';
  const name = v.display_name.trim();
  if (name.length === 0) e.display_name = 'Enter a display name';
  else if (name.length > DISPLAY_NAME_MAX) e.display_name = `Max ${DISPLAY_NAME_MAX} characters`;
  return e;
}

export function validatePrefs(v: PrefsValues): FieldErrors {
  const e: FieldErrors = {};
  if (!v.region) e.region = 'Pick your region';
  if (v.languages.length === 0) e.languages = 'Pick at least one language';
  if (!v.play_style) e.play_style = 'Pick a play style';
  if (v.has_mic === null) e.has_mic = 'Do you use a mic?';
  if (v.play_times.length === 0) e.play_times = 'Pick when you usually play';
  return e;
}

export function validateGames(games: GameEntry[]): FieldErrors {
  const e: FieldErrors = {};
  if (games.length === 0) e.games = 'Pick at least one game';
  for (const g of games) {
    if (g.role.trim().length > ROLE_MAX) e[`role_${g.game_id}`] = `Max ${ROLE_MAX} characters`;
  }
  return e;
}

export function validateAbout(v: AboutValues): FieldErrors {
  const e: FieldErrors = {};
  if (v.bio.length > BIO_MAX) e.bio = `Max ${BIO_MAX} characters`;
  return e;
}

export function hasErrors(e: FieldErrors): boolean {
  return Object.values(e).some(Boolean);
}
