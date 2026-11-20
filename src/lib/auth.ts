import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { PLAYER_IDS } from '@/engine/rules'

if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) {
  throw new Error('AUTH_SECRET must be set in production')
}

const SESSION_COOKIE = 'rpg_session'
const SECRET = process.env.AUTH_SECRET || 'brotherhood-rpg-local-secret-change-me-in-prod'

// ---- PIN brute-force limiter (in-memory): max 10 failed attempts per 10 minutes ----

const MAX_FAILED_ATTEMPTS = 10
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000
const failedAttempts = new Map<string, { attempts: number; firstAt: number }>()

/** Key a rate-limit bucket by client ip (if available) + player id. */
export function attemptKey(ip: string | null, playerId: string): string {
  return `${ip || 'unknown-ip'}:${playerId}`
}

export function isRateLimited(key: string): boolean {
  const rec = failedAttempts.get(key)
  if (!rec) return false
  if (Date.now() - rec.firstAt > ATTEMPT_WINDOW_MS) {
    failedAttempts.delete(key)
    return false
  }
  return rec.attempts >= MAX_FAILED_ATTEMPTS
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now()
  const rec = failedAttempts.get(key)
  if (!rec || now - rec.firstAt > ATTEMPT_WINDOW_MS) {
    failedAttempts.set(key, { attempts: 1, firstAt: now })
  } else {
    rec.attempts++
  }
}

export function clearFailedAttempts(key: string): void {
  failedAttempts.delete(key)
}

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
  // only the two real players may ever hold a session cookie
  if (!(PLAYER_IDS as string[]).includes(playerId)) return null
  // timing-safe HMAC comparison (length-guarded — timingSafeEqual throws on length mismatch)
  const expected = Buffer.from(sign(`${playerId}.${issuedAt}`), 'hex')
  const given = Buffer.from(sig, 'hex')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
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
