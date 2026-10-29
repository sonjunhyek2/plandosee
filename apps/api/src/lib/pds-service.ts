import { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseConnected } from "./prisma";
import {
  formatUtcDateToDateOnly,
  parseDateOnlyToUtcDate,
  parseSeoulDateTimeInput,
  calculateActualMinutes,
  SEOUL_TIMEZONE,
} from "@plandosee/shared/date-seoul";
import {
  CreatePlanSchema,
  UpdatePlanSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  CreateExecutionLogInputSchema,
  CompleteTaskSchema,
  UncompleteTaskSchema,
  CreateReviewSchema,
  CreateNextPlanFromReviewSchema,
} from "@plandosee/shared/validation";
import {
  computeReviewAggregation,
  type TaskRecord,
  type ExecutionLogRecord,
  type TaskCompletionEventRecord,
} from "@plandosee/shared/domain-logic";
import type {
  PlanRecord,
  PlanSnapshotRecord,
  ReviewRecord,
} from "@plandosee/shared/records";

export type { PlanRecord, PlanSnapshotRecord, ReviewRecord } from "@plandosee/shared/records";

export class PdsDomainError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;

  constructor(message: string, statusCode = 400, errorCode = "DOMAIN_ERROR") {
    super(message);
    this.name = "PdsDomainError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

function serializeExecutionLog(log: {
  id: string;
  taskId: string;
  startedAt: Date;
  endedAt: Date;
  actualMinutes: number;
  blockReason: string | null;
  createdAt: Date;
}): ExecutionLogRecord {
  return {
    id: log.id,
    taskId: log.taskId,
    startedAt: log.startedAt.toISOString(),
    endedAt: log.endedAt.toISOString(),
    actualMinutes: log.actualMinutes,
    blockReason: log.blockReason,
    createdAt: log.createdAt.toISOString(),
  };
}

function serializeCompletionEvent(ev: {
  id: string;
  taskId: string;
  requestId: string;
  action: "COMPLETE" | "UNCOMPLETE";
  fromVersion: number;
  toVersion: number;
  isActiveCompletion: boolean;
  occurredAt: Date;
}): TaskCompletionEventRecord {
  return {
    id: ev.id,
    taskId: ev.taskId,
    requestId: ev.requestId,
    action: ev.action,
    fromVersion: ev.fromVersion,
    toVersion: ev.toVersion,
    isActiveCompletion: ev.isActiveCompletion,
    occurredAt: ev.occurredAt.toISOString(),
  };
}

export function serializeTask(task: {
  id: string;
  planId: string;
  title: string;
  dueDate: Date;
  priority: "HIGH" | "MEDIUM" | "LOW";
  tags: string[];
  estimatedMinutes: number;
  status: "TODO" | "DONE";
  version: number;
  completedAt: Date | null;
  completedRequestId: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  executionLogs?: Array<{
    id: string;
    taskId: string;
    startedAt: Date;
    endedAt: Date;
    actualMinutes: number;
    blockReason: string | null;
    createdAt: Date;
  }>;
  completionEvents?: Array<{
    id: string;
    taskId: string;
    requestId: string;
    action: "COMPLETE" | "UNCOMPLETE";
    fromVersion: number;
    toVersion: number;
    isActiveCompletion: boolean;
    occurredAt: Date;
  }>;
}): TaskRecord {
  return {
    id: task.id,
    planId: task.planId,
    title: task.title,
    dueDate: formatUtcDateToDateOnly(task.dueDate) ?? "",
    priority: task.priority,
    tags: task.tags,
    estimatedMinutes: task.estimatedMinutes,
    status: task.status,
    version: task.version,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    completedRequestId: task.completedRequestId,
    isDeleted: task.isDeleted,
    deletedAt: task.deletedAt ? task.deletedAt.toISOString() : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    executionLogs: (task.executionLogs ?? []).map(serializeExecutionLog),
    completionEvents: (task.completionEvents ?? []).map(serializeCompletionEvent),
  };
}

function serializeSnapshot(snap: {
  id: string;
  planId: string;
  version: number;
  title: string;
  startDate: Date;
  endDate: Date;
  priority: "HIGH" | "MEDIUM" | "LOW";
  successCriteria: string;
  estimatedMinutes: number;
  appliedImprovementNote: string | null;
  changedAt: Date;
}): PlanSnapshotRecord {
  return {
    id: snap.id,
    planId: snap.planId,
    version: snap.version,
    title: snap.title,
    startDate: formatUtcDateToDateOnly(snap.startDate) ?? "",
    endDate: formatUtcDateToDateOnly(snap.endDate) ?? "",
    priority: snap.priority,
    successCriteria: snap.successCriteria,
    estimatedMinutes: snap.estimatedMinutes,
    appliedImprovementNote: snap.appliedImprovementNote,
    changedAt: snap.changedAt.toISOString(),
  };
}

function serializeReview(rev: {
  id: string;
  planId: string;
  filterType: string;
  periodStartDate: Date | null;
  periodEndDate: Date | null;
  aggregationRule: string;
  reflectionNote: string;
  improvementNote: string;
  snapshotPlannedCount: number;
  snapshotCompletedCount: number;
  snapshotDelayedCount: number;
  snapshotBlockedCount: number;
  snapshotEstimatedMinutes: number;
  snapshotActualMinutes: number;
  snapshotDiffMinutes: number;
  createdAt: Date;
  updatedAt: Date;
  nextPlan?: { id: string; title: string } | null;
}): ReviewRecord {
  return {
    id: rev.id,
    planId: rev.planId,
    filterType: rev.filterType === "PERIOD" ? "PERIOD" : "ALL",
    periodStartDate: formatUtcDateToDateOnly(rev.periodStartDate),
    periodEndDate: formatUtcDateToDateOnly(rev.periodEndDate),
    aggregationRule: rev.aggregationRule,
    reflectionNote: rev.reflectionNote,
    improvementNote: rev.improvementNote,
    snapshotPlannedCount: rev.snapshotPlannedCount,
    snapshotCompletedCount: rev.snapshotCompletedCount,
    snapshotDelayedCount: rev.snapshotDelayedCount,
    snapshotBlockedCount: rev.snapshotBlockedCount,
    snapshotEstimatedMinutes: rev.snapshotEstimatedMinutes,
    snapshotActualMinutes: rev.snapshotActualMinutes,
    snapshotDiffMinutes: rev.snapshotDiffMinutes,
    nextPlanId: rev.nextPlan?.id ?? null,
    nextPlanTitle: rev.nextPlan?.title ?? null,
    createdAt: rev.createdAt.toISOString(),
    updatedAt: rev.updatedAt.toISOString(),
  };
}

/**
 * 전체 계획 및 하위 데이터 조회
 */
export async function listPlansWithDetails(): Promise<PlanRecord[]> {
  await ensureDatabaseConnected();

  const plans = await prisma.plan.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: {
      parentPlan: {
        select: { id: true, title: true },
      },
      snapshots: {
        orderBy: { version: "asc" },
      },
      tasks: {
        where: { isDeleted: false },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        include: {
          executionLogs: {
            orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          },
          completionEvents: {
            orderBy: [{ toVersion: "asc" }],
          },
        },
      },
      reviews: {
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: {
          nextPlan: {
            select: { id: true, title: true },
          },
        },
      },
    },
  });

  return plans.map((p) => ({
    id: p.id,
    title: p.title,
    startDate: formatUtcDateToDateOnly(p.startDate) ?? "",
    endDate: formatUtcDateToDateOnly(p.endDate) ?? "",
    priority: p.priority,
    successCriteria: p.successCriteria,
    estimatedMinutes: p.estimatedMinutes,
    appliedImprovementNote: p.appliedImprovementNote,
    version: p.version,
    parentPlanId: p.parentPlanId,
    parentPlanTitle: p.parentPlan?.title ?? null,
    sourceReviewId: p.sourceReviewId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    snapshots: p.snapshots.map(serializeSnapshot),
    tasks: p.tasks.map(serializeTask),
    reviews: p.reviews.map(serializeReview),
  }));
}

/**
 * 단일 계획 상세 조회
 */
export async function getPlanById(planId: string): Promise<PlanRecord | null> {
  await ensureDatabaseConnected();

  const p = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      parentPlan: { select: { id: true, title: true } },
      snapshots: { orderBy: { version: "asc" } },
      tasks: {
        where: { isDeleted: false },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        include: {
          executionLogs: {
            orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          },
          completionEvents: {
            orderBy: [{ toVersion: "asc" }],
          },
        },
      },
      reviews: {
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: {
          nextPlan: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!p) return null;

  return {
    id: p.id,
    title: p.title,
    startDate: formatUtcDateToDateOnly(p.startDate) ?? "",
    endDate: formatUtcDateToDateOnly(p.endDate) ?? "",
    priority: p.priority,
    successCriteria: p.successCriteria,
    estimatedMinutes: p.estimatedMinutes,
    appliedImprovementNote: p.appliedImprovementNote,
    version: p.version,
    parentPlanId: p.parentPlanId,
    parentPlanTitle: p.parentPlan?.title ?? null,
    sourceReviewId: p.sourceReviewId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    snapshots: p.snapshots.map(serializeSnapshot),
    tasks: p.tasks.map(serializeTask),
    reviews: p.reviews.map(serializeReview),
  };
}

/**
 * 계획 생성 (T06-C08: 최초 전체 상태를 버전 1 스냅샷으로 함께 저장)
 */
export async function createPlan(rawInput: unknown): Promise<PlanRecord> {
  await ensureDatabaseConnected();
  const parsed = CreatePlanSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PdsDomainError(
      parsed.error.issues.map((i) => i.message).join(" "),
      400,
      "VALIDATION_ERROR"
    );
  }

  const input = parsed.data;
  const startUtc = parseDateOnlyToUtcDate(input.startDate);
  const endUtc = parseDateOnlyToUtcDate(input.endDate);

  const createdPlanId = await prisma.$transaction(async (tx) => {
    if (input.parentPlanId) {
      const parent = await tx.plan.findUnique({ where: { id: input.parentPlanId } });
      if (!parent) {
        throw new PdsDomainError("연결하려는 이전 계획을 찾을 수 없습니다.", 404, "PARENT_PLAN_NOT_FOUND");
      }
    }

    if (input.sourceReviewId) {
      const review = await tx.review.findUnique({
        where: { id: input.sourceReviewId },
        include: { nextPlan: true },
      });
      if (!review) {
        throw new PdsDomainError("출처 돌아보기(Review)를 찾을 수 없습니다.", 404, "SOURCE_REVIEW_NOT_FOUND");
      }
      if (review.nextPlan) {
        throw new PdsDomainError(
          "해당 돌아보기에서는 이미 다음 계획이 생성되어 연결되어 있습니다.",
          409,
          "REVIEW_ALREADY_LINKED"
        );
      }
    }

    const plan = await tx.plan.create({
      data: {
        title: input.title,
        startDate: startUtc,
        endDate: endUtc,
        priority: input.priority,
        successCriteria: input.successCriteria,
        estimatedMinutes: input.estimatedMinutes,
        appliedImprovementNote: input.appliedImprovementNote ?? null,
        version: 1,
        parentPlanId: input.parentPlanId ?? null,
        sourceReviewId: input.sourceReviewId ?? null,
      },
    });

    // 최초 전체 상태를 버전 1 스냅샷으로 보존
    await tx.planSnapshot.create({
      data: {
        planId: plan.id,
        version: 1,
        title: plan.title,
        startDate: plan.startDate,
        endDate: plan.endDate,
        priority: plan.priority,
        successCriteria: plan.successCriteria,
        estimatedMinutes: plan.estimatedMinutes,
        appliedImprovementNote: plan.appliedImprovementNote,
      },
    });

    return plan.id;
  });

  const result = await getPlanById(createdPlanId);
  if (!result) {
    throw new PdsDomainError("계획 생성 후 조회에 실패했습니다.", 500, "INTERNAL_ERROR");
  }
  return result;
}

/**
 * 계획 수정 (T06-C08)
 * - Plan ID 유지
 * - 기존 스냅샷은 절대 수정·삭제하지 않음
 * - 현재 Plan 갱신과 새 PlanSnapshot(version + 1) 추가를 하나의 트랜잭션으로 처리
 * - expectedVersion 조건부 갱신 및 (planId, version) 고유 제약으로 동시 수정 충돌 방어
 */
export async function updatePlanWithSnapshot(rawInput: unknown): Promise<PlanRecord> {
  await ensureDatabaseConnected();
  const parsed = UpdatePlanSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PdsDomainError(
      parsed.error.issues.map((i) => i.message).join(" "),
      400,
      "VALIDATION_ERROR"
    );
  }

  const input = parsed.data;
  const startUtc = parseDateOnlyToUtcDate(input.startDate);
  const endUtc = parseDateOnlyToUtcDate(input.endDate);
  const nextVersion = input.expectedVersion + 1;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.plan.findUnique({
        where: { id: input.planId },
      });

      if (!existing) {
        throw new PdsDomainError("수정할 계획을 찾을 수 없습니다.", 404, "PLAN_NOT_FOUND");
      }

      const nextImprovementNote =
        input.appliedImprovementNote !== undefined
          ? input.appliedImprovementNote
          : existing.appliedImprovementNote;

      // 원자적 조건부 갱신: id와 expectedVersion이 일치할 때만 version + 1로 갱신
      const updated = await tx.plan.updateMany({
        where: {
          id: input.planId,
          version: input.expectedVersion,
        },
        data: {
          title: input.title,
          startDate: startUtc,
          endDate: endUtc,
          priority: input.priority,
          successCriteria: input.successCriteria,
          estimatedMinutes: input.estimatedMinutes,
          appliedImprovementNote: nextImprovementNote,
          version: nextVersion,
          updatedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        throw new PdsDomainError(
          `계획이 다른 요청에 의해 먼저 수정되었습니다 (요청 버전: v${input.expectedVersion}). 새로고침 후 최신 상태에서 다시 수정해 주세요.`,
          409,
          "PLAN_VERSION_CONFLICT"
        );
      }

      // 새 스냅샷 추가 (기존 스냅샷은 수정/삭제하지 않음)
      await tx.planSnapshot.create({
        data: {
          planId: input.planId,
          version: nextVersion,
          title: input.title,
          startDate: startUtc,
          endDate: endUtc,
          priority: input.priority,
          successCriteria: input.successCriteria,
          estimatedMinutes: input.estimatedMinutes,
          appliedImprovementNote: nextImprovementNote,
        },
      });
    });
  } catch (err) {
    if (err instanceof PdsDomainError) throw err;
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new PdsDomainError(
        "동시 수정 충돌로 인해 같은 버전 스냅샷 생성이 거부되었습니다. 다시 시도해 주세요.",
        409,
        "PLAN_SNAPSHOT_UNIQUE_CONFLICT"
      );
    }
    throw err;
  }

  const result = await getPlanById(input.planId);
  if (!result) {
    throw new PdsDomainError("계획 수정 후 조회에 실패했습니다.", 500, "INTERNAL_ERROR");
  }
  return result;
}

/**
 * 할 일 생성
 */
export async function createTask(rawInput: unknown): Promise<TaskRecord> {
  await ensureDatabaseConnected();
  const parsed = CreateTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PdsDomainError(
      parsed.error.issues.map((i) => i.message).join(" "),
      400,
      "VALIDATION_ERROR"
    );
  }

  const input = parsed.data;
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan) {
    throw new PdsDomainError("할 일을 추가할 소속 계획을 찾을 수 없습니다.", 404, "PLAN_NOT_FOUND");
  }

  const task = await prisma.task.create({
    data: {
      planId: input.planId,
      title: input.title,
      dueDate: parseDateOnlyToUtcDate(input.dueDate),
      priority: input.priority,
      tags: input.tags,
      estimatedMinutes: input.estimatedMinutes,
      status: "TODO",
      version: 1,
    },
    include: {
      executionLogs: true,
      completionEvents: true,
    },
  });

  return serializeTask(task);
}

/**
 * 할 일 수정 (삭제된 할 일은 수정 불가)
 */
export async function updateTask(rawInput: unknown): Promise<TaskRecord> {
  await ensureDatabaseConnected();
  const parsed = UpdateTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PdsDomainError(
      parsed.error.issues.map((i) => i.message).join(" "),
      400,
      "VALIDATION_ERROR"
    );
  }

  const input = parsed.data;
  const existing = await prisma.task.findUnique({ where: { id: input.taskId } });
  if (!existing) {
    throw new PdsDomainError("수정할 할 일을 찾을 수 없습니다.", 404, "TASK_NOT_FOUND");
  }
  if (existing.isDeleted) {
    throw new PdsDomainError("이미 삭제된 할 일은 수정할 수 없습니다.", 400, "TASK_ALREADY_DELETED");
  }

  const updated = await prisma.task.update({
    where: { id: input.taskId },
    data: {
      title: input.title,
      dueDate: parseDateOnlyToUtcDate(input.dueDate),
      priority: input.priority,
      tags: input.tags,
      estimatedMinutes: input.estimatedMinutes,
    },
    include: {
      executionLogs: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] },
      completionEvents: { orderBy: [{ toVersion: "asc" }] },
    },
  });

  return serializeTask(updated);
}

/**
 * 할 일 논리 삭제 (Soft Delete)
 * - 일반 목록과 집계에서 제외
 * - 기존 실행 기록(ExecutionLog) 및 완료 이벤트 연결은 보존
 */
export async function softDeleteTask(taskId: string): Promise<{ id: string; isDeleted: true }> {
  await ensureDatabaseConnected();
  if (!taskId || !taskId.trim()) {
    throw new PdsDomainError("삭제할 할 일 ID가 필요합니다.", 400, "VALIDATION_ERROR");
  }

  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) {
    throw new PdsDomainError("삭제할 할 일을 찾을 수 없습니다.", 404, "TASK_NOT_FOUND");
  }
  if (existing.isDeleted) {
    return { id: existing.id, isDeleted: true };
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      version: { increment: 1 },
    },
  });

  return { id: taskId, isDeleted: true };
}

/**
 * 실제 실행 기록(ExecutionLog) 추가
 * - 삭제된 할 일에는 추가 불가
 * - 원래 계획(Plan)과 할 일(Task)의 예상 시간(estimatedMinutes)을 절대 덮어쓰거나 변경하지 않음
 */
export async function addExecutionLog(rawInput: unknown): Promise<{
  log: ExecutionLogRecord;
  task: TaskRecord;
}> {
  await ensureDatabaseConnected();
  const parsed = CreateExecutionLogInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PdsDomainError(
      parsed.error.issues.map((i) => i.message).join(" "),
      400,
      "VALIDATION_ERROR"
    );
  }

  const input = parsed.data;

  const existingTask = await prisma.task.findUnique({
    where: { id: input.taskId },
  });

  if (!existingTask) {
    throw new PdsDomainError("실행 기록을 남길 할 일을 찾을 수 없습니다.", 404, "TASK_NOT_FOUND");
  }
  if (existingTask.isDeleted) {
    throw new PdsDomainError(
      "삭제된 할 일에는 새 실행 기록을 추가할 수 없습니다.",
      400,
      "TASK_DELETED_ACTION_FORBIDDEN"
    );
  }

  const createdLog = await prisma.executionLog.create({
    data: {
      taskId: input.taskId,
      startedAt: input.startedAtDate,
      endedAt: input.endedAtDate,
      actualMinutes: input.actualMinutes,
      blockReason: input.blockReason,
    },
  });

  const updatedTask = await prisma.task.findUniqueOrThrow({
    where: { id: input.taskId },
    include: {
      executionLogs: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] },
      completionEvents: { orderBy: [{ toVersion: "asc" }] },
    },
  });

  return {
    log: serializeExecutionLog(createdLog),
    task: serializeTask(updatedTask),
  };
}

export interface CompleteTaskResult {
  task: TaskRecord;
  idempotent: boolean;
  activeCompletionCount: number;
  message: string;
}

/**
 * 할 일 완료 처리 및 4대 중복/동시성 방어
 *
 * 검증 케이스:
 * 1. 같은 완료 요청 키(requestId) 재전송 -> 멱등성 보장(idempotent: true, 부수 효과 없음)
 * 2. 서로 다른 키로 같은 할 일에 동시 완료 요청 -> 원자적 조건부 갱신 및 Unique 제약으로 1건만 성공, 나머지는 409 ALREADY_COMPLETED_CONFLICT
 * 3. 완료 취소 후 정상 재완료 -> 취소 시 version 증가 및 isActiveCompletion 해제 후 새 버전으로 정상 완료
 * 4. 완료 취소 이후 과거 완료 요청이 늦게 도착 -> expectedVersion < 현재 version 이므로 409 STALE_VERSION_CONFLICT 차단
 *
 * 또한:
 * - 완료 버튼을 눌렀다는 이유로 가짜 시작·종료 시각이나 가짜 실행 기록을 절대 자동 생성하지 않는다.
 * - optionalExecutionLog가 명시적으로 함께 전달된 경우에만 하나의 트랜잭션 안에서 원자적으로 저장하며,
 *   중복/실패 요청인 경우 부수 실행 기록이 절대 남지 않는다.
 */
export async function completeTaskAtomic(rawInput: unknown): Promise<CompleteTaskResult> {
  await ensureDatabaseConnected();
  const parsed = CompleteTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PdsDomainError(
      parsed.error.issues.map((i) => i.message).join(" "),
      400,
      "VALIDATION_ERROR"
    );
  }

  const { taskId, requestId, expectedVersion, optionalExecutionLog } = parsed.data;

  // optionalExecutionLog가 있는 경우 사전 시간 검증
  let validatedOptionalLog: {
    startedAtDate: Date;
    endedAtDate: Date;
    actualMinutes: number;
    blockReason: string | null;
  } | null = null;

  if (optionalExecutionLog) {
    const startedAtDate = parseSeoulDateTimeInput(optionalExecutionLog.startedAt);
    const endedAtDate = parseSeoulDateTimeInput(optionalExecutionLog.endedAt);
    if (endedAtDate.getTime() < startedAtDate.getTime()) {
      throw new PdsDomainError(
        "종료 시각은 시작 시각보다 빠를 수 없습니다.",
        400,
        "VALIDATION_ERROR"
      );
    }
    const actualMinutes =
      optionalExecutionLog.actualMinutes !== undefined
        ? optionalExecutionLog.actualMinutes
        : calculateActualMinutes(startedAtDate, endedAtDate);
    validatedOptionalLog = {
      startedAtDate,
      endedAtDate,
      actualMinutes,
      blockReason:
        optionalExecutionLog.blockReason && optionalExecutionLog.blockReason.trim().length > 0
          ? optionalExecutionLog.blockReason.trim()
          : null,
    };
  }

  /**
   * 갱신 실패 또는 Unique 충돌 시 최신 DB 상태를 다시 조회하여
   * '동일 요청 키 재시도(Idempotent Retry)'와 '실제 충돌(Conflict)'을 정확히 판별하는 헬퍼
   */
  async function inspectAndResolveFailure(): Promise<CompleteTaskResult> {
    const latestTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        executionLogs: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] },
        completionEvents: { orderBy: [{ toVersion: "asc" }] },
      },
    });

    if (!latestTask) {
      throw new PdsDomainError("할 일을 찾을 수 없습니다.", 404, "TASK_NOT_FOUND");
    }

    if (latestTask.isDeleted) {
      throw new PdsDomainError(
        "삭제된 할 일에는 완료 요청을 적용할 수 없습니다.",
        400,
        "TASK_DELETED_ACTION_FORBIDDEN"
      );
    }

    // 케이스 1: 이미 같은 requestId로 완료된 상태이거나 동일 requestId 이벤트가 기록된 경우 (멱등 재시도)
    const existingEventByReq = await prisma.taskCompletionEvent.findUnique({
      where: { requestId },
    });

    if (
      (latestTask.status === "DONE" && latestTask.completedRequestId === requestId) ||
      (existingEventByReq &&
        existingEventByReq.taskId === taskId &&
        existingEventByReq.action === "COMPLETE" &&
        latestTask.status === "DONE")
    ) {
      const activeCount = await prisma.taskCompletionEvent.count({
        where: { taskId, isActiveCompletion: true },
      });
      return {
        task: serializeTask(latestTask),
        idempotent: true,
        activeCompletionCount: activeCount,
        message: "이미 동일한 요청 키로 완료 처리된 할 일입니다 (멱등 응답).",
      };
    }

    // 케이스 4: 완료 취소 등으로 인해 버전이 이미 넘어간 과거 지연 요청인 경우
    if (latestTask.version !== expectedVersion) {
      if (latestTask.status === "DONE") {
        throw new PdsDomainError(
          `다른 요청에 의해 이미 완료 처리되었습니다 (요청 버전: v${expectedVersion}, 현재 버전: v${latestTask.version}).`,
          409,
          "ALREADY_COMPLETED_CONFLICT"
        );
      }
      throw new PdsDomainError(
        `할 일의 상태 버전이 변경되어 과거 완료 요청이 거부되었습니다 (요청 버전: v${expectedVersion}, 현재 버전: v${latestTask.version}).`,
        409,
        "STALE_VERSION_CONFLICT"
      );
    }

    // 버전은 같으나 이미 DONE인 경우
    if (latestTask.status === "DONE") {
      throw new PdsDomainError(
        "이미 완료 상태인 할 일입니다.",
        409,
        "ALREADY_COMPLETED_CONFLICT"
      );
    }

    throw new PdsDomainError(
      "동시 요청 충돌로 완료 처리에 실패했습니다. 다시 시도해 주세요.",
      409,
      "CONCURRENT_COMPLETION_CONFLICT"
    );
  }

  // 1차 빠른 확인
  const initialTask = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!initialTask) {
    throw new PdsDomainError("할 일을 찾을 수 없습니다.", 404, "TASK_NOT_FOUND");
  }
  if (initialTask.isDeleted) {
    throw new PdsDomainError(
      "삭제된 할 일에는 완료 요청을 적용할 수 없습니다.",
      400,
      "TASK_DELETED_ACTION_FORBIDDEN"
    );
  }

  // 이미 같은 requestId로 완료된 상태면 즉시 멱등 응답 반환
  if (initialTask.status === "DONE" && initialTask.completedRequestId === requestId) {
    return inspectAndResolveFailure();
  }

  // 상태나 버전이 맞지 않으면 정밀 판별 후 에러/멱등 반환
  if (initialTask.status !== "TODO" || initialTask.version !== expectedVersion) {
    return inspectAndResolveFailure();
  }

  // 2차: 트랜잭션 내 원자적 조건부 갱신 (동일 시점에 초기 조회를 함께 통과한 동시 요청 방어)
  try {
    const now = new Date();
    const nextVersion = expectedVersion + 1;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.task.updateMany({
        where: {
          id: taskId,
          isDeleted: false,
          status: "TODO",
          version: expectedVersion,
        },
        data: {
          status: "DONE",
          completedAt: now,
          completedRequestId: requestId,
          version: nextVersion,
          updatedAt: now,
        },
      });

      if (updated.count !== 1) {
        throw new PdsDomainError("CONDITIONAL_UPDATE_FAILED", 409, "CONDITIONAL_UPDATE_FAILED");
      }

      // 완료 이벤트 기록 (requestId unique + (taskId, toVersion) unique + active partial unique)
      await tx.taskCompletionEvent.create({
        data: {
          taskId,
          requestId,
          action: "COMPLETE",
          fromVersion: expectedVersion,
          toVersion: nextVersion,
          isActiveCompletion: true,
          occurredAt: now,
        },
      });

      // 선택적 실행 기록이 함께 전달된 경우에만 동일 트랜잭션 내에서 저장 (가짜 기록 자동 생성 없음)
      if (validatedOptionalLog) {
        await tx.executionLog.create({
          data: {
            taskId,
            startedAt: validatedOptionalLog.startedAtDate,
            endedAt: validatedOptionalLog.endedAtDate,
            actualMinutes: validatedOptionalLog.actualMinutes,
            blockReason: validatedOptionalLog.blockReason,
          },
        });
      }
    });
  } catch (err) {
    if (
      (err instanceof PdsDomainError && err.errorCode === "CONDITIONAL_UPDATE_FAILED") ||
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
    ) {
      // 동시성 경합으로 인해 updateMany가 0건이거나 Unique 제약이 발동한 경우 상태 재확인
      return inspectAndResolveFailure();
    }
    throw err;
  }

  const finalTask = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      executionLogs: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] },
      completionEvents: { orderBy: [{ toVersion: "asc" }] },
    },
  });

  const activeCount = await prisma.taskCompletionEvent.count({
    where: { taskId, isActiveCompletion: true },
  });

  return {
    task: serializeTask(finalTask),
    idempotent: false,
    activeCompletionCount: activeCount,
    message: "할 일이 완료 처리되었습니다.",
  };
}

/**
 * 할 일 완료 취소 처리 (상태·version 검증 적용, 과거 실행 기록 보존)
 */
export async function uncompleteTaskAtomic(rawInput: unknown): Promise<CompleteTaskResult> {
  await ensureDatabaseConnected();
  const parsed = UncompleteTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PdsDomainError(
      parsed.error.issues.map((i) => i.message).join(" "),
      400,
      "VALIDATION_ERROR"
    );
  }

  const { taskId, requestId, expectedVersion } = parsed.data;

  async function inspectAndResolveUncompleteFailure(): Promise<CompleteTaskResult> {
    const latestTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        executionLogs: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] },
        completionEvents: { orderBy: [{ toVersion: "asc" }] },
      },
    });

    if (!latestTask) {
      throw new PdsDomainError("할 일을 찾을 수 없습니다.", 404, "TASK_NOT_FOUND");
    }
    if (latestTask.isDeleted) {
      throw new PdsDomainError(
        "삭제된 할 일에는 완료 취소 요청을 적용할 수 없습니다.",
        400,
        "TASK_DELETED_ACTION_FORBIDDEN"
      );
    }

    const existingEventByReq = await prisma.taskCompletionEvent.findUnique({
      where: { requestId },
    });

    if (
      existingEventByReq &&
      existingEventByReq.taskId === taskId &&
      existingEventByReq.action === "UNCOMPLETE" &&
      latestTask.status === "TODO"
    ) {
      const activeCount = await prisma.taskCompletionEvent.count({
        where: { taskId, isActiveCompletion: true },
      });
      return {
        task: serializeTask(latestTask),
        idempotent: true,
        activeCompletionCount: activeCount,
        message: "이미 동일한 요청 키로 완료 취소된 할 일입니다 (멱등 응답).",
      };
    }

    if (latestTask.version !== expectedVersion) {
      throw new PdsDomainError(
        `할 일의 버전이 변경되어 완료 취소 요청이 거부되었습니다 (요청 버전: v${expectedVersion}, 현재 버전: v${latestTask.version}).`,
        409,
        "STALE_VERSION_CONFLICT"
      );
    }

    if (latestTask.status === "TODO") {
      throw new PdsDomainError(
        "이미 미완료(TODO) 상태인 할 일입니다.",
        409,
        "ALREADY_TODO_CONFLICT"
      );
    }

    throw new PdsDomainError(
      "동시 요청 충돌로 완료 취소에 실패했습니다.",
      409,
      "CONCURRENT_UNCOMPLETE_CONFLICT"
    );
  }

  const initialTask = await prisma.task.findUnique({ where: { id: taskId } });
  if (!initialTask) {
    throw new PdsDomainError("할 일을 찾을 수 없습니다.", 404, "TASK_NOT_FOUND");
  }
  if (initialTask.isDeleted) {
    throw new PdsDomainError(
      "삭제된 할 일에는 완료 취소 요청을 적용할 수 없습니다.",
      400,
      "TASK_DELETED_ACTION_FORBIDDEN"
    );
  }

  if (initialTask.status !== "DONE" || initialTask.version !== expectedVersion) {
    return inspectAndResolveUncompleteFailure();
  }

  try {
    const now = new Date();
    const nextVersion = expectedVersion + 1;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.task.updateMany({
        where: {
          id: taskId,
          isDeleted: false,
          status: "DONE",
          version: expectedVersion,
        },
        data: {
          status: "TODO",
          completedAt: null,
          completedRequestId: null,
          version: nextVersion,
          updatedAt: now,
        },
      });

      if (updated.count !== 1) {
        throw new PdsDomainError("CONDITIONAL_UPDATE_FAILED", 409, "CONDITIONAL_UPDATE_FAILED");
      }

      // 기존 활성 완료 이벤트 비활성화 (과거 완료 이력 자체와 ExecutionLog는 삭제하지 않고 보존)
      await tx.taskCompletionEvent.updateMany({
        where: {
          taskId,
          isActiveCompletion: true,
        },
        data: {
          isActiveCompletion: false,
        },
      });

      // 완료 취소 이벤트 추가
      await tx.taskCompletionEvent.create({
        data: {
          taskId,
          requestId,
          action: "UNCOMPLETE",
          fromVersion: expectedVersion,
          toVersion: nextVersion,
          isActiveCompletion: false,
          occurredAt: now,
        },
      });
    });
  } catch (err) {
    if (
      (err instanceof PdsDomainError && err.errorCode === "CONDITIONAL_UPDATE_FAILED") ||
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
    ) {
      return inspectAndResolveUncompleteFailure();
    }
    throw err;
  }

  const finalTask = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      executionLogs: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] },
      completionEvents: { orderBy: [{ toVersion: "asc" }] },
    },
  });

  const activeCount = await prisma.taskCompletionEvent.count({
    where: { taskId, isActiveCompletion: true },
  });

  return {
    task: serializeTask(finalTask),
    idempotent: false,
    activeCompletionCount: activeCount,
    message: "할 일 완료가 취소되었습니다. 과거 실행 기록은 그대로 보존됩니다.",
  };
}

/**
 * 돌아보기(Review) 저장
 * - 대상 계획, 조회 기간, 집계 기준, 돌아보기 내용, 개선점 한 줄, 집계 스냅샷 저장
 */
export async function createReview(rawInput: unknown, referenceNow: Date = new Date()): Promise<ReviewRecord> {
  await ensureDatabaseConnected();
  const parsed = CreateReviewSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PdsDomainError(
      parsed.error.issues.map((i) => i.message).join(" "),
      400,
      "VALIDATION_ERROR"
    );
  }

  const input = parsed.data;
  const plan = await getPlanById(input.planId);
  if (!plan) {
    throw new PdsDomainError("돌아보기를 저장할 대상 계획을 찾을 수 없습니다.", 404, "PLAN_NOT_FOUND");
  }

  const agg = computeReviewAggregation(plan.tasks, {
    filterType: input.filterType,
    periodStartDate: input.filterType === "PERIOD" ? input.periodStartDate : null,
    periodEndDate: input.filterType === "PERIOD" ? input.periodEndDate : null,
    referenceNow,
  });

  const created = await prisma.review.create({
    data: {
      planId: input.planId,
      filterType: input.filterType,
      periodStartDate:
        input.filterType === "PERIOD" && input.periodStartDate
          ? parseDateOnlyToUtcDate(input.periodStartDate)
          : null,
      periodEndDate:
        input.filterType === "PERIOD" && input.periodEndDate
          ? parseDateOnlyToUtcDate(input.periodEndDate)
          : null,
      aggregationRule: agg.aggregationRule,
      reflectionNote: input.reflectionNote,
      improvementNote: input.improvementNote,
      snapshotPlannedCount: agg.metrics.plannedCount,
      snapshotCompletedCount: agg.metrics.completedCount,
      snapshotDelayedCount: agg.metrics.delayedCount,
      snapshotBlockedCount: agg.metrics.blockedCount,
      snapshotEstimatedMinutes: agg.metrics.estimatedMinutes,
      snapshotActualMinutes: agg.metrics.actualMinutes,
      snapshotDiffMinutes: agg.metrics.diffMinutes,
    },
    include: {
      nextPlan: { select: { id: true, title: true } },
    },
  });

  return serializeReview(created);
}

/**
 * 돌아보기(Review)의 개선점 한 줄을 반영하여 다음 계획(Next Plan) 생성
 * - 성공 기준(successCriteria)을 임의로 덮어쓰지 않고 별도 개선점 항목(appliedImprovementNote)으로 보존
 * - 원래 Review와 sourceReviewId로 출처 연결 및 parentPlanId 보존
 */
export async function createNextPlanFromReview(rawInput: unknown): Promise<{
  nextPlan: PlanRecord;
  updatedReview: ReviewRecord;
}> {
  await ensureDatabaseConnected();
  const parsed = CreateNextPlanFromReviewSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PdsDomainError(
      parsed.error.issues.map((i) => i.message).join(" "),
      400,
      "VALIDATION_ERROR"
    );
  }

  const input = parsed.data;
  const review = await prisma.review.findUnique({
    where: { id: input.reviewId },
    include: { nextPlan: true },
  });

  if (!review) {
    throw new PdsDomainError("출처 돌아보기(Review)를 찾을 수 없습니다.", 404, "REVIEW_NOT_FOUND");
  }
  if (review.nextPlan) {
    throw new PdsDomainError(
      "이미 이 돌아보기에서 생성된 다음 계획이 존재합니다.",
      409,
      "NEXT_PLAN_ALREADY_EXISTS"
    );
  }

  const improvementToApply = input.improvementNoteOverride ?? review.improvementNote;

  const nextPlan = await createPlan({
    title: input.title,
    startDate: input.startDate,
    endDate: input.endDate,
    priority: input.priority,
    successCriteria: input.successCriteria,
    estimatedMinutes: input.estimatedMinutes,
    appliedImprovementNote: improvementToApply,
    parentPlanId: review.planId,
    sourceReviewId: review.id,
  });

  const refreshedReview = await prisma.review.findUniqueOrThrow({
    where: { id: review.id },
    include: { nextPlan: { select: { id: true, title: true } } },
  });

  return {
    nextPlan,
    updatedReview: serializeReview(refreshedReview),
  };
}

/**
 * 전체 사용자 자료 단일 JSON 내보내기 데이터 생성
 * - 계획, 스냅샷, 할 일(논리 삭제된 항목 및 삭제 여부 포함), 완료 이벤트, 실행 기록, 돌아보기, 개선점 연결 모두 포함
 * - 스키마 버전, 시각, 단위, 날짜 규칙, 집계 규칙 포함 및 비밀값(환경변수 등) 완벽 배제
 */
export async function buildFullExportPayload() {
  await ensureDatabaseConnected();

  const [plans, planSnapshots, tasks, taskCompletionEvents, executionLogs, reviews] =
    await Promise.all([
      prisma.plan.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.planSnapshot.findMany({ orderBy: [{ planId: "asc" }, { version: "asc" }] }),
      prisma.task.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.taskCompletionEvent.findMany({ orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }),
      prisma.executionLog.findMany({ orderBy: [{ startedAt: "asc" }, { id: "asc" }] }),
      prisma.review.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { nextPlan: { select: { id: true, title: true } } },
      }),
    ]);

  const improvementLinks = plans
    .filter((p) => p.sourceReviewId !== null || p.parentPlanId !== null)
    .map((p) => ({
      nextPlanId: p.id,
      nextPlanTitle: p.title,
      parentPlanId: p.parentPlanId,
      sourceReviewId: p.sourceReviewId,
      appliedImprovementNote: p.appliedImprovementNote,
      preservedSuccessCriteria: p.successCriteria,
    }));

  return {
    schemaVersion: "2.0.0",
    contractId: "pds-schema-v2",
    exportedAt: new Date().toISOString(),
    timezone: SEOUL_TIMEZONE,
    unitRules: {
      timeUnit: "minutes (integer)",
      durationRoundingRule: "Math.round((endedAtMs - startedAtMs) / 60000)",
    },
    dateRules: {
      dateOnlyFormat: "YYYY-MM-DD",
      timestampFormat: "ISO-8601 (TIMESTAMPTZ, displayed in Asia/Seoul)",
      delayedEvaluationBasis: "status !== 'DONE' && dueDate < today(Asia/Seoul)",
      timestampRangeQueryRule: "[startDay 00:00:00+09:00, nextDay 00:00:00+09:00)",
    },
    aggregationRules: {
      ruleCode: "TASK_DUE_DATE_IN_PERIOD_WITH_ALL_TASK_EXECUTION_LOGS_ASIA_SEOUL",
      excludesSoftDeletedTasks: true,
      includesOutOfPeriodLogsForTargetTasks: true,
      preventsJoinDuplication: true,
    },
    data: {
      plans: plans.map((p) => ({
        id: p.id,
        title: p.title,
        startDate: formatUtcDateToDateOnly(p.startDate),
        endDate: formatUtcDateToDateOnly(p.endDate),
        priority: p.priority,
        successCriteria: p.successCriteria,
        estimatedMinutes: p.estimatedMinutes,
        appliedImprovementNote: p.appliedImprovementNote,
        version: p.version,
        parentPlanId: p.parentPlanId,
        sourceReviewId: p.sourceReviewId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      planSnapshots: planSnapshots.map(serializeSnapshot),
      tasks: tasks.map((t) => ({
        id: t.id,
        planId: t.planId,
        title: t.title,
        dueDate: formatUtcDateToDateOnly(t.dueDate),
        priority: t.priority,
        tags: t.tags,
        estimatedMinutes: t.estimatedMinutes,
        status: t.status,
        version: t.version,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        completedRequestId: t.completedRequestId,
        isDeleted: t.isDeleted,
        deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      taskCompletionEvents: taskCompletionEvents.map(serializeCompletionEvent),
      executionLogs: executionLogs.map(serializeExecutionLog),
      reviews: reviews.map(serializeReview),
      improvementLinks,
    },
  };
}

