'use client'

import { useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import type { GameState, SocketEvent } from '@/lib/types'

// ---- Bearer-token session (survives cookie-blocked contexts) ----
// The preview iframe is cross-origin, so browsers refuse to send the session
// cookie there. The auth endpoint therefore also returns a signed token which
// we keep in localStorage and attach as `x-session-token` on every request.
// Same signed token as the cookie — identical trust, works everywhere.
const SESSION_KEY = 'rpg_session_token'

export function saveSession(token: string): void {
  try {
    localStorage.setItem(SESSION_KEY, token)
  } catch {
    // storage blocked — cookie mode still works in first-party contexts
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

export function sessionHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem(SESSION_KEY)
    return t ? { 'x-session-token': t } : {}
  } catch {
    return {}
  }
}

export async function apiPost<T = Record<string, unknown>>(path: string, body?: unknown, method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export function useGameState() {
  const query = useQuery<GameState>({
    queryKey: ['game-state'],
    queryFn: async () => {
      const res = await fetch('/api/state', { cache: 'no-store', headers: sessionHeaders() })
      if (!res.ok) throw new Error('Failed to load state')
      return res.json()
    },
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
    staleTime: 2000,
  })
  return query
}

/** Live socket events → refresh state + feed the FX overlay. Polling is the fallback. */
export function useLiveEvents(onEvent: (ev: SocketEvent) => void) {
  const queryClient = useQueryClient()
  const handlerRef = useRef(onEvent)

  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    // No socket.io mini-service exists on serverless deployments (Vercel) —
    // skip connecting there entirely and rely on the 4s polling fallback.
    if (process.env.NODE_ENV === 'production') return
    const socket: Socket = io('/?XTransformPort=3003', { transports: ['websocket', 'polling'], reconnectionDelayMax: 10000 })
    socket.on('sync', (ev: SocketEvent) => {
      handlerRef.current(ev)
      queryClient.invalidateQueries({ queryKey: ['game-state'] })
    })
    return () => {
      socket.disconnect()
    }
  }, [queryClient])
}

export function useGameProvider() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  )
  return queryClient
}

export { QueryClientProvider }
