/**
 * v1.2 smoke test — quest editing (today/tomorrow), audit ledger rows
 * (QUEST_LOCK / QUEST_EDIT / QUEST_UNDO), tomorrowLog exposure, undo on HUD data.
 * Usage: node scripts/smoke-v12.mjs
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
  return (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
}

const state = async (cookie) => (await fetch(`${BASE}/api/state`, { headers: { cookie } })).json()
async function post(path, cookie, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  })
  return { res, body: await res.json().catch(() => ({})) }
}

async function main() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  console.log('== 0. pullup multiplier (0.6x) ==')
  const ckS = await login('sobhnath', '1111')
  check('sobhnath login', !!ckS)

  console.log('== 1. late lock today (resets yesterday\u2019s test data first) ==')
  const lock = await post('/api/quests/lock', ckS, { target: 'today', study: 'S1 original', workout: 'W1 original', skill: 'K1 original' })
  check('late lock ok (or already locked from earlier today)', lock.res.status === 200 || /already locked/.test(lock.body.error || ''), lock.body.late ? 'late=true' : lock.body.error || '')

  console.log('== 2. QUEST_LOCK audit row exists in feed ==')
  const s1 = await state(ckS)
  const lockRows = s1.feed.filter((f) => f.eventType === 'QUEST_LOCK')
  check('QUEST_LOCK row present', lockRows.length > 0, lockRows[0]?.note || '')

  console.log('== 3. edit TODAY\u2019s locked quests ==')
  const edit = await post('/api/quests/edit', ckS, { target: 'today', study: 'S1 EDITED', workout: 'W1 EDITED', skill: 'K1 EDITED' })
  check('edit ok', edit.res.status === 200 && edit.body.ok === true, `date=${edit.body.date}`)
  const s2 = await state(ckS)
  check('today texts updated', s2.players.sobhnath.todayLog.studyQuestText === 'S1 EDITED' && s2.players.sobhnath.todayLog.workoutQuestText === 'W1 EDITED')
  const editRows = s2.feed.filter((f) => f.eventType === 'QUEST_EDIT')
  check('QUEST_EDIT row with before→after', editRows.length > 0 && /EDITED/.test(editRows[0].note || ''), editRows[0]?.note || '')
  check('edit kept lock state (no XP change)', s2.players.sobhnath.todayLog.questsLocked === true && s2.players.sobhnath.todayLog.questXp === 0)

  console.log('== 4. log delta + undo → QUEST_UNDO audit row ==')
  const d = await post('/api/quests/log', ckS, { skillMins: 30 })
  check('delta logged', d.res.status === 200 && d.body.questXp > 0, `questXp=${d.body.questXp}`)
  const u = await post('/api/quests/undo', ckS, {})
  check('undo ok', u.res.status === 200, `undone="${u.body.undone}"`)
  const s3 = await state(ckS)
  const undoRows = s3.feed.filter((f) => f.eventType === 'QUEST_UNDO')
  check('QUEST_UNDO row present', undoRows.length > 0 && /Undid/.test(undoRows[0].note || ''), undoRows[0]?.note || '')

  console.log('== 5. lock TOMORROW + edit tomorrow ==')
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const lockT = await post('/api/quests/lock', ckS, { study: 'T-S tomorrow plan', workout: 'T-W tomorrow plan', skill: 'T-K tomorrow plan' })
  check('tomorrow lock ok', lockT.res.status === 200 && lockT.body.lockedFor === tomorrow, `lockedFor=${lockT.body.lockedFor}`)
  const s4 = await state(ckS)
  check('tomorrowLog exposed in state', s4.players.sobhnath.tomorrowLog?.questsLocked === true, `date=${s4.players.sobhnath.tomorrowLog?.logDate}`)
  check('tomorrow texts readable', s4.players.sobhnath.tomorrowLog?.studyQuestText === 'T-S tomorrow plan')
  const editT = await post('/api/quests/edit', ckS, { target: 'tomorrow', study: 'T-S EDITED', workout: 'T-W tomorrow plan', skill: 'T-K tomorrow plan' })
  check('tomorrow edit ok', editT.res.status === 200 && editT.body.target === 'tomorrow')
  const s5 = await state(ckS)
  check('tomorrow text updated', s5.players.sobhnath.tomorrowLog?.studyQuestText === 'T-S EDITED')

  console.log('== 6. brother sees edited quests (reveal incl. tomorrow flag) ==')
  const ckU = await login('umang', '2222')
  const s6 = await state(ckU)
  check('umang sees sobhnath\u2019s today texts', s6.players.sobhnath.todayLog.studyQuestText === 'S1 EDITED')
  check('umang sees sobhnath\u2019s tomorrowLog', s6.players.sobhnath.tomorrowLog?.questsLocked === true)

  console.log('== 7. unauthenticated edit rejected ==')
  const anon = await post('/api/quests/edit', '', { target: 'today', study: 'x', workout: 'y', skill: 'z' })
  check('anon edit 401', anon.res.status === 401)

  console.log(`(context) today=${today} tomorrow=${tomorrow}`)
  console.log(failures === 0 ? '\nALL v1.2 SMOKE TESTS PASSED' : `\n${failures} TEST(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
