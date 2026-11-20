'use client'

import { AnimatePresence, motion } from 'framer-motion'
import type { SocketEvent } from '@/lib/types'

export interface FxEvent extends SocketEvent {
  eid: number
}

const POPUP_STYLE: Record<string, { text: string; size: string }> = {
  BOSS_HIT: { text: 'text-red-400 text-glow-crimson', size: 'text-4xl' },
  BOSS_LOOT: { text: 'text-amber-300 text-glow-gold', size: 'text-3xl' },
  SNITCH: { text: 'text-red-300 text-glow-crimson', size: 'text-2xl' },
  XP: { text: 'text-cyan-300', size: 'text-2xl' },
  HP: { text: 'text-red-400', size: 'text-2xl' },
  ENT: { text: 'text-amber-300', size: 'text-xl' },
  PVP: { text: 'text-fuchsia-300', size: 'text-2xl' },
}

/** Floating damage numbers + broadcast banner, the RPG juice layer. */
export function FxLayer({ events }: { events: FxEvent[] }) {
  const visible = events.slice(-6)
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {visible.map((ev) => {
          const style = POPUP_STYLE[ev.kind] || POPUP_STYLE.XP
          const amount = typeof ev.amount === 'number' ? ev.amount : undefined
          const label =
            ev.kind === 'BOSS_HIT'
              ? `-${Math.abs(amount ?? 140)} BOSS HP!`
              : ev.kind === 'BOSS_LOOT'
                ? `+${amount ?? 70} BOSS LOOT!`
                : amount !== undefined
                  ? `${amount > 0 ? '+' : ''}${amount} XP`
                  : ev.kind
          return (
            <motion.div
              key={ev.eid}
              className={`absolute left-1/2 font-black num ${style.text} ${style.size}`}
              style={{ top: ev.kind === 'BOSS_HIT' || ev.kind === 'BOSS_LOOT' ? '34%' : '58%' }}
              initial={{ opacity: 0, y: 30, scale: 0.5, x: '-50%' }}
              animate={{ opacity: [0, 1, 1, 0], y: -70, scale: [0.6, 1.15, 1, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.2, times: [0, 0.12, 0.7, 1] }}
            >
              {label}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
