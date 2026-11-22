# Brotherhood Life RPG

**Two brothers. One boss. Zero excuses.** A playable real-life RPG for Sobhnath & Umang — daily quests, XP, a shared co-op boss, weekly PvP, an entertainment economy, and physical punishments enforced by a PIN-verified tribunal.

Built on the plan's exact math (kept 100% deterministic in one immutable file), upgraded where it made sense:

| Plan said | Shipped | Why it's better |
|---|---|---|
| Vite SPA + Supabase | **Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui + Framer Motion** | All game logic runs server-side in API routes — the UI literally *cannot* cheat. Same free Vercel deploy. |
| Supabase Realtime | **Socket.io live broadcast + 4s polling fallback** | Instant `-140 BOSS HP` / snitch alerts on both devices, no external service account needed. |
| pg_cron only | **Opportunistic scheduler + `POST /api/cron` + optional `supabase/cron.sql`** | Jobs run even if nobody hits the endpoint; nobody can game the device clock. |
| SQLite-local Prisma | **Prisma (SQLite local / Postgres prod — schema auto-picked at build time)** | Deploy to Vercel + Neon/Supabase Postgres with zero code or file swaps. |

## The game (exact rules shipped)

- **Quests (100 XP base, half-rate overtime)** — Study 60 (2 XP/Q to 30Q, then 1 XP; or 15 XP/h to 4h, then 7.5), Workout 25 (unlocks at 30+ min, +6.25 per extra 15m), Skill 15 (5 XP per 15m to 45m, then 2.5). Lockdown days multiply everything by 0.5.
- **Quest lock** — write tomorrow's 3 quests before **23:30 IST** (the app nag-pops 22:30–23:30). Locked quests are read-only the next day.
- **Entertainment economy** — 1 XP = 1 min (Sobhnath) / 2 min (Umang), credited straight to the vault. Spend presets or the **live drain stopwatch** (both brothers see who's watching — snitch bait). Lockdown hard-disables it (UI + server).
- **Co-op Boss** — 700 HP weekly spawn (random name + level). Both brothers ≥70 XP the same day → **-140 HP**. Kill → **+70 XP loot each** (+70m/+140m vault).
- **Weekly PvP** — 100 HP Monday; under 50 XP in a day costs **-25 HP**; 0 HP = KO = forfeit. Sunday **22:00 IST** settlement vs the stake (₹50 treat or 2-day chore) with Mark-Stake-Paid.
- **Anti-cheat escalation** — Snitch steals up to 30 XP (floor **-30**), catcher +30 (also vault credit). Cheat again at -30 → **next-day Entertainment Lockdown + 0.5x XP**. Cheat during lockdown → **PvP forfeit + Boss heals +140**. Anti-spam: 60-min cooldown, max 5 snitches/day per catcher.
- **Shields & Overrides** — every 5-day 70+ XP streak = 1 Rest Shield (0 HP loss, streak intact). Override before **18:00 IST**, 1 per 14 days, requires the other brother's PIN co-sign.
- **Punishment Chamber** — live debt forecast `R = 100 - max(0, netXp)` → pushups ×1, pullups ×0.5, crunches ×1, squats ×2 (5 kg / 2.5 kg). Midnight locks a ticket; **only Umang's PIN signs it off**.
- **JEE bridge** — drag-drop `jee-study-app` JSON export onto the Study card; sessions dedupe forever by id (`external_ref_id`).

## Run locally

```bash
bun install
bun run db:push          # creates SQLite in db/
bun mini-services/game-socket/index.ts &   # live-sync service on :3003
bun run dev              # http://localhost:3000
```

First login PINs: **Sobhnath 1111 · Umang 2222** — pick your name, the login screen shows your default PIN (tap it to fill), then change it in Settings ⚙ immediately. Multi-device: open the same URL on both phones, each signs in as its own brother with its PIN. Login works everywhere — normal browsers (session cookie) AND embedded preview windows/iframes (bearer token, stored automatically after login) — so the tabs always unlock after entering your PIN. The game's clock starts the first day the app is booted (`game_start_date`) — days before that never count, so a fresh install starts clean at 100 HP.

## Two brothers, two devices (or one shared device)

All state lives on the **server** (database), never in the phone — so every device sees the same HP, vault, and combat feed within ~4 seconds.

- **Separate devices (recommended)** — Sobhnath opens the URL on his phone and logs in as Sobhnath once; Umang opens the same URL on his phone and logs in as Umang once. The session sticks for 30 days. Both phones then just work: quest progress, vault drains, snitches, boss hits all sync automatically.
- **One shared device** — tap the amber **switch-user button** (top-right, next to ⚙ Settings, or Settings → *Switch user*): pick the other brother, enter **his** PIN, and the seat swaps instantly. Switching signs the previous player out of that device — switching back always needs the other PIN, so nobody ever sees the other's account.

## The 5 screens — what each one is

| Tab | What it is | What you do there |
|---|---|---|
| **HUD** | Command center — both brothers' cards (Weekly HP, today's XP, streak, shields, "WATCHING NOW" badge), the shared co-op **Boss arena** (pixel titan + HP bar + trigger lamps), all 4 deadline countdowns, and the live combat feed of every XP event | Watch the war. Boss lamps mean ≥70 XP; when both are lit, the boss takes −140 automatically |
| **Quests** | The daily grind board — lock **tomorrow's** 3 quests at night, then log study / workout / skill progress through the day with `+` buttons and live XP previews (Sobhnath also gets the JEE JSON drag-drop import here) | Lock quests before 23:30 IST; tap `+` as you actually do things |
| **Vault** | Your entertainment bank — every XP earned becomes guilt-free minutes (Sobhnath 1 XP = 1 min, Umang = 2 min). Shows balance, **live drain stopwatch**, quick-spend presets | Press START before gaming/YouTube, stop when done; the vault drains live and your brother sees it |
| **Arena** | The weekly war room — PvP head-to-head tug-of-war bar, the stake (₹50 treat / 2-day chore) with Sunday countdown, Weekly HP + KO watch, the **Snitch Tribunal** (report cheats → 3-tier escalation), Rest Shield + Big-Event Override cards | Snitch on cheating, burn shields, declare overrides, mark the stake paid |
| **Chamber** | Sobhnath's punishment hall — live debt forecast (`R = 100 − max(0, netXp)` → push/pull/crunch/squat reps), the midnight pending tickets queue, completed history. **Only Umang's PIN can sign off a ticket** | Umang watches the reps, enters his PIN, debt cleared |

## How to use it day to day (the loop)

1. **Evening (22:30–23:30 IST or any time before 23:30)** — open **Quests**, write tomorrow's 3 quest texts (study / workout / skill) and hit the gold **LOCK QUESTS**. Tomorrow they're read-only — no moving goalposts.
2. **Through the day** — log progress with the `+` buttons as you actually do it: study questions/hours, workout minutes (30+ unlocks 25 XP), skill blocks. Live XP preview on every card; the ledger strips show today's math.
3. **Gaming / YouTube** — open **Vault** → **START WATCHING**; the stopwatch drains your bank live on both phones. Stop when done. Spend presets for quick guilt-free sessions. Never spend what you haven't earned.
4. **Watch the boss** — when BOTH brothers are ≥70 XP on the same day, the boss takes **-140** automatically (HUD flashes + screen shake). Kill it by Sunday for +70 XP loot each.
5. **Catch a cheat** — **Arena** → red **REPORT CHEAT**. They lose 30 (floor −30), you gain 30. Repeat offenders get lockdown; cheating during lockdown forfeits the PvP and heals the boss.
6. **Bad day coming?** — before 18:00 IST, declare an **Override** (Arena) with a reason + the OTHER brother's PIN. Once per 14 days; skips HP loss and the punishment ticket that day. A 5-day 70+ XP streak earns a **shield** instead (burn it any day).
7. **Midnight** — the server rolls over: <50 XP → −25 weekly HP; Sobhnath's remaining debt `R = 100 − max(0, netXp)` locks in as a punishment ticket with exact reps (×1 push / ×0.5 pull / ×1 crunch / ×2 squat, 5 kg / 2.5 kg).
8. **Next morning** — Sobhnath does the reps; Umang watches and signs the ticket off with **his** PIN in the **Chamber**. No PIN, no forgiveness.
9. **Sunday 22:00 IST** — PvP settles (KO beats XP-diff; both KO = draw). Loser pays the stake, winner marks **STAKE PAID**; Monday a fresh boss spawns.

## Deploy — the finished product (free, ~15 minutes)

The app already stores everything server-side, so a deploy is literally: host it + give it a Postgres. Supabase is the recommended database (free tier, Mumbai region for lowest IST latency, zero code changes — it's just a `DATABASE_URL`).

### Step 1 — Database (Supabase)

1. [supabase.com](https://supabase.com) → **New project** → pick a region close to you (e.g. *Mumbai (ap-south-1)*) → create (free).
2. Open the project → **Connect** (top bar) → copy both pooler URIs:
   - **Transaction pooler** (port `6543`) → this becomes `DATABASE_URL` — append `?pgbouncer=true&connection_limit=1`
   - **Session pooler** (port `5432`) → this becomes `DIRECT_URL`
3. (Optional pure-Supabase alternative without Prisma lives in `supabase/` — not needed for this app.)

### Step 2 — Push code to GitHub

The repo owner is `SobhnathxLuffy`. Keep every secret out of git — only `.env.example` (placeholders) is tracked; the real `.env` is gitignored forever.

### Step 3 — Vercel (hosting)

1. [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → import the repo (zero config; the build works as-is).
2. **Settings → Environment Variables** — add exactly these four:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Supabase transaction-pooler URI (6543) `+ ?pgbouncer=true&connection_limit=1` |
   | `DIRECT_URL` | Supabase session-pooler URI (5432) |
   | `AUTH_SECRET` | `openssl rand -hex 32` (signs login sessions — keep it private) |
   | `CRON_SECRET` | `openssl rand -hex 32` (protects `/api/cron`) |

3. **Deploy** → you get `https://<your-app>.vercel.app`.

### Step 4 — Create the tables (one-time, no local tooling needed)

1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase/prisma-postgres-ddl.sql`](supabase/prisma-postgres-ddl.sql) — generated from the exact Prisma schema (7 tables: `Player`, `Week`, `DailyLog`, `Ledger`, `Punishment`, `EntSession`, `AppMeta`).
3. **Run** → Success. No seeding needed: on first load the app auto-creates both brothers (default PINs **Sobhnath 1111 / Umang 2222 — change both in Settings ⚙ immediately**) and spawns the first week's boss.

> Do **not** also run `supabase/schema.sql` / `supabase/cron.sql` — those are an alternative pure-Supabase architecture with different column names; mixing them breaks `prisma db push`.

### Step 5 — Scheduled jobs (already wired)

The scheduler runs opportunistically every time either brother opens the app (with a 10-day catch-up sweep), so jobs can never be skipped by more than "the first open of the day". `vercel.json` additionally pings `/api/cron` **daily at 00:01 IST** (`31 18 * * *` UTC — exactly the plan's rollover moment; Vercel Hobby allows once-per-day crons and sends `Authorization: Bearer <CRON_SECRET>` automatically). Want tighter timing? Add cron-job.org (free): URL `https://<your-app>.vercel.app/api/cron`, every 5 minutes, header `x-cron-secret: <CRON_SECRET>`.

### Step 6 — Install on both phones

Android Chrome → open the URL → **Install app** (PWA). Desktop (CachyOS): `brave --app=https://<your-app>.vercel.app` for a standalone window. Each brother logs in once; sessions last 30 days.

### Where credentials live (and never live)

- **Never in the code or git** — `.env` is gitignored; `.env.example` holds placeholders only.
- **In Vercel** → encrypted env vars; in **Supabase** → the dashboard; on **phones** → nothing but the 30-day signed session.
- PINs are stored **scrypt-hashed with per-player salt** — even a full database leak cannot reveal them. Sessions are HMAC-signed tokens; flipping one byte invalidates them.
- If a secret ever leaks: rotate `AUTH_SECRET`/`CRON_SECRET` in Vercel (instant, everyone re-logs-in) and reset Supabase's DB password.

> Same URL, two brothers, two PINs — that's the whole product. Player switching on a shared device is built in (amber button in the header).

## Map of the code

```
src/engine/rules.ts          ← EVERY number in the game (immutable, pure functions)
src/lib/game.ts              ← server service: XP recompute, snitch state machine, boss damage, cron jobs
src/lib/time.ts              ← IST helpers (device clocks are irrelevant)
src/lib/auth.ts              ← PIN (scrypt) + signed session (cookie + bearer token for iframes)
src/app/api/*                ← state, auth, quests/lock|log|import, ent, snitch, items, punishments, pvp, cron
mini-services/game-socket/   ← socket.io broadcaster (port 3003)
src/components/game/screens/ ← HUD · Quests · Vault · Arena · Chamber
supabase/                    ← Postgres DDL to paste into the Supabase SQL Editor (+ optional pure-Supabase path)
prisma/schema.postgres.prisma← production schema (auto-picked at build when DATABASE_URL is Postgres)
vercel.json                  ← daily 00:01 IST cron ping to /api/cron
```

## Notes

- `PULLUP_MULT = 0.5` per the plan's OCR resolution (gamee.pdf rendered "½*"); tweak one line in `rules.ts` if the ⅗ reading was right.
- Watch sessions left running auto-close at rollover and drain the vault — the stopwatch is a trust system, the feed is the audit trail.
- Every XP event (quests, snitches, boss loot, JEE imports) lands in an immutable ledger; `net_xp` is always recomputable from `questXp × multiplier + ledger deltas`.
