-- ============================================================
-- BROTHERHOOD LIFE RPG — pg_cron jobs locked to Asia/Kolkata (IST)
-- ============================================================
-- Enable extensions once in the Supabase dashboard (Database -> Extensions):
--   pg_cron, pg_net
-- Requires supabase/schema.sql to be applied first.
--
-- The Next.js app ALSO ships an opportunistic scheduler (runDueJobs on every
-- /api/state fetch) + a POST /api/cron endpoint, so these SQL jobs are an
-- optional belt-and-braces layer for the pure-Supabase deployment path.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- helper: current IST date
CREATE OR REPLACE FUNCTION ist_date() RETURNS DATE LANGUAGE SQL STABLE AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

-- 1. MIDNIGHT ROLLOVER (00:01 IST daily)
--    <50 XP day -> -25 weekly HP; 0 HP -> KO + forfeit.
--    net_xp > 70 -> streak++, every 5 -> +1 shield; else streak reset.
--    Sobhnath net_xp < 100 -> punishment ticket R = 100 - max(0, net_xp).
CREATE OR REPLACE FUNCTION rpg_rollover() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  y DATE := ist_date() - 1;
  target_week RECORD;
  rec RECORD;
  new_hp INT;
  streak INT;
BEGIN
  -- idempotency guard
  IF EXISTS (SELECT 1 FROM app_meta WHERE key = 'rollover:' || y) THEN RETURN; END IF;

  SELECT * INTO target_week FROM weeks
    WHERE start_date = (y - ((extract(isodow FROM y)::int) - 1) * INTERVAL '1 day')::date;
  IF NOT FOUND THEN
    INSERT INTO app_meta VALUES ('rollover:' || y, 'no-week') ON CONFLICT (key) DO NOTHING;
    RETURN;
  END IF;

  FOR rec IN SELECT * FROM players LOOP
    DECLARE
      log RECORD;
      net NUMERIC;
    BEGIN
      SELECT * INTO log FROM daily_logs WHERE player_id = rec.id AND log_date = y;
      net := COALESCE(log.net_xp, 0);
      CONTINUE WHEN log IS NOT NULL AND (log.shield_used OR log.override_used);

      IF net < 50 THEN
        IF rec.id = 'sobhnath' THEN
          new_hp := GREATEST(0, target_week.sobhnath_hp - 25);
          UPDATE weeks SET sobhnath_hp = new_hp,
            sobhnath_ko = (new_hp = 0),
            pvp_forfeited_by = CASE WHEN new_hp = 0 THEN 'sobhnath' ELSE pvp_forfeited_by END
          WHERE id = target_week.id;
        ELSE
          new_hp := GREATEST(0, target_week.umang_hp - 25);
          UPDATE weeks SET umang_hp = new_hp,
            umang_ko = (new_hp = 0),
            pvp_forfeited_by = CASE WHEN new_hp = 0 THEN 'umang' ELSE pvp_forfeited_by END
          WHERE id = target_week.id;
        END IF;
      END IF;

      IF net > 70 THEN
        streak := rec.current_70_streak + 1;
        UPDATE players SET current_70_streak = streak,
          shields_count = shields_count + CASE WHEN streak % 5 = 0 THEN 1 ELSE 0 END
        WHERE id = rec.id;
      ELSE
        UPDATE players SET current_70_streak = 0 WHERE id = rec.id;
      END IF;

      IF rec.has_physical_punishment AND net < 100 THEN
        INSERT INTO punishments (log_date, remaining_xp, pushups_5kg, pullups_2_5kg, crunches_5kg, squats_5kg)
        VALUES (y, 100 - GREATEST(0, net), 100 - GREATEST(0, net), (100 - GREATEST(0, net)) * 0.5, 100 - GREATEST(0, net), (100 - GREATEST(0, net)) * 2)
        ON CONFLICT (log_date) DO NOTHING;
      END IF;
    END;
  END LOOP;

  INSERT INTO app_meta VALUES ('rollover:' || y, 'done') ON CONFLICT (key) DO UPDATE SET value = 'done';
END $$;

-- 2. BOSS DAMAGE TRIGGER (on daily_logs update)
--    Both brothers >= 70 XP on the same day -> -140 boss HP; defeat -> +70 loot each.
CREATE OR REPLACE FUNCTION rpg_boss_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  partner RECORD;
  wk RECORD;
  own RECORD;
  new_hp INT;
BEGIN
  SELECT * INTO own FROM daily_logs WHERE id = NEW.id;
  SELECT * INTO partner FROM daily_logs
    WHERE log_date = NEW.log_date AND player_id <> NEW.player_id;
  IF partner IS NULL OR own.boss_hit_applied OR partner.boss_hit_applied THEN RETURN NEW; END IF;
  IF own.net_xp < 70 OR partner.net_xp < 70 THEN RETURN NEW; END IF;

  SELECT * INTO wk FROM weeks WHERE id = NEW.week_id;
  IF wk IS NULL OR wk.boss_defeated THEN RETURN NEW; END IF;

  new_hp := GREATEST(0, wk.boss_current_hp - 140);
  UPDATE daily_logs SET boss_hit_applied = TRUE WHERE id IN (own.id, partner.id);
  UPDATE weeks SET boss_current_hp = new_hp, boss_defeated = (new_hp = 0) WHERE id = wk.id;

  IF new_hp = 0 THEN
    INSERT INTO xp_ledger (player_id, week_id, log_date, delta_xp, event_type, note)
    VALUES ('sobhnath', wk.id, NEW.log_date, 70, 'BOSS_LOOT', wk.boss_name || ' defeated'),
           ('umang',    wk.id, NEW.log_date, 70, 'BOSS_LOOT', wk.boss_name || ' defeated');
    UPDATE players SET ent_bank_mins = ent_bank_mins + 70 * ent_multiplier WHERE id IN ('sobhnath', 'umang');
    UPDATE daily_logs SET net_xp = net_xp + 70 WHERE id IN (own.id, partner.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rpg_boss ON daily_logs;
CREATE TRIGGER trg_rpg_boss AFTER UPDATE OF net_xp ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION rpg_boss_trigger();

-- 3. SUNDAY 22:00 IST PVP SETTLEMENT (runs 22:05 IST Sundays)
CREATE OR REPLACE FUNCTION rpg_settle_pvp() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  wk RECORD;
  s NUMERIC; u NUMERIC;
BEGIN
  SELECT * INTO wk FROM weeks
    WHERE pvp_winner IS NULL
      AND start_date = (ist_date() - ((extract(isodow FROM ist_date())::int) - 1) * INTERVAL '1 day')::date;
  IF NOT FOUND THEN RETURN; END IF;

  IF wk.sobhnath_ko AND wk.umang_ko THEN
    UPDATE weeks SET pvp_winner = 'draw' WHERE id = wk.id;
  ELSIF wk.pvp_forfeited_by IS NOT NULL THEN
    UPDATE weeks SET pvp_winner = CASE WHEN wk.pvp_forfeited_by = 'sobhnath' THEN 'umang' ELSE 'sobhnath' END WHERE id = wk.id;
  ELSE
    SELECT COALESCE(SUM(net_xp), 0) INTO s FROM daily_logs WHERE week_id = wk.id AND player_id = 'sobhnath';
    SELECT COALESCE(SUM(net_xp), 0) INTO u FROM daily_logs WHERE week_id = wk.id AND player_id = 'umang';
    UPDATE weeks SET pvp_winner = CASE WHEN s > u THEN 'sobhnath' WHEN u > s THEN 'umang' ELSE 'draw' END WHERE id = wk.id;
  END IF;
END $$;

-- 4. MONDAY 00:00 IST — NEW WEEK / BOSS RESPAWN (runs 00:02 IST Mondays)
CREATE OR REPLACE FUNCTION rpg_new_week() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  today DATE := ist_date();
  n INT;
BEGIN
  IF extract(isodow FROM today)::int <> 1 THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM weeks WHERE start_date = today) THEN RETURN; END IF;
  SELECT COUNT(*) INTO n FROM weeks;
  INSERT INTO weeks (start_date, boss_name)
  VALUES (today, (ARRAY[
    'Procrastination Titan','Doomscroll Hydra','Distraction Demon King','The Scroll Reaper',
    'Couch Potato Golem','Infinite Feed Leviathan','Notification Wyrm','Zero-Focus Lich'
  ])[1 + floor(random() * 8)::int] || ' Lv.' || (n + 1));
END $$;

-- Schedules (cron times in the DB's configured timezone — set to Asia/Kolkata:
-- Supabase -> Database -> Settings -> "Report timezone" is UTC, so offset manually:
--   00:01 IST = 18:31 UTC (previous day) | 22:05 IST Sunday = 16:35 UTC Sunday
--   00:02 IST Monday = 18:32 UTC Monday
SELECT cron.schedule('rpg-rollover',    '31 18 * * *', 'SELECT rpg_rollover()');
SELECT cron.schedule('rpg-settle-pvp',  '35 16 * * 0', 'SELECT rpg_settle_pvp()');
SELECT cron.schedule('rpg-new-week',    '32 18 * * 1', 'SELECT rpg_new_week()');
