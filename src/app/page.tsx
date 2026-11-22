'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { Command, Swords, Coins, Skull, Dumbbell, Settings, Shield, Sun, Moon, UserRoundCog } from 'lucide-react'
import { QueryClientProvider, apiPost, useGameProvider, useGameState, useLiveEvents } from '@/components/game/live'
import { FxLayer, type FxEvent } from '@/components/game/fx'
import { HudPanel, ActionButton } from '@/components/game/ui'
import { AuthGate } from '@/components/game/auth-gate'
import { SettingsDialog } from '@/components/game/settings-dialog'
import { SwitchUserDialog } from '@/components/game/switch-user-dialog'
import { HudScreen } from '@/components/game/screens/hud-screen'
import { QuestsScreen } from '@/components/game/screens/quests-screen'
import { VaultScreen } from '@/components/game/screens/vault-screen'
import { ArenaScreen } from '@/components/game/screens/arena-screen'
import { ChamberScreen } from '@/components/game/screens/chamber-screen'
import type { GameState, SocketEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Dark/light toggle — mounted-guard avoids a hydration mismatch flash. */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // deferred setState: same mounted-guard, without cascading renders
    const t = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(t)
  }, [])
  const isDark = mounted ? resolvedTheme !== 'light' : true
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-foreground/[0.04] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}

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
  const [switchOpen, setSwitchOpen] = useState(false)

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
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-gold/70 shadow-[0_0_28px_-4px_var(--glow-ember)] ember-breathe">
            <Shield className="h-7 w-7 text-white drop-shadow" aria-hidden />
          </div>
          <div className="hud-title mb-3">Booting tactical HUD</div>
          <div className="surface-sunken mx-auto h-1.5 w-44 overflow-hidden rounded-full">
            <motion.div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary/60 to-primary" animate={{ x: ['-100%', '320%'] }} transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }} />
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
        <header className="glass sticky top-0 z-40 border-b border-border/60 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.5)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 md:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-gold/80 shadow-[0_0_18px_-2px_var(--glow-ember)]">
                <Shield className="h-5 w-5 text-white drop-shadow-sm" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="truncate font-display text-sm font-extrabold uppercase tracking-[0.18em] text-foreground">
                  Brotherhood <span className="text-primary text-glow-ember">Life RPG</span>
                </div>
                <div className="hud-title truncate">{state.week.startDate} · Week #{state.week.id} · IST {state.ist.now}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {myPlayer && (
                <span
                  className={cn(
                    'hidden rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider sm:inline-flex',
                    me === 'sobhnath' ? 'border-sobh/45 bg-sobh/10 text-sobh' : 'border-umang/45 bg-umang/10 text-umang',
                  )}
                >
                  {myPlayer.displayName}
                </span>
              )}
              {state.me && (
                <button
                  onClick={() => setSwitchOpen(true)}
                  aria-label="Switch user"
                  title="Switch user (PIN required)"
                  className="grid h-10 w-10 place-items-center rounded-lg border border-gold/40 bg-gold/10 text-gold transition-colors hover:bg-gold/20"
                >
                  <UserRoundCog className="h-4 w-4" />
                </button>
              )}
              <ThemeToggle />
              <button
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
                className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-foreground/[0.04] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="mx-auto flex max-w-6xl px-3 py-4 md:gap-5 md:px-6">
          {/* Left rail (desktop) */}
          <nav className="sticky top-[4.5rem] hidden h-fit flex-col gap-1 md:flex" aria-label="Screens">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold uppercase tracking-wider transition-colors',
                  tab === t.id ? 'text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="rail-active"
                    className="ember-ring absolute inset-0 rounded-lg bg-primary/10 shadow-[0_0_18px_-8px_var(--glow-ember)]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <t.icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10">{t.label}</span>
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
        <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border/60 md:hidden" aria-label="Screens" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="grid grid-cols-5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[58px] flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors',
                  tab === t.id ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="tabbar-active"
                    className="absolute inset-x-1.5 inset-y-1.5 rounded-xl border border-primary/30 bg-primary/10 shadow-[0_0_16px_-6px_var(--glow-ember)]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <t.icon className="relative z-10 h-5 w-5" />
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} state={state} onRequestSwitch={() => { setSettingsOpen(false); setSwitchOpen(true) }} />
        <SwitchUserDialog open={switchOpen} onOpenChange={setSwitchOpen} state={state} />
      </motion.div>
    </div>
  )
}
