import { db } from '@/lib/db'
import { emit } from '@/lib/emit'
import { currentPlayerId, hashPin, verifyPin } from '@/lib/auth'
import * as R from '@/engine/rules'
import { daysBetween, istDateOffset, istDateStr, istMinutesOfDay, istParts, istToUtc, mondayOf, minutesUntilIST } from '@/lib/time'
import type { GameState, PId, SocketEvent } from '@/lib/types'
import type { DailyLog, Player, Week } from '@prisma/client'
import { Prisma } from '@prisma/client'

// ============================ SEED & WEEK ============================

export async function ensureSeed(now: Date = new Date()) {
  const count = await db.player.count()
  if (count === 0) {
    await db.player.createMany({
      data: [
        { id: 'sobhnath', displayName: 'Sobhnath', pinHash: hashPin('1111'), entMultiplier: 1, hasPhysicalPunishment: true },
        { id: 'umang', displayName: 'Umang', pinHash: hashPin('2222'), entMultiplier: 2, hasPhysicalPunishment: false },
      ],
    })
    // The game begins the day the app is first booted — days BEFORE this marker
    // are never rolled over, so a fresh install doesn't get KO'd for days the
    // brothers never even had the app.
    try {
      await db.appMeta.create({ data: { key: 'game_start_date', value: istDateStr(now) } })
    } catch {
      // already exists — fine
    }
  }
  await repairLogWeeks()
}

/**
 * Repair legacy poisoned rows: DailyLogs whose weekId points at the wrong Week
 * (created before getOrCreateLog derived the week from the log's own date —
 * e.g. a Monday log attached to the previous week when created on a Sunday).
 * Cheap at 2-player scale + idempotent — safe to run on every seed/state fetch.
 */
export async function repairLogWeeks(): Promise<number> {
  const logs = await db.dailyLog.findMany({ select: { id: true, weekId: true, logDate: true } })
  const weekIdByMonday = new Map<string, number>()
  let fixed = 0
  for (const log of logs) {
    const monday = mondayOf(log.logDate)
    let weekId = weekIdByMonday.get(monday)
    if (weekId === undefined) {
      const week = await db.week.findUnique({ where: { startDate: monday } })
      if (!week) continue // week row doesn't exist yet — getOrCreateLog's mismatch repair handles it once it does
      weekId = week.id
      weekIdByMonday.set(monday, weekId)
    }
    if (log.weekId !== weekId) {
      await db.dailyLog.update({ where: { id: log.id }, data: { weekId } })
      fixed++
    }
  }
  return fixed
}

export async function ensureWeek(now: Date = new Date()): Promise<Week> {
  const startDate = mondayOf(istDateStr(now))
  let week = await db.week.findUnique({ where: { startDate } })
  if (!week) {
    const weekNum = (await db.week.count()) + 1
    const bossName = `${R.BOSS_NAMES[Math.floor(Math.random() * R.BOSS_NAMES.length)]} Lv.${weekNum}`
    week = await db.week.create({ data: { startDate, bossName } })
    await emit({ kind: 'WEEK', message: `New week — ${bossName} spawned with 700 HP!` })
  }
  return week
}

export async function weekOf(dateStr: string): Promise<Week | null> {
  return db.week.findUnique({ where: { startDate: mondayOf(dateStr) } })
}

// ============================ LOG HELPERS ============================

export async function getOrCreateLog(playerId: string, dateStr: string, now: Date = new Date()): Promise<DailyLog> {
  // Derive the week from the LOG's own date (noon IST so mondayOf matches that
  // date) — never from `now`: callers pass tomorrow (quest lock, Tier-1 snitch
  // lockdown) and on Sundays ensureWeek(now) would attach Monday's log to the
  // OLD week, breaking boss damage, rollover HP and weekly sums forever.
  // (`now` stays in the signature for caller compatibility only.)
  const week = await ensureWeek(istToUtc(dateStr, 720))
  let log = await db.dailyLog.findUnique({ where: { playerId_logDate: { playerId, logDate: dateStr } } })
  if (!log) {
    log = await db.dailyLog.create({ data: { playerId, logDate: dateStr, weekId: week.id } })
  } else if (log.weekId !== week.id) {
    // repair rows created against the wrong week
    log = await db.dailyLog.update({ where: { id: log.id }, data: { weekId: week.id } })
  }
  return log
}

export function toLogView(log: DailyLog) {
  return {
    logDate: log.logDate,
    studyQuestText: log.studyQuestText,
    workoutQuestText: log.workoutQuestText,
    skillQuestText: log.skillQuestText,
    questsLocked: !!log.questsLockedAt,
    studyMode: log.studyMode as R.StudyMode,
    studyQuestions: log.studyQuestions,
    studyHours: log.studyHours,
    workoutMins: log.workoutMins,
    skillMins: log.skillMins,
    questXp: log.questXp,
    netXp: log.netXp,
    xpMultiplier: log.xpMultiplier,
    isLockdown: log.isLockdown,
    shieldUsed: log.shieldUsed,
    overrideUsed: log.overrideUsed,
    overrideReason: log.overrideReason,
    bossHitApplied: log.bossHitApplied,
  }
}

/**
 * Recompute net_xp = questXp * multiplier + (snitch/boss ledger deltas for that date).
 * Pure + idempotent — safe to call after any mutation.
 */
export async function recomputeDaily(playerId: string, dateStr: string): Promise<DailyLog> {
  const log = await getOrCreateLog(playerId, dateStr)
  const others = await db.ledger.aggregate({
    _sum: { deltaXp: true },
    where: { playerId, logDate: dateStr, eventType: { in: ['SNITCH_GAIN', 'SNITCH_LOSS', 'BOSS_LOOT'] } },
  })
  const net = R.round2(log.questXp * log.xpMultiplier + (others._sum.deltaXp || 0))
  return db.dailyLog.update({ where: { id: log.id }, data: { netXp: net } })
}

/**
 * Add quest progress and recompute everything: XP, entertainment bank,
 * QUEST ledger row, co-op boss damage.
 */
export async function applyQuestDelta(
  playerId: string,
  dateStr: string,
  delta: { studyQuestions?: number; studyHours?: number; workoutMins?: number; skillMins?: number; studyMode?: R.StudyMode },
  now: Date = new Date(),
) {
  const log = await getOrCreateLog(playerId, dateStr, now)
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } })
  const oldQuestXp = log.questXp

  const next = {
    studyQuestions: Math.max(0, R.round2(log.studyQuestions + (delta.studyQuestions || 0))),
    studyHours: Math.max(0, R.round2(log.studyHours + (delta.studyHours || 0))),
    workoutMins: Math.max(0, log.workoutMins + (delta.workoutMins || 0)),
    skillMins: Math.max(0, log.skillMins + (delta.skillMins || 0)),
    studyMode: delta.studyMode || log.studyMode,
  }
  const newQuestXp = R.calcQuestXP({
    studyMode: next.studyMode as R.StudyMode,
    studyQuestions: next.studyQuestions,
    studyHours: next.studyHours,
    workoutMins: next.workoutMins,
    skillMins: next.skillMins,
  })
  const effectiveDelta = R.round2(newQuestXp * log.xpMultiplier - oldQuestXp * log.xpMultiplier)

  await db.dailyLog.update({ where: { id: log.id }, data: { ...next, questXp: newQuestXp } })

  // audit row (raw quest xp, pre-multiplier)
  const existing = await db.ledger.findFirst({ where: { playerId, logDate: dateStr, eventType: 'QUEST' } })
  if (existing) {
    await db.ledger.update({ where: { id: existing.id }, data: { deltaXp: newQuestXp, note: `Quest XP (study ${next.studyMode === 'questions' ? next.studyQuestions + 'Q' : next.studyHours + 'h'} / workout ${next.workoutMins}m / skill ${next.skillMins}m)` } })
  } else {
    await db.ledger.create({ data: { playerId, logDate: dateStr, weekId: log.weekId, deltaXp: newQuestXp, eventType: 'QUEST', note: `Quest XP (study ${next.studyMode === 'questions' ? next.studyQuestions + 'Q' : next.studyHours + 'h'} / workout ${next.workoutMins}m / skill ${next.skillMins}m)` } })
  }

  // entertainment vault credit for positive gains
  let credited = 0
  if (effectiveDelta > 0) {
    credited = R.entMinutesEarned(effectiveDelta, player.entMultiplier)
    if (credited > 0) await db.player.update({ where: { id: playerId }, data: { entBankMins: { increment: credited } } })
  }

  await recomputeDaily(playerId, dateStr)
  await checkBossDamage(dateStr, now)

  if (effectiveDelta !== 0) {
    await emit({ kind: 'XP', playerId, amount: effectiveDelta, message: `${player.displayName} logged progress: ${effectiveDelta > 0 ? '+' : ''}${effectiveDelta} XP` })
  }
  return { questXp: newQuestXp, effectiveDelta, credited }
}

/** Co-op boss: when BOTH brothers are at 70+ XP on the same day → -140 HP. */
export async function checkBossDamage(dateStr: string, now: Date = new Date()) {
  const week = await weekOf(dateStr)
  if (!week || week.bossDefeated) return
  const logs = await db.dailyLog.findMany({ where: { logDate: dateStr, weekId: week.id } })
  const byPlayer = Object.fromEntries(logs.map((l) => [l.playerId, l]))
  const s = byPlayer['sobhnath']
  const u = byPlayer['umang']
  if (!s || !u) return
  if (s.bossHitApplied || u.bossHitApplied) return
  if (s.netXp < R.BOSS.TRIGGER_XP || u.netXp < R.BOSS.TRIGGER_XP) return

  const newHp = Math.max(0, week.bossCurrentHp - R.BOSS.HIT_DMG)
  await db.dailyLog.updateMany({ where: { id: { in: [s.id, u.id] } }, data: { bossHitApplied: true } })
  const defeated = newHp <= 0
  await db.week.update({
    where: { id: week.id },
    data: { bossCurrentHp: newHp, bossDefeated: defeated },
  })
  await emit({ kind: 'BOSS_HIT', amount: R.BOSS.HIT_DMG, message: `BOSS HIT! -${R.BOSS.HIT_DMG} HP (${newHp}/${week.bossMaxHp})` })

  if (defeated) {
    for (const pid of R.PLAYER_IDS) {
      const player = await db.player.findUniqueOrThrow({ where: { id: pid } })
      await db.ledger.create({ data: { playerId: pid, logDate: dateStr, weekId: week.id, deltaXp: R.BOSS.LOOT_XP, eventType: 'BOSS_LOOT', note: `${week.bossName} defeated — Boss Loot!` } })
      await db.player.update({ where: { id: pid }, data: { entBankMins: { increment: R.entMinutesEarned(R.BOSS.LOOT_XP, player.entMultiplier) } } })
      await recomputeDaily(pid, dateStr)
    }
    await emit({ kind: 'BOSS_LOOT', message: `${week.bossName} DEFEATED! Both brothers loot +${R.BOSS.LOOT_XP} XP!` })
  }
}

// ============================ SNITCH STATE MACHINE ============================

export async function reportSnitch(catcherId: PId, targetId: PId, violation: string, note: string, now: Date = new Date()) {
  const today = istDateStr(now)

  // anti-spam: cooldown + daily cap for the catcher
  const catcherSnitches = await db.ledger.findMany({
    where: { playerId: catcherId, eventType: 'SNITCH_GAIN', logDate: today },
    orderBy: { createdAt: 'desc' },
  })
  if (catcherSnitches.length >= R.SNITCH.MAX_PER_CATCHER_PER_DAY) throw new GameError(`Max ${R.SNITCH.MAX_PER_CATCHER_PER_DAY} snitches per day — don't spam the tribunal.`)
  if (catcherSnitches[0]) {
    const minsAgo = (now.getTime() - catcherSnitches[0].createdAt.getTime()) / 60000
    if (minsAgo < R.SNITCH.COOLDOWN_MINUTES) throw new GameError(`Snitch cooldown: wait ${Math.ceil(R.SNITCH.COOLDOWN_MINUTES - minsAgo)} more minutes.`)
  }

  const week = await ensureWeek(now)
  const target = await db.player.findUniqueOrThrow({ where: { id: targetId } })
  const catcher = await db.player.findUniqueOrThrow({ where: { id: catcherId } })
  const targetLog = await getOrCreateLog(targetId, today, now)
  const tomorrow = istDateOffset(1, now)
  const violationLabel = R.VIOLATIONS.find((v) => v.id === violation)?.label || violation
  const noteTxt = `${target.displayName} caught: ${violationLabel}${note ? ` — "${note}"` : ''}`

  // catcher reward (+30 XP → also vault)
  await db.ledger.create({ data: { playerId: catcherId, logDate: today, weekId: week.id, deltaXp: R.SNITCH.REWARD_XP, eventType: 'SNITCH_GAIN', note: `Snitched on ${target.displayName}: ${violationLabel}` } })
  await db.player.update({ where: { id: catcherId }, data: { entBankMins: { increment: R.entMinutesEarned(R.SNITCH.REWARD_XP, catcher.entMultiplier) } } })

  let tier: 0 | 1 | 2
  if (targetLog.isLockdown) {
    // ===== Tier 2: cheating on a lockdown day → PvP forfeit + boss heals =====
    tier = 2
    await db.ledger.create({ data: { playerId: targetId, logDate: today, weekId: week.id, deltaXp: 0, eventType: 'SNITCH_LOSS', note: `Tier 2 — cheated during LOCKDOWN. Weekly PvP forfeited, Boss heals +${R.BOSS.HIT_DMG} HP.` } })
    const healedHp = Math.min(week.bossMaxHp, week.bossCurrentHp + R.BOSS.HIT_DMG)
    await db.week.update({ where: { id: week.id }, data: { pvpForfeitedBy: targetId, bossCurrentHp: healedHp, bossDefeated: false } })
    await emit({ kind: 'PVP', playerId: targetId, message: `${target.displayName} cheated on a LOCKDOWN day — weekly PvP forfeited! Boss healed +${R.BOSS.HIT_DMG} HP (${healedHp}/${week.bossMaxHp})` })
  } else if (targetLog.netXp <= R.SNITCH.DAILY_XP_FLOOR) {
    // ===== Tier 1: already at -30 XP → tomorrow is a Lockdown + half XP =====
    tier = 1
    const tomorrowLog = await getOrCreateLog(targetId, tomorrow, now)
    if (!tomorrowLog.isLockdown) {
      await db.dailyLog.update({ where: { id: tomorrowLog.id }, data: { isLockdown: true, xpMultiplier: R.LOCKDOWN_MULT } })
    }
    await db.ledger.create({ data: { playerId: targetId, logDate: today, weekId: week.id, deltaXp: 0, eventType: 'SNITCH_LOSS', note: `Tier 1 — already at -30 XP. Tomorrow: Entertainment Lockdown + 0.5x XP.` } })
    await emit({ kind: 'SNITCH', playerId: targetId, message: `${target.displayName} is LOCKED DOWN tomorrow: 0.5x XP, no entertainment!` })
  } else {
    // ===== Tier 0: standard steal — lose up to 30 XP, floored at -30 =====
    tier = 0
    const loss = R.snitchStealLoss(targetLog.netXp)
    await db.ledger.create({ data: { playerId: targetId, logDate: today, weekId: week.id, deltaXp: -loss, eventType: 'SNITCH_LOSS', note: noteTxt } })
    await emit({ kind: 'SNITCH', playerId: targetId, amount: -loss, message: `${catcher.displayName} snitched on ${target.displayName}! Stole +${R.SNITCH.REWARD_XP} XP — ${target.displayName} lost ${loss} XP!` })
  }

  await recomputeDaily(targetId, today)
  await recomputeDaily(catcherId, today)
  return { tier }
}

// ============================ ENTERTAINMENT VAULT ============================

export async function spendEnt(playerId: string, mins: number, now: Date = new Date()) {
  // NaN guard first: NaN <= 0 is false, so a bare `mins <= 0` lets NaN through
  // and SQLite would store it as NULL — permanently zeroing the vault.
  if (!Number.isFinite(mins) || mins <= 0) throw new GameError('Minutes must be a positive number.')
  const today = istDateStr(now)
  const log = await getOrCreateLog(playerId, today, now)
  if (log.isLockdown) throw new GameError('LOCKDOWN ACTIVE — entertainment spending is disabled today.')
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } })
  // Manual spends are floored at the current balance — the vault may only go
  // negative through the live watch drain, never through a manual spend.
  mins = Math.min(mins, player.entBankMins)
  if (mins <= 0) throw new GameError('Not enough minutes in the vault.')
  const updated = await db.player.update({ where: { id: playerId }, data: { entBankMins: { decrement: mins } } })
  await emit({ kind: 'ENT', playerId, amount: -mins, message: `${player.displayName} spent ${mins}m of entertainment time (${Math.floor(updated.entBankMins)}m left)` })
  return updated
}

export async function startWatch(playerId: string, now: Date = new Date()) {
  const open = await db.entSession.findFirst({ where: { playerId, endedAt: null } })
  if (open) throw new GameError('Watch session already running.')
  const log = await getOrCreateLog(playerId, istDateStr(now), now)
  if (log.isLockdown) throw new GameError('LOCKDOWN ACTIVE — the stopwatch is disabled today.')
  await db.entSession.create({ data: { playerId, startedAt: now } })
  await emit({ kind: 'ENT', playerId, message: `${(await db.player.findUniqueOrThrow({ where: { id: playerId } })).displayName} STARTED watching — vault draining live!` })
}

export async function stopWatch(playerId: string, now: Date = new Date()) {
  const open = await db.entSession.findFirst({ where: { playerId, endedAt: null } })
  if (!open) throw new GameError('No watch session running.')
  const rawMins = (now.getTime() - open.startedAt.getTime()) / 60000
  const mins = Number.isFinite(rawMins) ? R.round2(rawMins) : 0 // NaN-safety: never poison the vault
  await db.entSession.update({ where: { id: open.id }, data: { endedAt: now, minsSpent: mins } })
  const player = await db.player.update({ where: { id: playerId }, data: { entBankMins: { decrement: mins } } })
  await emit({ kind: 'ENT', playerId, amount: -mins, message: `${player.displayName} stopped watching — ${mins}m drained (balance ${Math.floor(player.entBankMins)}m)` })
  return player
}

// ============================ TACTICAL ITEMS ============================

export async function burnShield(playerId: string, now: Date = new Date()) {
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } })
  if (player.shieldsCount <= 0) throw new GameError('No shields available — earn one with a 5-day 70+ XP streak.')
  const log = await getOrCreateLog(playerId, istDateStr(now), now)
  if (log.shieldUsed) throw new GameError('Shield already burned today.')
  if (log.overrideUsed) throw new GameError('Override already declared today.')
  await db.player.update({ where: { id: playerId }, data: { shieldsCount: { decrement: 1 } } })
  await db.dailyLog.update({ where: { id: log.id }, data: { shieldUsed: true } })
  await emit({ kind: 'HP', playerId, message: `${player.displayName} burned a Rest Shield — today is protected (0 HP loss, streak intact).` })
}

export async function declareOverride(playerId: string, reason: string, cosignPin: string, now: Date = new Date()) {
  const today = istDateStr(now)
  if (!R.OVERRIDE || istMinutesOfDay(now) >= R.OVERRIDE.CUTOFF_HOUR * 60 + R.OVERRIDE.CUTOFF_MINUTE) {
    throw new GameError('Override window closed — must be declared before 6:00 PM IST.')
  }
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } })
  if (player.lastOverrideAt && daysBetween(istDateStr(player.lastOverrideAt), today) < R.OVERRIDE.COOLDOWN_DAYS) {
    throw new GameError(`Override cooldown: ${R.OVERRIDE.COOLDOWN_DAYS - daysBetween(istDateStr(player.lastOverrideAt), today)} more days until the next one.`)
  }
  const otherId: PId = playerId === 'sobhnath' ? 'umang' : 'sobhnath'
  const cosigner = await db.player.findUniqueOrThrow({ where: { id: otherId } })
  if (!verifyPin(cosignPin, cosigner.pinHash)) throw new GameError(`${cosigner.displayName}'s co-sign PIN is wrong — overrides need brotherly approval.`)
  const log = await getOrCreateLog(playerId, today, now)
  if (log.shieldUsed) throw new GameError('Shield already burned today.')
  if (log.overrideUsed) throw new GameError('Override already declared today.')
  await db.player.update({ where: { id: playerId }, data: { lastOverrideAt: new Date() } })
  await db.dailyLog.update({ where: { id: log.id }, data: { overrideUsed: true, overrideReason: reason } })
  await emit({ kind: 'HP', playerId, message: `${player.displayName} declared a Big-Event Override (co-signed by ${cosigner.displayName}) — day protected.` })
}

// ============================ PUNISHMENTS ============================

export async function verifyPunishment(verifierId: string, punishmentId: number, pin: string, now: Date = new Date()) {
  const p = await db.punishment.findUnique({ where: { id: punishmentId } })
  if (!p) throw new GameError('Punishment ticket not found.')
  if (p.status === 'COMPLETED') throw new GameError('Ticket already completed.')
  const ticketOwner = 'sobhnath' // punishments are Sobhnath's physical debt
  const verifier: PId = ticketOwner === 'sobhnath' ? 'umang' : 'sobhnath'
  if (verifierId !== verifier) throw new GameError(`Only ${verifier === 'umang' ? 'Umang' : 'Sobhnath'} can verify this ticket.`)
  const v = await db.player.findUniqueOrThrow({ where: { id: verifierId } })
  if (!verifyPin(pin, v.pinHash)) throw new GameError('Wrong PIN — reps must be witnessed before sign-off.')
  await db.punishment.update({ where: { id: punishmentId }, data: { status: 'COMPLETED', verifiedAt: now } })
  await emit({ kind: 'PUNISH', playerId: ticketOwner, message: `Punishment ticket (${p.pushups} pushups / ${p.squats} squats...) COMPLETED & verified by ${v.displayName}!` })
}

// ============================ SCHEDULED JOBS (IST) ============================

class GameError extends Error {}

export { GameError }

/** Midnight rollover for `dateStr` (should be yesterday): HP penalty, streak/shields, punishment ticket. */
export async function rollover(dateStr: string, now: Date = new Date()) {
  const metaKey = `rollover:${dateStr}`
  // Claim-then-work: the create is an atomic claim (AppMeta.key is the PK).
  // A concurrent trigger (cron route + state polls) hits the unique conflict and
  // bails immediately instead of double-applying -25 HP / streak increments.
  try {
    await db.appMeta.create({ data: { key: metaKey, value: 'running' } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false // already claimed / done
    throw err
  }
  try {
    const week = await weekOf(dateStr)
    if (!week) {
      // No week row for this date → nothing to roll over. Mark done so we never
      // re-claim it, and report false so callers treat it as a cheap no-op.
      await db.appMeta.update({ where: { key: metaKey }, data: { value: 'done' } })
      return false
    }
    for (const pid of R.PLAYER_IDS) {
      const log = await db.dailyLog.findUnique({ where: { playerId_logDate: { playerId: pid, logDate: dateStr } } })
      const player = await db.player.findUniqueOrThrow({ where: { id: pid } })
      const net = log?.netXp ?? 0
      const protectedDay = !!log && (log.shieldUsed || log.overrideUsed)

      if (!protectedDay) {
        // HP penalty
        if (net < R.WEEKLY.LOW_XP_THRESHOLD) {
          const isS = pid === 'sobhnath'
          const newHp = Math.max(0, (isS ? week.sobhnathHp : week.umangHp) - R.WEEKLY.LOW_XP_PENALTY)
          const ko = newHp <= 0
          // Only the player who actually KO'd writes pvpForfeitedBy — never write
          // it from the stale `week` snapshot, or a KO by the other player earlier
          // in this same loop would be silently overwritten back to null.
          const update = isS
            ? { sobhnathHp: newHp, sobhnathKo: ko, ...(ko ? { pvpForfeitedBy: pid } : {}) }
            : { umangHp: newHp, umangKo: ko, ...(ko ? { pvpForfeitedBy: pid } : {}) }
          await db.week.update({ where: { id: week.id }, data: update })
          if (ko) await emit({ kind: 'PVP', playerId: pid, message: `${player.displayName} HIT 0 HP — KNOCKED OUT! Weekly PvP forfeited.` })
          else await emit({ kind: 'HP', playerId: pid, message: `${player.displayName} scored ${net} XP (<50) — -${R.WEEKLY.LOW_XP_PENALTY} weekly HP (${newHp} left)` })
        }
        // streak / shield
        if (net > R.SHIELDS.STREAK_TARGET_XP) {
          const streak = player.current70Streak + 1
          const shieldGain = streak % R.SHIELDS.EVERY_N_DAYS === 0 ? 1 : 0
          await db.player.update({ where: { id: pid }, data: { current70Streak: streak, shieldsCount: { increment: shieldGain } } })
          if (shieldGain) await emit({ kind: 'XP', playerId: pid, message: `${player.displayName} earned a REST SHIELD (${streak}-day 70+ XP streak)!` })
        } else {
          await db.player.update({ where: { id: pid }, data: { current70Streak: 0 } })
        }
        // Sobhnath's punishment ticket
        if (player.hasPhysicalPunishment && net < 100) {
          const Rx = R.punishmentRemainingXp(net)
          const reps = R.calcPunishmentReps(Rx)
          const exists = await db.punishment.findUnique({ where: { logDate: dateStr } })
          if (!exists) {
            await db.punishment.create({ data: { logDate: dateStr, remainingXp: Rx, ...reps } })
            await emit({ kind: 'PUNISH', playerId: pid, message: `Punishment locked for ${dateStr}: ${reps.pushups} pushups, ${reps.pullups} pullups, ${reps.crunches} crunches, ${reps.squats} squats` })
          }
        }
      }
    }
    // auto-close any watch sessions left running before this rollover
    const openSessions = await db.entSession.findMany({ where: { endedAt: null, startedAt: { lt: istToUtc(dateStr, 1440) } } })
    for (const s of openSessions) {
      const mins = R.round2((istToUtc(dateStr, 1439).getTime() - s.startedAt.getTime()) / 60000)
      const drain = Number.isFinite(mins) ? Math.max(0, mins) : 0 // NaN-safety: Math.max(0, NaN) is still NaN
      await db.entSession.update({ where: { id: s.id }, data: { endedAt: istToUtc(dateStr, 1439), minsSpent: drain } })
      await db.player.update({ where: { id: s.playerId }, data: { entBankMins: { decrement: drain } } })
    }
    await db.appMeta.update({ where: { key: metaKey }, data: { value: 'done' } })
    return true
  } catch (err) {
    // release the claim so a later trigger can retry the whole day
    try {
      await db.appMeta.delete({ where: { key: metaKey } })
    } catch {
      // claim row already gone
    }
    throw err
  }
}

/** Sunday 22:00 IST (or later) — settle weekly PvP for every finished week. */
export async function settleFinishedWeeks(now: Date = new Date()) {
  const today = istDateStr(now)
  const dow = istParts(now).dow
  const minutes = istMinutesOfDay(now)
  const unfinished = await db.week.findMany({ where: { pvpWinner: null } })
  let settled = 0
  for (const week of unfinished) {
    const endOffset = daysBetween(week.startDate, today)
    const weekEnded = endOffset > 6 || (endOffset === 6 && dow === 'Sun' && minutes >= 22 * 60)
    if (!weekEnded) continue
    let winner: string
    if (week.sobhnathKo && week.umangKo) winner = 'draw'
    else if (week.pvpForfeitedBy) winner = week.pvpForfeitedBy === 'sobhnath' ? 'umang' : 'sobhnath'
    else {
      const sums = await db.dailyLog.groupBy({ by: ['playerId'], _sum: { netXp: true }, where: { weekId: week.id } })
      const s = sums.find((x) => x.playerId === 'sobhnath')?._sum.netXp || 0
      const u = sums.find((x) => x.playerId === 'umang')?._sum.netXp || 0
      winner = s > u ? 'sobhnath' : u > s ? 'umang' : 'draw'
    }
    await db.week.update({ where: { id: week.id }, data: { pvpWinner: winner } })
    const msg = winner === 'draw' ? `Weekly PvP ended in a DRAW — nobody pays the stake.` : `WEEKLY PvP SETTLED: ${(await db.player.findUniqueOrThrow({ where: { id: winner } })).displayName} WINS! ${R.STAKE_TEXT}`
    await emit({ kind: 'PVP', message: msg })
    settled++
  }
  return settled
}

/** Opportunistic scheduler — runs due jobs idempotently. Safe to call on every state fetch. */
export async function runDueJobs(now: Date = new Date()) {
  const jobs: string[] = []
  // Sweep backwards up to 10 days so multi-day downtime doesn't skip rollovers
  // forever. Oldest-first (chronological) so streak increments/resets land in
  // the right order, and no early break: the per-date claim inside rollover()
  // makes already-done / missing-week days a fast no-op (returns false).
  const gameStart = (await db.appMeta.findUnique({ where: { key: 'game_start_date' } }))?.value || null
  for (let i = 10; i >= 1; i--) {
    const date = istDateOffset(-i, now)
    if (gameStart && date < gameStart) continue // before first boot — not a played day
    const ok = await rollover(date, now)
    if (ok) jobs.push(`rollover:${date}`)
  }
  const settled = await settleFinishedWeeks(now)
  if (settled) jobs.push(`settlement x${settled}`)
  await ensureWeek(now)
  return jobs
}

// ============================ FULL STATE ============================

export async function getFullState(now: Date = new Date(), req?: Request): Promise<GameState> {
  await ensureSeed()
  const jobs = await runDueJobs(now)
  void jobs
  const week = await ensureWeek(now)
  const today = istDateStr(now)
  const players = await db.player.findMany()
  const logsToday = await db.dailyLog.findMany({ where: { logDate: today } })
  // Rebuild exactly what the vault credited today, event by event:
  // QUEST rows are stored raw and were credited (delta × log.xpMultiplier
  // [lockdown-aware]) × player.entMultiplier; SNITCH_GAIN / BOSS_LOOT rows
  // were credited × player.entMultiplier. Negative rows never credit the vault.
  const earnedTodayRows = await db.ledger.findMany({ where: { logDate: today, deltaXp: { gt: 0 } } })
  const earnedTodayMap = new Map<string, number>()
  for (const row of earnedTodayRows) {
    const pid = row.playerId as PId
    const playerMult = players.find((p) => p.id === pid)?.entMultiplier ?? 1
    const mult = row.eventType === 'QUEST'
      ? (logsToday.find((l) => l.playerId === pid)?.xpMultiplier ?? 1) * playerMult
      : playerMult
    earnedTodayMap.set(pid, R.round2((earnedTodayMap.get(pid) || 0) + row.deltaXp * mult))
  }
  const weeklySums = await db.dailyLog.groupBy({ by: ['playerId'], _sum: { netXp: true }, where: { weekId: week.id } })
  const totalSums = await db.dailyLog.groupBy({ by: ['playerId'], _sum: { netXp: true }, where: { playerId: { in: R.PLAYER_IDS } } })
  const openSessions = await db.entSession.findMany({ where: { endedAt: null } })
  const feed = await db.ledger.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })
  const punishments = await db.punishment.findMany({ orderBy: { logDate: 'desc' }, take: 10 })
  const p = istParts(now)
  const me = await currentPlayerId(req)

  const playerStates = Object.fromEntries(
    players.map((player) => {
      const pid = player.id as PId
      const log = logsToday.find((l) => l.playerId === pid)
      const weeklyXp = weeklySums.find((x) => x.playerId === pid)?._sum.netXp || 0
      const totalXp = totalSums.find((x) => x.playerId === pid)?._sum.netXp || 0
      return [
        pid,
        {
          id: pid,
          displayName: player.displayName,
          entMultiplier: player.entMultiplier,
          shieldsCount: player.shieldsCount,
          streak: player.current70Streak,
          entBankMins: player.entBankMins,
          entEarnedToday: earnedTodayMap.get(pid) ?? 0,
          hasPhysicalPunishment: player.hasPhysicalPunishment,
          lastOverrideAt: player.lastOverrideAt?.toISOString() || null,
          todayLog: log
            ? toLogView(log)
            : {
                logDate: today, studyQuestText: null, workoutQuestText: null, skillQuestText: null, questsLocked: false,
                studyMode: 'questions' as R.StudyMode, studyQuestions: 0, studyHours: 0, workoutMins: 0, skillMins: 0,
                questXp: 0, netXp: 0, xpMultiplier: 1, isLockdown: false, shieldUsed: false, overrideUsed: false,
                overrideReason: null, bossHitApplied: false,
              },
          weeklyXp: R.round2(weeklyXp),
          totalXp: R.round2(totalXp),
          level: R.levelFromTotalXp(totalXp),
          watching: openSessions.some((s) => s.playerId === pid),
          watchingSince: openSessions.find((s) => s.playerId === pid)?.startedAt.toISOString() ?? null,
        },
      ]
    }),
  ) as GameState['players']

  const pvpDaysLeft = daysBetween(today, week.startDate) // days since monday
  void pvpDaysLeft

  return {
    ist: { now: `${String(p.h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}:${String(p.s).padStart(2, '0')}`, date: today, dow: p.dow, minutes: p.minutes },
    week: {
      id: week.id, startDate: week.startDate, bossName: week.bossName, bossMaxHp: week.bossMaxHp,
      bossCurrentHp: week.bossCurrentHp, bossDefeated: week.bossDefeated, sobhnathHp: week.sobhnathHp,
      umangHp: week.umangHp, sobhnathKo: week.sobhnathKo, umangKo: week.umangKo,
      pvpForfeitedBy: week.pvpForfeitedBy, pvpWinner: week.pvpWinner, pvpStakeSettled: week.pvpStakeSettled,
    },
    players: playerStates,
    feed: feed.map((f) => ({ id: Number(f.id), playerId: f.playerId, deltaXp: f.deltaXp, eventType: f.eventType, note: f.note, createdAt: f.createdAt.toISOString(), logDate: f.logDate })),
    punishments: punishments.map((x) => ({ id: x.id, logDate: x.logDate, remainingXp: x.remainingXp, pushups: x.pushups, pullups: x.pullups, crunches: x.crunches, squats: x.squats, status: x.status, verifiedAt: x.verifiedAt?.toISOString() || null })),
    deadlines: {
      questLockMins: minutesUntilIST(R.QUEST_LOCK.CUTOFF_HOUR, R.QUEST_LOCK.CUTOFF_MINUTE, now),
      overrideCutoffMins: minutesUntilIST(R.OVERRIDE.CUTOFF_HOUR, R.OVERRIDE.CUTOFF_MINUTE, now),
      // after the Sunday 22:00 settlement the week is over — don't let the
      // countdown wrap around to next Monday's 22:00
      pvpEndMins: p.dow === 'Sun' && p.minutes >= 22 * 60 ? 0 : minutesUntilIST(22, 0, now),
      newWeekMins: minutesUntilIST(24, 0, now),
      questLockPassed: istMinutesOfDay(now) >= R.QUEST_LOCK.CUTOFF_HOUR * 60 + R.QUEST_LOCK.CUTOFF_MINUTE,
      overrideCutoffPassed: istMinutesOfDay(now) >= R.OVERRIDE.CUTOFF_HOUR * 60,
    },
    me: (me as PId) || null,
  }
}

export async function changePin(playerId: string, currentPin: string, newPin: string) {
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId } })
  if (!verifyPin(currentPin, player.pinHash)) throw new GameError('Current PIN is wrong.')
  if (!/^\d{4}$/.test(newPin)) throw new GameError('PIN must be exactly 4 digits.')
  await db.player.update({ where: { id: playerId }, data: { pinHash: hashPin(newPin) } })
}
