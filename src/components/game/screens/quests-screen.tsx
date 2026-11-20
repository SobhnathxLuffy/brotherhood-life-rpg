'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, BookOpen, Dumbbell, FileJson, Hammer, Lock } from 'lucide-react'
import type { GameState, PlayerState } from '@/lib/types'
import {
  LOCKDOWN_MULT,
  QUEST_LOCK,
  SKILL,
  STUDY,
  WORKOUT,
  calcSkillXP,
  calcStudyXP,
  calcWorkoutXP,
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
        className="resize-none bg-black/50 text-sm"
      />
    </label>
  )
}

function QuestLockForm({ date, onLocked }: { date: string; onLocked: () => void }) {
  const qc = useQueryClient()
  const [study, setStudy] = useState('')
  const [workout, setWorkout] = useState('')
  const [skill, setSkill] = useState('')
  const [busy, setBusy] = useState(false)

  const ready = study.trim().length > 0 && workout.trim().length > 0 && skill.trim().length > 0

  async function lock() {
    setBusy(true)
    try {
      await apiPost('/api/quests/lock', { study: study.trim(), workout: workout.trim(), skill: skill.trim() })
      lsSet(lockedTomorrowKey(date), '1')
      lsSet(lockPromptKey(date), '1')
      await qc.invalidateQueries({ queryKey: ['game-state'] })
      toast.success("Tomorrow's quests locked — no edits allowed. Sleep like a monk.")
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
      <ActionButton tone="gold" size="lg" className="w-full" disabled={!ready || busy} onClick={() => { void lock() }}>
        <Lock className="mr-1.5 inline h-4 w-4" aria-hidden />
        Lock quests
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
        <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-950/40 px-3 py-2.5 text-xs font-semibold leading-relaxed text-red-200 lockdown-flash">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>LOCK WINDOW CLOSED (11:30 PM IST) — quests must be locked before sleeping</span>
        </div>
      ) : lockedOk ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/5 px-3 py-2 text-xs font-semibold text-emerald-200">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          Tomorrow&apos;s quests are locked — no edits until the daily reset.
        </div>
      ) : (
        <>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            Write tomorrow&apos;s 3 quests tonight — auto-closes in{' '}
            <Countdown minsFromServer={state.deadlines.questLockMins} className="font-semibold text-amber-300" />.
            Locked text becomes read-only at dawn.
          </p>
          <QuestLockForm date={state.ist.date} onLocked={onLocked} />
        </>
      )}
    </HudPanel>
  )
}

// ---------- B. quest card shell ----------

function QuestCard({ glow, icon, title, baseXp, questText, questsLocked, logDate, children }: {
  glow: 'cyan' | 'emerald' | 'gold'
  icon: ReactNode
  title: string
  baseXp: number
  questText: string | null
  questsLocked: boolean
  logDate: string
  children: ReactNode
}) {
  return (
    <HudPanel glow={glow}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground" aria-hidden>{icon}</span>
          <h3 className="text-sm font-black uppercase tracking-[0.18em]">{title}</h3>
        </div>
        <StatChip label="base" value={`${baseXp} XP`} />
      </div>

      {questsLocked ? (
        <div className="mb-3 border-l-2 border-border pl-2.5">
          <p className="text-xs italic leading-relaxed text-muted-foreground">&ldquo;{questText ?? '—'}&rdquo;</p>
          <p className="mt-1 text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">Read-only — locked {logDate}</p>
        </div>
      ) : (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded border border-amber-400/30 bg-amber-400/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-300/80">
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
          'cursor-pointer rounded-md border border-dashed px-3 py-3 text-center text-[11px] transition-colors',
          dragOver
            ? 'border-cyan-300 bg-cyan-400/10 text-cyan-200 hud-glow-cyan'
            : 'border-border text-muted-foreground hover:border-cyan-400/50 hover:text-foreground',
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
              'rounded border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors',
              log.studyMode === m
                ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200'
                : 'border-border text-muted-foreground hover:border-cyan-400/40 hover:text-foreground',
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
            className="inline-block num font-bold text-cyan-300 text-glow-cyan"
          >
            {round2(xp)}
          </motion.span>
          <span className="num"> / 60</span>
          {overtime > 0 && <span className="ml-1.5 font-semibold text-amber-300">+ half-rate overtime</span>}
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
            className="inline-block num font-bold text-emerald-300 text-glow-emerald"
          >
            {round2(xp)}
          </motion.span>
          <span className="num"> / {WORKOUT.BASE_XP}</span>
          {mins >= WORKOUT.MIN_MINS && (
            <span className="ml-1.5 font-semibold text-amber-300">+ {WORKOUT.OT_XP_PER_BLOCK} XP per extra {WORKOUT.OT_BLOCK_MINS}m</span>
          )}
        </p>
        {mins < WORKOUT.MIN_MINS && (
          <p className="text-[11px] font-semibold text-red-300">
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
            className="inline-block num font-bold text-amber-300 text-glow-gold"
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

// ---------- C. bottom summary strip ----------

function SummaryStrip({ me }: { me: PlayerState }) {
  const log = me.todayLog
  const theme = PLAYER_THEME[me.id]
  const lockdown = log.xpMultiplier === LOCKDOWN_MULT
  const effective = round2(log.questXp * log.xpMultiplier)

  return (
    <HudPanel glow={lockdown ? 'crimson' : theme.bar}>
      <SectionTitle
        right={
          <StatChip tone={lockdown ? 'crimson' : 'cyan'} pulse={lockdown} label="multiplier" value={lockdown ? 'x0.5 LOCKDOWN' : 'x1'} />
        }
      >
        Day&apos;s ledger
      </SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        <StatChip label="quest XP" value={round2(log.questXp)} />
        <StatChip tone="gold" label="effective" value={effective} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="hud-title">Net XP today</span>
        <motion.span
          key={log.netXp}
          initial={{ scale: 1.15, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn('num text-4xl font-black leading-none sm:text-5xl', theme.text, lockdown ? 'text-glow-crimson' : theme.bar === 'cyan' ? 'text-glow-cyan' : 'text-glow-emerald')}
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
      setBusy(true)
      try {
        await apiPost('/api/quests/log', body)
        await qc.invalidateQueries({ queryKey: ['game-state'] })
        toast.success(okMsg)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Quest log failed')
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

  if (!me) {
    return (
      <HudPanel>
        <p className="text-xs text-muted-foreground">Sign in to open your quest log.</p>
      </HudPanel>
    )
  }

  return (
    <div className="space-y-4">
      <LockPanel state={state} lockedOk={lockedOk} onLocked={onLocked} />

      <div className="space-y-4">
        <StudyCard me={me} post={post} busy={busy} />
        <WorkoutCard me={me} post={post} busy={busy} />
        <SkillCard me={me} post={post} busy={busy} />
      </div>

      <SummaryStrip me={me} />

      {/* Nightly lock prompt dialog (22:30 IST window, once per day) */}
      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="border-amber-400/30 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.2em]">
              <Lock className="h-4 w-4 text-amber-300" aria-hidden />
              Lock tomorrow&apos;s quests
            </DialogTitle>
            <DialogDescription>
              Quest-locking hour — plan tomorrow before the window closes at 11:30 PM IST.
            </DialogDescription>
          </DialogHeader>
          {state.deadlines.questLockPassed ? (
            <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-950/40 px-3 py-2.5 text-xs font-semibold leading-relaxed text-red-200">
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
