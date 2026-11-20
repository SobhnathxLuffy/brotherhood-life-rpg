# Brotherhood Life RPG

**Two brothers. One boss. Zero excuses.** A playable real-life RPG for Sobhnath & Umang — daily quests, XP, a shared co-op boss, weekly PvP, an entertainment economy, and physical punishments enforced by a PIN-verified tribunal.

Built on the plan's exact math (kept 100% deterministic in one immutable file), upgraded where it made sense:

| Plan said | Shipped | Why it's better |
|---|---|---|
| Vite SPA + Supabase | **Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui + Framer Motion** | All game logic runs server-side in API routes — the UI literally *cannot* cheat. Same free Vercel deploy. |
| Supabase Realtime | **Socket.io live broadcast + 4s polling fallback** | Instant `-140 BOSS HP` / snitch alerts on both devices, no external service account needed. |
| pg_cron only | **Opportunistic scheduler + `POST /api/cron` + optional `supabase/cron.sql`** | Jobs run even if nobody hits the endpoint; nobody can game the device clock. |
| SQLite-local Prisma | **Prisma (SQLite local / Postgres prod via one file swap)** | Deploy to Vercel + Neon/Supabase Postgres with a 2-step change. |

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

First login PINs: **Sobhnath 1111 · Umang 2222** — change them in Settings immediately. Multi-device: open the same URL on both phones, each signs in as its own brother with its PIN.

## Deploy (free)

1. Push this repo to GitHub → import in **Vercel** (zero config, `bun run build` works out of the box).
2. Create a free Postgres (Neon or Supabase). Copy `prisma/schema.postgres.prisma` over `prisma/schema.prisma`, set `DATABASE_URL` + `AUTH_SECRET` in Vercel env, run `npx prisma db push` locally against the prod URL once.
3. Point a free cron (cron-job.org) at `https://your-app.vercel.app/api/cron` every 5 min (optional — the opportunistic scheduler already covers it while the app is open).
4. PWA: "Install app" on Android; on desktop launch standalone via `brave --app=https://your-app.vercel.app`.

The pure-Supabase path (schema + pg_cron in IST) lives in `supabase/`.

## Map of the code

```
src/engine/rules.ts          ← EVERY number in the game (immutable, pure functions)
src/lib/game.ts              ← server service: XP recompute, snitch state machine, boss damage, cron jobs
src/lib/time.ts              ← IST helpers (device clocks are irrelevant)
src/lib/auth.ts              ← PIN (scrypt) + signed session cookie
src/app/api/*                ← state, auth, quests/lock|log|import, ent, snitch, items, punishments, pvp, cron
mini-services/game-socket/   ← socket.io broadcaster (port 3003)
src/components/game/screens/ ← HUD · Quests · Vault · Arena · Chamber
supabase/                    ← optional pure-Supabase schema + pg_cron jobs
prisma/schema.postgres.prisma← production DB swap
```

## Notes

- `PULLUP_MULT = 0.5` per the plan's OCR resolution (gamee.pdf rendered "½*"); tweak one line in `rules.ts` if the ⅗ reading was right.
- Watch sessions left running auto-close at rollover and drain the vault — the stopwatch is a trust system, the feed is the audit trail.
- Every XP event (quests, snitches, boss loot, JEE imports) lands in an immutable ledger; `net_xp` is always recomputable from `questXp × multiplier + ledger deltas`.
