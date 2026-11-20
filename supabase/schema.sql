-- ============================================================
-- BROTHERHOOD LIFE RPG — Supabase-native schema (OPTIONAL PATH B)
-- ============================================================
-- The Next.js app runs on Prisma (SQLite locally / any Postgres in prod).
-- If you prefer the plan's original pure-Supabase architecture, run this file
-- in the Supabase SQL editor instead of using Prisma. All names match the
-- original plan spec.

-- 1. Players (2 rows: 'sobhnath' | 'umang')
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  ent_multiplier INT NOT NULL,             -- 1 for Sobhnath, 2 for Umang
  has_physical_punishment BOOLEAN DEFAULT FALSE,
  shields_count INT DEFAULT 0,             -- +1 per 5-day streak > 70 XP
  current_70_streak INT DEFAULT 0,
  ent_bank_mins NUMERIC DEFAULT 0,
  last_override_at TIMESTAMPTZ             -- 14-day cooldown
);

-- 2. Weekly season (Mon 00:00 -> Sun 22:00 PvP settlement)
CREATE TABLE IF NOT EXISTS weeks (
  id SERIAL PRIMARY KEY,
  start_date DATE NOT NULL UNIQUE,         -- always Monday (IST)
  boss_name TEXT NOT NULL,
  boss_max_hp INT DEFAULT 700,
  boss_current_hp INT DEFAULT 700,
  boss_defeated BOOLEAN DEFAULT FALSE,
  sobhnath_hp INT DEFAULT 100,
  umang_hp INT DEFAULT 100,
  sobhnath_ko BOOLEAN DEFAULT FALSE,
  umang_ko BOOLEAN DEFAULT FALSE,
  pvp_forfeited_by TEXT,
  pvp_winner TEXT,                         -- settled Sunday 22:00 IST
  pvp_stake_settled BOOLEAN DEFAULT FALSE
);

-- 3. Daily logs (1 row per player per date)
CREATE TABLE IF NOT EXISTS daily_logs (
  id SERIAL PRIMARY KEY,
  week_id INT REFERENCES weeks(id),
  player_id TEXT REFERENCES players(id),
  log_date DATE NOT NULL,
  study_quest_text TEXT,
  workout_quest_text TEXT,
  skill_quest_text TEXT,
  quests_locked_at TIMESTAMPTZ,
  study_mode TEXT DEFAULT 'questions',     -- 'questions' | 'hours'
  study_value NUMERIC DEFAULT 0,
  workout_mins INT DEFAULT 0,
  skill_mins INT DEFAULT 0,
  xp_multiplier NUMERIC DEFAULT 1.0,       -- 0.5 on lockdown days
  is_lockdown BOOLEAN DEFAULT FALSE,
  shield_used BOOLEAN DEFAULT FALSE,
  override_used BOOLEAN DEFAULT FALSE,
  override_reason TEXT,
  net_xp NUMERIC DEFAULT 0,
  boss_hit_applied BOOLEAN DEFAULT FALSE,
  UNIQUE(player_id, log_date)
);

-- 4. Immutable activity & combat ledger
CREATE TABLE IF NOT EXISTS xp_ledger (
  id BIGSERIAL PRIMARY KEY,
  player_id TEXT REFERENCES players(id),
  week_id INT REFERENCES weeks(id),
  log_date DATE NOT NULL,
  delta_xp NUMERIC NOT NULL,
  event_type TEXT NOT NULL,                -- QUEST | SNITCH_GAIN | SNITCH_LOSS | BOSS_LOOT | JEE_IMPORT
  note TEXT,
  external_ref_id TEXT UNIQUE,             -- JEE import dedupe
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Sobhnath's punishment queue (verified by Umang's PIN)
CREATE TABLE IF NOT EXISTS punishments (
  id SERIAL PRIMARY KEY,
  log_date DATE NOT NULL UNIQUE,
  remaining_xp NUMERIC NOT NULL,
  pushups_5kg INT NOT NULL,
  pullups_2_5kg NUMERIC NOT NULL,
  crunches_5kg INT NOT NULL,
  squats_5kg INT NOT NULL,
  status TEXT DEFAULT 'PENDING',           -- 'PENDING' | 'COMPLETED'
  verified_by_umang_at TIMESTAMPTZ
);

-- 6. Active entertainment timer sessions
CREATE TABLE IF NOT EXISTS ent_sessions (
  id SERIAL PRIMARY KEY,
  player_id TEXT REFERENCES players(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  mins_spent NUMERIC
);

-- 7. Scheduled-job bookkeeping (idempotency keys)
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_date ON xp_ledger(log_date);
CREATE INDEX IF NOT EXISTS idx_ledger_player ON xp_ledger(player_id, log_date);
CREATE INDEX IF NOT EXISTS idx_logs_week ON daily_logs(week_id);

-- Seed the two brothers (default PINs: 1111 / 2222 — CHANGE ON FIRST LOGIN)
-- pin_hash format in the Next.js app is scrypt "salt:hash"; if you use pure
-- Supabase, replace with your own hash (e.g. pgcrypto crypt()).
INSERT INTO players (id, display_name, pin_hash, ent_multiplier, has_physical_punishment)
VALUES
  ('sobhnath', 'Sobhnath', 'CHANGE_ME', 1, TRUE),
  ('umang',    'Umang',    'CHANGE_ME', 2, FALSE)
ON CONFLICT (id) DO NOTHING;
