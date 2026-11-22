'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeftRight, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { apiPost, saveSession } from '@/components/game/live'
import { ActionButton, HudPanel, SectionTitle, PLAYER_THEME } from '@/components/game/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { GameState, PId } from '@/lib/types'

const BROTHERS: { id: PId; name: string; cls: string }[] = [
  { id: 'sobhnath', name: 'Sobhnath', cls: 'border-sobh/60 bg-sobh/10 text-sobh shadow-[0_0_18px_-6px_var(--glow-cyan)]' },
  { id: 'umang', name: 'Umang', cls: 'border-umang/60 bg-umang/10 text-umang shadow-[0_0_18px_-6px_var(--glow-emerald)]' },
]

/**
 * Switch user — one shared device, two brothers.
 * Replaces the device's active session with the chosen brother's, but ONLY
 * after entering that brother's 4-digit PIN. The previous player's session
 * is fully replaced (their token is gone from this device) — switching back
 * always requires their PIN again, so nobody can peek at the other's account.
 */
export function SwitchUserDialog({ open, onOpenChange, state }: { open: boolean; onOpenChange: (v: boolean) => void; state: GameState }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<PId | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  if (!state.me) return null
  const me = state.me

  async function switchUser() {
    if (!selected || pin.length !== 4 || selected === me) return
    setBusy(true)
    try {
      const res = await apiPost<{ ok: boolean; playerId: string; token: string }>('/api/auth', { playerId: selected, pin })
      // Replace this device's stored bearer token — the old player is now
      // signed out of this device and must re-enter their PIN to return.
      saveSession(res.token)
      toast.success(`Swapped the seat — now playing as ${selected === 'sobhnath' ? 'Sobhnath' : 'Umang'}.`)
      setSelected(null)
      setPin('')
      onOpenChange(false)
      await qc.invalidateQueries({ queryKey: ['game-state'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Wrong PIN — seat stays with the current player.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ember-ring border-border bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-sm uppercase tracking-[0.2em]">
            <ArrowLeftRight className="h-4 w-4 text-gold" /> Switch user
          </DialogTitle>
        </DialogHeader>
        <HudPanel className="p-3">
          <SectionTitle>Who takes the seat?</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {BROTHERS.map((b) => {
              const isMe = b.id === me
              return (
                <motion.button
                  key={b.id}
                  whileTap={{ scale: 0.97 }}
                  disabled={isMe}
                  onClick={() => setSelected(b.id)}
                  className={cn(
                    'rounded-lg border bg-foreground/[0.03] p-3 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                    !isMe && selected === b.id ? b.cls : 'border-border text-muted-foreground',
                    !isMe && selected !== b.id && 'hover:text-foreground',
                  )}
                >
                  <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {isMe ? 'SEATED NOW' : selected === b.id ? 'SWITCH TO →' : 'TAP TO PICK'}
                  </div>
                  <div className={cn('mt-1 font-display text-sm font-extrabold uppercase tracking-wider', !isMe && selected === b.id ? PLAYER_THEME[b.id].text : '')}>{b.name}</div>
                </motion.button>
              )
            })}
          </div>

          {selected && selected !== me && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-gold/45 bg-gold/10 px-2.5 py-2 text-[11px] leading-snug text-gold">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Entering <b>{selected === 'sobhnath' ? 'Sobhnath' : 'Umang'}&apos;s</b> PIN signs the current player out of this device. Switching back needs the other PIN again — nobody reads anybody&apos;s account.
              </span>
            </div>
          )}

          <div className="mt-3">
            <label className="hud-title mb-1 block">{selected ? `${selected === 'sobhnath' ? 'Sobhnath' : 'Umang'}'s PIN` : 'PIN'}</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && switchUser()}
              placeholder="••••"
              className="num w-full rounded-lg border border-input bg-foreground/[0.04] px-3 py-2.5 text-center text-2xl tracking-[0.5em] outline-none transition-colors focus:border-gold/60"
              aria-label="PIN to switch user"
            />
          </div>
          <ActionButton className="mt-3 w-full" size="lg" tone="gold" disabled={!selected || selected === me || pin.length !== 4 || busy} onClick={switchUser}>
            <ShieldCheck className="mr-1 inline h-4 w-4" /> {selected && selected !== me ? `Play as ${selected === 'sobhnath' ? 'Sobhnath' : 'Umang'}` : 'Pick a brother first'}
          </ActionButton>
        </HudPanel>
      </DialogContent>
    </Dialog>
  )
}
