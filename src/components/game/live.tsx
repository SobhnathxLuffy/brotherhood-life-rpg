'use client'

import { useEffect, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import type { GameState, SocketEvent } from '@/lib/types'

export async function apiPost<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export function useGameState() {
  const query = useQuery<GameState>({
    queryKey: ['game-state'],
    queryFn: async () => {
      const res = await fetch('/api/state', { cache: 'no-store' })
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
