-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DONE');

-- CreateEnum
CREATE TYPE "CompletionAction" AS ENUM ('COMPLETE', 'UNCOMPLETE');

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "successCriteria" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "appliedImprovementNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentPlanId" TEXT,
    "sourceReviewId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Plan_estimatedMinutes_non_negative_chk" CHECK ("estimatedMinutes" >= 0),
    CONSTRAINT "Plan_date_order_chk" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "Plan_version_positive_chk" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "PlanSnapshot" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "priority" "Priority" NOT NULL,
    "successCriteria" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "appliedImprovementNote" TEXT,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlanSnapshot_estimatedMinutes_non_negative_chk" CHECK ("estimatedMinutes" >= 0),
    CONSTRAINT "PlanSnapshot_date_order_chk" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "PlanSnapshot_version_positive_chk" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[],
    "estimatedMinutes" INTEGER NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMPTZ(3),
    "completedRequestId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Task_estimatedMinutes_non_negative_chk" CHECK ("estimatedMinutes" >= 0),
    CONSTRAINT "Task_version_positive_chk" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "TaskCompletionEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "action" "CompletionAction" NOT NULL,
    "fromVersion" INTEGER NOT NULL,
    "toVersion" INTEGER NOT NULL,
    "isActiveCompletion" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCompletionEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskCompletionEvent_version_transition_chk" CHECK ("toVersion" = "fromVersion" + 1)
);

-- CreateTable
CREATE TABLE "ExecutionLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,
    "actualMinutes" INTEGER NOT NULL,
    "blockReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExecutionLog_actualMinutes_non_negative_chk" CHECK ("actualMinutes" >= 0),
    CONSTRAINT "ExecutionLog_time_order_chk" CHECK ("endedAt" >= "startedAt")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "filterType" TEXT NOT NULL DEFAULT 'ALL',
    "periodStartDate" DATE,
    "periodEndDate" DATE,
    "aggregationRule" TEXT NOT NULL DEFAULT 'TASK_DUE_DATE_IN_PERIOD_WITH_ALL_TASK_EXECUTION_LOGS_ASIA_SEOUL',
    "reflectionNote" TEXT NOT NULL DEFAULT '',
    "improvementNote" TEXT NOT NULL,
    "snapshotPlannedCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotCompletedCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotDelayedCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotBlockedCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotEstimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "snapshotActualMinutes" INTEGER NOT NULL DEFAULT 0,
    "snapshotDiffMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Review_period_order_chk" CHECK ("periodStartDate" IS NULL OR "periodEndDate" IS NULL OR "periodEndDate" >= "periodStartDate")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_sourceReviewId_key" ON "Plan"("sourceReviewId");

-- CreateIndex
CREATE INDEX "Plan_createdAt_idx" ON "Plan"("createdAt");

-- CreateIndex
CREATE INDEX "PlanSnapshot_planId_version_idx" ON "PlanSnapshot"("planId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PlanSnapshot_planId_version_key" ON "PlanSnapshot"("planId", "version");

-- CreateIndex
CREATE INDEX "Task_planId_isDeleted_dueDate_idx" ON "Task"("planId", "isDeleted", "dueDate");

-- CreateIndex
CREATE INDEX "Task_planId_isDeleted_status_idx" ON "Task"("planId", "isDeleted", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCompletionEvent_requestId_key" ON "TaskCompletionEvent"("requestId");

-- CreateIndex
CREATE INDEX "TaskCompletionEvent_taskId_isActiveCompletion_idx" ON "TaskCompletionEvent"("taskId", "isActiveCompletion");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCompletionEvent_taskId_toVersion_key" ON "TaskCompletionEvent"("taskId", "toVersion");

-- CreateIndex (Partial Unique Index: Only one active completion record per task at any time)
CREATE UNIQUE INDEX "TaskCompletionEvent_one_active_per_task_key" ON "TaskCompletionEvent"("taskId") WHERE "isActiveCompletion" = true;

-- CreateIndex
CREATE INDEX "ExecutionLog_taskId_startedAt_idx" ON "ExecutionLog"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "Review_planId_createdAt_idx" ON "Review"("planId", "createdAt");

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_parentPlanId_fkey" FOREIGN KEY ("parentPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_sourceReviewId_fkey" FOREIGN KEY ("sourceReviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSnapshot" ADD CONSTRAINT "PlanSnapshot_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletionEvent" ADD CONSTRAINT "TaskCompletionEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

