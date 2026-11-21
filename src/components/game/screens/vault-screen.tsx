'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, Info, Lock, Timer } from 'lucide-react'
import type { GameState, PId } from '@/lib/types'
import { fmtClock, round2 } from '@/engine/rules'
import { apiPost } from '@/components/game/live'
import { ActionButton, GameBar, HudPanel, SectionTitle, StatChip } from '@/components/game/ui'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type EntBody = { action: 'spend'; mins: number } | { action: 'start' } | { action: 'stop' }

function fmtElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function VaultScreen({ state }: { state: GameState }) {
  const qc = useQueryClient()
  const [, setTick] = useState(0)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)

  const me = state.me ? state.players[state.me] : null
  const otherId: PId | null = state.me ? (state.me === 'sobhnath' ? 'umang' : 'sobhnath') : null
  const otherPlayer = otherId ? state.players[otherId] : null

  const watching = me?.watching ?? false
  const lockdown = me?.todayLog.isLockdown ?? false
  const balance = me?.entBankMins ?? 0

  // Live drain stopwatch — anchored to the SERVER's session start timestamp so
  // it stays accurate across reloads (before, it reset to 0:00 on refresh).
  const watchStartMs = me?.watchingSince ? new Date(me.watchingSince).getTime() : null
  const elapsedSec = watching && watchStartMs ? Math.max(0, Math.floor((Date.now() - watchStartMs) / 1000)) : 0
  useEffect(() => {
    if (!watching) return
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [watching])

  const drainedMins = round2(elapsedSec / 60)
  const liveBalance = watching ? round2(balance - drainedMins) : balance
  const negative = liveBalance < 0
  // Server rebuilds exactly what the vault credited today (positive ledger
  // events × the right multiplier) — always matches the real bank math.
  const earnedToday = me?.entEarnedToday ?? 0

  const customMins = Number(custom)
  const customValid = Number.isFinite(customMins) && Number.isInteger(customMins) && customMins > 0

  async function entAction(body: EntBody, okMsg: string) {
    setBusy(true)
    try {
      await apiPost('/api/ent', body)
      toast.success(okMsg)
      await qc.invalidateQueries({ queryKey: ['game-state'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Vault action failed')
    } finally {
      setBusy(false)
    }
  }

  if (!me) {
    return (
      <HudPanel>
        <p className="text-xs text-muted-foreground">Sign in to open the vault.</p>
      </HudPanel>
    )
  }

  return (
    <div className="space-y-4">
      {/* A+B. Balance card — turns dark red under lockdown */}
      <div className={cn('rounded-lg p-6', lockdown ? 'border border-red-500/50 bg-red-950/40 hud-glow-crimson' : 'hud-panel hud-glow-gold')}>
        <SectionTitle
          right={<StatChip tone="gold" label="rate" value={`1 XP = ${me.entMultiplier}m`} />}
        >
          Entertainment vault
        </SectionTitle>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="hud-title">Bank balance</p>
            <div
              className={cn(
                'num text-5xl font-black leading-tight tracking-tight sm:text-6xl md:text-7xl',
                negative ? 'text-red-400 text-glow-crimson' : 'text-amber-300 text-glow-gold',
              )}
            >
              {fmtClock(liveBalance)}
            </div>
          </div>
          {lockdown && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/50 bg-red-950/60 px-3 py-2 lockdown-flash">
              <Lock className="h-5 w-5 text-red-300" aria-hidden />
              <span className="text-sm font-black uppercase tracking-[0.15em] text-red-200">Lockdown active — 00:00 available</span>
            </div>
          )}
        </div>

        {negative ? (
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.15em] text-red-300 lockdown-flash">
            Overspent — earn XP to recover
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Earned today: <span className="num font-semibold text-amber-300">+{earnedToday}m</span> available at 1 XP ={' '}
            <span className="num">{me.entMultiplier}m</span>
          </p>
        )}
        {watching && (
          <p className="num mt-1.5 text-[11px] text-red-300/80">
            Draining live — balance {fmtClock(liveBalance)}
          </p>
        )}
      </div>

      {/* D. Live drain stopwatch / start watch */}
      <HudPanel glow={watching ? 'crimson' : 'emerald'}>
        <SectionTitle
          right={
            watching ? (
              <StatChip tone="crimson" pulse label="status" value="draining" />
            ) : (
              <StatChip label="status" value="idle" />
            )
          }
        >
          Live drain stopwatch
        </SectionTitle>

        <AnimatePresence initial={false} mode="wait">
          {watching ? (
            <motion.div
              key="watching"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-red-300/80 lockdown-flash">
                    <Timer className="h-3.5 w-3.5" aria-hidden />
                    Live drain — vault draining
                  </p>
                  <p className="num mt-1 text-4xl font-black text-red-300 text-glow-crimson">{fmtElapsed(elapsedSec)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Drained <span className="num text-red-300">{drainedMins}m</span> — balance{' '}
                    <span className="num text-amber-300">{fmtClock(liveBalance)}</span>
                  </p>
                </div>
                <ActionButton
                  tone="crimson"
                  size="lg"
                  disabled={busy}
                  onClick={() => { void entAction({ action: 'stop' }, `Watch stopped — ${fmtElapsed(elapsedSec)} drained from the vault.`) }}
                >
                  Stop watching
                </ActionButton>
              </div>
              <GameBar
                className="mt-3"
                value={drainedMins}
                max={Math.max(1, balance)}
                overtime={Math.max(0, round2(drainedMins - balance))}
                tone="crimson"
                label={`${drainedMins}m drained`}
              />
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {otherPlayer?.watching && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-red-300 lockdown-flash">
                  <Eye className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{otherPlayer.displayName} is watching — their vault is draining live</span>
                </div>
              )}
              <ActionButton
                tone="emerald"
                size="lg"
                className="w-full"
                disabled={busy || lockdown}
                onClick={() => { void entAction({ action: 'start' }, 'Watch started — the vault drains until you stop it.') }}
              >
                Start watching / gaming
              </ActionButton>
              {lockdown && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-red-300/80">
                  <Lock className="h-3 w-3" aria-hidden />
                  Stopwatch disabled under lockdown
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </HudPanel>

      {/* C. Quick spend presets */}
      <HudPanel glow={lockdown ? 'crimson' : 'gold'}>
        <SectionTitle>Quick spend</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {[5, 10, 20].map((mins) => (
            <ActionButton
              key={mins}
              tone="gold"
              size="md"
              className="num"
              disabled={lockdown || busy || balance < mins}
              onClick={() => { void entAction({ action: 'spend', mins }, `Spent ${mins}m — guilt-free dopamine secured.`) }}
            >
              Spend {mins}m
            </ActionButton>
          ))}
        </div>
        <div className="mt-3 flex gap-1.5">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="Custom minutes"
            aria-label="Custom minutes to spend"
            disabled={lockdown || busy}
            className="num h-9 bg-black/50"
          />
          <ActionButton
            tone="gold"
            size="md"
            disabled={lockdown || busy || !customValid || balance < customMins}
            onClick={() => { void entAction({ action: 'spend', mins: customMins }, `Spent ${customMins}m — guilt-free dopamine secured.`) }}
          >
            Spend
          </ActionButton>
        </div>
        {lockdown ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-red-300 lockdown-flash">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Spending is hard-locked today — the server enforces it too.
          </p>
        ) : (
          balance <= 0 && (
            <p className="mt-2.5 text-[11px] text-muted-foreground">
              Nothing banked — log quests to refill the vault.
            </p>
          )
        )}
      </HudPanel>

      {/* E. Rules footer */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-black/30 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>
          Spend 20m right after a study block — instant guilt-free dopamine. Bank the rest.{' '}
          <span className="font-semibold text-cyan-300">Sobhnath 1x</span>,{' '}
          <span className="font-semibold text-emerald-300">Umang 2x</span>.
        </p>
      </div>
    </div>
  )
}
