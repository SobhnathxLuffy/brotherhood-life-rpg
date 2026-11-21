import type { StudyMode } from '@/engine/rules'

export type PId = 'sobhnath' | 'umang'

export interface DailyLogView {
  logDate: string
  studyQuestText: string | null
  workoutQuestText: string | null
  skillQuestText: string | null
  questsLocked: boolean
  studyMode: StudyMode
  studyQuestions: number
  studyHours: number
  workoutMins: number
  skillMins: number
  questXp: number
  netXp: number
  xpMultiplier: number
  isLockdown: boolean
  shieldUsed: boolean
  overrideUsed: boolean
  overrideReason: string | null
  bossHitApplied: boolean
}

export interface PlayerState {
  id: PId
  displayName: string
  entMultiplier: number
  shieldsCount: number
  streak: number
  entBankMins: number
  entEarnedToday: number
  hasPhysicalPunishment: boolean
  lastOverrideAt: string | null
  todayLog: DailyLogView
  weeklyXp: number
  totalXp: number
  level: { level: number; title: string; progress: number }
  watching: boolean
  /** ISO timestamp of the open watch session — lets the vault stopwatch survive reloads. */
  watchingSince: string | null
}

export interface FeedEntry {
  id: number
  playerId: string
  deltaXp: number
  eventType: string
  note: string | null
  createdAt: string
  logDate: string
}

export interface PunishmentView {
  id: number
  logDate: string
  remainingXp: number
  pushups: number
  pullups: number
  crunches: number
  squats: number
  status: string
  verifiedAt: string | null
}

export interface WeekState {
  id: number
  startDate: string
  bossName: string
  bossMaxHp: number
  bossCurrentHp: number
  bossDefeated: boolean
  sobhnathHp: number
  umangHp: number
  sobhnathKo: boolean
  umangKo: boolean
  pvpForfeitedBy: string | null
  pvpWinner: string | null
  pvpStakeSettled: boolean
}

export interface GameState {
  ist: { now: string; date: string; dow: string; minutes: number }
  week: WeekState
  players: Record<PId, PlayerState>
  feed: FeedEntry[]
  punishments: PunishmentView[]
  deadlines: {
    questLockMins: number
    overrideCutoffMins: number
    pvpEndMins: number
    newWeekMins: number
    questLockPassed: boolean
    overrideCutoffPassed: boolean
  }
  me: PId | null
}

export interface SocketEvent {
  kind: 'XP' | 'BOSS_HIT' | 'BOSS_LOOT' | 'SNITCH' | 'HP' | 'ENT' | 'PVP' | 'PUNISH' | 'LOCK' | 'WEEK'
  playerId?: string
  amount?: number
  message?: string
  [k: string]: unknown
}
