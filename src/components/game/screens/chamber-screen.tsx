'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dumbbell,
  ChevronsUp,
  Repeat,
  ArrowDownUp,
  Flame,
  Moon,
  KeyRound,
  CheckCircle2,
  ScrollText,
  Sparkles,
  ShieldCheck,
  History,
  Lock,
} from 'lucide-react'
import type { GameState, PunishmentView } from '@/lib/types'
import { calcPunishmentReps, punishmentRemainingXp } from '@/engine/rules'
import { HudPanel, SectionTitle, StatChip, ActionButton } from '@/components/game/ui'
import { apiPost } from '@/components/game/live'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Format a rep count: integers plain, fractions trimmed to 1 decimal (R*0.5). */
function fmtRep(v: number): string {
  return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(2)))
}

/** Number that springs (scale pop) every time its value changes. */
function SpringNum({ value, className }: { value: number; className?: string }) {
  return (
    <motion.span
      key={value}
      initial={{ scale: 1.35, opacity: 0.35 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 16 }}
      className={cn('num inline-block', className)}
    >
      {fmtRep(value)}
    </motion.span>
  )
}

/* ============================ A. Live debt forecast ============================ */

const REP_CARDS = [
  { key: 'pushups', name: 'PUSHUPS', weightKg: '5', mult: '×1', icon: Dumbbell },
  { key: 'pullups', name: 'PULLUPS', weightKg: '2.5', mult: '×0.5', icon: ChevronsUp },
  { key: 'crunches', name: 'CRUNCHES', weightKg: '5', mult: '×1', icon: Repeat },
  { key: 'squats', name: 'SQUATS', weightKg: '5', mult: '×2', icon: ArrowDownUp },
] as const

function DebtForecast({ state }: { state: GameState }) {
  const sobh = state.players.sobhnath
  const log = sobh.todayLog
  const protectedToday = log.shieldUsed || log.overrideUsed
  const R = punishmentRemainingXp(log.netXp)
  const reps = calcPunishmentReps(R)

  return (
    <HudPanel glow={protectedToday || R === 0 ? 'gold' : 'crimson'} className="p-4">
      <SectionTitle
        right={
          <StatChip
            icon={<Flame className="h-3 w-3" />}
            label="live net XP"
            value={log.netXp}
            tone={log.netXp >= 0 ? 'default' : 'crimson'}
          />
        }
      >
        Sobhnath&apos;s Punishment Chamber — Live Debt
      </SectionTitle>

      {protectedToday ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 rounded-lg border border-umang/50 bg-umang/10 px-3 py-3"
        >
          <ShieldCheck className="h-5 w-5 shrink-0 text-umang" aria-hidden />
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-umang text-glow-emerald">
              Protected today — R = 0
            </p>
            <p className="text-[11px] text-muted-foreground">
              {log.shieldUsed ? 'Rest Shield burned' : 'Big-Event Override active'} — no punishment, no HP loss, streak intact.
            </p>
          </div>
        </motion.div>
      ) : R === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-3 py-3"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-gold" aria-hidden />
          <div>
            <p className="font-display text-base font-black uppercase tracking-widest text-gold text-glow-gold">Debt clear</p>
            <p className="text-[11px] text-muted-foreground">The chamber is silent. Keep the streak alive.</p>
          </div>
        </motion.div>
      ) : (
        <>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Today&apos;s net XP <span className="num text-foreground">{log.netXp}</span> leaves a live debt of{' '}
            <span className="num font-bold text-crimson text-glow-crimson">{R} XP</span> — reps update in real time as you log.
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {REP_CARDS.map((c) => (
              <div key={c.key} className="flex flex-col items-center rounded-lg border border-crimson/30 bg-crimson/[0.06] px-2 py-3 text-center">
                <span className="hud-title flex items-center gap-1 text-crimson/80">
                  <c.icon className="h-3.5 w-3.5" aria-hidden /> {c.name}
                </span>
                <SpringNum value={reps[c.key]} className="mt-1.5 font-display text-3xl font-black text-crimson text-glow-crimson sm:text-4xl" />
                <span className="mt-1 text-[11px] text-muted-foreground">
                  <span className="num">{c.weightKg}</span> kg · <span className="num">{c.mult}</span> per XP
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mt-3 text-center text-sm font-semibold tracking-wide text-gold">
        Every JEE question you log shrinks the debt.
      </p>
    </HudPanel>
  )
}

/* ============================ B. Midnight pending queue ============================ */

function PendingTicket({ ticket, isUmang, isSobhnath }: { ticket: PunishmentView; isUmang: boolean; isSobhnath: boolean }) {
  const qc = useQueryClient()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  async function verify() {
    setBusy(true)
    try {
      await apiPost('/api/punishments', { id: ticket.id, pin })
      await qc.invalidateQueries({ queryKey: ['game-state'] })
      toast.success(`Ticket ${ticket.logDate} verified — punishment signed off.`)
      setPin('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-crimson/40 bg-crimson/[0.06] p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ScrollText className="h-4 w-4 text-crimson" aria-hidden />
          Punishment Ticket — <span className="num">{ticket.logDate}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <StatChip label="debt" value={ticket.remainingXp} tone="crimson" />
          <span className="rounded-full border border-crimson/60 bg-crimson/15 px-2 py-0.5 text-[11px] font-black tracking-widest text-crimson num lockdown-flash">
            PENDING
          </span>
        </span>
      </div>

      {/* Reps row */}
      <div className="mt-2.5 grid grid-cols-4 gap-2 text-center">
        {(
          [
            { label: 'PUSH', value: ticket.pushups },
            { label: 'PULL', value: ticket.pullups },
            { label: 'CRNCH', value: ticket.crunches },
            { label: 'SQT', value: ticket.squats },
          ] as const
        ).map((r) => (
          <div key={r.label} className="surface-sunken rounded-md px-1 py-1.5">
            <p className="hud-title">{r.label}</p>
            <p className="num mt-0.5 text-lg font-bold text-crimson">{fmtRep(r.value)}</p>
          </div>
        ))}
      </div>

      {/* Verification gate */}
      {isUmang ? (
        <div className="mt-3 rounded-lg border border-umang/30 bg-umang/[0.06] p-2.5">
          <p className="text-[11px] leading-relaxed text-umang/90">
            Verify only AFTER watching his sets live — your PIN signs off his sweat.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="Your 4-digit PIN"
              className="num min-w-0 flex-1 text-center tracking-[0.3em]"
              aria-label={`PIN for ticket ${ticket.logDate}`}
              disabled={busy}
            />
            <ActionButton tone="emerald" onClick={verify} disabled={pin.length !== 4 || busy}>
              {busy ? 'Verifying…' : 'Verify completed'}
            </ActionButton>
          </div>
        </div>
      ) : isSobhnath ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0" aria-hidden />
          Umang must enter HIS PIN to sign off — you cannot self-verify.
        </p>
      ) : null}
    </motion.div>
  )
}

function PendingQueue({ state }: { state: GameState }) {
  const pending = state.punishments.filter((p) => p.status === 'PENDING')
  const openDebt = pending.reduce((sum, p) => sum + p.remainingXp, 0)
  const me = state.me

  return (
    <HudPanel className="p-4">
      <SectionTitle
        right={
          pending.length > 0 ? (
            <StatChip icon={<Moon className="h-3 w-3" />} label="open debt" value={openDebt} tone="crimson" />
          ) : (
            <StatChip icon={<Moon className="h-3 w-3" />} label="queue" value="CLEAR" tone="emerald" />
          )
        }
      >
        Midnight Pending Queue
      </SectionTitle>

      {pending.length === 0 ? (
        <div className="surface-sunken flex items-center justify-center gap-2 rounded-lg px-3 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-umang" aria-hidden />
          No pending tickets — the chamber rests until midnight.
        </div>
      ) : (
        <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
          {pending.map((t) => (
            <PendingTicket key={t.id} ticket={t} isUmang={me === 'umang'} isSobhnath={me === 'sobhnath'} />
          ))}
        </div>
      )}
    </HudPanel>
  )
}

/* ============================ C. Completed history ============================ */

function CompletedHistory({ state }: { state: GameState }) {
  const done = state.punishments
    .filter((p) => p.status === 'COMPLETED')
    .sort((a, b) => (a.verifiedAt ?? a.logDate) < (b.verifiedAt ?? b.logDate) ? 1 : -1)

  return (
    <HudPanel className="p-4">
      <SectionTitle right={<StatChip label="signed off" value={done.length} tone="emerald" />}>
        Completed History
      </SectionTitle>

      {done.length === 0 ? (
        <p className="surface-sunken rounded-lg px-3 py-4 text-center text-sm text-muted-foreground">
          Nothing verified yet — history stays empty until sweat is signed off.
        </p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {done.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-umang/30 bg-umang/[0.06] px-3 py-2">
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground/90">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-umang" aria-hidden />
                <span className="truncate">
                  Ticket — <span className="num">{t.logDate}</span>
                  <span className="ml-2 hidden text-muted-foreground sm:inline num">
                    {t.pushups}p / {t.pullups}pl / {t.crunches}c / {t.squats}s
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                verified <span className="num text-umang">{t.verifiedAt ? t.verifiedAt.slice(0, 10) : '—'}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </HudPanel>
  )
}

/* ============================ Screen root ============================ */

export function ChamberScreen({ state }: { state: GameState }) {
  return (
    <div className="space-y-4">
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <DebtForecast state={state} />
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}>
        <PendingQueue state={state} />
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
        <CompletedHistory state={state} />
      </motion.section>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Rule: reps lock in at midnight IST from R = <span className="num">100 − max(0, netXp)</span>. Whatever R is when the clock strikes 12 is what you owe — no
        edits, no mercy.
      </p>
    </div>
  )
}
