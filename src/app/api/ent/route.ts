import { NextRequest, NextResponse } from 'next/server'
import { currentPlayerId } from '@/lib/auth'
import { GameError, spendEnt, startWatch, stopWatch } from '@/lib/game'

export const dynamic = 'force-dynamic'

/** Entertainment vault: spend preset minutes OR start/stop the live drain stopwatch. */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId()
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  let body: { action?: string; mins?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  try {
    const { action, mins } = body
    if (action === 'spend') {
      const player = await spendEnt(me, Number(mins))
      return NextResponse.json({ ok: true, balance: player.entBankMins })
    }
    if (action === 'start') {
      await startWatch(me)
      return NextResponse.json({ ok: true, watching: true })
    }
    if (action === 'stop') {
      const player = await stopWatch(me)
      return NextResponse.json({ ok: true, watching: false, balance: player.entBankMins, drained: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Vault action failed' }, { status: 500 })
  }
}
