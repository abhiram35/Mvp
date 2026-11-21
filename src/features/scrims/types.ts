// Scrims (Phase 1). Mirrors supabase/migrations/0014_scrims.sql — see docs/SCRIMS.md.
import type { MemberProfile } from '../chat/useConversation';
import type { Region } from '../../lib/types';

export type ScrimFormat = 'bo1' | 'bo3' | 'bo5';
export type ScrimStatus = 'open' | 'booked' | 'completed' | 'disputed' | 'cancelled' | 'no_show';
export type TeamRole = 'captain' | 'player' | 'sub';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

/** table: teams */
export interface Team {
  id: string;
  game_id: string;
  name: string;
  tag: string;
  region: Region;
  captain_id: string;
  created_at: string;
}

/** table: team_members (with the member's profile embedded) */
export interface TeamMember {
  team_id: string;
  profile_id: string;
  game_id: string;
  role: TeamRole;
  joined_at: string;
  profile: MemberProfile | null;
}

/** table: team_invites (with the team embedded) */
export interface TeamInvite {
  id: string;
  team_id: string;
  profile_id: string;
  invited_by: string | null;
  status: InviteStatus;
  created_at: string;
  team: Team | null;
}

/** table: scrims (host / opponent teams embedded) */
export interface Scrim {
  id: string;
  game_id: string;
  /** null once the host team was disbanded (old scrims keep their row). */
  host_team_id: string | null;
  opponent_team_id: string | null;
  region: Region;
  scheduled_at: string;
  format: ScrimFormat;
  rank_min: string | null;
  rank_max: string | null;
  notes: string | null;
  status: ScrimStatus;
  host_checked_in_at: string | null;
  opp_checked_in_at: string | null;
  host_score: number | null;
  opp_score: number | null;
  no_show_team_id: string | null;
  cancelled_by_team_id: string | null;
  late_cancel: boolean;
  conversation_id: string | null;
  /** 0015: both teams agreed it may be streamed (host opts in before any request). */
  stream_allowed?: boolean;
  /** 0015: YouTube / Twitch link added by a captain once booked. */
  stream_url?: string | null;
  /** 0015: featured at the top of the board by a moderator. */
  featured_at?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  host: Team | null;
  opponent: Team | null;
}

/** table: scrim_requests (requesting team embedded) */
export interface ScrimRequest {
  id: string;
  scrim_id: string;
  team_id: string;
  message: string | null;
  status: RequestStatus;
  created_by: string;
  created_at: string;
  team: Team | null;
}

/** table: scrim_reports */
export interface ScrimReport {
  scrim_id: string;
  team_id: string;
  host_score: number;
  opp_score: number;
  screenshot_url: string | null;
  reported_by: string | null;
  created_at: string;
}

/** get_team_stats() */
export interface TeamStats {
  played: number;
  wins: number;
  losses: number;
  no_shows: number;
  late_cancels: number;
  reliability: number | null;
}
