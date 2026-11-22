/**
 * BROTHERHOOD LIFE RPG — IMMUTABLE GAME RULES
 * ============================================
 * Single source of truth for every number in the game.
 * Pure functions only — no DB, no I/O — so frontend previews and
 * backend validation are 100% deterministic.
 */

export type PlayerId = 'sobhnath' | 'umang'
export const PLAYER_IDS: PlayerId[] = ['sobhnath', 'umang']

// ---------- Daily quest XP (100 XP base cap, half-rate overtime) ----------

export const STUDY = { QUEST_CAP: 30, QUEST_RATE: 2, QUEST_OT_RATE: 1, HOUR_CAP: 4, HOUR_RATE: 15, HOUR_OT_RATE: 7.5 }
export const WORKOUT = { MIN_MINS: 30, BASE_XP: 25, OT_BLOCK_MINS: 15, OT_XP_PER_BLOCK: 6.25 }
export const SKILL = { BLOCK_MINS: 15, BASE_BLOCKS: 3, RATE: 5, OT_RATE: 2.5 }

export type StudyMode = 'questions' | 'hours'

export function calcStudyXP(mode: StudyMode, value: number): number {
  if (mode === 'questions') {
    const base = Math.min(value, STUDY.QUEST_CAP) * STUDY.QUEST_RATE
    const overtime = Math.max(0, value - STUDY.QUEST_CAP) * STUDY.QUEST_OT_RATE
    return base + overtime
  }
  const base = Math.min(value, STUDY.HOUR_CAP) * STUDY.HOUR_RATE
  const overtime = Math.max(0, value - STUDY.HOUR_CAP) * STUDY.HOUR_OT_RATE
  return base + overtime
}

export function calcWorkoutXP(minutes: number): number {
  if (minutes < WORKOUT.MIN_MINS) return 0
  const overtimeBlocks = Math.floor((minutes - WORKOUT.MIN_MINS) / WORKOUT.OT_BLOCK_MINS)
  return WORKOUT.BASE_XP + overtimeBlocks * WORKOUT.OT_XP_PER_BLOCK
}

export function calcSkillXP(minutes: number): number {
  const blocks = Math.floor(minutes / SKILL.BLOCK_MINS)
  const base = Math.min(blocks, SKILL.BASE_BLOCKS) * SKILL.RATE
  const overtime = Math.max(0, blocks - SKILL.BASE_BLOCKS) * SKILL.OT_RATE
  return base + overtime
}

export function calcQuestXP(log: { studyMode: StudyMode; studyQuestions: number; studyHours: number; workoutMins: number; skillMins: number }): number {
  const study = calcStudyXP(log.studyMode, log.studyMode === 'questions' ? log.studyQuestions : log.studyHours)
  return round2(study + calcWorkoutXP(log.workoutMins) + calcSkillXP(log.skillMins))
}

// ---------- Lockdown multiplier ----------
export const LOCKDOWN_MULT = 0.5

// ---------- Late quest lock ----------
// Missed the 23:30 nightly lock? You may still write TODAY's quests late, but
// everything logged that day pays a 20% XP toll. Stacks multiplicatively with
// the lockdown multiplier (0.5 × 0.8 = 0.4).
export const LATE_QUEST_MULT = 0.8

// ---------- Entertainment economy ----------
export function entMinutesEarned(effectiveXp: number, entMultiplier: number): number {
  return effectiveXp > 0 ? round2(effectiveXp * entMultiplier) : 0
}

// ---------- Sobhnath's physical punishment ----------
// gamee.pdf specified pullups as "⅗" = 0.6 per XP short (restored 2026-11-22 —
// the plan had wrongly flattened it to 0.5). Only Sobhnath owes physical reps
// (hasPhysicalPunishment), so this multiplier affects him alone.
export const PUNISHMENT = { PUSHUP_MULT: 1, PULLUP_MULT: 0.6, CRUNCH_MULT: 1, SQUAT_MULT: 2 }
export function calcPunishmentReps(R: number) {
  return {
    pushups: round2(R * PUNISHMENT.PUSHUP_MULT),
    pullups: round2(R * PUNISHMENT.PULLUP_MULT),
    crunches: round2(R * PUNISHMENT.CRUNCH_MULT),
    squats: round2(R * PUNISHMENT.SQUAT_MULT),
  }
}
export function punishmentRemainingXp(netXp: number): number {
  return Math.max(0, 100 - Math.max(0, netXp))
}

// ---------- Anti-cheat escalation state machine ----------
export const SNITCH = {
  REWARD_XP: 30,
  DAILY_XP_FLOOR: -30,
  COOLDOWN_MINUTES: 60,
  MAX_PER_CATCHER_PER_DAY: 5,
}
export function snitchStealLoss(currentNetXp: number): number {
  // Cheater loses up to 30 XP, floored strictly at -30.
  return Math.max(0, Math.min(SNITCH.REWARD_XP, currentNetXp - SNITCH.DAILY_XP_FLOOR))
}

// ---------- Shared Co-op Boss ----------
export const BOSS = { MAX_HP: 700, HIT_DMG: 140, TRIGGER_XP: 70, LOOT_XP: 70 }

// ---------- Weekly PvP / HP ----------
export const WEEKLY = { MAX_HP: 100, LOW_XP_THRESHOLD: 50, LOW_XP_PENALTY: 25 }

// ---------- Shields & streaks ----------
export const SHIELDS = { STREAK_TARGET_XP: 70, EVERY_N_DAYS: 5 }

// ---------- Overrides ----------
export const OVERRIDE = { CUTOFF_HOUR: 18, CUTOFF_MINUTE: 0, COOLDOWN_DAYS: 14 }

// ---------- Quest lock ----------
export const QUEST_LOCK = { CUTOFF_HOUR: 23, CUTOFF_MINUTE: 30, PROMPT_HOUR: 22, PROMPT_MINUTE: 30 }

// ---------- RPG flavour ----------
const LEVEL_TITLES = ['Rookie', 'Novice', 'Apprentice', 'Adept', 'Grinder', 'Specialist', 'Veteran', 'Elite', 'Master', 'Grandmaster', 'Legend']
export const LEVEL_STEP_XP = 500
export function levelFromTotalXp(totalXp: number): { level: number; title: string; progress: number } {
  const level = Math.floor(Math.max(0, totalXp) / LEVEL_STEP_XP) + 1
  const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)]
  const progress = Math.round(((Math.max(0, totalXp) % LEVEL_STEP_XP) / LEVEL_STEP_XP) * 100)
  return { level, title, progress }
}

export const BOSS_NAMES = [
  'Procrastination Titan', 'Doomscroll Hydra', 'Distraction Demon King', 'The Scroll Reaper',
  'Couch Potato Golem', 'Infinite Feed Leviathan', 'Notification Wyrm', 'Zero-Focus Lich',
  'The Great Unfocused', 'Short-Form Basilisk',
]

export const VIOLATIONS = [
  { id: 'youtube_no_timer', label: 'YouTube / OTT without timer running' },
  { id: 'faked_reps', label: 'Faked workout / punishment reps' },
  { id: 'dodged_punishment', label: 'Dodged a pending punishment' },
  { id: 'quest_fakery', label: 'Faked quest progress / JEE import' },
  { id: 'other', label: 'Other (explain in note)' },
] as const

export const STAKE_TEXT = 'Loser buys the winner a ₹50 treat (egg roll / shake / snack) OR does their household chore for 2 days'

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function fmtClock(totalMins: number): string {
  const sign = totalMins < 0 ? '-' : ''
  const abs = Math.abs(totalMins)
  const h = Math.floor(abs / 60)
  const m = Math.floor(abs % 60)
  const s = Math.round((abs - Math.floor(abs)) * 60)
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
