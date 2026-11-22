'use client'

import { AnimatePresence, motion } from 'framer-motion'
import type { SocketEvent } from '@/lib/types'

export interface FxEvent extends SocketEvent {
  eid: number
}

const POPUP_STYLE: Record<string, { text: string; size: string; top: string }> = {
  BOSS_HIT: { text: 'fx-grad fx-grad-crimson text-glow-crimson', size: 'text-5xl', top: '34%' },
  BOSS_LOOT: { text: 'fx-grad fx-grad-gold text-glow-gold', size: 'text-4xl', top: '34%' },
  SNITCH: { text: 'fx-grad fx-grad-crimson text-glow-crimson', size: 'text-3xl', top: '58%' },
  XP: { text: 'fx-grad fx-grad-sobh', size: 'text-3xl', top: '58%' },
  HP: { text: 'fx-grad fx-grad-crimson text-glow-crimson', size: 'text-3xl', top: '58%' },
  ENT: { text: 'fx-grad fx-grad-gold', size: 'text-2xl', top: '58%' },
  PVP: { text: 'fx-grad fx-grad-gold text-glow-gold', size: 'text-3xl', top: '58%' },
}

const FALLBACK_STYLE = POPUP_STYLE.XP

/** Floating damage numbers + broadcast banner, the RPG juice layer. */
export function FxLayer({ events }: { events: FxEvent[] }) {
  const visible = events.slice(-6)
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {visible.map((ev, i) => {
          const style = POPUP_STYLE[ev.kind] || FALLBACK_STYLE
          const amount = typeof ev.amount === 'number' ? ev.amount : undefined
          const label =
            ev.kind === 'BOSS_HIT'
              ? `-${Math.abs(amount ?? 140)} BOSS HP!`
              : ev.kind === 'BOSS_LOOT'
                ? `+${amount ?? 70} BOSS LOOT!`
                : amount !== undefined
                  ? `${amount > 0 ? '+' : ''}${amount} XP`
                  : ev.kind
          const isBoss = ev.kind === 'BOSS_HIT' || ev.kind === 'BOSS_LOOT'
          // Slight vertical fan-out so stacked events stay readable
          const drift = i * 26
          return (
            <motion.div
              key={ev.eid}
              className={`absolute left-1/2 font-display font-black num tracking-tight ${style.text} ${style.size}`}
              style={{ top: `calc(${style.top} + ${drift}px)` }}
              initial={{ opacity: 0, y: 34, scale: 0.4, x: '-50%', rotate: -4 }}
              animate={{ opacity: [0, 1, 1, 0], y: -84, scale: [0.5, 1.22, 1, 1.02], rotate: [-4, 2, 0, 0] }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 2.2, times: [0, 0.1, 0.68, 1], ease: ['easeOut', 'easeInOut', 'easeInOut'] }}
            >
              {label}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
