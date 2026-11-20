import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPin, setSessionCookie, clearSessionCookie, currentPlayerId } from '@/lib/auth'
import { ensureSeed, changePin } from '@/lib/game'

export const dynamic = 'force-dynamic'

// POST — select identity with PIN
export async function POST(req: NextRequest) {
  await ensureSeed()
  const { playerId, pin } = await req.json()
  const player = await db.player.findUnique({ where: { id: playerId } })
  if (!player) return NextResponse.json({ error: 'Unknown player' }, { status: 400 })
  if (!verifyPin(String(pin), player.pinHash)) return NextResponse.json({ error: 'Wrong PIN — this terminal is for the real you.' }, { status: 401 })
  await setSessionCookie(playerId)
  return NextResponse.json({ ok: true, playerId })
}

// PUT — change own PIN
export async function PUT(req: NextRequest) {
  const me = await currentPlayerId()
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { currentPin, newPin } = await req.json()
  try {
    await changePin(me, String(currentPin), String(newPin))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}

// DELETE — sign out
export async function DELETE() {
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
