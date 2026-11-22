/**
 * v1.1 smoke test — exercises the late-lock (0.8x), undo, and brother-reveal
 * flows against a running local production server on :3000.
 * Usage: node scripts/smoke-v11.mjs
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
  check('sobhnath login', sob.res.status === 200 && sob.cookie, JSON.stringify(sob.body).slice(0, 120))
  const um = await login('umang', '2222')
  check('umang login', um.res.status === 200 && um.cookie, '')

  console.log('== 2. authenticated state ==')
  const s1 = await state(sob.cookie)
  check('me=sobhnath', s1.me === 'sobhnath', `me=${s1.me}`)

  console.log('== 3. late lock (target:today) → 0.8x toll ==')
  const lock = await post('/api/quests/lock', sob.cookie, {
    target: 'today',
    study: 'Late rescue: 20 DSA questions',
    workout: 'Late rescue: 30 pushups',
    skill: 'Late rescue: guitar chords',
  })
  check('late lock ok', lock.res.status === 200 && lock.body.late === true, `mult=${lock.body.xpMultiplier}`)
  check('toll = 0.8', Math.abs((lock.body.xpMultiplier ?? 9) - 0.8) < 1e-9, `xpMultiplier=${lock.body.xpMultiplier}`)

  console.log('== 4. log a quest delta under the toll ==')
  const delta = await post('/api/quests/log', sob.cookie, { workoutMins: 20 })
  check('delta ok', delta.res.status === 200, `questXp=${delta.body.questXp} effectiveDelta=${delta.body.effectiveDelta}`)
  const xpBefore = delta.body.questXp

  console.log('== 5. undo the delta ==')
  const undo = await post('/api/quests/undo', sob.cookie, {})
  check('undo ok', undo.res.status === 200 && undo.body.ok === true, `undone="${undo.body.undone}"`)
  check('questXp rolled back', undo.body.questXp === 0, `questXp after undo=${undo.body.questXp}`)

  console.log('== 6. brother reveal: umang sees sobhnath locked quests ==')
  const s2 = await state(um.cookie)
  check('me=umang', s2.me === 'umang', `me=${s2.me}`)
  const bro = s2.players?.sobhnath?.todayLog
  check('sobhnath questsLocked visible', bro?.questsLocked === true)
  check('quest TEXT visible to brother', !!bro?.studyQuestText && bro.studyQuestText.includes('Late rescue'), bro?.studyQuestText || 'EMPTY')
  check('lateQuests flag visible', bro?.lateQuests === true)

  console.log('== 7. undo with empty stack errors cleanly ==')
  const undo2 = await post('/api/quests/undo', sob.cookie, {})
  check('empty-stack undo rejected', undo2.res.status === 400, `error="${undo2.body.error}"`)

  console.log('== 8. double late-lock rejected ==')
  const lock2 = await post('/api/quests/lock', sob.cookie, {
    target: 'today', study: 'x', workout: 'y', skill: 'z',
  })
  check('double late lock rejected', lock2.res.status === 400, `error="${lock2.body.error}"`)

  console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} TEST(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
