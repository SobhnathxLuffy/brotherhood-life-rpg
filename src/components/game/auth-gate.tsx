'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ShieldCheck, UserRound } from 'lucide-react'
import { apiPost } from '@/components/game/live'
import { HudPanel, ActionButton, SectionTitle } from '@/components/game/ui'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import type { PId } from '@/lib/types'

const BROTHERS: { id: PId; name: string; cls: string; hint: string }[] = [
  { id: 'sobhnath', name: 'Sobhnath', cls: 'border-cyan-400/60 text-cyan-300 hud-glow-cyan', hint: '1x vault · physical punishment · JEE bridge' },
  { id: 'umang', name: 'Umang', cls: 'border-emerald-400/60 text-emerald-300 hud-glow-emerald', hint: '2x vault · the verification gate' },
]

export function AuthGate() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<PId | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!selected || pin.length !== 4) return
    setBusy(true)
    try {
      await apiPost('/api/auth', { playerId: selected, pin })
      toast.success(`Welcome back, ${selected === 'sobhnath' ? 'Sobhnath' : 'Umang'}!`)
      await qc.invalidateQueries({ queryKey: ['game-state'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Auth failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <HudPanel className="mx-auto max-w-md">
      <SectionTitle>Identify yourself, brother</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {BROTHERS.map((b) => (
          <motion.button
            key={b.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => setSelected(b.id)}
            className={cn('rounded-lg border bg-black/40 p-4 text-left transition-all', selected === b.id ? b.cls : 'border-border text-muted-foreground hover:text-foreground')}
          >
            <UserRound className="mb-2 h-6 w-6" />
            <div className="font-black uppercase tracking-wider">{b.name}</div>
            <div className="mt-1 text-[10px] leading-tight opacity-70">{b.hint}</div>
          </motion.button>
        ))}
      </div>
      <div className="mt-4">
        <label className="hud-title mb-1 block">4-digit PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="••••"
          className="num w-full rounded border border-input bg-black/50 px-3 py-2.5 text-center text-2xl tracking-[0.5em] outline-none focus:border-cyan-400/60"
          aria-label="PIN"
        />
      </div>
      {selected && (
        <div className="mt-3 rounded border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-200">
          Default PIN for {selected === 'sobhnath' ? 'Sobhnath' : 'Umang'} is{' '}
          <button
            type="button"
            onClick={() => setPin(selected === 'sobhnath' ? '1111' : '2222')}
            className="num font-bold underline decoration-dotted hover:text-amber-100"
            aria-label={`Fill default PIN for ${selected}`}
          >
            {selected === 'sobhnath' ? '1111' : '2222'}
          </button>{' '}
          — tap the number to fill, then change it in Settings.
        </div>
      )}
      <ActionButton className="mt-4 w-full" size="lg" tone={selected === 'umang' ? 'emerald' : 'cyan'} disabled={pin.length !== 4 || busy || !selected} onClick={submit}>
        <ShieldCheck className="mr-1 inline h-4 w-4" /> Enter Command
      </ActionButton>
      <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
        First time? Pick your name, use the default PIN shown above, and you're in. The HUD, Quests, Vault, Arena and Chamber tabs unlock after login — change your PIN in Settings ⚙.
      </p>
    </HudPanel>
  )
}
