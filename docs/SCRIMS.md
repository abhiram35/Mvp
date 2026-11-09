# Scrims (Phase 1: free scrims)

Teams post scrims (practice matches) for **VALORANT** and **Counter-Strike 2**. Another team requests
the slot, the host accepts, both rosters get a group chat, check in, play in-game, and both captains
report the result. No money changes hands in Phase 1.

Games are enabled per row with `games.scrims_enabled` (true for `valorant` and `cs2`), so more games
can be added later without a code change.

## Flow

```
post_scrim ──► open ──request_scrim──► (requests) ──respond_scrim_request(accept)──► booked
                 │                                                                 │
             cancel_scrim                         check_in_scrim (T-30 min … T+15 min)
                 ▼                                                                 │
             cancelled ◄──────────── cancel_scrim (late if < 2 h before) ──────────┤
                                                                                   │
            no_show ◄── claim_scrim_no_show (T+15 min, I checked in, they didn't) ─┤
                                                                                   ▼
                       report_scrim_result by both captains: same score → completed
                                                             different     → disputed
                       booked ≥ 2 h after start ──escalate_scrim (captain)──► disputed
                       disputed ──resolve_scrim_dispute (moderator)──► completed
```

An `open` scrim whose `scheduled_at` has passed is shown as expired (not stored).

## Tables (migration 0015_scrims.sql)

| table | purpose |
|---|---|
| `games.scrims_enabled boolean` | which games support scrims |
| `teams` | `id, game_id, name (3–32), tag (2–5, A–Z0–9, stored upper), region, captain_id, created_at`. Unique name and tag per game (case-insensitive). |
| `team_members` | `team_id, profile_id, game_id (denormalised), role ('captain'|'player'|'sub'), joined_at`. One team per player per game. Max 7 members. |
| `team_invites` | `id, team_id, profile_id, invited_by, status ('pending'|'accepted'|'declined'|'cancelled'), created_at` |
| `scrims` | `id, game_id, host_team_id, opponent_team_id, region, scheduled_at, format ('bo1'|'bo3'|'bo5'), rank_min, rank_max, notes (≤200), status ('open'|'booked'|'completed'|'disputed'|'cancelled'|'no_show'), host_checked_in_at, opp_checked_in_at, host_score, opp_score, no_show_team_id, cancelled_by_team_id, late_cancel, conversation_id, created_by, created_at, updated_at` |
| `scrim_requests` | `id, scrim_id, team_id, message (≤140), status ('pending'|'accepted'|'declined'|'withdrawn'), created_by, created_at`; unique (scrim_id, team_id) |
| `scrim_lobby` | `scrim_id, info (≤300), updated_by, updated_at` — party code / server details, readable only by both rosters |
| `scrim_reports` | `scrim_id, team_id, host_score, opp_score, screenshot_url, reported_by, created_at`; PK (scrim_id, team_id) |

Reads: `teams`, `team_members`, `scrims` are readable by any signed-in user. `scrim_requests` by
members of the host or requesting team. `team_invites` by the invitee and team members.
`scrim_lobby` by members of both teams. `scrim_reports` by members of both teams and moderators.
**All writes go through the RPCs below** (no direct insert/update/delete).

## RPCs (all `security definer`, `search_path = public`, signed-in users only)

| function | who | notes |
|---|---|---|
| `create_team(p_game_id, p_name, p_tag, p_region) → uuid` | anyone | caller becomes captain; game must be scrims-enabled; caller not already on a team for that game |
| `invite_to_team(p_team_id, p_profile_id) → uuid` | captain | not blocked either way; invitee not on a team for that game; roster < 7; notifies |
| `respond_team_invite(p_invite_id, p_accept) → void` | invitee | accept re-checks the rules and joins as `player` |
| `remove_team_member(p_team_id, p_profile_id) → void` | captain | cannot remove self |
| `leave_team(p_team_id) → void` | member | captain leaving hands captaincy to the longest-serving member; last member leaving deletes the team and cancels its open scrims |
| `post_scrim(p_team_id, p_scheduled_at, p_format, p_rank_min, p_rank_max, p_notes) → uuid` | captain | team needs ≥ 5 members; time between now + 15 min and now + 14 days; max 5 upcoming open/booked per team; region = team region |
| `request_scrim(p_scrim_id, p_team_id, p_message) → uuid` | captain of requesting team | same game, not the host, scrim open and upcoming, ≥ 5 members, captains not blocked; notifies host captain |
| `withdraw_scrim_request(p_request_id) → void` | captain of requesting team | |
| `respond_scrim_request(p_request_id, p_accept) → uuid` | host captain | accept: scrim → booked, other pending requests declined, group chat for both rosters created (returned), lobby row created, notifies |
| `cancel_scrim(p_scrim_id) → void` | host captain (open/booked) or opponent captain (booked) | `late_cancel` when booked and < 2 h before start; notifies the other captain |
| `check_in_scrim(p_scrim_id) → void` | any member of either team | booked, from 30 min before to 15 min after start |
| `set_scrim_lobby(p_scrim_id, p_info) → void` | either captain | booked |
| `report_scrim_result(p_scrim_id, p_host_score, p_opp_score, p_screenshot_url) → text` | either captain | booked and started; scores valid for the format (bo1 1–0, bo3 2–0/2–1, bo5 3–0/3–1/3–2); returns new status |
| `claim_scrim_no_show(p_scrim_id) → void` | captain of the team that checked in | ≥ 15 min after start, other team not checked in |
| `escalate_scrim(p_scrim_id) → void` | either captain | booked and ≥ 2 h after the start (nobody finished it): → disputed, for a moderator |
| `resolve_scrim_dispute(p_scrim_id, p_host_score, p_opp_score) → void` | moderator | disputed → completed; not for a scrim the moderator's own team played |
| `get_team_stats(p_team_id) → jsonb` | anyone | `{ played, wins, losses, no_shows, late_cancels, reliability }` (reliability 0–100 or null) |

Notification times use the region's main time zone (IST, GST, SGT) or UTC for regions that span
many zones; the app always shows the player's local time. Notifications use the new types `team_invite`, `scrim_request`, `scrim_update`, routed to
`/teams/[id]` or `/scrims/[id]`.

## Streaming (migration 0016_scrim_streams.sql)

Opt-in per scrim. New columns on `scrims`: `stream_allowed`, `stream_url` (https YouTube / Twitch
only), `featured_at`.

| function | who | notes |
|---|---|---|
| `set_scrim_streaming(p_scrim_id, p_allowed) → void` | host captain | ON only while open and before any team has requested (so requesting teams agree knowingly); OFF any time before the start (also clears the link) |
| `set_scrim_stream_url(p_scrim_id, p_url) → void` | either captain | booked / completed / disputed, `stream_allowed` required; null or '' clears; notifies the other team |
| `set_scrim_featured(p_scrim_id, p_featured) → void` | moderator | featured scrims show at the top of the board |

The app shows **LIVE · YouTube** from the start time for 4 hours while a booked scrim has a link.
Streaming guidance shown to captains: stream from an observer slot with a 2–5 minute delay, team
voice off stream unless players agree, no copyrighted music, no Riot/Valve logos.

## Not in Phase 1

Brackets/tournaments (Phase 2), paid entry (Phase 3: needs registration with India's Online
Gaming Authority and a lawyer/CA review), automatic result verification (needs Riot API approval).
