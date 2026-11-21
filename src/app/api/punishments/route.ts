import { NextRequest, NextResponse } from 'next/server'
import { currentPlayerId } from '@/lib/auth'
import { GameError, verifyPunishment } from '@/lib/game'

export const dynamic = 'force-dynamic'

/** Umang verifies Sobhnath's punishment ticket with his PIN after watching the sets. */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const { id, pin } = await req.json()
    await verifyPunishment(me, Number(id), String(pin || ''))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
