import { NextRequest, NextResponse } from 'next/server'
import { currentPlayerId } from '@/lib/auth'
import { GameError, reportSnitch } from '@/lib/game'
import type { PId } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Report a cheating violation — runs the escalation state machine server-side. */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const { target, violation, note } = await req.json()
    if (target !== 'sobhnath' && target !== 'umang') return NextResponse.json({ error: 'Unknown target' }, { status: 400 })
    if (target === me) return NextResponse.json({ error: 'You cannot snitch on yourself.' }, { status: 400 })
    if (!violation) return NextResponse.json({ error: 'Pick a violation type.' }, { status: 400 })
    const result = await reportSnitch(me as PId, target as PId, String(violation), String(note || '').slice(0, 200))
    return NextResponse.json({ ok: true, tier: result.tier })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Snitch failed' }, { status: 500 })
  }
}
