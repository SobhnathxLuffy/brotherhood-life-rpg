'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { fmtCountdown } from '@/lib/time'

export function HudPanel({ className, children, glow }: { className?: string; children: React.ReactNode; glow?: 'cyan' | 'emerald' | 'crimson' | 'gold' }) {
  return (
    <div className={cn('hud-panel rounded-lg p-4', glow && `hud-glow-${glow}`, className)}>{children}</div>
  )
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="hud-title">{children}</span>
      {right}
    </div>
  )
}

export function StatChip({ icon, label, value, tone = 'default', pulse }: { icon?: React.ReactNode; label: string; value: React.ReactNode; tone?: 'default' | 'cyan' | 'emerald' | 'crimson' | 'gold'; pulse?: boolean }) {
  const toneCls = {
    default: 'text-foreground border-border',
    cyan: 'text-cyan-300 border-cyan-400/40',
    emerald: 'text-emerald-300 border-emerald-400/40',
    crimson: 'text-red-300 border-red-400/40',
    gold: 'text-amber-300 border-amber-400/40',
  }[tone]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] num bg-black/30', toneCls, pulse && 'lockdown-flash')}>
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  )
}

/** Animated bar — HP drain, XP fill, tug-of-war. */
export function GameBar({ value, max, tone = 'cyan', className, overtime, label }: { value: number; max: number; tone?: 'cyan' | 'emerald' | 'crimson' | 'gold' | 'hp'; className?: string; overtime?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))
  const otPct = overtime ? Math.max(0, Math.min(100 - pct, (overtime / Math.max(1, max)) * 100)) : 0
  const bg = { cyan: 'bg-cyan-400', emerald: 'bg-emerald-400', crimson: 'bg-red-500', gold: 'bg-amber-400', hp: 'bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500' }[tone]
  return (
    <div className={cn('relative h-3 w-full overflow-hidden rounded-sm border border-border bg-black/50', className)}>
      <motion.div
        className={cn('absolute inset-y-0 left-0', bg)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 80, damping: 20 }}
      />
      {otPct > 0 && (
        <motion.div
          className="absolute inset-y-0 bg-gradient-to-r from-amber-500/80 to-amber-300/80"
          initial={{ width: 0 }}
          animate={{ width: `${otPct}%` }}
          style={{ left: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 80, damping: 20 }}
        />
      )}
      {label && <span className="absolute inset-0 flex items-center justify-center text-[9px] num text-white/90">{label}</span>}
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
    cyan: 'border-cyan-400/50 text-cyan-200 hover:bg-cyan-400/15 hud-glow-cyan',
    emerald: 'border-emerald-400/50 text-emerald-200 hover:bg-emerald-400/15 hud-glow-emerald',
    crimson: 'border-red-500/60 text-red-200 hover:bg-red-500/20 hud-glow-crimson',
    gold: 'border-amber-400/50 text-amber-200 hover:bg-amber-400/15 hud-glow-gold',
    ghost: 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary',
  }
  const sizes = { sm: 'px-2 py-1 text-xs', md: 'px-3 py-1.5 text-sm', lg: 'px-4 py-2.5 text-base' }
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      disabled={disabled}
      className={cn('rounded border bg-black/40 font-semibold uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed', tones[tone], sizes[size], className)}
    >
      {children}
    </motion.button>
  )
}

export const PLAYER_THEME = {
  sobhnath: { text: 'text-cyan-300', bar: 'cyan' as const, glow: 'hud-glow-cyan', name: 'SOBHNATH' },
  umang: { text: 'text-emerald-300', bar: 'emerald' as const, glow: 'hud-glow-emerald', name: 'UMANG' },
}
