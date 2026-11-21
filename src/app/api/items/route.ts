import { NextRequest, NextResponse } from 'next/server'
import { currentPlayerId } from '@/lib/auth'
import { burnShield, declareOverride, GameError } from '@/lib/game'

export const dynamic = 'force-dynamic'

/** Tactical items: burn a Rest Shield OR declare a Big-Event Override (needs brother's PIN). */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const { action, reason, cosignPin } = await req.json()
    if (action === 'shield') {
      await burnShield(me)
      return NextResponse.json({ ok: true })
    }
    if (action === 'override') {
      if (!reason?.trim()) return NextResponse.json({ error: 'State the big-event reason.' }, { status: 400 })
      await declareOverride(me, String(reason).trim(), String(cosignPin || ''))
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Item action failed' }, { status: 500 })
  }
}
