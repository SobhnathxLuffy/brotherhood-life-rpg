import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  verifyPin,
  setSessionCookie,
  clearSessionCookie,
  currentPlayerId,
  makeSessionToken,
  attemptKey,
  isRateLimited,
  recordFailedAttempt,
  clearFailedAttempts,
} from '@/lib/auth'
import { ensureSeed, changePin } from '@/lib/game'

export const dynamic = 'force-dynamic'

// POST — select identity with PIN
export async function POST(req: NextRequest) {
  await ensureSeed()
  let body: { playerId?: unknown; pin?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const playerId = String(body.playerId ?? '')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const key = attemptKey(ip, playerId)
  if (isRateLimited(key)) {
    return NextResponse.json({ error: 'Too many attempts — wait a few minutes.' }, { status: 429 })
  }
  const player = await db.player.findUnique({ where: { id: playerId } })
  if (!player) return NextResponse.json({ error: 'Unknown player' }, { status: 400 })
  if (!verifyPin(String(body.pin ?? ''), player.pinHash)) {
    recordFailedAttempt(key)
    return NextResponse.json({ error: 'Wrong PIN — this terminal is for the real you.' }, { status: 401 })
  }
  clearFailedAttempts(key)
  await setSessionCookie(playerId)
  // Also hand back a signed bearer token: preview iframes (cross-origin) block
  // cookies entirely, so the client stores this in localStorage and sends it
  // as the `x-session-token` header on every request.
  return NextResponse.json({ ok: true, playerId, token: makeSessionToken(playerId) })
}

// PUT — change own PIN
export async function PUT(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  let body: { currentPin?: unknown; newPin?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  try {
    await changePin(me, String(body.currentPin ?? ''), String(body.newPin ?? ''))
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
