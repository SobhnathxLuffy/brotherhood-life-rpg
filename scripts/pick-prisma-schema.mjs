/**
 * Picks the right Prisma schema for the environment BEFORE `prisma generate`.
 *
 *  - DATABASE_URL starting with `postgres` (Vercel / Supabase production)
 *      → copy prisma/schema.postgres.prisma over prisma/schema.prisma
 *  - anything else (local sandbox dev, SQLite file DB)
 *      → leave prisma/schema.prisma untouched (it IS the SQLite schema)
 *
 * This lets one repo build correctly in both worlds without committing
 * credentials or maintaining two divergent codebases.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const schemaPath = resolve(root, 'prisma/schema.prisma')
const postgresPath = resolve(root, 'prisma/schema.postgres.prisma')

const url = (process.env.DATABASE_URL || '').trim().toLowerCase()
if (url.startsWith('postgres')) {
  const pg = readFileSync(postgresPath, 'utf8')
  const current = readFileSync(schemaPath, 'utf8')
  if (current !== pg) {
    writeFileSync(schemaPath, pg)
    console.log('[pick-prisma-schema] DATABASE_URL is Postgres → using prisma/schema.postgres.prisma')
  }
} else if (process.env.VERCEL) {
  // On Vercel the app can ONLY run against Postgres. A SQLite client would
  // build "successfully" and then explode at runtime — fail loudly instead.
  throw new Error(
    '[pick-prisma-schema] VERCEL build but DATABASE_URL is missing or not postgres:// — ' +
      'add DATABASE_URL + DIRECT_URL (+ AUTH_SECRET + CRON_SECRET) in Vercel → Settings → Environment Variables, then Redeploy.',
  )
} else {
  console.log('[pick-prisma-schema] no Postgres DATABASE_URL → keeping SQLite schema (local dev)')
}
