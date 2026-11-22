'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, BookOpen, Dumbbell, Eye, FileJson, Hammer, Lock, Undo2, UserRound } from 'lucide-react'
import type { GameState, PId, PlayerState } from '@/lib/types'
import {
  LATE_QUEST_MULT,
  LOCKDOWN_MULT,
  QUEST_LOCK,
  SKILL,
  STUDY,
  WORKOUT,
  calcQuestXP,
  calcSkillXP,
  calcStudyXP,
  calcWorkoutXP,
  levelFromTotalXp,
  round2,
  type StudyMode,
} from '@/engine/rules'
import { apiPost } from '@/components/game/live'
import {
  ActionButton,
  Countdown,
  GameBar,
  HudPanel,
  PLAYER_THEME,
  SectionTitle,
  StatChip,
} from '@/components/game/ui'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// ---------- types ----------

type QuestDeltaBody =
  | { studyMode: StudyMode }
  | { studyQuestions: number }
  | { studyHours: number }
  | { workoutMins: number }
  | { skillMins: number }

interface ImportResult {
  ok: boolean
  imported: number
  skipped: number
  newQuestions: number
  newHours: number
}

interface RawSession {
  id?: string | number
  questions?: number
  total_questions?: number
  time_seconds?: number
  total_time_seconds?: number
}

// ---------- localStorage guards (client-only, crash-safe) ----------

function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // private mode / storage disabled — prompt guard degrades gracefully
  }
}

function lockedTomorrowKey(date: string): string {
  return `lockedTomorrow:${date}`
}

function lockPromptKey(date: string): string {
  return `lockPrompt:${date}`
}

// ---------- optimistic updates (instant game feel — server reconciles right after) ----------

/** Day multiplier including the late-lock toll, mirroring the server's effectiveMult. */
function dayMult(log: PlayerState['todayLog']): number {
  return log.xpMultiplier * (log.lateQuests ? LATE_QUEST_MULT : 1)
}

function deltaLabel(delta: QuestDeltaBody): string {
  if ('studyMode' in delta) return `mode → ${delta.studyMode}`
  if ('studyQuestions' in delta) return `+${delta.studyQuestions} questions`
  if ('studyHours' in delta) return `+${delta.studyHours}h study`
  if ('workoutMins' in delta) return `+${delta.workoutMins}m workout`
  return `+${delta.skillMins}m skill`
}

/** Apply a quest delta to the cached state immediately; the refetch lands the server truth. */
function optimisticQuestDelta(qc: ReturnType<typeof useQueryClient>, pid: PId, delta: QuestDeltaBody) {
  qc.setQueryData<GameState>(['game-state'], (old) => {
    if (!old || !old.players[pid]) return old
    const me = old.players[pid]
    const log = me.todayLog
    const next = {
      studyMode: ('studyMode' in delta ? delta.studyMode : log.studyMode) as StudyMode,
      studyQuestions: 'studyQuestions' in delta ? Math.max(0, round2(log.studyQuestions + delta.studyQuestions)) : log.studyQuestions,
      studyHours: 'studyHours' in delta ? Math.max(0, round2(log.studyHours + delta.studyHours)) : log.studyHours,
      workoutMins: 'workoutMins' in delta ? Math.max(0, log.workoutMins + delta.workoutMins) : log.workoutMins,
      skillMins: 'skillMins' in delta ? Math.max(0, log.skillMins + delta.skillMins) : log.skillMins,
    }
    const newQuestXp = calcQuestXP(next)
    const mult = dayMult(log)
    const others = round2(log.netXp - round2(log.questXp * mult)) // snitch/boss portion stays fixed
    const newNetXp = round2(newQuestXp * mult + others)
    const effDelta = round2(newQuestXp * mult - round2(log.questXp * mult))
    const credited = effDelta > 0 ? round2(effDelta * me.entMultiplier) : 0
    const totalXp = Math.max(0, round2(me.totalXp + effDelta))
    return {
      ...old,
      players: {
        ...old.players,
        [pid]: {
          ...me,
          entBankMins: round2(me.entBankMins + credited),
          weeklyXp: round2(me.weeklyXp + effDelta),
          totalXp,
          level: levelFromTotalXp(totalXp),
          todayLog: {
            ...log,
            ...next,
            questXp: newQuestXp,
            netXp: newNetXp,
            canUndo: true,
            undoLabel: deltaLabel(delta),
          },
        },
      },
    }
  })
}

// ---------- shared: nightly lock form ----------

function QuestField({ label, value, onChange, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        maxLength={200}
        className="resize-none bg-foreground/[0.04] text-sm"
      />
    </label>
  )
}

function QuestLockForm({ date, late, onLocked }: { date: string; late?: boolean; onLocked: () => void }) {
  const qc = useQueryClient()
  const [study, setStudy] = useState('')
  const [workout, setWorkout] = useState('')
  const [skill, setSkill] = useState('')
  const [busy, setBusy] = useState(false)

  const ready = study.trim().length > 0 && workout.trim().length > 0 && skill.trim().length > 0

  async function lock() {
    setBusy(true)
    try {
      await apiPost('/api/quests/lock', { study: study.trim(), workout: workout.trim(), skill: skill.trim(), ...(late ? { target: 'today' } : {}) })
      if (!late) {
        lsSet(lockedTomorrowKey(date), '1')
        lsSet(lockPromptKey(date), '1')
      }
      await qc.invalidateQueries({ queryKey: ['game-state'] })
      toast.success(late
        ? "Today's quests locked late — 0.8x XP toll active. Salvage mode engaged."
        : "Tomorrow's quests locked — no edits allowed. Sleep like a monk.")
      onLocked()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Quest lock failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <QuestField label="Study quest" value={study} onChange={setStudy} placeholder="e.g. 25 MCQs of Rotational Motion + revise error log" />
      <QuestField label="Workout quest" value={workout} onChange={setWorkout} placeholder="e.g. Push day — 4 sets incl. 30 pushups" />
      <QuestField label="Skill quest" value={skill} onChange={setSkill} placeholder="e.g. 45m practice — new scale + metronome" />
      <ActionButton tone={late ? 'crimson' : 'gold'} size="lg" className="w-full" disabled={!ready || busy} onClick={() => { void lock() }}>
        <Lock className="mr-1.5 inline h-4 w-4" aria-hidden />
        {late ? 'Lock today (late — 0.8x XP)' : 'Lock quests'}
      </ActionButton>
    </div>
  )
}

// ---------- A. lock panel ----------

function LockPanel({ state, lockedOk, onLocked }: { state: GameState; lockedOk: boolean; onLocked: () => void }) {
  const passed = state.deadlines.questLockPassed
  return (
    <HudPanel glow={passed ? 'crimson' : 'gold'}>
      <SectionTitle
        right={
          lockedOk ? (
            <StatChip tone="emerald" label="tomorrow" value="locked" />
          ) : passed ? (
            <StatChip tone="crimson" pulse label="window" value="closed" />
          ) : undefined
        }
      >
        Lock tomorrow&apos;s quests
      </SectionTitle>

      {passed ? (
        <div className="flex items-start gap-2 rounded-lg border border-crimson/50 bg-crimson/10 px-3 py-2.5 text-xs font-semibold leading-relaxed text-crimson lockdown-flash">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>LOCK WINDOW CLOSED (11:30 PM IST) — lock tomorrow before sleeping</span>
        </div>
      ) : lockedOk ? (
        <div className="flex items-center gap-2 rounded-lg border border-umang/40 bg-umang/10 px-3 py-2 text-xs font-semibold text-umang">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          Tomorrow&apos;s quests are locked — no edits until the daily reset.
        </div>
      ) : (
        <>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            Write tomorrow&apos;s 3 quests tonight — auto-closes in{' '}
            <Countdown minsFromServer={state.deadlines.questLockMins} className="font-semibold text-gold" />.
            Locked text becomes read-only at dawn.
          </p>
          <QuestLockForm date={state.ist.date} onLocked={onLocked} />
        </>
      )}
    </HudPanel>
  )
}

// ---------- A2. late rescue panel (missed last night's lock) ----------

function LateRescuePanel({ me, onLocked }: { me: PlayerState; onLocked: () => void }) {
  const log = me.todayLog
  return (
    <HudPanel glow="crimson">
      <SectionTitle
        right={<StatChip tone="crimson" pulse label="xp toll" value={`×${LATE_QUEST_MULT}`} />}
      >
        Late rescue — today&apos;s quests
      </SectionTitle>
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-gold/45 bg-gold/10 px-3 py-2.5 text-xs font-semibold leading-relaxed text-gold">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          No quests were locked for today (missed last night&apos;s window?). You can still write them now —
          but everything logged today earns only <span className="num font-bold">×{LATE_QUEST_MULT}</span> XP
          {log.isLockdown ? ' (stacks with the ×0.5 lockdown: ×0.4 total)' : ''}. Plan earlier tonight.
        </span>
      </div>
      <QuestLockForm date={me.todayLog.logDate} late onLocked={onLocked} />
    </HudPanel>
  )
}

// ---------- A3. brother's quests panel (revealed after lock) ----------

function BrotherQuestsPanel({ state }: { state: GameState }) {
  const meId = state.me
  if (!meId) return null
  const otherId: PId = meId === 'sobhnath' ? 'umang' : 'sobhnath'
  const other = state.players[otherId]
  if (!other) return null
  const log = other.todayLog
  const theme = PLAYER_THEME[otherId]
  const quests: Array<{ icon: ReactNode; label: string; text: string | null }> = [
    { icon: <BookOpen className="h-3.5 w-3.5" />, label: 'Study', text: log.studyQuestText },
    { icon: <Dumbbell className="h-3.5 w-3.5" />, label: 'Workout', text: log.workoutQuestText },
    { icon: <Hammer className="h-3.5 w-3.5" />, label: 'Skill', text: log.skillQuestText },
  ]

  return (
    <HudPanel glow={theme.bar}>
      <SectionTitle
        right={log.questsLocked ? <StatChip tone="emerald" icon={<Eye className="h-3 w-3" />} label="revealed" value="locked" /> : <StatChip tone="crimson" icon={<Lock className="h-3 w-3" />} label="sealed" value="not locked" />}
      >
        <span className="inline-flex items-center gap-1.5">
          <UserRound className="h-4 w-4" aria-hidden />
          {other.displayName}&apos;s quests
        </span>
      </SectionTitle>
      {log.questsLocked ? (
        <div className="space-y-2">
          {quests.map((q) => (
            <div key={q.label} className="flex items-start gap-2 rounded-lg border border-border/70 bg-foreground/[0.03] px-3 py-2">
              <span className="mt-0.5 text-muted-foreground" aria-hidden>{q.icon}</span>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground/70">{q.label}</p>
                <p className="text-xs italic leading-relaxed text-foreground/90">&ldquo;{q.text ?? '—'}&rdquo;</p>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/70">
            Locked for {log.logDate}{log.lateQuests ? ` — late lock, ×${LATE_QUEST_MULT} XP toll` : ''}. Hold each other accountable.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-foreground/[0.03] px-3 py-3 text-xs font-semibold text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          Sealed until {other.displayName} locks today&apos;s quests — no peeking before the plan is committed.
        </div>
      )}
    </HudPanel>
  )
}

// ---------- B. quest card shell ----------

function QuestCard({ glow, icon, title, baseXp, questText, questsLocked, lateQuests, logDate, children }: {
  glow: 'cyan' | 'emerald' | 'gold'
  icon: ReactNode
  title: string
  baseXp: number
  questText: string | null
  questsLocked: boolean
  lateQuests?: boolean
  logDate: string
  children: ReactNode
}) {
  return (
    <HudPanel glow={glow}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground" aria-hidden>{icon}</span>
          <h3 className="font-display text-sm font-extrabold uppercase tracking-[0.18em]">{title}</h3>
        </div>
        <StatChip label="base" value={`${baseXp} XP`} />
      </div>

      {questsLocked ? (
        <div className="mb-3 border-l-2 border-primary/40 pl-2.5">
          <p className="text-xs italic leading-relaxed text-muted-foreground">&ldquo;{questText ?? '—'}&rdquo;</p>
          <p className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">
            Read-only — locked {logDate}
            {lateQuests && <span className="rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-gold normal-case tracking-normal">late · ×{LATE_QUEST_MULT} XP</span>}
          </p>
        </div>
      ) : (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-gold/35 bg-gold/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-gold">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Unplanned — no quest locked last night
        </div>
      )}

      {children}
    </HudPanel>
  )
}

// ---------- JEE bridge (Sobhnath only) ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function extractSessions(raw: unknown): RawSession[] {
  if (Array.isArray(raw)) return raw.filter(isRecord) as RawSession[]
  if (isRecord(raw)) {
    if (Array.isArray(raw.sessions)) return raw.sessions.filter(isRecord) as RawSession[]
    const data: unknown = raw.data
    if (isRecord(data) && Array.isArray(data.sessions)) return data.sessions.filter(isRecord) as RawSession[]
  }
  return []
}

function JeeBridge() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)

  async function importFile(file: File) {
    setBusy(true)
    try {
      let raw: unknown
      try {
        raw = JSON.parse(await file.text())
      } catch {
        throw new Error('Invalid JSON — export a fresh file from jee-study-app.')
      }
      const sessions = extractSessions(raw)
        .map((s) => ({
          id: s.id,
          questions: Number(s.questions ?? s.total_questions ?? 0),
          timeSeconds: Number(s.time_seconds ?? s.total_time_seconds ?? 0),
        }))
        .filter((s) => s.questions > 0 || s.timeSeconds > 0)
      if (sessions.length === 0) throw new Error('No study sessions with data found in the JSON export.')
      // time_seconds alias keeps the server contract happy (it reads snake_case)
      const payload = sessions.map((s) => ({ ...s, time_seconds: s.timeSeconds }))
      const res = await apiPost<ImportResult>('/api/quests/import', { sessions: payload })
      const xp = round2(res.newQuestions * STUDY.QUEST_RATE)
      const dupNote = res.skipped > 0 ? ` — ${res.skipped} duplicate${res.skipped === 1 ? '' : 's'} skipped` : ''
      toast.success(`Imported ${res.imported} session${res.imported === 1 ? '' : 's'} (+${xp} XP)${dupNote}`)
      await qc.invalidateQueries({ queryKey: ['game-state'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'JEE import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        <FileJson className="h-3.5 w-3.5" aria-hidden />
        JEE bridge — auto-import study sessions
      </p>
      <div
        role="button"
        tabIndex={0}
        aria-label="Import jee-study-app JSON export"
        onClick={() => { if (!busy) inputRef.current?.click() }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) void importFile(f)
        }}
        className={cn(
          'cursor-pointer rounded-lg border border-dashed px-3 py-4 text-center text-[11px] transition-colors',
          dragOver
            ? 'border-primary bg-primary/10 text-primary hud-glow-ember'
            : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        {busy ? 'Parsing export…' : 'Drop jee-study-app JSON export or click to pick'}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importFile(f)
          e.target.value = ''
        }}
      />
      <p className="mt-1.5 text-[10px] text-muted-foreground/70">
        Counts {STUDY.QUEST_RATE} XP per question · deduped forever by session id
      </p>
    </div>
  )
}

// ---------- study card (60 base XP) ----------

function StudyCard({ me, post, busy }: { me: PlayerState; post: (body: QuestDeltaBody, okMsg: string) => Promise<void>; busy: boolean }) {
  const log = me.todayLog
  const isQuestions = log.studyMode === 'questions'
  const value = isQuestions ? log.studyQuestions : log.studyHours
  const cap = isQuestions ? STUDY.QUEST_CAP : STUDY.HOUR_CAP
  const overtime = Math.max(0, round2(value - cap))
  const xp = calcStudyXP(log.studyMode, value)
  const unit = isQuestions ? 'Q' : 'h'

  return (
    <QuestCard
      glow="cyan"
      icon={<BookOpen className="h-4 w-4" />}
      title="Study"
      baseXp={60}
      questText={log.studyQuestText}
      questsLocked={log.questsLocked}
      lateQuests={log.lateQuests}
      logDate={log.logDate}
    >
      {/* mode toggle */}
      <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Study tracking mode">
        {(['questions', 'hours'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={log.studyMode === m}
            disabled={busy || log.studyMode === m}
            onClick={() => { void post({ studyMode: m }, m === 'questions' ? 'Tracking QUESTIONS tonight' : 'Tracking HOURS tonight') }}
            className={cn(
              'rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors',
              log.studyMode === m
                ? 'border-primary/60 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {m === 'questions' ? 'Questions' : 'Hours'}
          </button>
        ))}
      </div>

      {/* increment buttons */}
      <div className="flex flex-wrap gap-1.5">
        {(isQuestions ? [1, 5, 10] : [0.5, 1]).map((n) => (
          <ActionButton
            key={n}
            tone="cyan"
            size="sm"
            className="num"
            disabled={busy}
            onClick={() => {
              void (isQuestions
                ? post({ studyQuestions: n }, `+${n} questions logged — grinding.`)
                : post({ studyHours: n }, `+${n}h study logged — grinding.`))
            }}
          >
            {isQuestions ? `+${n} Q` : `+${n}h`}
          </ActionButton>
        ))}
      </div>

      {/* progress + live XP preview */}
      <div className="mt-3 space-y-1.5">
        <GameBar value={value} max={cap} overtime={overtime} tone="cyan" label={`${round2(value)} / ${cap}${unit}`} />
        <p className="text-[11px] text-muted-foreground">
          Study XP now:{' '}
          <motion.span
            key={xp}
            initial={{ opacity: 0.3, scale: 1.35 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-block num font-bold text-primary text-glow-ember"
          >
            {round2(xp)}
          </motion.span>
          <span className="num"> / 60</span>
          {overtime > 0 && <span className="ml-1.5 font-semibold text-gold">+ half-rate overtime</span>}
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          {isQuestions
            ? `${STUDY.QUEST_RATE} XP per question up to ${STUDY.QUEST_CAP}Q — overtime pays ${STUDY.QUEST_OT_RATE} XP.`
            : `${STUDY.HOUR_RATE} XP per hour up to ${STUDY.HOUR_CAP}h — overtime pays ${STUDY.HOUR_OT_RATE} XP.`}
        </p>
      </div>

      {me.id === 'sobhnath' && <JeeBridge />}
    </QuestCard>
  )
}

// ---------- workout card (25 base XP) ----------

function WorkoutCard({ me, post, busy }: { me: PlayerState; post: (body: QuestDeltaBody, okMsg: string) => Promise<void>; busy: boolean }) {
  const log = me.todayLog
  const mins = log.workoutMins
  const xp = calcWorkoutXP(mins)
  const remaining = Math.max(0, round2(WORKOUT.MIN_MINS - mins))

  return (
    <QuestCard
      glow="emerald"
      icon={<Dumbbell className="h-4 w-4" />}
      title="Workout"
      baseXp={WORKOUT.BASE_XP}
      questText={log.workoutQuestText}
      questsLocked={log.questsLocked}
      lateQuests={log.lateQuests}
      logDate={log.logDate}
    >
      <div className="flex flex-wrap gap-1.5">
        <ActionButton
          tone="gold"
          size="sm"
          className="num"
          disabled={busy}
          onClick={() => { void post({ workoutMins: 30 }, '+30m workout logged — 25 XP zone.') }}
        >
          <span title="25 XP unlocks at 30+">+30m</span>
        </ActionButton>
        <ActionButton tone="ghost" size="sm" className="num" disabled={busy} onClick={() => { void post({ workoutMins: 5 }, '+5m workout logged') }}>
          +5m
        </ActionButton>
        <ActionButton tone="ghost" size="sm" className="num" disabled={busy} onClick={() => { void post({ workoutMins: 15 }, '+15m workout logged') }}>
          +15m
        </ActionButton>
      </div>

      <div className="mt-3 space-y-1.5">
        <GameBar
          value={mins}
          max={WORKOUT.MIN_MINS}
          overtime={Math.max(0, mins - WORKOUT.MIN_MINS)}
          tone="emerald"
          label={`${round2(mins)} / ${WORKOUT.MIN_MINS}m`}
        />
        <p className="text-[11px] text-muted-foreground">
          Workout XP now:{' '}
          <motion.span
            key={xp}
            initial={{ opacity: 0.3, scale: 1.35 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-block num font-bold text-umang text-glow-emerald"
          >
            {round2(xp)}
          </motion.span>
          <span className="num"> / {WORKOUT.BASE_XP}</span>
          {mins >= WORKOUT.MIN_MINS && (
            <span className="ml-1.5 font-semibold text-gold">+ {WORKOUT.OT_XP_PER_BLOCK} XP per extra {WORKOUT.OT_BLOCK_MINS}m</span>
          )}
        </p>
        {mins < WORKOUT.MIN_MINS && (
          <p className="text-[11px] font-semibold text-crimson">
            No XP yet — <span className="num">{remaining}m</span> to unlock
          </p>
        )}
      </div>
    </QuestCard>
  )
}

// ---------- skill card (15 base XP) ----------

function SkillCard({ me, post, busy }: { me: PlayerState; post: (body: QuestDeltaBody, okMsg: string) => Promise<void>; busy: boolean }) {
  const log = me.todayLog
  const mins = log.skillMins
  const xp = calcSkillXP(mins)
  const capMins = SKILL.BASE_BLOCKS * SKILL.BLOCK_MINS

  return (
    <QuestCard
      glow="gold"
      icon={<Hammer className="h-4 w-4" />}
      title="Skill"
      baseXp={15}
      questText={log.skillQuestText}
      questsLocked={log.questsLocked}
      lateQuests={log.lateQuests}
      logDate={log.logDate}
    >
      <div className="flex flex-wrap gap-1.5">
        {[15, 30, 45].map((n) => (
          <ActionButton
            key={n}
            tone={n === 45 ? 'gold' : 'emerald'}
            size="sm"
            className="num"
            disabled={busy}
            onClick={() => { void post({ skillMins: n }, `+${n}m skill practice logged`) }}
          >
            +{n}m
          </ActionButton>
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        <GameBar
          value={mins}
          max={capMins}
          overtime={Math.max(0, mins - capMins)}
          tone="gold"
          label={`${round2(mins)} / ${capMins}m`}
        />
        <p className="text-[11px] text-muted-foreground">
          Skill XP now:{' '}
          <motion.span
            key={xp}
            initial={{ opacity: 0.3, scale: 1.35 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-block num font-bold text-gold text-glow-gold"
          >
            {round2(xp)}
          </motion.span>
          <span className="num"> / 15</span>
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          {SKILL.RATE} XP per {SKILL.BLOCK_MINS}m up to {capMins}m, then half-rate ({SKILL.OT_RATE} XP per block).
        </p>
      </div>
    </QuestCard>
  )
}

// ---------- undo station ----------

function UndoStation({ me, busy, onUndo }: { me: PlayerState; busy: boolean; onUndo: () => Promise<void> }) {
  const log = me.todayLog
  return (
    <HudPanel glow={log.canUndo ? 'crimson' : undefined} className={cn(!log.canUndo && 'opacity-70')}>
      <SectionTitle right={log.undoLabel ? <StatChip tone="crimson" label="last action" value={log.undoLabel} /> : <StatChip label="last action" value="—" />}>
        Undo station
      </SectionTitle>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Misclicked a &ldquo;done&rdquo; or an XP bump? Reverse the latest action — XP, vault credit and the ledger all snap back.
        </p>
        <ActionButton tone="crimson" disabled={!log.canUndo || busy} onClick={() => { void onUndo() }} className="shrink-0">
          <Undo2 className="mr-1.5 inline h-4 w-4" aria-hidden />
          Undo
        </ActionButton>
      </div>
      {!log.canUndo && <p className="mt-2 text-[10px] text-muted-foreground/70">Nothing to undo yet — today&apos;s log is clean.</p>}
    </HudPanel>
  )
}

// ---------- C. bottom summary strip ----------

function SummaryStrip({ me }: { me: PlayerState }) {
  const log = me.todayLog
  const theme = PLAYER_THEME[me.id]
  const lockdown = log.xpMultiplier === LOCKDOWN_MULT
  const mult = dayMult(log)
  const effective = round2(log.questXp * mult)

  return (
    <HudPanel glow={lockdown ? 'crimson' : theme.bar}>
      <SectionTitle
        right={
          <StatChip tone={lockdown ? 'crimson' : 'cyan'} pulse={lockdown} label="multiplier" value={`×${mult}${lockdown ? ' LOCKDOWN' : log.lateQuests ? ' LATE' : ''}`} />
        }
      >
        Day&apos;s ledger
      </SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        <StatChip label="quest XP" value={round2(log.questXp)} />
        <StatChip tone="gold" label="effective" value={effective} />
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        <span className="hud-title">Net XP today</span>
        <motion.span
          key={log.netXp}
          initial={{ scale: 1.15, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className={cn('num font-display text-4xl font-black leading-none sm:text-5xl', theme.text, lockdown ? 'text-glow-crimson' : theme.bar === 'cyan' ? 'text-glow-cyan' : 'text-glow-emerald')}
        >
          {round2(log.netXp)}
        </motion.span>
      </div>
    </HudPanel>
  )
}

// ---------- screen root ----------

export function QuestsScreen({ state }: { state: GameState }) {
  const qc = useQueryClient()
  const [promptOpen, setPromptOpen] = useState(false)
  const [lockedOk, setLockedOk] = useState(false)
  const [busy, setBusy] = useState(false)

  const date = state.ist.date
  const promptKey = lockPromptKey(date)

  // Nightly auto-prompt — fires once per IST day inside the 22:30–23:30 lock window
  useEffect(() => {
    if (state.deadlines.questLockPassed) return
    const mins = state.ist.minutes
    const promptFrom = QUEST_LOCK.PROMPT_HOUR * 60 + QUEST_LOCK.PROMPT_MINUTE
    const cutoff = QUEST_LOCK.CUTOFF_HOUR * 60 + QUEST_LOCK.CUTOFF_MINUTE
    if (mins < promptFrom || mins > cutoff) return
    if (lsGet(promptKey) || lsGet(lockedTomorrowKey(date))) return
    lsSet(promptKey, '1')
    setPromptOpen(true)
  }, [state.ist.minutes, state.ist.date, state.deadlines.questLockPassed, promptKey, date])

  // Restore the "locked for tomorrow" marker across reloads
  useEffect(() => {
    setLockedOk(lsGet(lockedTomorrowKey(date)) === '1')
  }, [date])

  const me = state.me ? state.players[state.me] : null

  const post = useCallback(
    async (body: QuestDeltaBody, okMsg: string) => {
      if (!state.me) return
      setBusy(true)
      optimisticQuestDelta(qc, state.me, body) // instant feedback — server truth lands via refetch
      try {
        await apiPost('/api/quests/log', body)
        await qc.invalidateQueries({ queryKey: ['game-state'] })
        toast.success(okMsg)
      } catch (err) {
        await qc.invalidateQueries({ queryKey: ['game-state'] }) // roll back to server truth
        toast.error(err instanceof Error ? err.message : 'Quest log failed')
      } finally {
        setBusy(false)
      }
    },
    [qc, state.me],
  )

  const undo = useCallback(
    async () => {
      setBusy(true)
      try {
        const res = await apiPost<{ undone: string }>('/api/quests/undo')
        await qc.invalidateQueries({ queryKey: ['game-state'] })
        toast.success(`Reversed: ${res.undone}`)
      } catch (err) {
        await qc.invalidateQueries({ queryKey: ['game-state'] })
        toast.error(err instanceof Error ? err.message : 'Undo failed')
      } finally {
        setBusy(false)
      }
    },
    [qc],
  )

  const onLocked = useCallback(() => {
    lsSet(lockedTomorrowKey(date), '1')
    lsSet(promptKey, '1')
    setLockedOk(true)
    setPromptOpen(false)
  }, [date, promptKey])

  const onLateLocked = useCallback(() => {
    setPromptOpen(false)
  }, [])

  if (!me) {
    return (
      <HudPanel>
        <p className="text-xs text-muted-foreground">Sign in to open your quest log.</p>
      </HudPanel>
    )
  }

  const needsLateRescue = !me.todayLog.questsLocked

  return (
    <div className="space-y-4">
      {needsLateRescue && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }}>
          <LateRescuePanel me={me} onLocked={onLateLocked} />
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.28, ease: 'easeOut' }}>
        <LockPanel state={state} lockedOk={lockedOk} onLocked={onLocked} />
      </motion.div>

      <motion.div className="space-y-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.28, ease: 'easeOut' }}>
        <StudyCard me={me} post={post} busy={busy} />
        <WorkoutCard me={me} post={post} busy={busy} />
        <SkillCard me={me} post={post} busy={busy} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.28, ease: 'easeOut' }}>
        <SummaryStrip me={me} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.28, ease: 'easeOut' }}>
        <UndoStation me={me} busy={busy} onUndo={undo} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.28, ease: 'easeOut' }}>
        <BrotherQuestsPanel state={state} />
      </motion.div>

      {/* Nightly lock prompt dialog (22:30 IST window, once per day) */}
      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="ember-ring border-gold/30 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-sm uppercase tracking-[0.2em]">
              <Lock className="h-4 w-4 text-gold" aria-hidden />
              Lock tomorrow&apos;s quests
            </DialogTitle>
            <DialogDescription>
              Quest-locking hour — plan tomorrow before the window closes at 11:30 PM IST.
            </DialogDescription>
          </DialogHeader>
          {state.deadlines.questLockPassed ? (
            <div className="flex items-start gap-2 rounded-lg border border-crimson/50 bg-crimson/10 px-3 py-2.5 text-xs font-semibold leading-relaxed text-crimson">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>LOCK WINDOW CLOSED (11:30 PM IST) — quests must be locked before sleeping</span>
            </div>
          ) : (
            <QuestLockForm date={date} onLocked={onLocked} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
