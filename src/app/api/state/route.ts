import { NextRequest, NextResponse } from 'next/server'
import { getFullState } from '@/lib/game'

export const dynamic = 'force-dynamic'

/**
 * Strip credentials from any URL that leaks into an error message, so the
 * `detail` field is safe to show in a private 2-player app's responses.
 */
function redact(msg: unknown): string {
  let out = typeof msg === 'string' ? msg : msg instanceof Error ? `${msg.name}: ${msg.message}` : String(msg)
  try {
    out = out.replace(/\w+:\/\/[^/\s]+:[^@\s]+@/g, (m) => m.replace(/:[^@/\s]+@/, ':***@'))
    const url = process.env.DATABASE_URL
    if (url) out = out.split(url).join('***DATABASE_URL***')
  } catch {
    // redaction itself should never throw
  }
  return out.slice(0, 600)
}

export async function GET(req: NextRequest) {
  try {
    const state = await getFullState(new Date(), req)
    return NextResponse.json(state)
  } catch (err) {
    console.error('state error', err)
    // Private game: surface the *real* cause (connection string, missing
    // tables, engine mismatch…) so it can be diagnosed from the response.
    const detail = redact(err instanceof Error ? `${err.message}\n${(err as { code?: string }).code ? `code=${(err as { code?: string }).code}` : ''}` : err)
    return NextResponse.json({ error: 'Failed to load game state', detail }, { status: 500 })
  }
}
