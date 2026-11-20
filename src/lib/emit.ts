import type { SocketEvent } from './types'

/**
 * Fire-and-forget broadcast to the socket.io mini-service (port 3003).
 * Failures are swallowed — polling fallback keeps the UI fresh anyway.
 */
export async function emit(ev: SocketEvent) {
  try {
    await fetch(`http://127.0.0.1:${process.env.SOCKET_PORT || 3003}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
      signal: AbortSignal.timeout(1500),
    })
  } catch {
    // socket service down — SWR polling covers it
  }
}
