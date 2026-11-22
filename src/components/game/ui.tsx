'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { fmtCountdown } from '@/lib/time'

/**
 * Ember design language — shared game primitives.
 * Tone names are part of the app contract (`cyan`/`emerald`/`crimson`/`gold`)
 * but render in the warm palette: cyan → ember coral (primary action),
 * emerald → sage, crimson → warm red, gold → amber.
 */
export function HudPanel({ className, children, glow }: { className?: string; children: React.ReactNode; glow?: 'cyan' | 'emerald' | 'crimson' | 'gold' }) {
  return (
    <div className={cn('hud-panel rounded-xl p-4', glow && `hud-glow-${glow}`, className)}>{children}</div>
  )
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_6px_var(--glow-ember)]" aria-hidden />
        <span className="hud-title">{children}</span>
      </span>
      {right}
    </div>
  )
}

export function StatChip({ icon, label, value, tone = 'default', pulse }: { icon?: React.ReactNode; label: string; value: React.ReactNode; tone?: 'default' | 'cyan' | 'emerald' | 'crimson' | 'gold'; pulse?: boolean }) {
  const toneCls = {
    default: 'text-foreground border-border',
    cyan: 'text-primary border-primary/45 bg-primary/[0.07]',
    emerald: 'text-umang border-umang/45 bg-umang/[0.08]',
    crimson: 'text-crimson border-crimson/45 bg-crimson/[0.08]',
    gold: 'text-gold border-gold/45 bg-gold/[0.08]',
  }[tone]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] num', toneCls, pulse && 'lockdown-flash')}>
      {icon}
      {label && <span className="text-muted-foreground">{label}</span>}
      <span className="font-semibold">{value}</span>
    </span>
  )
}

/** Animated bar — HP drain, XP fill, tug-of-war. Gel fill + travelling gloss. */
export function GameBar({ value, max, tone = 'cyan', className, overtime, label }: { value: number; max: number; tone?: 'cyan' | 'emerald' | 'crimson' | 'gold' | 'hp'; className?: string; overtime?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))
  const otPct = overtime ? Math.max(0, Math.min(100 - pct, (overtime / Math.max(1, max)) * 100)) : 0
  const bg = {
    cyan: 'bg-gradient-to-r from-sobh to-sobh/80',
    emerald: 'bg-gradient-to-r from-umang to-umang/80',
    crimson: 'bg-gradient-to-r from-crimson to-crimson/80',
    gold: 'bg-gradient-to-r from-gold to-gold/80',
    hp: 'bg-gradient-to-r from-umang via-gold to-crimson',
  }[tone]
  return (
    <div className={cn('surface-sunken relative h-3 w-full overflow-hidden rounded-full', className)}>
      <motion.div
        className={cn('absolute inset-y-0 left-0 rounded-full', bg)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 80, damping: 20 }}
      >
        <span className="bar-toplight" aria-hidden />
        <span className="bar-gloss" aria-hidden />
      </motion.div>
      {otPct > 0 && (
        <motion.div
          className="absolute inset-y-0 bg-gradient-to-r from-gold/90 to-gold/60"
          initial={{ width: 0 }}
          animate={{ width: `${otPct}%` }}
          style={{ left: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 80, damping: 20 }}
        />
      )}
      {label && <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold num text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">{label}</span>}
    </div>
  )
}

/** Live countdown to a minutes-until value coming from the server (auto-ticks locally). */
export function Countdown({ minsFromServer, className }: { minsFromServer: number; className?: string }) {
  const [drift, setDrift] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const t = setInterval(() => setDrift((Date.now() - started) / 60000), 1000)
    return () => clearInterval(t)
  }, [minsFromServer])
  return <span className={cn('num', className)}>{fmtCountdown(minsFromServer - drift)}</span>
}

export function ActionButton({ children, onClick, tone = 'cyan', disabled, className, size = 'md' }: {
  children: React.ReactNode
  onClick?: () => void
  tone?: 'cyan' | 'emerald' | 'crimson' | 'gold' | 'ghost'
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const tones = {
    cyan: 'border-primary/55 bg-primary/10 text-primary shadow-[0_0_14px_-4px_var(--glow-ember)] hover:bg-primary/20 hover:shadow-[0_0_18px_-3px_var(--glow-ember)]',
    emerald: 'border-umang/55 bg-umang/10 text-umang shadow-[0_0_14px_-4px_var(--glow-emerald)] hover:bg-umang/20 hover:shadow-[0_0_18px_-3px_var(--glow-emerald)]',
    crimson: 'border-crimson/60 bg-crimson/10 text-crimson shadow-[0_0_14px_-4px_var(--glow-crimson)] hover:bg-crimson/20 hover:shadow-[0_0_18px_-3px_var(--glow-crimson)]',
    gold: 'border-gold/55 bg-gold/10 text-gold shadow-[0_0_14px_-4px_var(--glow-gold)] hover:bg-gold/20 hover:shadow-[0_0_18px_-3px_var(--glow-gold)]',
    ghost: 'border-border bg-foreground/[0.04] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.09]',
  }
  const sizes = { sm: 'min-h-11 px-3 py-2 text-xs', md: 'min-h-11 px-4 py-2 text-sm', lg: 'min-h-[52px] px-5 py-3 text-base' }
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={disabled ? undefined : { y: -1 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-lg border font-semibold uppercase tracking-wide transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        tones[tone],
        sizes[size],
        className,
      )}
    >
      {children}
    </motion.button>
  )
}

export const PLAYER_THEME = {
  sobhnath: { text: 'text-sobh', bar: 'cyan' as const, glow: 'hud-glow-cyan', name: 'SOBHNATH' },
  umang: { text: 'text-umang', bar: 'emerald' as const, glow: 'hud-glow-emerald', name: 'UMANG' },
}
