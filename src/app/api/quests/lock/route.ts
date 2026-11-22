import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentPlayerId } from '@/lib/auth'
import { GameError, getOrCreateLog, logEvent, recomputeDaily } from '@/lib/game'
import { istDateOffset, istDateStr, istMinutesOfDay } from '@/lib/time'
import * as R from '@/engine/rules'

export const dynamic = 'force-dynamic'

/**
 * Lock 3 quests.
 *  - default  → TOMORROW's quests, allowed any time today BEFORE 23:30 IST.
 *  - target:'today' → LATE lock for TODAY: the nightly window was missed, but
 *    the day can still be salvaged — everything logged today pays 0.8x XP.
 */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const now = new Date()
    const body = await req.json().catch(() => ({}))
    const { study, workout, skill, target } = body as { study?: string; workout?: string; skill?: string; target?: string }
    if (!study?.trim() || !workout?.trim() || !skill?.trim()) {
      return NextResponse.json({ error: 'All 3 quests are required — no moving the goalposts.' }, { status: 400 })
    }

    if (target === 'today') {
      // ===== LATE LOCK — rescue today's unplanned quests at 0.8x XP =====
      const today = istDateStr(now)
      const log = await getOrCreateLog(me, today, now)
      if (log.questsLockedAt) return NextResponse.json({ error: "Today's quests are already locked — no edits allowed." }, { status: 400 })
      await db.dailyLog.update({
        where: { id: log.id },
        data: { studyQuestText: study.trim(), workoutQuestText: workout.trim(), skillQuestText: skill.trim(), questsLockedAt: now, lateQuests: true },
      })
      // audit trail — brothers must see when (and how) quests got locked
      await logEvent(me, today, log.weekId, 'QUEST_LOCK', `Late-locked TODAY's quests (${today}) — ×${R.LATE_QUEST_MULT} XP toll`)
      // the 0.8x toll applies retroactively to the whole day — recompute net XP now
      const fresh = await recomputeDaily(me, today)
      return NextResponse.json({ ok: true, lockedFor: today, late: true, date: today, netXp: fresh.netXp, xpMultiplier: R.round2(R.LATE_QUEST_MULT * log.xpMultiplier) })
    }

    // ===== NORMAL LOCK — tomorrow's quests, before 23:30 IST =====
    if (istMinutesOfDay(now) >= R.QUEST_LOCK.CUTOFF_HOUR * 60 + R.QUEST_LOCK.CUTOFF_MINUTE) {
      return NextResponse.json({ error: 'Lock window CLOSED (past 11:30 PM IST) — lock tomorrow before sleeping, or use the late rescue for today.' }, { status: 400 })
    }
    const lockTarget = istDateOffset(1, now)
    const log = await getOrCreateLog(me, lockTarget, now)
    if (log.questsLockedAt) return NextResponse.json({ error: 'Tomorrow is already locked — no edits allowed.' }, { status: 400 })
    await db.dailyLog.update({
      where: { id: log.id },
      data: { studyQuestText: study.trim(), workoutQuestText: workout.trim(), skillQuestText: skill.trim(), questsLockedAt: now },
    })
    // audit trail — brothers must see when (and how) quests got locked
    await logEvent(me, lockTarget, log.weekId, 'QUEST_LOCK', `Locked quests for ${lockTarget} (tomorrow) — committed before the 23:30 IST cutoff`)
    return NextResponse.json({ ok: true, lockedFor: lockTarget, date: istDateStr(now) })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Lock failed' }, { status: 500 })
  }
}
