import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentPlayerId } from '@/lib/auth'
import { ensureWeek } from '@/lib/game'
import { emit } from '@/lib/emit'

export const dynamic = 'force-dynamic'

/** Mark the weekly stake as paid (either brother, after Sunday settlement). */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const week = await ensureWeek()
  if (!week.pvpWinner) return NextResponse.json({ error: 'Stake can be marked paid only after Sunday settlement.' }, { status: 400 })
  if (week.pvpStakeSettled) return NextResponse.json({ error: 'Stake already marked paid.' }, { status: 400 })
  await db.week.update({ where: { id: week.id }, data: { pvpStakeSettled: true } })
  await emit({ kind: 'PVP', message: 'Weekly stake marked PAID — brotherhood honour maintained.' })
  return NextResponse.json({ ok: true })
}
