import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  getSeoulDateString,
  getSeoulTimestampHalfOpenRange,
  isTaskDelayedInSeoul,
  calculateActualMinutes,
  parseSeoulDateTimeInput,
} from "@plandosee/shared/date-seoul";
import {
  filterAndSortTasks,
  computeReviewAggregation,
  type TaskRecord,
} from "@plandosee/shared/domain-logic";
import {
  CreatePlanSchema,
  CreateTaskSchema,
  CreateExecutionLogInputSchema,
  CreateReviewSchema,
} from "@plandosee/shared/validation";
import { assertSafeTestDatabase } from "@api/lib/prisma";

describe("1. 서울 시간대(Asia/Seoul) 자정 경계 및 지연(Delayed) 판정 검증", () => {
  it("UTC 14:59:59.999Z는 서울 기준 전날(23:59:59)이고, UTC 15:00:00.000Z는 서울 기준 다음 날(00:00:00)이어야 한다", () => {
    const justBeforeSeoulMidnight = new Date("2026-10-28T14:59:59.999Z");
    const exactSeoulMidnight = new Date("2026-10-28T15:00:00.000Z");

    expect(getSeoulDateString(justBeforeSeoulMidnight)).toBe("2026-10-28");
    expect(getSeoulDateString(exactSeoulMidnight)).toBe("2026-10-29");
  });

  it("서울 기준 오늘 마감인 미완료 할 일은 지연이 아니며, 어제 마감인 미완료 할 일만 지연으로 판정하고, 완료(DONE)된 할 일은 지연에서 제외한다", () => {
    // 서울 기준 2026-10-29 00:05:00 (UTC 2026-10-28 15:05:00Z)
    const refNow = new Date("2026-10-28T15:05:00.000Z");

    const todoDueToday = { status: "TODO", dueDate: "2026-10-29" };
    const todoDueYesterday = { status: "TODO", dueDate: "2026-10-28" };
    const doneDueYesterday = { status: "DONE", dueDate: "2026-10-28" };

    expect(isTaskDelayedInSeoul(todoDueToday, refNow)).toBe(false);
    expect(isTaskDelayedInSeoul(todoDueYesterday, refNow)).toBe(true);
    expect(isTaskDelayedInSeoul(doneDueYesterday, refNow)).toBe(false);
  });

  it("시각 범위 조회 시 종료일 23:59:59 대신 [시작일 00:00:00+09:00, 다음 날 00:00:00+09:00) 반열린 구간을 생성한다", () => {
    const { startInclusive, endExclusive } = getSeoulTimestampHalfOpenRange(
      "2026-10-25",
      "2026-10-29"
    );
    expect(startInclusive.toISOString()).toBe("2026-10-24T15:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-10-29T15:00:00.000Z");
  });

  it("실제 소요 시간 계산 시 초 단위를 반올림하여 정수 분으로 반환한다", () => {
    const start = parseSeoulDateTimeInput("2026-10-29T10:00:00");
    const end45m20s = new Date(start.getTime() + (45 * 60 + 20) * 1000);
    const end45m40s = new Date(start.getTime() + (45 * 60 + 40) * 1000);

    expect(calculateActualMinutes(start, end45m20s)).toBe(45);
    expect(calculateActualMinutes(start, end45m40s)).toBe(46);
  });
});

describe("2. 할 일 검색·필터·동률 정렬 및 삭제 자료 제외 검증", () => {
  const sampleTasks: TaskRecord[] = [
    {
      id: "task-b",
      planId: "plan-1",
      title: "API 서버 라우트 구현",
      dueDate: "2026-10-28",
      priority: "HIGH",
      tags: ["백엔드", "API"],
      estimatedMinutes: 60,
      status: "TODO",
      version: 1,
      completedAt: null,
      completedRequestId: null,
      isDeleted: false,
      deletedAt: null,
      createdAt: "2026-10-25T02:00:00.000Z",
      updatedAt: "2026-10-25T02:00:00.000Z",
      executionLogs: [],
    },
    {
      id: "task-a",
      planId: "plan-1",
      title: "DB 스키마 마이그레이션",
      dueDate: "2026-10-28",
      priority: "HIGH",
      tags: ["백엔드", "DB"],
      estimatedMinutes: 60,
      status: "DONE",
      version: 2,
      completedAt: "2026-10-26T05:00:00.000Z",
      completedRequestId: "req-1",
      isDeleted: false,
      deletedAt: null,
      createdAt: "2026-10-25T02:00:00.000Z", // task-b와 마감일, 우선순위, 생성시각까지 모두 동일!
      updatedAt: "2026-10-26T05:00:00.000Z",
      executionLogs: [],
    },
    {
      id: "task-deleted",
      planId: "plan-1",
      title: "삭제된 구버전 백엔드 작업",
      dueDate: "2026-10-27",
      priority: "HIGH",
      tags: ["백엔드"],
      estimatedMinutes: 120,
      status: "TODO",
      version: 2,
      completedAt: null,
      completedRequestId: null,
      isDeleted: true,
      deletedAt: "2026-10-27T01:00:00.000Z",
      createdAt: "2026-10-24T01:00:00.000Z",
      updatedAt: "2026-10-27T01:00:00.000Z",
      executionLogs: [],
    },
  ];

  it("논리 삭제된 할 일은 제외하고, 마감일·우선순위·생성시각이 모두 동률일 때 ID 오름차순으로 항상 일정한 순서를 유지한다", () => {
    const result = filterAndSortTasks(sampleTasks, {
      tagFilter: "백엔드",
      sortBy: "DUE_DATE_ASC",
    });

    expect(result.map((t) => t.id)).toEqual(["task-a", "task-b"]);
  });
});

describe("3. 돌아보기(See) 집계 정합성, 1:N 중복 합산 방지, 빈 자료 0 처리 검증", () => {
  it("빈 자료일 때 모든 집계 지표가 정확히 0이고 근거 목록이 비어 있어야 한다", () => {
    const emptyAgg = computeReviewAggregation([], { filterType: "ALL" });
    expect(emptyAgg.metrics).toEqual({
      plannedCount: 0,
      completedCount: 0,
      delayedCount: 0,
      blockedCount: 0,
      estimatedMinutes: 0,
      actualMinutes: 0,
      diffMinutes: 0,
      outOfPeriodLogCount: 0,
      totalLogCount: 0,
    });
    expect(emptyAgg.evidence.plannedTasks).toHaveLength(0);
  });

  it("한 할 일에 여러 실행 기록이 있어도 할 일 수와 예상 시간이 중복 합산되지 않으며, 공백 아닌 막힘 사유가 여러 개여도 막힘 할 일 수는 1건으로 집계된다", () => {
    const refNow = new Date("2026-10-28T15:30:00.000Z"); // 서울 기준 2026-10-29

    const tasks: TaskRecord[] = [
      {
        id: "t1",
        planId: "p1",
        title: "복수 실행 기록 및 복수 막힘 할 일",
        dueDate: "2026-10-28", // 어제 마감 & 미완료 -> 지연 1건
        priority: "HIGH",
        tags: [],
        estimatedMinutes: 100, // 3개 로그가 있어도 100분 1번만 합산되어야 함
        status: "TODO",
        version: 1,
        completedAt: null,
        completedRequestId: null,
        isDeleted: false,
        deletedAt: null,
        createdAt: "2026-10-25T00:00:00.000Z",
        updatedAt: "2026-10-25T00:00:00.000Z",
        executionLogs: [
          {
            id: "l1",
            taskId: "t1",
            startedAt: "2026-10-27T01:00:00.000Z",
            endedAt: "2026-10-27T01:40:00.000Z",
            actualMinutes: 40,
            blockReason: "환경변수 누락 이슈",
            createdAt: "2026-10-27T01:40:00.000Z",
          },
          {
            id: "l2",
            taskId: "t1",
            startedAt: "2026-10-28T02:00:00.000Z",
            endedAt: "2026-10-28T03:10:00.000Z",
            actualMinutes: 70,
            blockReason: "방화벽 포트 차단 이슈",
            createdAt: "2026-10-28T03:10:00.000Z",
          },
          {
            id: "l3",
            taskId: "t1",
            startedAt: "2026-10-30T02:00:00.000Z", // 기간 밖 실행 기록
            endedAt: "2026-10-30T02:20:00.000Z",
            actualMinutes: 20,
            blockReason: "   ", // 공백만 있는 사유
            createdAt: "2026-10-30T02:20:00.000Z",
          },
        ],
      },
      {
        id: "t2",
        planId: "p1",
        title: "공백 막힘만 있는 완료 할 일",
        dueDate: "2026-10-27", // 어제 이전 마감이지만 DONE이므로 지연 아님
        priority: "MEDIUM",
        tags: [],
        estimatedMinutes: 50,
        status: "DONE",
        version: 2,
        completedAt: "2026-10-27T05:00:00.000Z",
        completedRequestId: "req-2",
        isDeleted: false,
        deletedAt: null,
        createdAt: "2026-10-25T01:00:00.000Z",
        updatedAt: "2026-10-27T05:00:00.000Z",
        executionLogs: [
          {
            id: "l4",
            taskId: "t2",
            startedAt: "2026-10-27T04:00:00.000Z",
            endedAt: "2026-10-27T04:45:00.000Z",
            actualMinutes: 45,
            blockReason: "   ", // 공백만 있으므로 막힘 아님
            createdAt: "2026-10-27T04:45:00.000Z",
          },
        ],
      },
    ];

    const agg = computeReviewAggregation(tasks, {
      filterType: "PERIOD",
      periodStartDate: "2026-10-25",
      periodEndDate: "2026-10-29",
      referenceNow: refNow,
    });

    expect(agg.metrics.plannedCount).toBe(2);
    expect(agg.metrics.completedCount).toBe(1);
    expect(agg.metrics.delayedCount).toBe(1);
    expect(agg.metrics.blockedCount).toBe(1); // t1에 막힘이 2개 있어도 1건, t2는 공백이므로 0건
    expect(agg.metrics.estimatedMinutes).toBe(150); // 100 + 50 (중복 합산 없음)
    expect(agg.metrics.actualMinutes).toBe(175); // (40 + 70 + 20) + 45
    expect(agg.metrics.diffMinutes).toBe(25); // 175 - 150
    expect(agg.metrics.outOfPeriodLogCount).toBe(1);

    // 집계 숫자와 근거 목록 개수 일치 검증
    expect(agg.evidence.plannedTasks).toHaveLength(agg.metrics.plannedCount);
    expect(agg.evidence.completedTasks).toHaveLength(agg.metrics.completedCount);
    expect(agg.evidence.delayedTasks).toHaveLength(agg.metrics.delayedCount);
    expect(agg.evidence.blockedTasks).toHaveLength(agg.metrics.blockedCount);
  });
});

describe("4. 서버 입력 검증 및 테스트 DB 보호 장치 검증", () => {
  it("종료일이 시작일보다 앞선 계획, 음수 예상 시간, 종료 시각이 시작 시각보다 빠른 실행 기록을 거부한다", () => {
    const badPlan = CreatePlanSchema.safeParse({
      title: "잘못된 기간 계획",
      startDate: "2026-10-30",
      endDate: "2026-10-25",
      priority: "HIGH",
      successCriteria: "기준",
      estimatedMinutes: 60,
    });
    expect(badPlan.success).toBe(false);

    const negativeTask = CreateTaskSchema.safeParse({
      planId: "p1",
      title: "음수 시간 할 일",
      dueDate: "2026-10-29",
      priority: "MEDIUM",
      tags: [],
      estimatedMinutes: -10,
    });
    expect(negativeTask.success).toBe(false);

    const badLog = CreateExecutionLogInputSchema.safeParse({
      taskId: "t1",
      startedAt: "2026-10-29T15:00",
      endedAt: "2026-10-29T14:00",
      actualMinutes: 30,
    });
    expect(badLog.success).toBe(false);

    const emptyImprovementReview = CreateReviewSchema.safeParse({
      planId: "p1",
      filterType: "ALL",
      improvementNote: "   ",
    });
    expect(emptyImprovementReview.success).toBe(false);
  });

  it("운영 표식이거나 development 표식이면 테스트 DB 작업을 차단해야 한다", () => {
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      PDS_DB_ENV: process.env.PDS_DB_ENV,
    };
    try {
      process.env.PDS_DB_ENV = "production";
      expect(() => assertSafeTestDatabase()).toThrow(/보안 차단/);

      process.env.PDS_DB_ENV = "development";
      expect(() => assertSafeTestDatabase()).toThrow(/전용 테스트 DB/);
    } finally {
      if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous.NODE_ENV;
      if (previous.PDS_DB_ENV === undefined) delete process.env.PDS_DB_ENV;
      else process.env.PDS_DB_ENV = previous.PDS_DB_ENV;
    }
  });

  it("prod 문자열이 없는 운영 URL을 TEST_DATABASE_URL에 잘못 넣어도 등록된 테스트 DB 식별자와 다르면 차단해야 한다", () => {
    const keys = [
      "NODE_ENV",
      "PDS_DB_ENV",
      "TEST_DATABASE_URL",
      "DATABASE_URL",
      "PDS_TEST_DB_HOST",
      "PDS_TEST_DB_NAME",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.NODE_ENV = "test";
      process.env.PDS_DB_ENV = "test";
      process.env.TEST_DATABASE_URL =
        "postgresql://user:secret@ep-main-example.neon.tech/main?sslmode=require";
      process.env.PDS_TEST_DB_HOST = "ep-test-example.neon.tech";
      process.env.PDS_TEST_DB_NAME = "plandosee_test";
      expect(() => assertSafeTestDatabase()).toThrow(/식별자와 일치하지 않습니다/);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("정확히 등록된 별도 테스트 DB만 허용하고, 전체 초기화는 추가 확인 문구가 있어야 한다", () => {
    const keys = [
      "NODE_ENV",
      "PDS_DB_ENV",
      "TEST_DATABASE_URL",
      "DATABASE_URL",
      "PDS_TEST_DB_HOST",
      "PDS_TEST_DB_NAME",
      "PDS_TEST_RESET_CONFIRM",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.NODE_ENV = "test";
      process.env.PDS_DB_ENV = "test";
      process.env.TEST_DATABASE_URL =
        "postgresql://user:secret@ep-test-example.neon.tech/plandosee_test?sslmode=require";
      process.env.DATABASE_URL =
        "postgresql://user:secret@ep-main-example.neon.tech/plandosee?sslmode=require";
      process.env.PDS_TEST_DB_HOST = "ep-test-example.neon.tech";
      process.env.PDS_TEST_DB_NAME = "plandosee_test";

      expect(() => assertSafeTestDatabase()).not.toThrow();
      expect(() => assertSafeTestDatabase({ destructive: true })).toThrow(/확인 문구/);
      process.env.PDS_TEST_RESET_CONFIRM = "RESET_plandosee_TEST_ONLY";
      expect(() => assertSafeTestDatabase({ destructive: true })).not.toThrow();
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("contracts/pds-schema-v2.json 계약 파일이 존재하고 핵심 테이블 6종과 집계 규칙을 모두 포함해야 한다", () => {
    const contractPath = path.resolve(process.cwd(), "contracts/pds-schema-v2.json");
    const raw = fs.readFileSync(contractPath, "utf-8");
    const contract = JSON.parse(raw);

    expect(contract.contractId).toBe("pds-schema-v2");
    expect(Object.keys(contract.tables)).toEqual([
      "Plan",
      "PlanSnapshot",
      "Task",
      "TaskCompletionEvent",
      "ExecutionLog",
      "Review",
    ]);
    expect(contract.conventions.dateAndTimezone.displayTimezone).toBe("Asia/Seoul");
    expect(contract.conventions.timeUnit.unit).toBe("minutes");
  });
});

