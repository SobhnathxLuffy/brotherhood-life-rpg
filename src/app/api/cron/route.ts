import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { runDueJobs } from '@/lib/game'

export const dynamic = 'force-dynamic'

/** Length-guarded, timing-safe string comparison. */
function safeSecretEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/**
 * Scheduled jobs endpoint (IST): midnight rollover, Sunday 22:00 PvP settlement,
 * Monday week spawn. Also runs opportunistically on every /api/state fetch.
 * Point a free external cron (e.g. cron-job.org) here every 5 minutes.
 * Protect with CRON_SECRET env → header "x-cron-secret".
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  // timing-safe compare; empty/unset CRON_SECRET keeps dev mode open
  if (secret && !safeSecretEqual(req.headers.get('x-cron-secret') || '', secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const jobs = await runDueJobs()
    return NextResponse.json({ ok: true, jobs })
  } catch (err) {
    console.error('cron error', err)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
