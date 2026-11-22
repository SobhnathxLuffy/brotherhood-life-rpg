/**
 * Post-build step for LOCAL standalone runs (bun .next/standalone/server.js).
 * Skipped entirely on Vercel (process.env.VERCEL is set) — Vercel packages the
 * app itself, and blindly copying could fail or bloat the serverless bundle.
 */
import { existsSync, cpSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
process.chdir(root)

if (process.env.VERCEL) {
  console.log('[standalone-postbuild] running on Vercel → skip local standalone copy')
  process.exit(0)
}

const standalone = '.next/standalone'
if (!existsSync(standalone)) {
  console.log('[standalone-postbuild] no .next/standalone output → nothing to do')
  process.exit(0)
}

cpSync('.next/static', `${standalone}/.next/static`, { recursive: true })
cpSync('public', `${standalone}/public`, { recursive: true })
console.log('[standalone-postbuild] copied static/ and public/ into .next/standalone')
