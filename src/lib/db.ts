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
  const addParam = (s: string, key: string, val: string): string =>
    new RegExp(`[?&]${key}=`).test(s) ? s : `${s}${s.includes('?') ? '&' : '?'}${key}=${val}`
  let out = addParam(url, 'pgbouncer', 'true')
  out = addParam(out, 'connection_limit', '1')
  return out
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