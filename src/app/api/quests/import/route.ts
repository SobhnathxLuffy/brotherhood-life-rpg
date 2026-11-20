import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentPlayerId } from '@/lib/auth'
import { applyQuestDelta, GameError, getOrCreateLog } from '@/lib/game'
import { istDateStr } from '@/lib/time'
import { emit } from '@/lib/emit'
import * as R from '@/engine/rules'

export const dynamic = 'force-dynamic'

interface JeeSession {
  id?: string | number
  questions?: number
  total_questions?: number
  time_seconds?: number
  total_time_seconds?: number
}

/**
 * jee-study-app JSON bridge (Sobhnath only).
 * Accepts { sessions: [...] } with per-session ids (deduped forever via external_ref_id)
 * and either question counts or total_time_seconds.
 */
export async function POST(req: NextRequest) {
  const me = await currentPlayerId()
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  try {
    const payload = await req.json()
    const sessions: JeeSession[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.sessions)
        ? payload.sessions
        : Array.isArray(payload.data?.sessions)
          ? payload.data.sessions
          : []
    if (!sessions.length) return NextResponse.json({ error: 'No sessions[] found in the JSON export.' }, { status: 400 })

    const today = istDateStr()
    let newQuestions = 0
    let newHours = 0
    let imported = 0
    let skipped = 0

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i]
      const questions = Number(s.questions ?? s.total_questions ?? 0)
      const timeSeconds = Number(s.time_seconds ?? s.total_time_seconds ?? 0)
      const refId = `jee:${s.id ?? `${today}:${i}`}`
      const exists = await db.ledger.findUnique({ where: { externalRefId: refId } })
      if (exists) {
        skipped++
        continue
      }
      const log = await getOrCreateLog(me, today)
      await db.ledger.create({
        data: {
          playerId: me, logDate: today, weekId: log.weekId,
          deltaXp: R.round2(questions * R.STUDY.QUEST_RATE),
          eventType: 'JEE_IMPORT', externalRefId: refId,
          note: `JEE import: ${questions} questions${timeSeconds ? ` / ${(timeSeconds / 3600).toFixed(2)}h` : ''}`,
        },
      })
      newQuestions += questions
      newHours += timeSeconds / 3600
      imported++
    }

    if (imported > 0) {
      await applyQuestDelta(me, today, {
        studyQuestions: R.round2(newQuestions),
        studyHours: R.round2(newHours),
      })
      const player = await db.player.findUniqueOrThrow({ where: { id: me } })
      await emit({ kind: 'XP', playerId: me, message: `${player.displayName} imported ${imported} JEE session${imported > 1 ? 's' : ''} (${newQuestions} questions, +${R.round2(newQuestions * R.STUDY.QUEST_RATE)} XP)` })
    }
    return NextResponse.json({ ok: true, imported, skipped, newQuestions, newHours: R.round2(newHours) })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Import failed — is this a valid jee-study-app export?' }, { status: 400 })
  }
}
