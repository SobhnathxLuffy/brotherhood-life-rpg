/**
 * Dev-only setup for the v1.4 late-log smoke test:
 * backdates game_start_date so the scheduler treats the last few days as played
 * days, ensures their Week rows exist, and cleans yesterday's logs/claims —
 * so the next authenticated state fetch runs REAL rollovers for them and
 * yesterday ends up "judged as an empty day" (HP -25, streak reset, punishment
 * ticket) exactly like a forgotten midnight.
 * Local SQLite only — never touches production.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ datasources: { db: { url: 'file:../db/custom.db' } } })

const IST_OFFSET = 5.5 * 60 * 60 * 1000
function istDateStr(d = new Date()) {
  return new Date(d.getTime() + IST_OFFSET).toISOString().slice(0, 10)
}
function mondayOf(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7))
  return dt.toISOString().slice(0, 10)
}

async function main() {
  const today = istDateStr()
  const yesterday = new Date(new Date(`${today}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
  const start = new Date(new Date(`${today}T12:00:00Z`).getTime() - 4 * 86400000).toISOString().slice(0, 10)

  // 1. the game officially started 4 days ago → runDueJobs will sweep those days
  await db.appMeta.upsert({
    where: { key: 'game_start_date' },
    update: { value: start },
    create: { key: 'game_start_date', value: start },
  })

  // 2. week rows for every Monday the sweep will touch
  const mondays = [...new Set([mondayOf(yesterday), mondayOf(start), mondayOf(today)])]
  for (const m of mondays) {
    await db.week.upsert({ where: { startDate: m }, update: {}, create: { startDate: m, bossName: 'Late-Log Test Boss Lv.1' } })
  }

  // 3. clean slate for yesterday: no logs, no ticket, no claims/markers
  await db.dailyLog.deleteMany({ where: { logDate: yesterday } })
  await db.punishment.deleteMany({ where: { logDate: yesterday } })
  await db.appMeta.deleteMany({ where: { key: { in: [`rollover:${yesterday}`, `rofx:${yesterday}`] } } })

  console.log(`setup ok — game_start=${start}, yesterday=${yesterday}, weeks=${mondays.join(', ')}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
