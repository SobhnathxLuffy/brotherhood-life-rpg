import { PrismaClient } from '@prisma/client'

/**
 * Serverless-safe URL shaping (idempotent, string-based so it never throws on
 * exotic passwords):
 *  - `pgbouncer=true`      → Prisma must NOT use named prepared statements when
 *                            the URL goes through Supabase's transaction pooler
 *                            (PgBouncer). Without it every query dies with
 *                            Postgres error 42P05 "prepared statement already exists".
 *  - `connection_limit=1`  → one connection per serverless instance.
 * Safe to pass through any postgres URL variant (pooler 6543 / session 5432 /
 * direct) — the flag is merely "don't prepare statements", which is always valid.
 */
function serverlessSafeUrl(url: string | undefined): string | undefined {
  if (!url || !/^postgres(ql)?:\/\//i.test(url)) return url
  let out = url.trim()

  // Repair the database path segment: pasted connection strings often pick up
  // trailing spaces/newlines (".../postgres        " → Postgres error 3D000
  // "database postgres%20%20… does not exist"). Decode → trim → re-encode ONLY
  // the final path segment; never touch scheme, host or credentials.
  const qIdx = out.indexOf('?')
  const head = qIdx === -1 ? out : out.slice(0, qIdx)
  const tail = qIdx === -1 ? '' : out.slice(qIdx)
  const slash = head.lastIndexOf('/')
  const dbSeg = head.slice(slash + 1)
  if (dbSeg && !dbSeg.includes('@')) {
    let name = dbSeg
    try {
      name = decodeURIComponent(name)
    } catch {
      // not valid percent-encoding — keep raw
    }
    name = name.trim() || 'postgres'
    try {
      name = encodeURIComponent(name)
    } catch {
      // keep raw
    }
    out = head.slice(0, slash + 1) + name + tail
  }

  const addParam = (s: string, key: string, val: string): string =>
    new RegExp(`[?&]${key}=`).test(s) ? s : `${s}${s.includes('?') ? '&' : '?'}${key}=${val}`
  let res = addParam(out, 'pgbouncer', 'true')
  res = addParam(res, 'connection_limit', '1')
  return res
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: serverlessSafeUrl(process.env.DATABASE_URL) } },
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db