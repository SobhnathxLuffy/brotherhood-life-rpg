'use client'

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Command, Swords, Coins, Skull, Dumbbell, Settings, LogOut, Shield } from 'lucide-react'
import { QueryClientProvider, apiPost, useGameProvider, useGameState, useLiveEvents } from '@/components/game/live'
import { FxLayer, type FxEvent } from '@/components/game/fx'
import { HudPanel, ActionButton } from '@/components/game/ui'
import { AuthGate } from '@/components/game/auth-gate'
import { SettingsDialog } from '@/components/game/settings-dialog'
import { HudScreen } from '@/components/game/screens/hud-screen'
import { QuestsScreen } from '@/components/game/screens/quests-screen'
import { VaultScreen } from '@/components/game/screens/vault-screen'
import { ArenaScreen } from '@/components/game/screens/arena-screen'
import { ChamberScreen } from '@/components/game/screens/chamber-screen'
import type { GameState, SocketEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'hud', label: 'HUD', icon: Command },
  { id: 'quests', label: 'Quests', icon: Swords },
  { id: 'vault', label: 'Vault', icon: Coins },
  { id: 'arena', label: 'Arena', icon: Skull },
  { id: 'chamber', label: 'Chamber', icon: Dumbbell },
] as const

type TabId = (typeof TABS)[number]['id']

export default function Home() {
  const queryClient = useGameProvider()
  return (
    <QueryClientProvider client={queryClient}>
      <GameShell />
    </QueryClientProvider>
  )
}

function GameShell() {
  const { data: state, isLoading, isError, refetch } = useGameState()
  const [tab, setTab] = useState<TabId>('hud')
  const [events, setEvents] = useState<FxEvent[]>([])
  const [shake, setShake] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const onEvent = useCallback((ev: SocketEvent) => {
    const eid = Date.now() + Math.random()
    setEvents((prev) => [...prev.slice(-8), { ...ev, eid }])
    if (ev.kind === 'BOSS_HIT' || ev.kind === 'BOSS_LOOT') setShake((s) => s + 1)
    if (ev.message) {
      if (ev.kind === 'SNITCH' || ev.kind === 'HP' || ev.kind === 'PUNISH') toast.error(ev.message, { duration: 5000 })
      else if (ev.kind === 'BOSS_LOOT' || ev.kind === 'PVP' || ev.kind === 'WEEK') toast.success(ev.message, { duration: 5000 })
      else toast(ev.message, { duration: 3500 })
    }
  }, [])

  useLiveEvents(onEvent)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background scanline">
        <div className="text-center">
          <div className="hud-title mb-2">Booting tactical HUD</div>
          <div className="mx-auto h-1 w-40 overflow-hidden rounded bg-secondary">
            <motion.div className="h-full w-1/3 bg-cyan-400" animate={{ x: ['-100%', '300%'] }} transition={{ repeat: Infinity, duration: 1.2 }} />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <HudPanel className="text-center">
          <div className="hud-title mb-3">Connection to command lost</div>
          <ActionButton onClick={() => refetch()}>Retry</ActionButton>
        </HudPanel>
      </div>
    )
  }

  const me = state.me
  const myPlayer = me ? state.players[me] : null

  return (
    <div className="min-h-screen bg-background text-foreground scanline pb-16 md:pb-0">
      <FxLayer events={events} />
      <motion.div key={shake} animate={shake > 0 ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.45 }}>
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2.5 md:px-6">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-cyan-400" />
              <div>
                <div className="text-sm font-black uppercase tracking-[0.2em] text-foreground">Brotherhood <span className="text-cyan-300 text-glow-cyan">Life RPG</span></div>
                <div className="hud-title">{state.week.startDate} · Week #{state.week.id} · IST {state.ist.now}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {myPlayer && (
                <span className={cn('hidden sm:inline rounded border px-2 py-1 text-[11px] font-bold uppercase tracking-wider', me === 'sobhnath' ? 'border-cyan-400/40 text-cyan-300' : 'border-emerald-400/40 text-emerald-300')}>
                  {myPlayer.displayName}
                </span>
              )}
              <button onClick={() => setSettingsOpen(true)} aria-label="Settings" className="rounded border border-border p-2 text-muted-foreground hover:text-foreground">
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="mx-auto flex max-w-6xl px-3 py-4 md:gap-5 md:px-6">
          {/* Left rail (desktop) */}
          <nav className="sticky top-16 hidden h-fit flex-col gap-1 md:flex" aria-label="Screens">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 rounded border px-3 py-2 text-sm font-semibold uppercase tracking-wider transition-colors',
                  tab === t.id ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200' : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </nav>

          <main className="min-w-0 flex-1">
            {state.me && state.players ? (
              tab === 'hud' ? <HudScreen state={state} /> :
              tab === 'quests' ? <QuestsScreen state={state} /> :
              tab === 'vault' ? <VaultScreen state={state} /> :
              tab === 'arena' ? <ArenaScreen state={state} /> :
              <ChamberScreen state={state} />
            ) : (
              <AuthGate />
            )}
          </main>
        </div>

        {/* Bottom nav (mobile) */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur md:hidden" aria-label="Screens" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="grid grid-cols-5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn('flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wider', tab === t.id ? 'text-cyan-300' : 'text-muted-foreground')}
              >
                <t.icon className="h-5 w-5" />
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} state={state} />
      </motion.div>
    </div>
  )
}
