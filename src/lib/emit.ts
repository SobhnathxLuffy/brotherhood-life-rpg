import type { SocketEvent } from './types'

const EMIT_TOKEN = process.env.EMIT_TOKEN || 'brotherhood-emit-local'

/**
 * Fire-and-forget broadcast to the socket.io mini-service (port 3003).
 * The /emit endpoint requires the shared x-emit-token header (see
 * mini-services/game-socket/index.ts). Failures are swallowed —
 * polling fallback keeps the UI fresh anyway.
 */
export async function emit(ev: SocketEvent) {
  try {
    await fetch(`http://127.0.0.1:${process.env.SOCKET_PORT || 3003}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-emit-token': EMIT_TOKEN },
      body: JSON.stringify(ev),
      signal: AbortSignal.timeout(1500),
    })
  } catch {
    // socket service down — SWR polling covers it
  }
}
