'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import { ActionButton, HudPanel, SectionTitle } from '@/components/game/ui'

import { useQueryClient } from '@tanstack/react-query'
import { apiPost, clearSession } from '@/components/game/live'
import type { GameState } from '@/lib/types'

import { ArrowLeftRight, KeyRound, RotateCcw, ShieldAlert, TriangleAlert } from 'lucide-react'

export function SettingsDialog({ open, onOpenChange, state, onRequestSwitch }: { open: boolean; onOpenChange: (v: boolean) => void; state: GameState; onRequestSwitch?: () => void }) {
  const qc = useQueryClient()
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [busy, setBusy] = useState(false)
  // fresh-start confirmation flow: armed → typed phrase → executed
  const [resetArmed, setResetArmed] = useState(false)
  const [resetPhrase, setResetPhrase] = useState('')

  async function changePin() {
    setBusy(true)
    try {
      await apiPost('/api/auth', { currentPin, newPin }, 'PUT')
      toast.success('PIN changed — keep it secret, keep it safe.')
      setCurrentPin('')
      setNewPin('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    try {
      await apiPost('/api/auth', undefined, 'DELETE')
    } catch {
      // server-side cookie already gone — still clear the local token below
    }
    clearSession()
    onOpenChange(false)
    await qc.invalidateQueries({ queryKey: ['game-state'] })
    toast('Signed out of this terminal.')
  }

  async function restartGame() {
    setBusy(true)
    try {
      const r = await apiPost<{ wiped?: { logs?: number; weeks?: number; ledger?: number; punishments?: number; sessions?: number } }>('/api/restart', { confirm: resetPhrase.trim() })
      const w = r.wiped
      const stats = w ? `${w.logs} day-logs, ${w.weeks} weeks, ${w.ledger} ledger rows, ${w.punishments} tickets` : 'all progress'
      toast.success(`Fresh game started — wiped ${stats}. The ledger records that you pulled the trigger.`)
      setResetArmed(false)
      setResetPhrase('')
      onOpenChange(false)
      await qc.invalidateQueries({ queryKey: ['game-state'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restart failed')
    } finally {
      setBusy(false)
    }
  }

  if (!state.me) return null
  const me = state.players[state.me]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setResetArmed(false); onOpenChange(v) }}>
      <DialogContent className="ember-ring max-h-[85dvh] overflow-y-auto border-border bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-sm uppercase tracking-[0.2em]">Settings — {me.displayName}</DialogTitle>
        </DialogHeader>
        <HudPanel className="p-3">
          <SectionTitle>Change PIN</SectionTitle>
          <div className="flex gap-2">
            <input
              type="password" inputMode="numeric" maxLength={4} value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
              placeholder="old" className="num w-1/2 rounded-lg border border-input bg-foreground/[0.04] px-2 py-2 text-center tracking-[0.3em] outline-none transition-colors focus:border-primary/60" aria-label="Current PIN"
            />
            <input
              type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="new" className="num w-1/2 rounded-lg border border-input bg-foreground/[0.04] px-2 py-2 text-center tracking-[0.3em] outline-none transition-colors focus:border-primary/60" aria-label="New PIN"
            />
          </div>
          <ActionButton className="mt-2 w-full" tone="gold" size="sm" disabled={currentPin.length !== 4 || newPin.length !== 4 || busy} onClick={changePin}>
            <KeyRound className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Save PIN
          </ActionButton>
        </HudPanel>

        <HudPanel className="border-crimson/40 p-3">
          <SectionTitle right={<ShieldAlert className="h-3.5 w-3.5 text-crimson" />}>Danger zone</SectionTitle>
          <AnimatePresence mode="wait" initial={false}>
            {resetArmed ? (
              <motion.div key="confirm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                <div className="rounded-lg border border-crimson/50 bg-crimson/10 p-2.5 text-[11px] leading-relaxed text-foreground">
                  <p className="flex items-center gap-1.5 font-black uppercase tracking-wider text-crimson">
                    <TriangleAlert className="h-4 w-4 shrink-0" /> This deletes EVERYTHING
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    All XP, quests, boss battles, PvP history, punishment tickets, shields, streaks and both vaults — for
                    <span className="text-sobh"> Sobhnath</span> AND<span className="text-umang"> Umang</span>. There is no undo for this.
                    The History tab will be wiped too, except one permanent record naming <span className="font-bold text-foreground">{me.displayName}</span> as the one who restarted.
                  </p>
                </div>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Type <span className="num text-crimson">RESET</span> to confirm</p>
                <input
                  type="text" autoComplete="off" value={resetPhrase} onChange={(e) => setResetPhrase(e.target.value.toUpperCase())}
                  placeholder="RESET" aria-label="Type RESET to confirm the restart"
                  className="num mt-1 w-full rounded-lg border border-crimson/50 bg-foreground/[0.04] px-3 py-2 text-center tracking-[0.4em] outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-crimson"
                />
                <div className="mt-2 flex gap-2">
                  <ActionButton className="flex-1" tone="ghost" size="sm" disabled={busy} onClick={() => { setResetArmed(false); setResetPhrase('') }}>
                    Cancel
                  </ActionButton>
                  <ActionButton className="flex-1" tone="crimson" size="sm" disabled={resetPhrase.trim() !== 'RESET' || busy} onClick={restartGame}>
                    <RotateCcw className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Restart everything
                  </ActionButton>
                </div>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="flex items-center justify-between gap-2">
                <p className="text-[11px] leading-relaxed text-muted-foreground">Wipe all progress and begin a brand-new game for both brothers.</p>
                <ActionButton tone="crimson" size="sm" disabled={busy} onClick={() => { setResetArmed(true); setResetPhrase('') }}>
                  <RotateCcw className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Restart
                </ActionButton>
              </motion.div>
            )}
          </AnimatePresence>
        </HudPanel>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Vault multiplier: <span className="num text-gold">{me.entMultiplier}x</span> · Level {me.level.level} {me.level.title}</span>
          <div className="flex gap-1.5">
            {onRequestSwitch && <ActionButton tone="gold" size="sm" onClick={onRequestSwitch}><ArrowLeftRight className="mr-0.5 inline h-3 w-3" />Switch user</ActionButton>}
            <ActionButton tone="crimson" size="sm" onClick={signOut}>Sign out</ActionButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
