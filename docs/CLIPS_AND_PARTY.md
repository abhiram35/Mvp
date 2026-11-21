# Clips first + Game Lobby (navigation, clips, party)

Chosen layout (design canvas "Vinq Layout Concepts", artboard "Chosen: Clips first + Game Lobby"):
the app opens on **Clips**; **Lobby** is one tap away; a raised hexagon **PLAY** button sits in
the middle of the tab bar.

## Navigation

Tab bar (left → right): **Clips · Lobby · PLAY (hexagon, raised) · Hub · Me**

| tab | route file | was |
|---|---|---|
| Clips (initial) | `src/app/(tabs)/index.tsx` | the LFG board (moved, see below) |
| Lobby | `src/app/(tabs)/lobby.tsx` | new |
| PLAY | `src/app/(tabs)/squad.tsx` | Duo finder (unchanged screen, new hexagon tab button) |
| Hub | `src/app/(tabs)/community.tsx` | Community |
| Me | `src/app/(tabs)/profile.tsx` | Profile |

Moved out of the tab bar:
- the LFG board ("Lobbies") → `src/app/lfg/index.tsx` (same screen; opened from the Lobby tile)
- Chats → `src/app/chats.tsx` (same screen; chat icon with unread badge in the Lobby and Clips headers)

## Clips (v1: links, no uploads)

Players share clips as links: **YouTube** (videos and Shorts), **Twitch** clips/videos, **Medal**.
No video is stored by Vinq. YouTube clips show their real thumbnail
(`https://i.ytimg.com/vi/<id>/hqdefault.jpg`); others show the game's art with the title.
Tapping the clip opens it in the YouTube/Twitch/Medal app or browser. Real uploads come later.

Feed tabs on top: **Squad** (friends + teammates) · **For you** (ranked) · **Cups** (clips linked to
a tournament). One clip per screen, vertical paging. Each clip: author, game, title, caption,
**GG** (like), comments, share, and **"Squad up with <name>"** (party invite).

## Party (the Lobby's squad slots)

A party is up to 5 players playing together right now. One party per player. The leader invites;
invites expire after 1 hour. Members can mark themselves ready. Inviting from a clip creates
the party if you don't have one.

## Database: migration 0017_clips_party.sql

| table | columns |
|---|---|
| `clips` | `id, author_id, game_id, url, platform ('youtube'\|'twitch'\|'medal'), video_id, title (3–80), caption (≤300, nullable), tournament_id (nullable), gg_count int default 0, comment_count int default 0, removed_at, created_at` |
| `clip_ggs` | `clip_id, profile_id, created_at`, PK (clip_id, profile_id) |
| `clip_comments` | `id, clip_id, author_id, body (1–500), removed_at, created_at` |
| `parties` | `id, leader_id, created_at` |
| `party_members` | `party_id, profile_id (unique: one party per player), ready boolean default false, joined_at` |
| `party_invites` | `id, party_id, from_id, to_id, status ('pending'\|'accepted'\|'declined'\|'cancelled'\|'expired'), created_at, expires_at (created + 1 h)` |

Reads: clips (not removed) and clip_comments (not removed) by any signed-in user, minus blocked
authors both ways; clip_ggs own rows; parties/party_members by members of that party;
party_invites by sender, recipient and party members. All writes through RPCs.

| RPC | rules |
|---|---|
| `post_clip(p_url, p_game_id, p_title, p_caption, p_tournament_id) → uuid` | signed in, not banned; URL must parse as YouTube (`youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `m.youtube.com`), Twitch (`clips.twitch.tv/<slug>`, `twitch.tv/<ch>/clip/<slug>`, `twitch.tv/videos/<id>`) or Medal (`medal.tv/.../clips/<id>`), https only; stores platform + video_id; title/caption through the profanity filter; max 10 clips per 24 h; same URL by the same author not twice; `p_tournament_id` only when the poster is the tournament's organiser or on a team entered in it (not withdrawn; current team member or on its start roster) |
| `delete_clip(p_clip_id) → void` | author (sets removed_at) |
| `toggle_clip_gg(p_clip_id) → jsonb {gg boolean, gg_count int}` | not on removed clips; can't GG yourself? (allowed) |
| `add_clip_comment(p_clip_id, p_body) → uuid` | profanity filter, 30 per hour; notifies the author (`clip_comment`, route `/clips/[id]`) |
| `delete_clip_comment(p_comment_id) → void` | author of the comment or of the clip |
| `get_clip_feed(p_feed text, p_game_id text, p_limit int, p_offset int, p_as_of timestamptz default now()) → setof jsonb` | `p_feed` 'for_you' \| 'squad' \| 'cups'. `p_as_of` is the feed snapshot: only clips created at or before it, and `hours_old` is measured from it, so offset pages taken with the same snapshot are stable (the app passes the time of its last refresh). Each row: clip columns + `author` {id, username, display_name, avatar_url} + `my_gg` boolean. for_you: last 30 days ordered by `(gg_count + 2*comment_count + 1) / power(hours_old + 2, 1.5)` desc; squad: authors who are accepted friends or share a team with me, newest first; cups: tournament_id not null, newest first. Excludes removed clips and blocked users. |
| `get_my_party() → jsonb` | `{party_id, leader_id, members: [{profile_id, username, display_name, avatar_url, ready, joined_at}], invites: [{id, to_id, username, display_name, avatar_url, created_at, expires_at}]}` (pending, unexpired) or null |
| `invite_to_party(p_profile_id) → uuid` | creates my party if none (me as leader); only the leader invites; party + pending invites < 5; target not blocked either way, not already in my party; notifies (`party_invite`, route `/lobby`) |
| `respond_party_invite(p_invite_id, p_accept) → void` | recipient; expired → error; accepting leaves your current party first |
| `leave_party() → void` | leaving leader hands over to the longest member; last member deletes the party |
| `remove_party_member(p_profile_id) → void` | leader |
| `set_party_ready(p_ready) → void` | member |
| `cancel_party_invite(p_invite_id) → void` | leader or sender |

Reports: extend the existing reports system so `clip` and `clip_comment` can be reported and a
moderator "remove content" sets `removed_at` (follow how 0009/0012 handle other target types).
Notifications: add types `clip_comment`, `party_invite`. Realtime: `party_members`, `party_invites`.
