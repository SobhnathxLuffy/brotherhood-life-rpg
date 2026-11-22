'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ActionButton, HudPanel, SectionTitle } from '@/components/game/ui'

import { useQueryClient } from '@tanstack/react-query'
import { apiPost, clearSession } from '@/components/game/live'
import type { GameState } from '@/lib/types'

import { ArrowLeftRight, KeyRound } from 'lucide-react'

export function SettingsDialog({ open, onOpenChange, state, onRequestSwitch }: { open: boolean; onOpenChange: (v: boolean) => void; state: GameState; onRequestSwitch?: () => void }) {
  const qc = useQueryClient()
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [busy, setBusy] = useState(false)

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

  if (!state.me) return null
  const me = state.players[state.me]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ember-ring border-border bg-card sm:max-w-sm">
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
