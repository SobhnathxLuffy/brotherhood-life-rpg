import { NextResponse } from 'next/server'
import { getFullState } from '@/lib/game'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const state = await getFullState()
    return NextResponse.json(state)
  } catch (err) {
    console.error('state error', err)
    return NextResponse.json({ error: 'Failed to load game state' }, { status: 500 })
  }
}
