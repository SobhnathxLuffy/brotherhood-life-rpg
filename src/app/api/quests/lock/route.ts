import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentPlayerId } from '@/lib/auth'
import { GameError, getOrCreateLog } from '@/lib/game'
import { istDateOffset, istDateStr, istMinutesOfDay } from '@/lib/time'
import * as R from '@/engine/rules'

export const dynamic = 'force-dynamic'

/** Lock tomorrow's 3 quests — allowed any time today BEFORE 23:30 IST. */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId()
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const now = new Date()
    if (istMinutesOfDay(now) >= R.QUEST_LOCK.CUTOFF_HOUR * 60 + R.QUEST_LOCK.CUTOFF_MINUTE) {
      return NextResponse.json({ error: 'Lock window CLOSED (past 11:30 PM IST) — quests must be locked before sleeping.' }, { status: 400 })
    }
    const { study, workout, skill } = await req.json()
    if (!study?.trim() || !workout?.trim() || !skill?.trim()) {
      return NextResponse.json({ error: 'All 3 quests are required — no moving the goalposts.' }, { status: 400 })
    }
    const target = istDateOffset(1, now)
    const log = await getOrCreateLog(me, target, now)
    if (log.questsLockedAt) return NextResponse.json({ error: 'Tomorrow is already locked — no edits allowed.' }, { status: 400 })
    await db.dailyLog.update({
      where: { id: log.id },
      data: { studyQuestText: study.trim(), workoutQuestText: workout.trim(), skillQuestText: skill.trim(), questsLockedAt: now },
    })
    const player = await db.player.findUniqueOrThrow({ where: { id: me } })
    return NextResponse.json({ ok: true, lockedFor: target, date: istDateStr(now) })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Lock failed' }, { status: 500 })
  }
}
