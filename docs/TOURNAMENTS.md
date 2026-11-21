# Tournaments (Phase 2: free, streamed, hosted by verified organisers)

Lives in the Scrims section as a second tab: **Practice | Tournaments**. Verified organisers host
single-elimination tournaments for scrim-enabled games (VALORANT, CS2). Teams (from Phase 1)
register for free, check in, and play bracket matches that work like scrim match rooms. Every
tournament has a required YouTube/Twitch stream channel; registering means a team agrees to be
streamed. No money in the app (prizes are descriptions only, e.g. sponsor items).

## Verified organisers

```
apply_to_organise ──► organiser_applications (pending)
                         │  review_organiser_application (moderator)
                         ▼
                approved → row in organisers (✓ badge)   rejected → can re-apply after 7 days
revoke_organiser (moderator) deletes the organisers row (their upcoming tournaments stay; mods can cancel)
```

Eligibility to apply: signed in, not banned, account at least 30 days old, no pending application,
`p_accept_terms = true` (organiser terms: follow Riot/Valve community rules, no gambling/alcohol/
crypto sponsors, no Riot/Valve logos, no entry fees or cash collection through Vinq).

## Tournament lifecycle

```
create_tournament ─► registration ──(registration_closes_at)──► check-in window (starts_at − 30 min … starts_at)
                         │ register_team / withdraw_team             │ check_in_team
                         ▼                                           ▼
                    cancel_tournament ─► cancelled          start_tournament (organiser, ≥ 2 checked-in teams,
                                                              now ≥ starts_at − 30 min) ─► live
live: bracket matches. report_match_result (both captains) → same score: completed + winner advances
                                                           → different: disputed → resolve_match (organiser/mod)
final completed ─► tournament completed, winner_team_id set
```

Bracket: single elimination. Size = smallest power of two ≥ checked-in teams. Seeds: team
reliability (get_team_stats) desc, then random. Byes go to the top seeds and auto-advance.
Teams that registered but didn't check in are marked `no_show`. Rosters are snapshotted at start.
Match format: `match_format` for every round except the final, which uses `final_format`.
When both teams of a match are known it becomes `ready`: a group chat for both rosters plus the
organiser is created and both teams are notified.

## Tables (migration 0016_tournaments.sql)

| table | columns |
|---|---|
| `organiser_applications` | `id, profile_id, org_name (2–60), discord (≤60, nullable), about (10–500), status ('pending'\|'approved'\|'rejected'), review_note (≤300), reviewed_by, reviewed_at, created_at` |
| `organisers` | `profile_id (pk), org_name, granted_by, granted_at` |
| `tournaments` | `id, organiser_id, game_id, name (3–60), description (≤2000, rules), prize (≤200, nullable), region (nullable = any), max_teams (4\|8\|16\|32), match_format ('bo1'\|'bo3'), final_format ('bo1'\|'bo3'\|'bo5'), registration_closes_at, starts_at, stream_url (required, https YouTube/Twitch, same rule as 0015), status ('registration'\|'live'\|'completed'\|'cancelled'), featured_match_id, winner_team_id, created_at, updated_at` |
| `tournament_teams` | `tournament_id, team_id, registered_by, registered_at, checked_in_at, seed, status ('registered'\|'withdrawn'\|'no_show'\|'playing'\|'eliminated'\|'champion'\|'disqualified')`, PK (tournament_id, team_id) |
| `tournament_rosters` | `tournament_id, team_id, profile_id` (snapshot at start) |
| `tournament_matches` | `id, tournament_id, round (1 = first), slot (0-based within round), team_a_id, team_b_id, format, status ('pending'\|'ready'\|'completed'\|'disputed'\|'bye'), a_score, b_score, winner_team_id, next_match_id, next_slot ('a'\|'b'), lobby_info (≤300), conversation_id, started_at, completed_at, created_at, updated_at` |
| `tournament_match_reports` | `match_id, team_id, a_score, b_score, reported_by, created_at`, PK (match_id, team_id) |

Reads: `organisers`, `tournaments`, `tournament_teams`, `tournament_matches` (without lobby_info),
`tournament_rosters` readable by all signed-in users. `organiser_applications`: own rows +
moderators. `tournament_matches.lobby_info` and `tournament_match_reports`: the two teams of the
match, the organiser and moderators (expose lobby via the RPC `get_match_lobby` or a column-level
revoke + RPC). All writes through RPCs.

## RPCs (security definer, `search_path = public`, signed-in only)

| function | who | rules |
|---|---|---|
| `apply_to_organise(p_org_name, p_discord, p_about, p_accept_terms) → uuid` | anyone eligible | see above |
| `review_organiser_application(p_application_id, p_approve, p_note) → void` | moderator | approve → organisers row; notify applicant |
| `revoke_organiser(p_profile_id) → void` | moderator | |
| `create_tournament(p_game_id, p_name, p_description, p_prize, p_region, p_max_teams, p_match_format, p_final_format, p_registration_closes_at, p_starts_at, p_stream_url) → uuid` | organiser | game scrims-enabled; `starts_at` between now + 1 h and now + 60 days; `registration_closes_at` > now and ≤ starts_at − 30 min; valid stream URL; max 3 upcoming (registration/live) per organiser; text through profanity filter |
| `update_tournament_info(p_tournament_id, p_description, p_prize, p_stream_url) → void` | organiser | not completed/cancelled |
| `cancel_tournament(p_tournament_id) → void` | organiser (registration only) or moderator (registration/live) | notifies registered captains |
| `register_team(p_tournament_id, p_team_id) → void` | captain of the team | registration open (status registration and now < registration_closes_at); same game; ≥ 5 members; not full (registered + checked-in < max_teams); team not already in; re-register after withdraw allowed; banned users can't |
| `withdraw_team(p_tournament_id, p_team_id) → void` | captain | before start (status registration) |
| `check_in_team(p_tournament_id, p_team_id) → void` | any member of a registered team | status registration and starts_at − 30 min ≤ now ≤ starts_at + 10 min |
| `start_tournament(p_tournament_id) → void` | organiser | status registration, now ≥ starts_at − 30 min, at least 2 checked-in teams; builds the bracket as described |
| `report_match_result(p_match_id, p_a_score, p_b_score) → text` | captain of team A or B | match ready or disputed; valid score for the match format; returns new match status |
| `resolve_match(p_match_id, p_a_score, p_b_score) → void` | organiser or moderator (not a member of either team) | match ready or disputed; sets result and advances |
| `set_match_lobby(p_match_id, p_info) → void` | captains of the match or organiser | match ready |
| `get_match_lobby(p_match_id) → text` | the two teams, organiser, moderators | null for others |
| `set_featured_match(p_tournament_id, p_match_id) → void` | organiser | match belongs to the tournament; null clears |

Notifications: new types `tournament_update` and `organiser_application`, routes `/tournaments/[id]` and
`/tournaments/match/[id]`. Moderators get `organiser_application` routed to `/moderation`.
