'use client'

/**
 * HUD SCREEN — the always-on tactical overview:
 *   1. VS banner (brother vs brother cards)
 *   2. Shared co-op boss arena (pixel-art titan)
 *   3. Deadline countdown strip
 *   4. Live combat feed
 *
 * Pure presentation — every number arrives via the `state` prop. No fetching.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiPost } from '@/components/game/live'
import {
  AlertTriangle,
  CalendarClock,
  Crown,
  FileUp,
  Flame,
  Hourglass,
  Lock,
  Megaphone,
  Pencil,
  Shield,
  Skull,
  Swords,
  Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BOSS, SHIELDS, WEEKLY } from '@/engine/rules'
import { Countdown, GameBar, HudPanel, PLAYER_THEME, SectionTitle, StatChip } from '@/components/game/ui'
import { cn } from '@/lib/utils'
import type { FeedEntry, GameState, PId } from '@/lib/types'

// ---------- small helpers ----------

const DAILY_XP_CAP = 100

function fmtDelta(v: number): string {
  const r = Math.round(v * 100) / 100
  return `${r >= 0 ? '+' : '-'}${Math.abs(r)} XP`
}

function relTime(createdAt: string): string {
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return '—'
  const mins = Math.floor((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const FEED_ICONS: Record<string, { icon: LucideIcon; cls: string }> = {
  QUEST: { icon: Swords, cls: 'text-primary' },
  QUEST_LOCK: { icon: Lock, cls: 'text-gold' },
  QUEST_EDIT: { icon: Pencil, cls: 'text-primary' },
  QUEST_UNDO: { icon: Undo2, cls: 'text-crimson' },
  SNITCH_GAIN: { icon: Megaphone, cls: 'text-gold' },
  SNITCH_LOSS: { icon: AlertTriangle, cls: 'text-crimson' },
  BOSS_LOOT: { icon: Crown, cls: 'text-gold' },
  JEE_IMPORT: { icon: FileUp, cls: 'text-sobh' },
}
const FEED_ICON_FALLBACK = { icon: Swords, cls: 'text-muted-foreground' }

function feedPlayerColor(playerId: string): string {
  if (playerId === 'sobhnath') return 'text-sobh'
  if (playerId === 'umang') return 'text-umang'
  return 'text-muted-foreground'
}

// ---------- 1. VS banner: player card ----------

function PlayerCard({ pid, state, index }: { pid: PId; state: GameState; index: number }) {
  const p = state.players[pid]
  const theme = PLAYER_THEME[pid]
  const hp = pid === 'sobhnath' ? state.week.sobhnathHp : state.week.umangHp
  const ko = pid === 'sobhnath' ? state.week.sobhnathKo : state.week.umangKo
  const glowText = pid === 'sobhnath' ? 'text-glow-cyan' : 'text-glow-emerald'
  const isSobh = pid === 'sobhnath'

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.3, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className="relative"
    >
      <HudPanel className="relative h-full overflow-hidden p-3 sm:p-4">
        {/* identity tint + top accent strip — fighting-game character card */}
        <div className={cn('pointer-events-none absolute inset-0', isSobh ? 'bg-sobh/[0.05]' : 'bg-umang/[0.05]')} aria-hidden />
        <div
          className={cn('pointer-events-none absolute inset-x-0 top-0 h-[3px]', isSobh ? 'bg-gradient-to-r from-sobh via-sobh/50 to-transparent' : 'bg-gradient-to-r from-umang via-umang/50 to-transparent')}
          aria-hidden
        />

        {/* name + level chip */}
        <div className="relative flex items-center justify-between gap-1.5">
          <span className={cn('truncate font-display text-sm font-extrabold uppercase tracking-[0.15em]', theme.text, glowText)}>
            {p.displayName}
          </span>
          <span className="num shrink-0 rounded-full border border-gold/45 bg-gold/10 px-2 py-0.5 text-[9px] font-semibold text-gold">
            Lv.{p.level.level} {p.level.title}
          </span>
        </div>

        {/* weekly HP */}
        <div className="relative mt-2">
          <span className="hud-title">Weekly HP</span>
          <GameBar
            className="mt-1"
            value={hp}
            max={WEEKLY.MAX_HP}
            tone="hp"
            label={`${hp}/${WEEKLY.MAX_HP} HP`}
          />
        </div>

        {/* today's XP */}
        <div className="relative mt-2 flex items-center justify-between gap-1">
          <span className="hud-title">Today XP</span>
          {p.todayLog.isLockdown && (
            <span className="lockdown-flash rounded-full border border-crimson/50 bg-crimson/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-crimson">
              LOCKDOWN 0.5x
            </span>
          )}
        </div>
        <GameBar
          className="mt-1"
          value={p.todayLog.netXp}
          max={DAILY_XP_CAP}
          tone={theme.bar}
          label={`${p.todayLog.netXp}/${DAILY_XP_CAP} XP`}
        />

        {/* stat chips */}
        <div className="relative mt-2 flex flex-wrap gap-1">
          <StatChip
            icon={<Flame className="h-3 w-3" />}
            label="TO SHIELD"
            value={`${p.streak}/${SHIELDS.EVERY_N_DAYS}`}
            tone={p.streak >= 3 ? 'gold' : 'default'}
          />
          <StatChip icon={<Shield className="h-3 w-3" />} label="SHIELDS" value={p.shieldsCount} tone="gold" />
          <StatChip label="1 XP =" value={`${p.entMultiplier}m`} />
        </div>

        {/* watching badge */}
        {p.watching && (
          <div
            className="relative mt-2 flex items-center gap-1.5 rounded-lg border border-crimson/40 bg-crimson/10 px-2 py-1 text-[9px] font-black tracking-[0.2em] text-crimson"
            title="The other brother can snitch!"
          >
            <span className="pulse-dot relative flex h-2 w-2 shrink-0 rounded-full bg-crimson" />
            WATCHING NOW
          </div>
        )}
      </HudPanel>

      {/* KO overlay */}
      {ko && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-[2px]">
          <motion.div
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14 }}
            className="-rotate-6 rounded-lg border-2 border-crimson/80 bg-crimson/15 px-3 py-1.5 text-center font-display text-xs font-black tracking-[0.25em] text-crimson text-glow-crimson sm:text-sm"
          >
            KNOCKED OUT
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}

// ---------- 2. boss arena: pixel-art titan ----------

function BossSvg({ defeated }: { defeated: boolean }) {
  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={defeated ? 'Fallen boss titan silhouette' : 'Menacing boss titan silhouette'}
      className={cn('h-40 w-40 sm:h-48 sm:w-48 md:h-56 md:w-56', defeated && 'translate-y-3 grayscale opacity-45')}
      style={{ filter: 'drop-shadow(0 0 14px rgba(239, 68, 68, 0.45))' }}
    >
      {/* horns */}
      <polygon points="34,44 8,8 20,28 18,42 30,46" fill="#b91c1c" />
      <polygon points="86,44 112,8 100,28 102,42 90,46" fill="#b91c1c" />
      <polygon points="8,8 16,21 11,22" fill="#ef4444" />
      <polygon points="112,8 104,21 109,22" fill="#ef4444" />

      {/* head blocks */}
      <rect x="36" y="26" width="48" height="8" fill="#991b1b" />
      <rect x="32" y="34" width="56" height="10" fill="#7f1d1d" />
      <rect x="32" y="44" width="56" height="6" fill="#450a0a" />
      <rect x="32" y="50" width="56" height="16" fill="#7f1d1d" />
      <rect x="28" y="50" width="4" height="12" fill="#991b1b" />
      <rect x="88" y="50" width="4" height="12" fill="#991b1b" />
      <rect x="36" y="66" width="48" height="8" fill="#991b1b" />
      <rect x="42" y="74" width="36" height="6" fill="#7f1d1d" />

      {/* glowing eyes (pulse when alive, dead when slain) */}
      <motion.g
        animate={defeated ? { opacity: 0.3 } : { opacity: [1, 0.45, 1] }}
        transition={defeated ? { duration: 0.4 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ellipse cx="45" cy="55" rx="9" ry="4.5" fill="#ef4444" opacity="0.35" />
        <ellipse cx="75" cy="55" rx="9" ry="4.5" fill="#ef4444" opacity="0.35" />
        <rect x="40" y="52" width="10" height="6" fill="#ef4444" />
        <rect x="70" y="52" width="10" height="6" fill="#ef4444" />
        <rect x="42" y="54" width="6" height="2" fill="#fecaca" />
        <rect x="72" y="54" width="6" height="2" fill="#fecaca" />
      </motion.g>

      {/* nose */}
      <rect x="57" y="60" width="6" height="4" fill="#450a0a" />

      {/* mouth + fangs */}
      <rect x="44" y="66" width="32" height="7" fill="#1c0505" />
      <polygon points="46,66 50,66 48,71" fill="#d6d3d1" />
      <polygon points="53,66 57,66 55,72" fill="#d6d3d1" />
      <polygon points="60,66 64,66 62,72" fill="#d6d3d1" />
      <polygon points="67,66 71,66 69,71" fill="#d6d3d1" />
      <polygon points="49,73 53,73 51,69" fill="#d6d3d1" />
      <polygon points="64,73 68,73 66,69" fill="#d6d3d1" />

      {/* neck + shoulders */}
      <rect x="50" y="80" width="20" height="6" fill="#450a0a" />
      <polygon points="16,84 10,74 18,80" fill="#991b1b" />
      <polygon points="104,84 110,74 102,80" fill="#991b1b" />
      <rect x="16" y="84" width="12" height="10" fill="#991b1b" />
      <rect x="92" y="84" width="12" height="10" fill="#991b1b" />
      <rect x="26" y="86" width="68" height="12" fill="#450a0a" />

      {/* chest rune */}
      <motion.rect
        x="54"
        y="88"
        width="12"
        height="4"
        fill="#ef4444"
        animate={defeated ? { opacity: 0.2 } : { opacity: [0.9, 0.4, 0.9] }}
        transition={defeated ? { duration: 0.4 } : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  )
}

function BossLamp({ label, lit }: { label: string; lit: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider num',
        lit
          ? 'border-gold/60 bg-gold/10 text-gold hud-glow-gold'
          : 'border-border bg-foreground/[0.04] text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          lit ? 'pulse-dot bg-gold shadow-[0_0_6px_rgba(212,175,55,0.9)]' : 'bg-muted-foreground/40'
        )}
      />
      {`[${label} >= ${BOSS.TRIGGER_XP} XP]`}
    </span>
  )
}

// ---------- 3. deadline strip ----------

function DeadlineChip({ icon: Icon, iconCls, label, mins }: { icon: LucideIcon; iconCls: string; label: string; mins: number }) {
  return (
    <div className="hud-panel flex items-center gap-2 rounded-lg px-2.5 py-2">
      <Icon className={cn('h-4 w-4 shrink-0', iconCls)} />
      <div className="flex min-w-0 flex-col">
        <span className="hud-title truncate">{label}</span>
        <Countdown minsFromServer={mins} className="text-xs font-semibold" />
      </div>
    </div>
  )
}

// ---------- 4. combat feed ----------

function FeedRow({ entry }: { entry: FeedEntry }) {
  const ic = FEED_ICONS[entry.eventType] ?? FEED_ICON_FALLBACK
  const Icon = ic.icon
  const name =
    entry.playerId === 'sobhnath' ? 'SOBHNATH' : entry.playerId === 'umang' ? 'UMANG' : entry.playerId
  return (
    <motion.div
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 14 }}
      whileHover={{ x: 3 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex items-center gap-2 border-b border-border/50 py-2 last:border-b-0"
    >
      <span className={cn('surface-sunken flex h-6 w-6 shrink-0 items-center justify-center rounded-full', ic.cls)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className={cn('shrink-0 text-[11px] font-black tracking-wider uppercase', feedPlayerColor(entry.playerId))}>
        {name}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{entry.note ?? '—'}</span>
      <span className={cn('num shrink-0 text-xs font-bold', entry.deltaXp >= 0 ? 'text-umang' : 'text-crimson')}>
        {fmtDelta(entry.deltaXp)}
      </span>
      <span className="num w-14 shrink-0 text-right text-[10px] text-muted-foreground">{relTime(entry.createdAt)}</span>
    </motion.div>
  )
}

// ---------- main export ----------

export function HudScreen({ state }: { state: GameState }) {
  const qc = useQueryClient()
  const { week, players, feed, deadlines } = state
  const bothLit =
    players.sobhnath.todayLog.netXp >= BOSS.TRIGGER_XP && players.umang.todayLog.netXp >= BOSS.TRIGGER_XP
  const bothHit = players.sobhnath.todayLog.bossHitApplied && players.umang.todayLog.bossHitApplied
  const undoable = state.me ? players[state.me].todayLog : null
  const [undoBusy, setUndoBusy] = useState(false)

  async function undo() {
    if (!state.me) return
    setUndoBusy(true)
    try {
      const res = await apiPost<{ undone: string }>('/api/quests/undo')
      await qc.invalidateQueries({ queryKey: ['game-state'] })
      toast.success(`Reversed: ${res.undone}`)
    } catch (err) {
      await qc.invalidateQueries({ queryKey: ['game-state'] })
      toast.error(err instanceof Error ? err.message : 'Undo failed')
    } finally {
      setUndoBusy(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {/* 1. VS BANNER */}
      <section aria-label="Brother versus brother status">
        <div className="grid grid-cols-2 gap-3">
          <PlayerCard pid="sobhnath" state={state} index={0} />
          <PlayerCard pid="umang" state={state} index={1} />
        </div>
      </section>

      {/* 2. SHARED CO-OP BOSS ARENA */}
      <motion.section
        aria-label="Shared co-op boss arena"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3, ease: 'easeOut' }}
      >
        <HudPanel glow="crimson" className="relative overflow-hidden">
          <div className="boss-aura pointer-events-none absolute inset-0" aria-hidden />
          <div className="scanline pointer-events-none absolute inset-0" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-crimson/70 to-transparent" aria-hidden />
          <SectionTitle
            right={<span className="num text-[10px] text-muted-foreground">WEEK {week.id}</span>}
          >
            Shared Co-op Boss
          </SectionTitle>

          {/* boss figure */}
          <div className="relative flex justify-center py-1">
            <motion.div
              animate={week.bossDefeated ? { y: 6 } : { y: [0, -6, 0] }}
              transition={
                week.bossDefeated
                  ? { duration: 0.5 }
                  : { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              <BossSvg defeated={week.bossDefeated} />
            </motion.div>
            {week.bossDefeated && (
              <motion.div
                initial={{ scale: 2.2, opacity: 0, rotate: -18 }}
                animate={{ scale: 1, opacity: 1, rotate: -12 }}
                transition={{ type: 'spring', stiffness: 180, damping: 15 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="rounded-lg border-2 border-crimson/80 bg-crimson/15 px-4 py-1.5 font-display text-xl font-black tracking-[0.4em] text-crimson text-glow-crimson">
                  SLAIN
                </span>
              </motion.div>
            )}
          </div>

          {/* boss name + HP bar (flash overlay fires on every HP change) */}
          <div className="relative text-center font-display text-base font-extrabold uppercase tracking-[0.2em] text-crimson text-glow-crimson sm:text-lg">
            {week.bossName}
          </div>
          <div className="relative">
            <AnimatePresence initial={false}>
              <motion.div
                key={week.bossCurrentHp}
                className="pointer-events-none absolute inset-0 rounded-full bg-crimson/25"
                initial={{ opacity: 0.7 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                aria-hidden
              />
            </AnimatePresence>
            <GameBar
              className="mt-2"
              value={week.bossCurrentHp}
              max={week.bossMaxHp}
              tone="crimson"
              label={`${week.bossCurrentHp} / ${week.bossMaxHp} HP`}
            />
          </div>

          {week.bossDefeated ? (
            <div className="relative mt-3 flex items-center justify-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 text-[11px] font-black tracking-widest text-gold hud-glow-gold">
              <Crown className="h-4 w-4 shrink-0" />
              <span className="num">BOSS LOOT +{BOSS.LOOT_XP} XP PAID TO BOTH</span>
            </div>
          ) : (
            <>
              {/* trigger lamps */}
              <div className="relative mt-3 flex flex-wrap items-center justify-center gap-2">
                <BossLamp label={PLAYER_THEME.sobhnath.name} lit={players.sobhnath.todayLog.netXp >= BOSS.TRIGGER_XP} />
                <BossLamp label={PLAYER_THEME.umang.name} lit={players.umang.todayLog.netXp >= BOSS.TRIGGER_XP} />
              </div>

              {bothLit && (
                <motion.div
                  animate={{ opacity: [0.55, 1, 0.55], scale: [1, 1.04, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="num relative mt-2 text-center text-[11px] font-black tracking-[0.2em] text-gold text-glow-gold"
                >
                  SYNERGY CHARGED — NEXT DOUBLE-DAY DEALS -{BOSS.HIT_DMG}
                </motion.div>
              )}

              {bothHit && (
                <div className="relative mt-2 flex justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-crimson/50 bg-crimson/10 px-2 py-1 text-[10px] font-bold tracking-widest text-crimson num">
                    <Skull className="h-3 w-3 shrink-0" />
                    TODAY&apos;S HIT DELIVERED: -{BOSS.HIT_DMG}
                  </span>
                </div>
              )}
            </>
          )}
        </HudPanel>
      </motion.section>

      {/* 3. DEADLINES STRIP */}
      <motion.section
        aria-label="Deadlines"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3, ease: 'easeOut' }}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DeadlineChip icon={Swords} iconCls="text-primary" label="Quests lock in" mins={deadlines.questLockMins} />
          <DeadlineChip icon={Hourglass} iconCls="text-gold" label="Override closes in" mins={deadlines.overrideCutoffMins} />
          <DeadlineChip icon={Skull} iconCls="text-crimson" label="PvP ends in" mins={deadlines.pvpEndMins} />
          <DeadlineChip icon={CalendarClock} iconCls="text-gold" label="New week in" mins={deadlines.newWeekMins} />
        </div>
      </motion.section>

      {/* 4. LIVE COMBAT FEED */}
      <motion.section
        aria-label="Live combat feed"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3, ease: 'easeOut' }}
      >
        <HudPanel>
          <SectionTitle
            right={
              <div className="flex items-center gap-2">
                {undoable?.canUndo && (
                  <button
                    type="button"
                    onClick={() => { void undo() }}
                    disabled={undoBusy}
                    title={`Undo last action: ${undoable.undoLabel ?? ''}`}
                    className="inline-flex items-center gap-1 rounded-full border border-crimson/50 bg-crimson/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-crimson transition-colors hover:bg-crimson/20 disabled:opacity-50"
                  >
                    <Undo2 className="h-3 w-3" aria-hidden /> Undo last
                  </button>
                )}
                <span className="num text-[10px] text-muted-foreground">{feed.length} EVENTS</span>
              </div>
            }
          >
            Live Combat Feed
          </SectionTitle>
          <div className="max-h-96 overflow-y-auto pr-1">
            {feed.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No combat yet — go earn some XP.</div>
            ) : (
              <AnimatePresence initial={false}>
                {feed.map((e) => (
                  <FeedRow key={e.id} entry={e} />
                ))}
              </AnimatePresence>
            )}
          </div>
        </HudPanel>
      </motion.section>
    </div>
  )
}
