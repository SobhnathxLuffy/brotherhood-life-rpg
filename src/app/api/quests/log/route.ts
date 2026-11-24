import { NextRequest, NextResponse } from 'next/server'
import { currentPlayerId } from '@/lib/auth'
import { db } from '@/lib/db'
import { applyQuestDelta, GameError, getOrCreateLog, logEvent, repairRolloverForBackfill } from '@/lib/game'
import { istDateOffset, istDateStr } from '@/lib/time'
import * as R from '@/engine/rules'
import type { PId } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Log quest progress deltas (questions / hours / workout mins / skill mins / mode toggle).
 * target 'today' (default) → today's log; target 'yesterday' → the LATE-LOG backfill:
 * forgot to log before midnight? The progress lands on yesterday's tally (weekly XP,
 * boss, vault) and last night's rollover consequences (HP penalty, streak reset,
 * punishment ticket) are automatically re-judged with the corrected numbers.
 */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId(req)
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  try {
    const target = body.target === 'yesterday' ? 'yesterday' : 'today'
    const delta: {
      studyQuestions?: number
      studyHours?: number
      workoutMins?: number
      skillMins?: number
      studyMode?: R.StudyMode
    } = {}
    const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined)
    // workoutMins / skillMins are Prisma Int columns — fractional values would
    // 500 on write, so reject them with a clear message (studyQuestions /
    // studyHours are Float and may stay fractional).
    const intMins = (v: unknown, label: string) => {
      const n = num(v)
      if (n === undefined) return undefined
      if (!Number.isInteger(n)) throw new GameError(`${label} must be a whole number of minutes.`)
      return n
    }
    delta.studyQuestions = num(body.studyQuestions)
    delta.studyHours = num(body.studyHours)
    delta.workoutMins = intMins(body.workoutMins, 'Workout minutes')
    delta.skillMins = intMins(body.skillMins, 'Skill minutes')
    if (body.studyMode === 'questions' || body.studyMode === 'hours') delta.studyMode = body.studyMode
    if (!delta.studyQuestions && !delta.studyHours && !delta.workoutMins && !delta.skillMins && !delta.studyMode) {
      return NextResponse.json({ error: 'Nothing to log' }, { status: 400 })
    }

    const date = target === 'yesterday' ? istDateOffset(-1) : istDateStr()
    if (target === 'yesterday') {
      const gameStart = await db.appMeta.findUnique({ where: { key: 'game_start_date' } })
      if (gameStart && date < gameStart.value) {
        throw new GameError('Yesterday is before this game even started — nothing to log.')
      }
    }

    const result = await applyQuestDelta(me, date, delta)

    let rolloverRepaired = false
    if (target === 'yesterday') {
      // the corrected numbers re-judge last night's rollover (HP / streak / ticket)
      rolloverRepaired = await repairRolloverForBackfill(me as PId, date)
      // audit row — late logging must be visible in the History tab
      const parts: string[] = []
      if (delta.studyQuestions) parts.push(`+${delta.studyQuestions} questions`)
      if (delta.studyHours) parts.push(`+${delta.studyHours}h study`)
      if (delta.workoutMins) parts.push(`+${delta.workoutMins}m workout`)
      if (delta.skillMins) parts.push(`+${delta.skillMins}m skill`)
      const log = await getOrCreateLog(me, date)
      await logEvent(me, date, log.weekId, 'QUEST_EDIT', `Late log — ${parts.join(' + ') || 'mode toggle'} backfilled into ${date} (missed the midnight window)`)
    }

    return NextResponse.json({ ok: true, target, date, rolloverRepaired, ...result })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Log failed' }, { status: 500 })
  }
}
