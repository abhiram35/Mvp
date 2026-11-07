-- ─────────────────────────────────────────────────────────────────────────────
-- GG 0005 – seed games (safe to re-run)
-- ranks are ordered lowest → highest; empty array = no ranked ladder.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.games (id, name, platforms, ranks, emoji) values
  ('bgmi', 'Battlegrounds Mobile India', array['mobile'],
    array['Bronze','Silver','Gold','Platinum','Diamond','Crown','Ace','Ace Master','Ace Dominator','Conqueror'], '🪂'),
  ('free_fire_max', 'Free Fire MAX', array['mobile'],
    array['Bronze','Silver','Gold','Platinum','Diamond','Heroic','Elite Heroic','Master','Elite Master','Grandmaster'], '🔥'),
  ('codm', 'Call of Duty: Mobile', array['mobile'],
    array['Rookie','Veteran','Elite','Pro','Master','Grandmaster','Legendary'], '🎖️'),
  ('valorant', 'VALORANT', array['pc','console'],
    array['Iron','Bronze','Silver','Gold','Platinum','Diamond','Ascendant','Immortal','Radiant'], '🎯'),
  ('cs2', 'Counter-Strike 2', array['pc'],
    array['Silver','Gold Nova','Master Guardian','Distinguished Master Guardian','Legendary Eagle','Supreme Master First Class','Global Elite'], '💣'),
  ('pubg_pc', 'PUBG: Battlegrounds', array['pc','console'],
    array['Bronze','Silver','Gold','Platinum','Diamond','Master'], '🍳'),
  ('fortnite', 'Fortnite', array['pc','console','mobile'],
    array['Bronze','Silver','Gold','Platinum','Diamond','Elite','Champion','Unreal'], '🦙'),
  ('apex_legends', 'Apex Legends', array['pc','console'],
    array['Rookie','Bronze','Silver','Gold','Platinum','Diamond','Master','Apex Predator'], '🦾'),
  ('minecraft', 'Minecraft', array['pc','console','mobile'],
    array[]::text[], '⛏️'),
  ('gta_v', 'Grand Theft Auto V Online', array['pc','console'],
    array[]::text[], '🚗'),
  ('league_of_legends', 'League of Legends', array['pc'],
    array['Iron','Bronze','Silver','Gold','Platinum','Emerald','Diamond','Master','Grandmaster','Challenger'], '⚔️'),
  ('dota_2', 'Dota 2', array['pc'],
    array['Herald','Guardian','Crusader','Archon','Legend','Ancient','Divine','Immortal'], '🛡️'),
  ('genshin_impact', 'Genshin Impact', array['pc','console','mobile'],
    array[]::text[], '🌸'),
  ('clash_of_clans', 'Clash of Clans', array['mobile'],
    array['Bronze League','Silver League','Gold League','Crystal League','Master League','Champion League','Titan League','Legend League'], '🏰')
on conflict (id) do update
  set name      = excluded.name,
      platforms = excluded.platforms,
      ranks     = excluded.ranks,
      emoji     = excluded.emoji;
