'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ActionButton, HudPanel, SectionTitle } from '@/components/game/ui'

import { useQueryClient } from '@tanstack/react-query'
import type { GameState } from '@/lib/types'

export function SettingsDialog({ open, onOpenChange, state }: { open: boolean; onOpenChange: (v: boolean) => void; state: GameState }) {
  const qc = useQueryClient()
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [busy, setBusy] = useState(false)

  async function changePin() {
    setBusy(true)
    try {
      // PUT for change-pin
      const res = await fetch('/api/auth', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPin, newPin }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
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
    await fetch('/api/auth', { method: 'DELETE' })
    onOpenChange(false)
    await qc.invalidateQueries({ queryKey: ['game-state'] })
    toast('Signed out of this terminal.')
  }

  if (!state.me) return null
  const me = state.players[state.me]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm uppercase tracking-[0.2em]">Settings — {me.displayName}</DialogTitle>
        </DialogHeader>
        <HudPanel className="p-3">
          <SectionTitle>Change PIN</SectionTitle>
          <div className="flex gap-2">
            <input
              type="password" inputMode="numeric" maxLength={4} value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
              placeholder="old" className="num w-1/2 rounded border border-input bg-black/50 px-2 py-2 text-center tracking-[0.3em] outline-none focus:border-cyan-400/60" aria-label="Current PIN"
            />
            <input
              type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="new" className="num w-1/2 rounded border border-input bg-black/50 px-2 py-2 text-center tracking-[0.3em] outline-none focus:border-cyan-400/60" aria-label="New PIN"
            />
          </div>
          <ActionButton className="mt-2 w-full" tone="gold" size="sm" disabled={currentPin.length !== 4 || newPin.length !== 4 || busy} onClick={changePin}>
            Save PIN
          </ActionButton>
        </HudPanel>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Vault multiplier: <span className="num text-amber-300">{me.entMultiplier}x</span> · Level {me.level.level} {me.level.title}</span>
          <ActionButton tone="crimson" size="sm" onClick={signOut}>Sign out</ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
