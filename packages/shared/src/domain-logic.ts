import {
  formatUtcDateToDateOnly,
  getSeoulDateString,
  isTaskDelayedInSeoul,
} from "./date-seoul";

export type PriorityType = "HIGH" | "MEDIUM" | "LOW";
export type TaskStatusType = "TODO" | "DONE";

export interface ExecutionLogRecord {
  id: string;
  taskId: string;
  startedAt: string; // ISO string
  endedAt: string; // ISO string
  actualMinutes: number;
  blockReason: string | null;
  createdAt: string;
}

export interface TaskCompletionEventRecord {
  id: string;
  taskId: string;
  requestId: string;
  action: "COMPLETE" | "UNCOMPLETE";
  fromVersion: number;
  toVersion: number;
  isActiveCompletion: boolean;
  occurredAt: string;
}

export interface TaskRecord {
  id: string;
  planId: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  priority: PriorityType;
  tags: string[];
  estimatedMinutes: number;
  status: TaskStatusType;
  version: number;
  completedAt: string | null;
  completedRequestId: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  executionLogs: ExecutionLogRecord[];
  completionEvents?: TaskCompletionEventRecord[];
}

export type TaskSortBy =
  | "DUE_DATE_ASC"
  | "DUE_DATE_DESC"
  | "PRIORITY_DESC"
  | "PRIORITY_ASC"
  | "ESTIMATED_DESC"
  | "CREATED_ASC";

export type TaskQuickFilter =
  | "ALL"
  | "TODO"
  | "DONE"
  | "DELAYED"
  | "BLOCKED"
  | "HAS_ACTUAL"
  | "TIME_DIFF";

export interface TaskQueryOptions {
  searchQuery?: string;
  tagFilter?: string;
  statusFilter?: "ALL" | "TODO" | "DONE";
  priorityFilter?: "ALL" | PriorityType;
  quickFilter?: TaskQuickFilter;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  sortBy?: TaskSortBy;
  referenceNow?: Date;
}

const PRIORITY_WEIGHT: Record<PriorityType, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export const SORT_LABELS: Record<TaskSortBy, string> = {
  DUE_DATE_ASC: "마감일 빠른순 (동률 시: 우선순위 높은순 → 생성시각 빠른순 → ID 오름차순)",
  DUE_DATE_DESC: "마감일 늦은순 (동률 시: 우선순위 높은순 → 생성시각 빠른순 → ID 오름차순)",
  PRIORITY_DESC: "우선순위 높은순 (동률 시: 마감일 빠른순 → 생성시각 빠른순 → ID 오름차순)",
  PRIORITY_ASC: "우선순위 낮은순 (동률 시: 마감일 빠른순 → 생성시각 빠른순 → ID 오름차순)",
  ESTIMATED_DESC: "예상 시간 많은순 (동률 시: 마감일 빠른순 → 생성시각 빠른순 → ID 오름차순)",
  CREATED_ASC: "등록순 (동률 시: ID 오름차순)",
};

/**
 * 할 일에 공백이 아닌 막혔던 이유(blockReason)가 하나라도 기록되어 있는지 판정한다.
 */
export function hasNonEmptyBlockReason(task: {
  executionLogs: Array<{ blockReason: string | null | undefined }>;
}): boolean {
  return task.executionLogs.some(
    (log) => typeof log.blockReason === "string" && log.blockReason.trim().length > 0
  );
}

/**
 * 할 일에 연결된 모든 실행 기록의 실제 소요 시간(분) 총합을 구한다.
 */
export function getTaskActualMinutesSum(task: {
  executionLogs: Array<{ actualMinutes: number }>;
}): number {
  return task.executionLogs.reduce((acc, log) => acc + (log.actualMinutes || 0), 0);
}

/**
 * 할 일 목록에 검색, 태그/상태/우선순위/근거 필터 및 다중 조건 정렬(보조 정렬 포함)을 결합 적용한다.
 * 논리 삭제(isDeleted === true)된 할 일은 항상 제외한다.
 */
export function filterAndSortTasks(
  tasks: TaskRecord[],
  options: TaskQueryOptions = {}
): TaskRecord[] {
  const {
    searchQuery = "",
    tagFilter = "ALL",
    statusFilter = "ALL",
    priorityFilter = "ALL",
    quickFilter = "ALL",
    periodStartDate = null,
    periodEndDate = null,
    sortBy = "DUE_DATE_ASC",
    referenceNow = new Date(),
  } = options;

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filtered = tasks.filter((task) => {
    // 1. 논리 삭제된 할 일은 일반 목록에서 항상 제외
    if (task.isDeleted) return false;

    // 2. 기간 필터 (마감일 기준)
    const dueStr = formatUtcDateToDateOnly(task.dueDate) ?? task.dueDate;
    if (periodStartDate && dueStr < periodStartDate) return false;
    if (periodEndDate && dueStr > periodEndDate) return false;

    // 3. 검색어 (제목, 태그, 막혔던 이유에서 검색)
    if (trimmedQuery.length > 0) {
      const inTitle = task.title.toLowerCase().includes(trimmedQuery);
      const inTags = task.tags.some((t) => t.toLowerCase().includes(trimmedQuery));
      const inBlockReason = task.executionLogs.some(
        (l) => l.blockReason && l.blockReason.toLowerCase().includes(trimmedQuery)
      );
      if (!inTitle && !inTags && !inBlockReason) return false;
    }

    // 4. 태그 필터
    if (tagFilter && tagFilter !== "ALL") {
      if (!task.tags.includes(tagFilter)) return false;
    }

    // 5. 상태 필터
    if (statusFilter && statusFilter !== "ALL") {
      if (task.status !== statusFilter) return false;
    }

    // 6. 우선순위 필터
    if (priorityFilter && priorityFilter !== "ALL") {
      if (task.priority !== priorityFilter) return false;
    }

    // 7. 돌아보기 근거 / 빠른 필터
    if (quickFilter === "TODO" && task.status !== "TODO") return false;
    if (quickFilter === "DONE" && task.status !== "DONE") return false;
    if (
      quickFilter === "DELAYED" &&
      !isTaskDelayedInSeoul(task, referenceNow)
    ) {
      return false;
    }
    if (quickFilter === "BLOCKED" && !hasNonEmptyBlockReason(task)) {
      return false;
    }
    if (quickFilter === "HAS_ACTUAL" && task.executionLogs.length === 0) {
      return false;
    }

    return true;
  });

  // 동률 시 일정한 순서를 보장하는 결정론적 정렬(Deterministic Tie-Breaking Sort)
  return [...filtered].sort((a, b) => {
    const dueA = formatUtcDateToDateOnly(a.dueDate) ?? a.dueDate;
    const dueB = formatUtcDateToDateOnly(b.dueDate) ?? b.dueDate;
    const prioA = PRIORITY_WEIGHT[a.priority] ?? 0;
    const prioB = PRIORITY_WEIGHT[b.priority] ?? 0;

    let primaryCmp = 0;

    switch (sortBy) {
      case "DUE_DATE_ASC":
        primaryCmp = dueA.localeCompare(dueB);
        if (primaryCmp !== 0) return primaryCmp;
        if (prioB !== prioA) return prioB - prioA;
        break;
      case "DUE_DATE_DESC":
        primaryCmp = dueB.localeCompare(dueA);
        if (primaryCmp !== 0) return primaryCmp;
        if (prioB !== prioA) return prioB - prioA;
        break;
      case "PRIORITY_DESC":
        primaryCmp = prioB - prioA;
        if (primaryCmp !== 0) return primaryCmp;
        if (dueA !== dueB) return dueA.localeCompare(dueB);
        break;
      case "PRIORITY_ASC":
        primaryCmp = prioA - prioB;
        if (primaryCmp !== 0) return primaryCmp;
        if (dueA !== dueB) return dueA.localeCompare(dueB);
        break;
      case "ESTIMATED_DESC":
        primaryCmp = b.estimatedMinutes - a.estimatedMinutes;
        if (primaryCmp !== 0) return primaryCmp;
        if (dueA !== dueB) return dueA.localeCompare(dueB);
        break;
      case "CREATED_ASC":
        break;
    }

    // 보조 정렬 1: 생성 시각 오름차순
    const createdCmp = a.createdAt.localeCompare(b.createdAt);
    if (createdCmp !== 0) return createdCmp;

    // 보조 정렬 2 (최종 결정자): 고유 ID 사전순 오름차순
    return a.id.localeCompare(b.id);
  });
}

export interface ReviewAggregationResult {
  filterType: "ALL" | "PERIOD";
  periodStartDate: string | null;
  periodEndDate: string | null;
  referenceSeoulToday: string;
  aggregationRule: string;
  metrics: {
    plannedCount: number;
    completedCount: number;
    delayedCount: number;
    blockedCount: number;
    estimatedMinutes: number;
    actualMinutes: number;
    diffMinutes: number;
    outOfPeriodLogCount: number;
    totalLogCount: number;
  };
  evidence: {
    plannedTasks: TaskRecord[];
    completedTasks: TaskRecord[];
    delayedTasks: TaskRecord[];
    blockedTasks: TaskRecord[];
    tasksWithTimeBreakdown: Array<{
      task: TaskRecord;
      estimatedMinutes: number;
      actualMinutes: number;
      diffMinutes: number;
      logCount: number;
      blockReasons: string[];
    }>;
  };
}

/**
 * 돌아보기(See) 집계 및 근거 목록을 단일 규칙으로 계산한다.
 *
 * 규칙:
 * - 대상 할 일: 해당 계획에 속하며 삭제되지 않은(isDeleted === false) 할 일 중
 *   filterType === 'PERIOD'이면 dueDate가 [periodStartDate, periodEndDate]에 속하는 할 일.
 * - 계획 수(plannedCount): 대상 할 일 수 (실행 기록 수와 무관하게 할 일 1건당 1로 계산)
 * - 완료 수(completedCount): 대상 할 일 중 현재 status === 'DONE'인 할 일 수
 * - 지연 수(delayedCount): 대상 할 일 중 미완료(status !== 'DONE')이면서 dueDate < 오늘(Asia/Seoul)인 할 일 수
 * - 막힘 수(blockedCount): 대상 할 일 중 공백이 아닌 막힌 이유가 하나라도 기록된 할 일 수 (한 할 일에 여러 개여도 1건)
 * - 예상 시간(estimatedMinutes): 대상 할 일의 estimatedMinutes 단순 합 (실행 기록과 JOIN되어도 중복 합산 안 함)
 * - 실제 시간(actualMinutes): 대상 할 일에 연결된 모든 실행 기록의 actualMinutes 총합 (기간 밖 실행 기록도 포함)
 * - 차이(diffMinutes): actualMinutes - estimatedMinutes
 * - 대상 자료가 없으면 모든 수치는 정확히 0
 */
export function computeReviewAggregation(
  tasks: TaskRecord[],
  options: {
    filterType?: "ALL" | "PERIOD";
    periodStartDate?: string | null;
    periodEndDate?: string | null;
    referenceNow?: Date;
  } = {}
): ReviewAggregationResult {
  const {
    filterType = "ALL",
    periodStartDate = null,
    periodEndDate = null,
    referenceNow = new Date(),
  } = options;

  const referenceSeoulToday = getSeoulDateString(referenceNow);

  // 1. 대상 할 일 선별 (삭제된 할 일 제외 + 기간 필터)
  const targetTasks = filterAndSortTasks(tasks, {
    periodStartDate: filterType === "PERIOD" ? periodStartDate : null,
    periodEndDate: filterType === "PERIOD" ? periodEndDate : null,
    sortBy: "DUE_DATE_ASC",
    referenceNow,
  });

  if (targetTasks.length === 0) {
    return {
      filterType,
      periodStartDate: filterType === "PERIOD" ? periodStartDate : null,
      periodEndDate: filterType === "PERIOD" ? periodEndDate : null,
      referenceSeoulToday,
      aggregationRule: "TASK_DUE_DATE_IN_PERIOD_WITH_ALL_TASK_EXECUTION_LOGS_ASIA_SEOUL",
      metrics: {
        plannedCount: 0,
        completedCount: 0,
        delayedCount: 0,
        blockedCount: 0,
        estimatedMinutes: 0,
        actualMinutes: 0,
        diffMinutes: 0,
        outOfPeriodLogCount: 0,
        totalLogCount: 0,
      },
      evidence: {
        plannedTasks: [],
        completedTasks: [],
        delayedTasks: [],
        blockedTasks: [],
        tasksWithTimeBreakdown: [],
      },
    };
  }

  const completedTasks = targetTasks.filter((t) => t.status === "DONE");
  const delayedTasks = targetTasks.filter((t) =>
    isTaskDelayedInSeoul(t, referenceNow)
  );
  const blockedTasks = targetTasks.filter((t) => hasNonEmptyBlockReason(t));

  let estimatedMinutes = 0;
  let actualMinutes = 0;
  let outOfPeriodLogCount = 0;
  let totalLogCount = 0;

  const tasksWithTimeBreakdown = targetTasks.map((task) => {
    const taskEst = task.estimatedMinutes;
    let taskAct = 0;
    const blockReasons: string[] = [];

    for (const log of task.executionLogs) {
      totalLogCount += 1;
      taskAct += log.actualMinutes;
      if (log.blockReason && log.blockReason.trim().length > 0) {
        blockReasons.push(log.blockReason.trim());
      }
      if (filterType === "PERIOD" && periodStartDate && periodEndDate) {
        const logSeoulDate = getSeoulDateString(new Date(log.startedAt));
        if (logSeoulDate < periodStartDate || logSeoulDate > periodEndDate) {
          outOfPeriodLogCount += 1;
        }
      }
    }

    estimatedMinutes += taskEst;
    actualMinutes += taskAct;

    return {
      task,
      estimatedMinutes: taskEst,
      actualMinutes: taskAct,
      diffMinutes: taskAct - taskEst,
      logCount: task.executionLogs.length,
      blockReasons,
    };
  });

  const diffMinutes = actualMinutes - estimatedMinutes;

  return {
    filterType,
    periodStartDate: filterType === "PERIOD" ? periodStartDate : null,
    periodEndDate: filterType === "PERIOD" ? periodEndDate : null,
    referenceSeoulToday,
    aggregationRule: "TASK_DUE_DATE_IN_PERIOD_WITH_ALL_TASK_EXECUTION_LOGS_ASIA_SEOUL",
    metrics: {
      plannedCount: targetTasks.length,
      completedCount: completedTasks.length,
      delayedCount: delayedTasks.length,
      blockedCount: blockedTasks.length,
      estimatedMinutes,
      actualMinutes,
      diffMinutes,
      outOfPeriodLogCount,
      totalLogCount,
    },
    evidence: {
      plannedTasks: targetTasks,
      completedTasks,
      delayedTasks,
      blockedTasks,
      tasksWithTimeBreakdown,
    },
  };
}

