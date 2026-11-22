'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Swords,
  Scale,
  Trophy,
  HeartPulse,
  Megaphone,
  Shield,
  CalendarClock,
  Gavel,
  ArrowDown,
  Skull,
  Timer,
  TriangleAlert,
  CheckCircle2,
} from 'lucide-react'
import type { GameState, PId } from '@/lib/types'
import { STAKE_TEXT, VIOLATIONS, SNITCH, WEEKLY, OVERRIDE } from '@/engine/rules'
import { HudPanel, SectionTitle, StatChip, GameBar, Countdown, ActionButton, PLAYER_THEME } from '@/components/game/ui'
import { apiPost } from '@/components/game/live'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const OTHER: Record<PId, PId> = { sobhnath: 'umang', umang: 'sobhnath' }

/* ============================ A. Weekly PvP tug-of-war ============================ */

function TugOfWar({ sobhXp, umangXp }: { sobhXp: number; umangXp: number }) {
  const total = Math.max(0, sobhXp) + Math.max(0, umangXp)
  const share = total > 0 ? Math.max(0, sobhXp) / total : 0.5
  // Flex widths by share of total, but never let a side shrink below 10%.
  const leftPct = Math.round(Math.min(90, Math.max(10, share * 100)))
  const rightPct = 100 - leftPct

  return (
    <div>
      <div className="surface-sunken relative flex h-9 w-full overflow-hidden rounded-full">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-r-full bg-gradient-to-r from-sobh/60 to-sobh/90"
          initial={{ width: '50%' }}
          animate={{ width: `${leftPct}%` }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
        />
        <motion.div
          className="absolute inset-y-0 right-0 rounded-l-full bg-gradient-to-l from-umang/60 to-umang/90"
          initial={{ width: '50%' }}
          animate={{ width: `${rightPct}%` }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full border border-gold/50 bg-background/85 px-2.5 py-0.5 text-[11px] font-bold tracking-[0.2em] text-gold shadow-[0_0_14px_-2px_var(--glow-gold)] backdrop-blur-sm">VS</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-sobh" aria-hidden />
            <span className={cn('hud-title', PLAYER_THEME.sobhnath.text)}>SOBHNATH</span>
          </div>
          <p className={cn('num mt-1 font-display text-3xl font-black text-glow-cyan sm:text-4xl', PLAYER_THEME.sobhnath.text)}>
            {Math.max(0, sobhXp).toLocaleString('en-IN')}
            <span className="ml-1 text-xs font-medium text-muted-foreground">XP</span>
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span className={cn('hud-title', PLAYER_THEME.umang.text)}>UMANG</span>
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-umang" aria-hidden />
          </div>
          <p className={cn('num mt-1 font-display text-3xl font-black text-glow-emerald sm:text-4xl', PLAYER_THEME.umang.text)}>
            {Math.max(0, umangXp).toLocaleString('en-IN')}
            <span className="ml-1 text-xs font-medium text-muted-foreground">XP</span>
          </p>
        </div>
      </div>
    </div>
  )
}

/* ============================ B. Stake banner ============================ */

function StakeBanner({ state, onStakePaid, stakeBusy }: { state: GameState; onStakePaid: () => void; stakeBusy: boolean }) {
  const week = state.week
  const winner = week.pvpWinner
  const winnerIsPlayer = winner === 'sobhnath' || winner === 'umang'

  return (
    <HudPanel glow="gold" className="p-4">
      <SectionTitle
        right={
          week.pvpStakeSettled ? (
            <StatChip icon={<CheckCircle2 className="h-3 w-3" />} label="" value="STAKE PAID" tone="emerald" />
          ) : (
            <StatChip icon={<Timer className="h-3 w-3" />} label="closes in" value={<Countdown minsFromServer={state.deadlines.pvpEndMins} />} tone="gold" />
          )
        }
      >
        Weekly Stake
      </SectionTitle>

      <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground/85">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
        <span>{STAKE_TEXT}</span>
      </p>

      <AnimatePresence mode="wait">
        {week.pvpForfeitedBy ? (
          <motion.div
            key="forfeit"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-3 flex items-center gap-2 rounded-lg border border-crimson/50 bg-crimson/10 px-3 py-2"
          >
            <Skull className="h-4 w-4 shrink-0 text-crimson" aria-hidden />
            <p className="text-sm font-bold uppercase tracking-wide text-crimson text-glow-crimson">
              {(state.players[week.pvpForfeitedBy as PId]?.displayName ?? week.pvpForfeitedBy).toUpperCase()} FORFEITED (KO or lockdown cheat)
            </p>
          </motion.div>
        ) : winnerIsPlayer ? (
          <motion.div
            key="winner"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            className={cn(
              'mt-3 flex items-center gap-2 rounded-lg border px-3 py-2',
              winner === 'sobhnath' ? 'border-sobh/50 bg-sobh/10 hud-glow-cyan' : 'border-umang/50 bg-umang/10 hud-glow-emerald',
            )}
          >
            <Trophy className={cn('h-5 w-5 shrink-0', winner === 'sobhnath' ? 'text-sobh' : 'text-umang')} aria-hidden />
            <p className={cn('font-display text-lg font-black uppercase tracking-wider', winner === 'sobhnath' ? 'text-sobh text-glow-cyan' : 'text-umang text-glow-emerald')}>
              {winner === 'sobhnath' ? 'SOBHNATH' : 'UMANG'} WINS THE WEEK
            </p>
          </motion.div>
        ) : winner ? (
          <motion.div
            key="draw"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-3 flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-3 py-2"
          >
            <Scale className="h-4 w-4 shrink-0 text-gold" aria-hidden />
            <p className="text-sm font-bold uppercase tracking-wide text-gold text-glow-gold">DRAW — NOBODY PAYS THE STAKE</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {winner && !week.pvpStakeSettled && (
        <ActionButton tone="gold" className="mt-3 w-full" onClick={onStakePaid} disabled={stakeBusy}>
          {stakeBusy ? 'Marking…' : 'Mark stake paid'}
        </ActionButton>
      )}
    </HudPanel>
  )
}

/* ============================ C. KO status ============================ */

function KoStatus({ state }: { state: GameState }) {
  const brothers: { id: PId; hp: number; ko: boolean }[] = [
    { id: 'sobhnath', hp: state.week.sobhnathHp, ko: state.week.sobhnathKo },
    { id: 'umang', hp: state.week.umangHp, ko: state.week.umangKo },
  ]
  return (
    <HudPanel glow="crimson" className="p-4">
      <SectionTitle right={<HeartPulse className="h-4 w-4 text-crimson" aria-hidden />}>Weekly HP — Knockout Watch</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {brothers.map((b) => (
          <div key={b.id} className="surface-sunken rounded-lg p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className={cn('hud-title', PLAYER_THEME[b.id].text)}>{PLAYER_THEME[b.id].name}</span>
              {b.ko ? (
                <span className="num inline-flex items-center gap-1 rounded-full border border-crimson/60 bg-crimson/15 px-2 py-0.5 text-[11px] font-black tracking-widest text-crimson lockdown-flash">
                  <Skull className="h-3 w-3" aria-hidden /> K.O.
                </span>
              ) : (
                <StatChip label="" value={`${b.hp}/${WEEKLY.MAX_HP} HP`} tone={b.hp <= WEEKLY.LOW_XP_THRESHOLD ? 'crimson' : 'default'} />
              )}
            </div>
            <GameBar value={b.hp} max={WEEKLY.MAX_HP} tone="hp" label={`${b.hp}/${WEEKLY.MAX_HP} HP`} />
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
        <span>
          Under <span className="num text-foreground">{WEEKLY.LOW_XP_THRESHOLD}</span> XP in a day costs <span className="num text-crimson">-{WEEKLY.LOW_XP_PENALTY} HP</span>.{' '}
          <span className="num text-foreground">0 HP</span> = Knocked Out = automatic PvP loss.
        </span>
      </p>
    </HudPanel>
  )
}

/* ============================ D. Snitch tribunal ============================ */

const LADDER = [
  {
    title: 'CAUGHT',
    body: (
      <>
        Cheater loses up to <span className="num text-crimson">30 XP</span> (floor <span className="num text-crimson">-{SNITCH.DAILY_XP_FLOOR}</span>), you gain{' '}
        <span className="num text-umang">+{SNITCH.REWARD_XP}</span>
      </>
    ),
  },
  {
    title: 'TOMORROW: LOCKDOWN',
    body: (
      <>
        Already at <span className="num">-{SNITCH.DAILY_XP_FLOOR}</span> and cheats again → tomorrow: Entertainment Lockdown +{' '}
        <span className="num text-gold">0.5x XP</span>
      </>
    ),
  },
  {
    title: 'WEEK FORFEITED',
    body: (
      <>
        Cheats ON lockdown day → weekly PvP forfeited + Boss heals <span className="num text-crimson">+140 HP</span>
      </>
    ),
  },
]

function SnitchTribunal({ state }: { state: GameState }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const me = state.me
  const [target, setTarget] = useState<PId>(me ? OTHER[me] : 'umang')
  const [violation, setViolation] = useState<string>('')
  const [note, setNote] = useState('')

  function openDialog() {
    setTarget(me ? OTHER[me] : 'umang')
    setViolation('')
    setNote('')
    setOpen(true)
  }

  async function execute() {
    setBusy(true)
    try {
      const res = await apiPost<{ ok: boolean; tier?: number }>('/api/snitch', { target, violation, note: note.trim() })
      await qc.invalidateQueries({ queryKey: ['game-state'] })
      const tierLine =
        res.tier === 2 ? 'LOCKDOWN CHEAT DETECTED — WEEK FORFEITED, BOSS HEALS' : res.tier === 1 ? 'TOMORROW: ENTERTAINMENT LOCKDOWN' : 'XP STOLEN'
      toast.success(`Snitch executed (+${SNITCH.REWARD_XP} XP) — ${tierLine}`)
      setOpen(false)
      setNote('')
      setViolation('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Snitch failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <HudPanel glow="crimson" className="p-4">
      <SectionTitle right={<Megaphone className="h-4 w-4 text-crimson" aria-hidden />}>Snitch Tribunal</SectionTitle>

      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Catch your brother cheating and the tribunal executes. Evidence optional — the system knows.</p>

      <ActionButton tone="crimson" size="lg" className="w-full" onClick={openDialog} disabled={!me}>
        <span className="inline-flex items-center gap-2">
          <Megaphone className="h-5 w-5" aria-hidden /> Report cheat
        </span>
      </ActionButton>

      {/* Escalation ladder */}
      <div className="mt-4">
        <p className="hud-title mb-2">Escalation Ladder</p>
        <div className="flex flex-col">
          {LADDER.map((step, i) => (
            <div key={step.title} className="flex flex-col items-stretch">
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-2.5 rounded-lg border border-border bg-foreground/[0.03] px-3 py-2"
              >
                <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-crimson/50 bg-crimson/15 text-[11px] font-bold text-crimson">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="hud-title text-crimson/90">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-foreground/90">{step.body}</p>
                </div>
              </motion.div>
              {i < LADDER.length - 1 && (
                <div className="flex justify-center py-1" aria-hidden>
                  <ArrowDown className="h-3.5 w-3.5 text-crimson/70" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        <span className="num text-umang">+{SNITCH.REWARD_XP}</span> for you per catch; <span className="num">{SNITCH.COOLDOWN_MINUTES}</span>-min cooldown, max{' '}
        <span className="num">{SNITCH.MAX_PER_CATCHER_PER_DAY}</span>/day.
      </p>

      {/* Tribunal dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="ember-ring max-h-[85dvh] overflow-y-auto border-crimson/40 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-sm uppercase tracking-[0.2em] text-crimson">
              <Gavel className="h-4 w-4" aria-hidden /> Snitch Tribunal — Verdict
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              The accused loses up to <span className="num">30 XP</span>; you bank <span className="num text-umang">+{SNITCH.REWARD_XP} XP</span> of entertainment
              credit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <p className="hud-title mb-1.5">Target</p>
              <Select value={target} onValueChange={(v) => setTarget(v as PId)}>
                <SelectTrigger className="w-full" aria-label="Snitch target">
                  <SelectValue placeholder="Pick target" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sobhnath" disabled={me === 'sobhnath'}>
                    SOBHNATH
                  </SelectItem>
                  <SelectItem value="umang" disabled={me === 'umang'}>
                    UMANG
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="hud-title mb-1.5">Violation</p>
              <Select value={violation} onValueChange={setViolation}>
                <SelectTrigger className="w-full" aria-label="Violation type">
                  <SelectValue placeholder="Pick the crime" />
                </SelectTrigger>
                <SelectContent>
                  {VIOLATIONS.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="hud-title mb-1.5">Note (optional)</p>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="What exactly did you see?"
                className="min-h-16 resize-none text-sm"
                aria-label="Snitch note"
              />
            </div>

            <ActionButton tone="crimson" size="lg" className="w-full" onClick={execute} disabled={!target || !violation || busy}>
              <span className="inline-flex items-center gap-2">
                <Gavel className="h-5 w-5" aria-hidden /> {busy ? 'Executing…' : `Execute snitch (+${SNITCH.REWARD_XP} XP steal)`}
              </span>
            </ActionButton>
          </div>
        </DialogContent>
      </Dialog>
    </HudPanel>
  )
}

/* ============================ E. Tactical items ============================ */

function RestShieldCard({ state }: { state: GameState }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const me = state.me
  const player = me ? state.players[me] : null
  if (!me || !player) return null
  const log = player.todayLog
  const shieldActive = log.shieldUsed
  const disabled = player.shieldsCount === 0 || shieldActive || log.overrideUsed || busy

  async function burn() {
    setBusy(true)
    try {
      await apiPost('/api/items', { action: 'shield' })
      await qc.invalidateQueries({ queryKey: ['game-state'] })
      toast.success('Rest Shield burned — 0 HP loss, streak intact.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Shield failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <HudPanel glow="cyan" className="flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="hud-title flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-sobh" aria-hidden /> Rest Shield
        </span>
        <span className="num rounded-full border border-sobh/40 bg-foreground/[0.04] px-2.5 py-0.5 text-lg font-bold text-sobh text-glow-cyan" aria-label={`${player.shieldsCount} shields held`}>
          ×{player.shieldsCount}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Burn on a sick/big day: <span className="num text-foreground">0 HP</span> loss, <span className="num text-foreground">0 punishment</span>, streak intact. Earn{' '}
        <span className="num text-foreground">1</span> per <span className="num text-foreground">5-day</span> 70+ XP streak.
      </p>
      <div className="mt-auto pt-3">
        {shieldActive ? (
          <StatChip icon={<CheckCircle2 className="h-3 w-3" />} label="" value="SHIELD ACTIVE TODAY" tone="emerald" />
        ) : (
          <ActionButton tone="cyan" className="w-full" onClick={burn} disabled={disabled}>
            {busy ? 'Burning…' : 'Burn shield today'}
          </ActionButton>
        )}
        {log.overrideUsed && !shieldActive && <p className="mt-1.5 text-[11px] text-muted-foreground">Override already active today — shield not needed.</p>}
      </div>
    </HudPanel>
  )
}

function OverrideCard({ state }: { state: GameState }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const me = state.me
  const player = me ? state.players[me] : null
  if (!me || !player) return null
  const log = player.todayLog
  const overrideActive = log.overrideUsed
  const cutoffPassed = state.deadlines.overrideCutoffPassed
  const disabled = overrideActive || cutoffPassed || busy

  async function declare() {
    setBusy(true)
    try {
      await apiPost('/api/items', { action: 'override', reason: reason.trim(), cosignPin: pin })
      await qc.invalidateQueries({ queryKey: ['game-state'] })
      toast.success('Big-Event Override declared — brother co-signed.')
      setReason('')
      setPin('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Override failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <HudPanel glow="gold" className="flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="hud-title flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-gold" aria-hidden /> Big-Event Override
        </span>
        {overrideActive ? (
          <StatChip label="" value="OVERRIDE ACTIVE TODAY" tone="gold" />
        ) : cutoffPassed ? (
          <StatChip label="" value="CUTOFF PASSED" tone="crimson" />
        ) : (
          <StatChip icon={<Timer className="h-3 w-3" />} label="closes in" value={<Countdown minsFromServer={state.deadlines.overrideCutoffMins} />} tone="gold" />
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Declared before <span className="num text-foreground">6:00 PM IST</span>, max <span className="num text-foreground">1</span> per{' '}
        <span className="num text-foreground">{OVERRIDE.COOLDOWN_DAYS} days</span>, requires the other brother&apos;s PIN co-sign.
      </p>
      <div className="mt-3 space-y-2">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={120}
          placeholder="Reason — e.g. cousin's wedding, hospital visit…"
          className="min-h-14 resize-none text-sm"
          aria-label="Override reason"
          disabled={disabled}
        />
        <Input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          placeholder="Brother's 4-digit PIN"
          className="num text-center tracking-[0.3em]"
          aria-label="Cosign PIN"
          disabled={disabled}
        />
      </div>
      <div className="mt-auto pt-3">
        <ActionButton tone="gold" className="w-full" onClick={declare} disabled={disabled || reason.trim().length === 0 || pin.length !== 4}>
          {busy ? 'Declaring…' : 'Declare override'}
        </ActionButton>
        {player.lastOverrideAt && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Last override: <span className="num text-foreground">{player.lastOverrideAt.slice(0, 10)}</span> — next allowed after{' '}
            <span className="num text-foreground">{OVERRIDE.COOLDOWN_DAYS} days</span>.
          </p>
        )}
      </div>
    </HudPanel>
  )
}

/* ============================ Screen root ============================ */

export function ArenaScreen({ state }: { state: GameState }) {
  const qc = useQueryClient()
  const [stakeBusy, setStakeBusy] = useState(false)

  async function markStakePaid() {
    setStakeBusy(true)
    try {
      await apiPost('/api/pvp')
      await qc.invalidateQueries({ queryKey: ['game-state'] })
      toast.success('Stake marked PAID — brotherhood honour maintained.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark stake')
    } finally {
      setStakeBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <HudPanel className="p-4">
          <SectionTitle right={<Swords className="h-4 w-4 text-gold" aria-hidden />}>Weekly PvP Head-to-Head</SectionTitle>
          <TugOfWar sobhXp={state.players.sobhnath.weeklyXp} umangXp={state.players.umang.weeklyXp} />
        </HudPanel>
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}>
        <StakeBanner state={state} onStakePaid={markStakePaid} stakeBusy={stakeBusy} />
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
        <KoStatus state={state} />
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.15 }}>
        <SnitchTribunal state={state} />
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.2 }}
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        aria-label="Tactical items"
      >
        <RestShieldCard state={state} />
        <OverrideCard state={state} />
      </motion.section>
    </div>
  )
}
