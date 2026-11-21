// Tournaments (Phase 2). Mirrors supabase/migrations/0016_tournaments.sql — see docs/TOURNAMENTS.md.
import type { Region } from '../../lib/types';
import type { ScrimFormat, Team } from '../scrims/types';

export type TournamentStatus = 'registration' | 'live' | 'completed' | 'cancelled';
export type EntryStatus = 'registered' | 'withdrawn' | 'no_show' | 'playing' | 'eliminated' | 'champion' | 'disqualified';
export type MatchStatus = 'pending' | 'ready' | 'completed' | 'disputed' | 'bye';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface Organiser {
  profile_id: string;
  org_name: string;
  granted_by: string | null;
  granted_at: string;
}

export interface OrganiserApplication {
  id: string;
  profile_id: string;
  org_name: string;
  discord: string | null;
  about: string;
  status: ApplicationStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profile?: { id: string; username: string; display_name: string | null; avatar_url: string | null; created_at?: string } | null;
}

export interface Tournament {
  id: string;
  organiser_id: string | null;
  game_id: string;
  name: string;
  description: string | null;
  prize: string | null;
  region: Region | null;
  max_teams: 4 | 8 | 16 | 32;
  match_format: Extract<ScrimFormat, 'bo1' | 'bo3'>;
  final_format: ScrimFormat;
  registration_closes_at: string;
  starts_at: string;
  stream_url: string;
  status: TournamentStatus;
  featured_match_id: string | null;
  winner_team_id: string | null;
  created_at: string;
  updated_at: string;
  organiser?: { profile_id: string; org_name: string } | null;
}

export interface TournamentEntry {
  tournament_id: string;
  team_id: string;
  registered_by: string | null;
  registered_at: string;
  checked_in_at: string | null;
  seed: number | null;
  status: EntryStatus;
  team: Team | null;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  round: number;
  slot: number;
  team_a_id: string | null;
  team_b_id: string | null;
  format: ScrimFormat;
  status: MatchStatus;
  a_score: number | null;
  b_score: number | null;
  winner_team_id: string | null;
  next_match_id: string | null;
  next_slot: 'a' | 'b' | null;
  conversation_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  team_a?: Team | null;
  team_b?: Team | null;
}

export interface MatchReport {
  match_id: string;
  team_id: string;
  a_score: number;
  b_score: number;
  reported_by: string | null;
  created_at: string;
}
