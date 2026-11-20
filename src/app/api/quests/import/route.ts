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
      // Sessions may carry either question counts or time_seconds — a missing
      // field counts as 0, but garbage (non-numeric strings etc.) must never
      // reach the DB: Number() NaN would be stored as NULL in SQLite and poison
      // questXp, and negatives would silently claw XP.
      const rawQ = s.questions ?? s.total_questions
      const rawT = s.time_seconds ?? s.total_time_seconds
      const q = rawQ == null ? 0 : Number(rawQ)
      const t = rawT == null ? 0 : Number(rawT)
      if (!Number.isFinite(q) || q < 0 || !Number.isFinite(t) || t < 0 || (q === 0 && t === 0)) {
        skipped++
        continue
      }
      const questions = q
      const timeSeconds = t
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
          // Provenance row only — deltaXp stays 0. Imported questions flow into
          // the cumulative QUEST ledger row (capped/half-rate via calcQuestXP),
          // so any XP number here would double-count in ledger sums.
          deltaXp: 0,
          eventType: 'JEE_IMPORT', externalRefId: refId,
          note: `JEE import: ${questions} questions${timeSeconds ? ` / ${(timeSeconds / 3600).toFixed(2)}h` : ''} (credited via quest XP)`,
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
      // JEE_IMPORT rows are excluded from recomputeDaily's netXp — the XP is
      // credited via today's capped quest totals, so the feed note stays
      // informational instead of showing a misleading uncapped XP number.
      await emit({ kind: 'XP', playerId: me, message: `${player.displayName} imported ${imported} JEE session${imported > 1 ? 's' : ''} — ${newQuestions} questions / ${R.round2(newHours)}h added to today's quest log.` })
    }
    return NextResponse.json({ ok: true, imported, skipped, newQuestions, newHours: R.round2(newHours) })
  } catch (err) {
    if (err instanceof GameError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Import failed — is this a valid jee-study-app export?' }, { status: 400 })
  }
}
