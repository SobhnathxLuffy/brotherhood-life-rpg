/**
 * v1.3 smoke test — the FRESH START (full game restart) flow.
 * Exercises guards (auth, typed confirmation), the wipe itself, the surviving
 * GAME_RESET audit row, identity survival (PINs + sessions) and the fresh Week 1.
 * Run against the local production standalone server on :3000.
 * Usage: node scripts/smoke-v13.mjs
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
  console.log('== 1. login both brothers (factory PINs) ==')
  const sob = await login('sobhnath', '1111')
  check('sobhnath login', sob.res.status === 200 && sob.cookie, '')
  const um = await login('umang', '2222')
  check('umang login', um.res.status === 200 && um.cookie, '')

  console.log('== 2. seed old-game data: locks + XP for both ==')
  await post('/api/quests/lock', sob.cookie, { target: 'today', study: 'old game: DSA 20Q', workout: 'old game: 30 pushups', skill: 'old game: chords' })
  await post('/api/quests/lock', um.cookie, { target: 'today', study: 'old game: revision', workout: 'old game: run', skill: 'old game: sketch' })
  await post('/api/quests/log', sob.cookie, { studyQuestions: 10 })
  await post('/api/quests/log', um.cookie, { workoutMins: 45 })
  const before = await state(sob.cookie)
  const sobXpBefore = before.players.sobhnath.todayLog.netXp
  check('old game has XP', sobXpBefore > 0, `sobhnath netXp=${sobXpBefore}`)
  check('old game has ledger rows', before.feed.length >= 2, `${before.feed.length} rows`)

  console.log('== 3. guards ==')
  const anon = await post('/api/restart', null, { confirm: 'RESET' })
  check('anonymous restart rejected', anon.res.status === 401, `status=${anon.res.status}`)
  const wrong = await post('/api/restart', sob.cookie, { confirm: 'reset' })
  check('wrong phrase rejected', wrong.res.status === 400, wrong.body.error || '')
  const empty = await post('/api/restart', sob.cookie, {})
  check('missing phrase rejected', empty.res.status === 400, '')
  const stillThere = await state(sob.cookie)
  check('no wipe happened on rejected calls', stillThere.players.sobhnath.todayLog.netXp > 0, `netXp=${stillThere.players.sobhnath.todayLog.netXp}`)

  console.log('== 4. the restart itself (sobhnath pulls the trigger) ==')
  const go = await post('/api/restart', sob.cookie, { confirm: 'RESET' })
  check('restart accepted', go.res.status === 200 && go.body.ok === true, JSON.stringify(go.body).slice(0, 140))
  check('wiped counters reported', go.body.wiped && go.body.wiped.logs >= 1 && go.body.wiped.weeks >= 1, `logs=${go.body.wiped?.logs} weeks=${go.body.wiped?.weeks} ledger=${go.body.wiped?.ledger}`)

  console.log('== 5. everything is actually gone ==')
  const after = await state(sob.cookie)
  const s = after.players.sobhnath
  const u = after.players.umang
  check('XP reset to zero', s.todayLog.netXp === 0 && s.totalXp === 0 && u.totalXp === 0, `sobhnath totalXp=${s.totalXp}, umang totalXp=${u.totalXp}`)
  check('vaults emptied', s.entBankMins === 0 && u.entBankMins === 0, `vaults=${s.entBankMins}/${u.entBankMins}`)
  check('undo stack gone', s.todayLog.canUndo === false && s.todayLog.undoLabel === null, '')
  check('quest texts gone', s.todayLog.studyQuestText === null && u.todayLog.studyQuestText === null, '')
  check('streaks & shields reset', s.streak === 0 && s.shieldsCount === 0 && u.streak === 0, '')

  console.log('== 6. fresh Week 1 ==')
  check('week 1 fresh boss', after.week.bossCurrentHp === 700 && after.week.bossMaxHp === 700 && after.week.bossDefeated === false, `boss=${after.week.bossName}`)
  check('boss is Lv.1', after.week.bossName.includes('Lv.1'), after.week.bossName)
  check('PvP HP full', after.week.sobhnathHp === 100 && after.week.umangHp === 100 && !after.week.sobhnathKo && !after.week.umangKo, '')

  console.log('== 7. the ONE surviving history row names the actor ==')
  check('feed has exactly 1 row', after.feed.length === 1, `${after.feed.length} row(s)`)
  const row = after.feed[0]
  check('row is GAME_RESET', row.eventType === 'GAME_RESET', row.eventType)
  check('row names sobhnath', row.playerId === 'sobhnath', `playerId=${row.playerId}`)
  check('row note has the wipe story', (row.note || '').includes('GAME RESTART') && (row.note || '').includes('Sobhnath'), (row.note || '').slice(0, 110))

  console.log('== 8. identity survived: PINs + sessions still valid ==')
  const sobStill = await state(sob.cookie)
  check('sobhnath session survived the wipe', sobStill.me === 'sobhnath', `me=${sobStill.me}`)
  const umStill = await state(um.cookie)
  check('umang session survived the wipe', umStill.me === 'umang', `me=${umStill.me}`)
  const umRelogin = await login('umang', '2222')
  check('factory PIN still works', umRelogin.res.status === 200, '')

  console.log('== 9. the game still plays after a restart ==')
  const lock2 = await post('/api/quests/lock', um.cookie, { target: 'today', study: 'new game: physics', workout: 'new game: 5k', skill: 'new game: piano' })
  check('quest lock works in fresh game', lock2.res.status === 200, JSON.stringify(lock2.body).slice(0, 100))
  const delta2 = await post('/api/quests/log', um.cookie, { studyQuestions: 5 })
  check('quest XP works in fresh game', delta2.res.status === 200 && delta2.body.questXp > 0, `questXp=${delta2.body.questXp}`)

  console.log('== 10. second restart by umang re-attributes the audit row ==')
  const go2 = await post('/api/restart', um.cookie, { confirm: 'RESET' })
  check('second restart ok', go2.res.status === 200, '')
  const after2 = await state(sob.cookie)
  check('audit row re-attributed to umang', after2.feed.length === 1 && after2.feed[0].eventType === 'GAME_RESET' && after2.feed[0].playerId === 'umang', `playerId=${after2.feed[0].playerId}`)
  check('umang XP wiped again', after2.players.umang.todayLog.questXp === 0, `questXp=${after2.players.umang.todayLog.questXp}`)

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
