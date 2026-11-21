/**
 * IST (Asia/Kolkata) time helpers — every game rule runs on IST regardless
 * of the device clock, so nobody can game the system from another timezone.
 */

const IST_TZ = 'Asia/Kolkata'

export function istParts(now: Date = new Date()) {
  // en-CA gives YYYY-MM-DD natively
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: IST_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now)
  const [h, m, s] = time.split(':').map(Number)
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: IST_TZ, weekday: 'short' }).format(now)
  return { date, h, m, s, dow, minutes: h * 60 + m }
}

export function istDateStr(now: Date = new Date()): string {
  return istParts(now).date
}

export function istMinutesOfDay(now: Date = new Date()): number {
  return istParts(now).minutes
}

/** Offset in days from today (IST). +1 = tomorrow, -1 = yesterday. */
export function istDateOffset(offset: number, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000)
  return istDateStr(shifted)
}

/** Monday of the week containing `dateStr` (YYYY-MM-DD), computed in IST. */
export function mondayOf(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  const dow = dt.getUTCDay() // 0 Sun .. 6 Sat
  const back = (dow + 6) % 7 // days since Monday
  dt.setUTCDate(dt.getUTCDate() - back)
  return dt.toISOString().slice(0, 10)
}

/** Minutes until a given IST wall-clock time today; if already past, minutes until it tomorrow. */
export function minutesUntilIST(targetH: number, targetM: number, now: Date = new Date()): number {
  const p = istParts(now)
  const target = targetH * 60 + targetM
  const diff = target - p.minutes - p.s / 60
  return diff > 0 ? diff : diff + 24 * 60
}

export function fmtCountdown(totalMins: number): string {
  const t = Math.max(0, Math.floor(totalMins * 60))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

export function isBeforeIST(h: number, m: number, now: Date = new Date()): boolean {
  return istMinutesOfDay(now) < h * 60 + m
}

/** Days between two YYYY-MM-DD strings. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** Real UTC instant for a given IST date + minutes-of-day (used for session close). */
export function istToUtc(dateStr: string, minutesOfDay: number): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  // IST = UTC+5:30
  return new Date(Date.UTC(y, mo - 1, d, 0, minutesOfDay) - 5.5 * 60 * 60 * 1000)
}
