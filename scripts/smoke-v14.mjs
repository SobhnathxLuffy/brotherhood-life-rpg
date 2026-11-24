/**
 * v1.4 smoke test — LATE-LOG backfill (tick off yesterday after missing midnight)
 * + custom amount deltas.
 *
 * Scenario: yesterday's rollover already judged an empty day (HP -25, streak
 * reset, punishment ticket). Backfilling real progress must re-judge that
 * rollover with the corrected numbers; undoing the backfill must put the
 * consequences right back. Custom amounts must flow through unchanged.
 * Run against the local production standalone server on :3000.
 * Usage: node scripts/smoke-v14.mjs
 */
const BASE = 'http://localhost:3000'

let failures = 0
function check(name, cond, extra = '') {
  if (cond) console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`)
  else { console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`); failures++ }
}

async function login(pid, pin) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', playerId: pid, pin }),
  })
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
  const body = await res.json().catch(() => ({}))
  return { res, body, cookie }
}

const state = async (cookie) =>
  (await fetch(`${BASE}/api/state`, { headers: cookie ? { cookie } : {} })).json()

async function post(path, cookie, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  })
  return { res, body: await res.json().catch(() => ({})) }
}

async function main() {
  // IST-safe yesterday, computed independently (rollover never creates log rows,
  // so yesterdayLog may legitimately be null in the pre-state)
  const yDate = new Date(Date.now() + 5.5 * 3600 * 1000 - 86400000).toISOString().slice(0, 10)
  console.log('== 1. login + let the scheduler judge yesterday (empty day) ==')
  const sob = await login('sobhnath', '1111')
  check('sobhnath login', sob.res.status === 200 && sob.cookie, '')
  const um = await login('umang', '2222')
  check('umang login', um.res.status === 200 && um.cookie, '')

  const pre = await state(sob.cookie)
  check('state exposes yesterdayLog', 'yesterdayLog' in pre.players.sobhnath, `yDate=${yDate}`)
  const hpBeforeBackfill = pre.week.sobhnathHp
  check('yesterday rolled over as an empty day (HP penalized)', hpBeforeBackfill < 100, `sobhnathHp=${hpBeforeBackfill}`)
  const ticketForYesterday = pre.punishments.find((p) => p.logDate === yDate)
  check('punishment ticket exists for yesterday', !!ticketForYesterday, ticketForYesterday ? `remainingXp=${ticketForYesterday.remainingXp}` : 'MISSING')
  check('yesterday net is zero', (pre.players.sobhnath.yesterdayLog?.netXp ?? 0) === 0, '')

  console.log('== 2. late-log backfill: +41 questions into yesterday (71 XP — clears HP, not the ticket) ==')
  const bf = await post('/api/quests/log', sob.cookie, { target: 'yesterday', studyQuestions: 41 })
  check('backfill accepted', bf.res.status === 200 && bf.body.target === 'yesterday', `date=${bf.body.date}`)
  check('repair ran', bf.body.rolloverRepaired === true, '')

  const after = await state(sob.cookie)
  const ylog = after.players.sobhnath.yesterdayLog
  check('yesterday questXp = 71 (30Q cap ×2 + 11Q ×1)', ylog?.questXp === 71, `questXp=${ylog?.questXp}`)
  check('yesterday netXp = 71', ylog?.netXp === 71, `netXp=${ylog?.netXp}`)
  check('weekly HP restored to 100 (71 ≥ 50)', after.week.sobhnathHp === 100, `sobhnathHp=${after.week.sobhnathHp}`)
  const recalibrated = after.punishments.find((p) => p.logDate === yDate)
  check('ticket recalibrated to 29 XP short', !!recalibrated && recalibrated.remainingXp === 29, recalibrated ? `remainingXp=${recalibrated.remainingXp}` : 'MISSING')
  check('streak incremented (71 > 70)', after.players.sobhnath.streak === 1, `streak=${after.players.sobhnath.streak}`)
  check('vault credited (71 × 1x)', after.players.sobhnath.entBankMins >= 71, `vault=${after.players.sobhnath.entBankMins}`)
  check('yesterday undo armed', ylog?.canUndo === true && ylog?.undoLabel === '+41 questions', `label=${ylog?.undoLabel}`)
  const audit = after.feed.find((e) => e.eventType === 'QUEST_EDIT' && (e.note || '').includes('Late log'))
  check('late-log audit row in History', !!audit, audit ? (audit.note || '').slice(0, 80) : 'MISSING')

  console.log('== 3. undo the backfill → consequences return ==')
  const un = await post('/api/quests/undo', sob.cookie, { target: 'yesterday' })
  check('yesterday undo accepted', un.res.status === 200 && un.body.target === 'yesterday', `undone=${un.body.undone}`)
  const afterUndo = await state(sob.cookie)
  check('yesterday net back to 0', (afterUndo.players.sobhnath.yesterdayLog?.netXp ?? 0) === 0, '')
  check('weekly HP re-penalized to 75', afterUndo.week.sobhnathHp === 75, `sobhnathHp=${afterUndo.week.sobhnathHp}`)
  const ticketBack = afterUndo.punishments.find((p) => p.logDate === yDate)
  check('punishment ticket back at 100 short', !!ticketBack && ticketBack.remainingXp === 100, ticketBack ? `remainingXp=${ticketBack.remainingXp}` : 'MISSING')
  check('streak reset to 0', afterUndo.players.sobhnath.streak === 0, `streak=${afterUndo.players.sobhnath.streak}`)

  console.log('== 4. re-backfill for keeps (+40 Q → 70 XP, HP restored, ticket at 30 short) ==')
  const bf2 = await post('/api/quests/log', sob.cookie, { target: 'yesterday', studyQuestions: 40 })
  check('re-backfill accepted', bf2.res.status === 200, '')
  const after2 = await state(sob.cookie)
  check('yesterday netXp = 70', after2.players.sobhnath.yesterdayLog?.netXp === 70, `netXp=${after2.players.sobhnath.yesterdayLog?.netXp}`)
  check('weekly HP restored again', after2.week.sobhnathHp === 100, `sobhnathHp=${after2.week.sobhnathHp}`)
  const recalibrated2 = after2.punishments.find((p) => p.logDate === yDate)
  check('ticket recalibrated to 30 short', !!recalibrated2 && recalibrated2.remainingXp === 30, recalibrated2 ? `remainingXp=${recalibrated2.remainingXp}` : 'MISSING')
  check('streak stays 0 (70 is not > 70)', after2.players.sobhnath.streak === 0, `streak=${after2.players.sobhnath.streak}`)

  console.log('== 5. custom amounts on today ==')
  const c1 = await post('/api/quests/log', um.cookie, { studyQuestions: 12.5 })
  check('fractional questions ok', c1.res.status === 200 && c1.body.questXp === 25, `questXp=${c1.body.questXp}`)
  const c2 = await post('/api/quests/log', um.cookie, { workoutMins: 37 })
  check('arbitrary whole minutes ok', c2.res.status === 200, `questXp=${c2.body.questXp}`)
  const c3 = await post('/api/quests/log', um.cookie, { workoutMins: 10.5 })
  check('fractional minutes rejected', c3.res.status === 400, c3.body.error || '')
  const c4 = await post('/api/quests/log', um.cookie, { studyQuestions: -3 })
  check('negative amounts rejected', c4.res.status === 400, '')
  const c5 = await post('/api/quests/log', um.cookie, { skillMins: 90 })
  check('big custom minutes ok', c5.res.status === 200, `questXp=${c5.body.questXp}`)

  console.log('== 6. guards ==')
  const anon = await post('/api/quests/log', null, { target: 'yesterday', studyQuestions: 5 })
  check('anonymous backfill rejected', anon.res.status === 401, `status=${anon.res.status}`)
  const empty = await post('/api/quests/log', sob.cookie, { target: 'yesterday' })
  check('nothing-to-log rejected', empty.res.status === 400, '')

  console.log('== 7. regression: today logging + today undo still work ==')
  const t1 = await post('/api/quests/log', sob.cookie, { workoutMins: 30 })
  check('today log ok', t1.res.status === 200 && t1.body.target === 'today', '')
  const t2 = await post('/api/quests/undo', sob.cookie, {})
  check('today undo ok', t2.res.status === 200 && t2.body.target === 'today', `undone=${t2.body.undone}`)

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
