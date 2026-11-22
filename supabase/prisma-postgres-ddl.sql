-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "entMultiplier" INTEGER NOT NULL,
    "hasPhysicalPunishment" BOOLEAN NOT NULL DEFAULT false,
    "shieldsCount" INTEGER NOT NULL DEFAULT 0,
    "current70Streak" INTEGER NOT NULL DEFAULT 0,
    "entBankMins" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastOverrideAt" TIMESTAMP(3),

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Week" (
    "id" SERIAL NOT NULL,
    "startDate" TEXT NOT NULL,
    "bossName" TEXT NOT NULL,
    "bossMaxHp" INTEGER NOT NULL DEFAULT 700,
    "bossCurrentHp" INTEGER NOT NULL DEFAULT 700,
    "bossDefeated" BOOLEAN NOT NULL DEFAULT false,
    "sobhnathHp" INTEGER NOT NULL DEFAULT 100,
    "umangHp" INTEGER NOT NULL DEFAULT 100,
    "sobhnathKo" BOOLEAN NOT NULL DEFAULT false,
    "umangKo" BOOLEAN NOT NULL DEFAULT false,
    "pvpForfeitedBy" TEXT,
    "pvpWinner" TEXT,
    "pvpStakeSettled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLog" (
    "id" SERIAL NOT NULL,
    "weekId" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "logDate" TEXT NOT NULL,
    "studyQuestText" TEXT,
    "workoutQuestText" TEXT,
    "skillQuestText" TEXT,
    "questsLockedAt" TIMESTAMP(3),
    "studyMode" TEXT NOT NULL DEFAULT 'questions',
    "studyQuestions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "studyHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workoutMins" INTEGER NOT NULL DEFAULT 0,
    "skillMins" INTEGER NOT NULL DEFAULT 0,
    "xpMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lateQuests" BOOLEAN NOT NULL DEFAULT false,
    "lastDeltaJson" TEXT,
    "isLockdown" BOOLEAN NOT NULL DEFAULT false,
    "shieldUsed" BOOLEAN NOT NULL DEFAULT false,
    "overrideUsed" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "questXp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netXp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bossHitApplied" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" SERIAL NOT NULL,
    "playerId" TEXT NOT NULL,
    "weekId" INTEGER,
    "logDate" TEXT NOT NULL,
    "deltaXp" DOUBLE PRECISION NOT NULL,
    "eventType" TEXT NOT NULL,
    "note" TEXT,
    "externalRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Punishment" (
    "id" SERIAL NOT NULL,
    "logDate" TEXT NOT NULL,
    "remainingXp" DOUBLE PRECISION NOT NULL,
    "pushups" DOUBLE PRECISION NOT NULL,
    "pullups" DOUBLE PRECISION NOT NULL,
    "crunches" DOUBLE PRECISION NOT NULL,
    "squats" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "Punishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntSession" (
    "id" SERIAL NOT NULL,
    "playerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "minsSpent" DOUBLE PRECISION,

    CONSTRAINT "EntSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppMeta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AppMeta_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Week_startDate_key" ON "Week"("startDate");

-- CreateIndex
CREATE INDEX "DailyLog_weekId_idx" ON "DailyLog"("weekId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_playerId_logDate_key" ON "DailyLog"("playerId", "logDate");

-- CreateIndex
CREATE UNIQUE INDEX "Ledger_externalRefId_key" ON "Ledger"("externalRefId");

-- CreateIndex
CREATE INDEX "Ledger_logDate_idx" ON "Ledger"("logDate");

-- CreateIndex
CREATE INDEX "Ledger_playerId_logDate_idx" ON "Ledger"("playerId", "logDate");

-- CreateIndex
CREATE UNIQUE INDEX "Punishment_logDate_key" ON "Punishment"("logDate");

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

