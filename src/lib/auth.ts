import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'rpg_session'
const SECRET = process.env.AUTH_SECRET || 'brotherhood-rpg-local-secret-change-me-in-prod'

// ---- PIN hashing (scrypt with per-player salt) ----

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pin, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(pin, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

// ---- Signed session cookie: "<playerId>.<issuedAtMs>.<hmac>" ----

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex')
}

export function makeSessionToken(playerId: string): string {
  const payload = `${playerId}.${Date.now()}`
  return `${payload}.${sign(payload)}`
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [playerId, issuedAt, sig] = parts
  if (sign(`${playerId}.${issuedAt}`) !== sig) return null
  // 30-day expiry
  if (Date.now() - Number(issuedAt) > 30 * 24 * 60 * 60 * 1000) return null
  return playerId
}

export async function currentPlayerId(): Promise<string | null> {
  const store = await cookies()
  return readSessionToken(store.get(SESSION_COOKIE)?.value)
}

export async function setSessionCookie(playerId: string) {
  const store = await cookies()
  store.set(SESSION_COOKIE, makeSessionToken(playerId), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
