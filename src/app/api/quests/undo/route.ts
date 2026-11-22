import { NextRequest, NextResponse } from 'next/server'
import { currentPlayerId } from '@/lib/auth'
import { GameError, undoLastDelta } from '@/lib/game'
import { istDateStr } from '@/lib/time'

export const dynamic = 'force-dynamic'

/** Undo the most recent quest action for today (misclick insurance). */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const result = await undoLastDelta(me, istDateStr())
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Undo failed' }, { status: 500 })
  }
}
