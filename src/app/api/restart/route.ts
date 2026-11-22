import { NextRequest, NextResponse } from 'next/server'
import { currentPlayerId } from '@/lib/auth'
import { GameError, resetGame } from '@/lib/game'
import type { PId } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * FRESH START — wipe the entire game for both brothers and begin a new one.
 * Extremely destructive, so it is triple-guarded:
 *   1. a signed-in session is required (401 otherwise),
 *   2. the body MUST carry confirm: 'RESET' (the exact phrase typed in the UI) —
 *      anything else is a 400, so a stray click or scripted call can never wipe,
 *   3. the actor is recorded: the first row of the new history is a GAME_RESET
 *      ledger entry naming whoever did it (see resetGame).
 */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.confirm !== 'RESET') {
      return NextResponse.json({ error: 'Confirmation failed — type RESET to prove you mean it.' }, { status: 400 })
    }
    const result = await resetGame(me as PId)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Restart failed — nothing was deleted.' }, { status: 500 })
  }
}
