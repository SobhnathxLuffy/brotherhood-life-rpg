import { NextRequest, NextResponse } from 'next/server'
import { currentPlayerId } from '@/lib/auth'
import { GameError, repairRolloverForBackfill, undoLastDelta } from '@/lib/game'
import { istDateOffset, istDateStr } from '@/lib/time'
import type { PId } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Undo the most recent quest action (misclick insurance).
 * body.target 'yesterday' reverses the latest LATE-LOG backfill on yesterday's
 * log — and the rollover repair replays too, so the HP penalty / streak reset /
 * punishment ticket that the backfill had cleared come right back (the day is
 * back to "nothing logged", which is exactly what last night judged).
 */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const yesterday = body?.target === 'yesterday'
    const date = yesterday ? istDateOffset(-1) : istDateStr()
    const result = await undoLastDelta(me, date)
    let rolloverRepaired = false
    if (yesterday) rolloverRepaired = await repairRolloverForBackfill(me as PId, date)
    return NextResponse.json({ ok: true, target: yesterday ? 'yesterday' : 'today', date, rolloverRepaired, ...result })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Undo failed' }, { status: 500 })
  }
}
