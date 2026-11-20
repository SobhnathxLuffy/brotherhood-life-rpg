import { NextRequest, NextResponse } from 'next/server'
import { currentPlayerId } from '@/lib/auth'
import { applyQuestDelta, GameError } from '@/lib/game'
import { istDateStr } from '@/lib/time'
import * as R from '@/engine/rules'

export const dynamic = 'force-dynamic'

/** Log quest progress deltas for today (questions / hours / workout mins / skill mins / mode toggle). */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId()
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const body = await req.json()
    const delta: {
      studyQuestions?: number
      studyHours?: number
      workoutMins?: number
      skillMins?: number
      studyMode?: R.StudyMode
    } = {}
    const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined)
    delta.studyQuestions = num(body.studyQuestions)
    delta.studyHours = num(body.studyHours)
    delta.workoutMins = num(body.workoutMins)
    delta.skillMins = num(body.skillMins)
    if (body.studyMode === 'questions' || body.studyMode === 'hours') delta.studyMode = body.studyMode
    if (!delta.studyQuestions && !delta.studyHours && !delta.workoutMins && !delta.skillMins && !delta.studyMode) {
      return NextResponse.json({ error: 'Nothing to log' }, { status: 400 })
    }
    const result = await applyQuestDelta(me, istDateStr(), delta)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Log failed' }, { status: 500 })
  }
}
