'use client'

/**
 * HISTORY SCREEN — the full audit trail. Every lock, edit, undo, XP gain,
 * snitch catch and boss loot row the ledger has (latest 150), filterable by
 * brother and by kind. Nothing in this game is invisible: if someone changed
 * their quests, reversed an action or caught a snitch, it shows here.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Crown,
  FileUp,
  Lock,
  Megaphone,
  Pencil,
  Swords,
  Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { HudPanel, PLAYER_THEME, SectionTitle, StatChip } from '@/components/game/ui'
import { cn } from '@/lib/utils'
import type { FeedEntry, GameState, PId } from '@/lib/types'

const EVENT_META: Record<string, { label: string; icon: LucideIcon; cls: string }> = {
  QUEST: { label: 'XP progress', icon: Swords, cls: 'text-primary' },
  QUEST_LOCK: { label: 'Quests locked', icon: Lock, cls: 'text-gold' },
  QUEST_EDIT: { label: 'Quests edited', icon: Pencil, cls: 'text-primary' },
  QUEST_UNDO: { label: 'Reversed', icon: Undo2, cls: 'text-crimson' },
  SNITCH_GAIN: { label: 'Snitch catch', icon: Megaphone, cls: 'text-gold' },
  SNITCH_LOSS: { label: 'Snitch penalty', icon: AlertTriangle, cls: 'text-crimson' },
  BOSS_LOOT: { label: 'Boss loot', icon: Crown, cls: 'text-gold' },
  JEE_IMPORT: { label: 'JEE import', icon: FileUp, cls: 'text-sobh' },
}
const FALLBACK_META = { label: 'Event', icon: Swords, cls: 'text-muted-foreground' }

type WhoFilter = 'all' | PId
type KindFilter = 'all' | 'quests' | 'xp'

function playerColor(playerId: string, displayName: string): string {
  if (playerId === 'sobhnath') return 'text-sobh'
  if (playerId === 'umang') return 'text-umang'
  return displayName || 'text-muted-foreground'
}

function fmtDelta(v: number): string {
  if (v === 0) return '—'
  const r = Math.round(v * 100) / 100
  return `${r >= 0 ? '+' : '-'}${Math.abs(r)} XP`
}

function istStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date} · ${time} IST`
}

function HistoryRow({ entry }: { entry: FeedEntry }) {
  const meta = EVENT_META[entry.eventType] ?? FALLBACK_META
  const Icon = meta.icon
  const name = entry.playerId === 'sobhnath' ? 'Sobhnath' : entry.playerId === 'umang' ? 'Umang' : entry.playerId
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-start gap-2.5 border-b border-border/50 py-2.5 last:border-b-0"
    >
      <span className={cn('surface-sunken mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', meta.cls)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn('text-[11px] font-black uppercase tracking-wider', playerColor(entry.playerId, name))}>{name}</span>
          <span className={cn('text-[10px] font-bold uppercase tracking-[0.15em]', meta.cls)}>{meta.label}</span>
          <span className="num text-[10px] text-muted-foreground/70">{istStamp(entry.createdAt)}</span>
        </p>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">{entry.note ?? '—'}</p>
      </div>
      <span className={cn('num shrink-0 text-xs font-bold', entry.deltaXp > 0 ? 'text-umang' : entry.deltaXp < 0 ? 'text-crimson' : 'text-muted-foreground/50')}>
        {fmtDelta(entry.deltaXp)}
      </span>
    </motion.div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors',
        active ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function HistoryScreen({ state }: { state: GameState }) {
  const [who, setWho] = useState<WhoFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')

  const rows = state.feed.filter((e) => {
    if (who !== 'all' && e.playerId !== who) return false
    if (kind === 'quests') return ['QUEST_LOCK', 'QUEST_EDIT', 'QUEST_UNDO'].includes(e.eventType)
    if (kind === 'xp') return !['QUEST_LOCK', 'QUEST_EDIT', 'QUEST_UNDO'].includes(e.eventType)
    return true
  })
  const lockEditCount = state.feed.filter((e) => ['QUEST_LOCK', 'QUEST_EDIT', 'QUEST_UNDO'].includes(e.eventType)).length

  return (
    <div className="flex w-full flex-col gap-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }}>
        <HudPanel>
          <SectionTitle right={<StatChip tone="cyan" label="ledger" value={`${state.feed.length} rows`} />}>
            Brotherhood history
          </SectionTitle>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            The full audit trail — quest locks, quest edits (with before → after), undo reversals, XP progress, snitch verdicts and boss loot.
            <span className="num"> {lockEditCount}</span> quest governance events on record.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap gap-1.5" aria-label="Filter by brother">
              <FilterChip active={who === 'all'} onClick={() => setWho('all')}>Everyone</FilterChip>
              <FilterChip active={who === 'sobhnath'} onClick={() => setWho('sobhnath')}>Sobhnath</FilterChip>
              <FilterChip active={who === 'umang'} onClick={() => setWho('umang')}>Umang</FilterChip>
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Filter by kind">
              <FilterChip active={kind === 'all'} onClick={() => setKind('all')}>All events</FilterChip>
              <FilterChip active={kind === 'quests'} onClick={() => setKind('quests')}>Locks · Edits · Undos</FilterChip>
              <FilterChip active={kind === 'xp'} onClick={() => setKind('xp')}>XP &amp; loot</FilterChip>
            </div>
          </div>
        </HudPanel>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.28, ease: 'easeOut' }}>
        <HudPanel glow={rows.length > 0 ? PLAYER_THEME[who === 'all' ? 'sobhnath' : who].bar : undefined}>
          <SectionTitle right={<span className="num text-[10px] text-muted-foreground">{rows.length} SHOWN</span>}>
            Event trail
          </SectionTitle>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            {rows.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No events match this filter yet.</div>
            ) : (
              rows.map((e) => <HistoryRow key={e.id} entry={e} />)
            )}
          </div>
        </HudPanel>
      </motion.div>
    </div>
  )
}
