import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentPlayerId } from '@/lib/auth'
import { GameError, getOrCreateLog, logEvent } from '@/lib/game'
import { istDateOffset, istDateStr } from '@/lib/time'

export const dynamic = 'force-dynamic'

/**
 * Edit quest texts for TODAY or TOMORROW — even after they were locked.
 * Corrections and testing both need an escape hatch; every edit is written to
 * the ledger as a QUEST_EDIT audit row (before → after) so the History tab
 * always shows who changed what. The day's XP toll / multiplier is untouched —
 * editing quests never grants or removes XP.
 */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const now = new Date()
    const body = await req.json().catch(() => ({}))
    const { study, workout, skill, target } = body as { study?: string; workout?: string; skill?: string; target?: string }
    if (!study?.trim() || !workout?.trim() || !skill?.trim()) {
      return NextResponse.json({ error: 'All 3 quests are required — write the full plan.' }, { status: 400 })
    }
    const date = target === 'tomorrow' ? istDateOffset(1, now) : istDateStr(now)
    const log = await getOrCreateLog(me, date, now)

    const before = { study: log.studyQuestText, workout: log.workoutQuestText, skill: log.skillQuestText }
    await db.dailyLog.update({
      where: { id: log.id },
      data: { studyQuestText: study.trim(), workoutQuestText: workout.trim(), skillQuestText: skill.trim() },
    })

    // audit row — compact before→after note (truncated per field)
    const short = (s: string | null) => (s && s.length > 60 ? `${s.slice(0, 57)}…` : s ?? '—')
    const changed: string[] = []
    if (short(before.study) !== study.trim()) changed.push(`study "${short(before.study)}" → "${short(study.trim())}"`)
    if (short(before.workout) !== workout.trim()) changed.push(`workout "${short(before.workout)}" → "${short(workout.trim())}"`)
    if (short(before.skill) !== skill.trim()) changed.push(`skill "${short(before.skill)}" → "${short(skill.trim())}"`)
    await logEvent(me, date, log.weekId, 'QUEST_EDIT', changed.length ? `Edited ${date}'s quests: ${changed.join(' · ')}` : `Re-saved ${date}'s quests (no text change)`)

    return NextResponse.json({ ok: true, target: target === 'tomorrow' ? 'tomorrow' : 'today', date, edited: changed.length > 0 })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Quest edit failed' }, { status: 500 })
  }
}
