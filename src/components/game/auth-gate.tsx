'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ShieldCheck, UserRound } from 'lucide-react'
import { apiPost, saveSession } from '@/components/game/live'
import { HudPanel, ActionButton, SectionTitle } from '@/components/game/ui'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import type { PId } from '@/lib/types'

const BROTHERS: { id: PId; name: string; cls: string; dot: string; hint: string }[] = [
  { id: 'sobhnath', name: 'Sobhnath', cls: 'border-sobh/60 bg-sobh/10 text-sobh shadow-[0_0_20px_-6px_var(--glow-cyan)]', dot: 'bg-sobh shadow-[0_0_8px_var(--sobh)]', hint: '1x vault · physical punishment · JEE bridge' },
  { id: 'umang', name: 'Umang', cls: 'border-umang/60 bg-umang/10 text-umang shadow-[0_0_20px_-6px_var(--glow-emerald)]', dot: 'bg-umang shadow-[0_0_8px_var(--umang)]', hint: '2x vault · the verification gate' },
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
      const res = await apiPost<{ ok: boolean; playerId: string; token: string }>('/api/auth', { playerId: selected, pin })
      // Persist the bearer token — the preview iframe blocks cookies, so this
      // token is what keeps the session alive in that context.
      saveSession(res.token)
      toast.success(`Welcome back, ${selected === 'sobhnath' ? 'Sobhnath' : 'Umang'}!`)
      await qc.invalidateQueries({ queryKey: ['game-state'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Auth failed')
    } finally {
      setBusy(false)
    }
  }

  const selectedBrother = BROTHERS.find((b) => b.id === selected)

  return (
    <div className="relative mx-auto max-w-md">
      {/* warm aura behind the title screen — vertical bleed only, no horizontal overflow */}
      <div className="ember-aura pointer-events-none absolute inset-x-0 -inset-y-10" aria-hidden />

      <HudPanel className="relative overflow-hidden">
        <div className="scanline pointer-events-none absolute inset-0" aria-hidden />

        {/* title block */}
        <div className="relative mb-5 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-gold/80 shadow-[0_0_30px_-4px_var(--glow-ember)] ember-breathe">
            <ShieldCheck className="h-8 w-8 text-white drop-shadow" aria-hidden />
          </div>
          <h1 className="font-display text-2xl font-extrabold uppercase tracking-[0.14em] text-foreground">
            Brotherhood <span className="text-primary text-glow-ember">Life RPG</span>
          </h1>
          <p className="mt-1 text-[11px] text-muted-foreground">Two brothers. One boss. Zero excuses.</p>
        </div>

        <div className="relative">
          <SectionTitle>Identify yourself, brother</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {BROTHERS.map((b) => (
              <motion.button
                key={b.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelected(b.id)}
                className={cn(
                  'rounded-xl border bg-foreground/[0.03] p-4 text-left transition-all',
                  selected === b.id ? b.cls : 'border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                )}
              >
                <UserRound className="mb-2 h-6 w-6" />
                <div className="font-display text-sm font-extrabold uppercase tracking-wider">{b.name}</div>
                <div className="mt-1 text-[10px] leading-tight opacity-70">{b.hint}</div>
              </motion.button>
            ))}
          </div>

          <div className="mt-5">
            <label className="hud-title mb-1.5 block">4-digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="••••"
              className="num w-full rounded-lg border border-input bg-foreground/[0.04] px-3 py-2.5 text-center text-2xl tracking-[0.5em] outline-none transition-colors focus:border-primary/60"
              aria-label="PIN"
            />
            {/* entry polish — filled dots mirror the PIN length (visual only) */}
            <div className="mt-2 flex items-center justify-center gap-2.5" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <motion.span
                  key={i}
                  animate={{ scale: pin.length > i ? 1 : 0.75, opacity: pin.length > i ? 1 : 0.3 }}
                  className={cn('h-1.5 w-1.5 rounded-full', pin.length > i ? (selectedBrother?.dot ?? 'bg-primary shadow-[0_0_8px_var(--glow-ember)]') : 'bg-muted-foreground')}
                />
              ))}
            </div>
          </div>

          {selected && (
            <div className="mt-4 rounded-lg border border-gold/45 bg-gold/10 px-3 py-2 text-center text-xs text-gold">
              Default PIN for {selected === 'sobhnath' ? 'Sobhnath' : 'Umang'} is{' '}
              <button
                type="button"
                onClick={() => setPin(selected === 'sobhnath' ? '1111' : '2222')}
                className="num font-bold underline decoration-dotted hover:opacity-80"
                aria-label={`Fill default PIN for ${selected}`}
              >
                {selected === 'sobhnath' ? '1111' : '2222'}
              </button>{' '}
              — tap the number to fill, then change it in Settings.
            </div>
          )}

          <ActionButton className="mt-5 w-full" size="lg" tone={selected === 'umang' ? 'emerald' : 'cyan'} disabled={pin.length !== 4 || busy || !selected} onClick={submit}>
            <ShieldCheck className="mr-1 inline h-4 w-4" /> Enter Command
          </ActionButton>

          <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
            First time? Pick your name, use the default PIN shown above, and you're in. The HUD, Quests, Vault, Arena and Chamber tabs unlock after login — change your PIN in Settings ⚙.
          </p>
        </div>
      </HudPanel>
    </div>
  )
}
