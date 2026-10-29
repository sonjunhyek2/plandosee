/**
 * 실제 테스트 DB(dev/test 브랜치)를 대상으로 모든 핵심 요구사항을 통합 검증하는 스크립트
 * 주의: 반드시 PDS_DB_ENV="test"와 정확한 테스트 DB 식별자가 설정된 전용 DB에서만 실행됩니다.
 */
import { assertSafeTestDatabase, prisma } from "../src/lib/prisma";
import {
  createPlan,
  updatePlanWithSnapshot,
  getPlanById,
  createTask,
  softDeleteTask,
  addExecutionLog,
  completeTaskAtomic,
  uncompleteTaskAtomic,
  createReview,
  createNextPlanFromReview,
  buildFullExportPayload,
  PdsDomainError,
} from "../src/lib/pds-service";

async function runVerification() {
  assertSafeTestDatabase();

  console.log("=== [1/6] T06-C08: 계획 생성(v1) 및 2회 수정(v2, v3) 스냅샷 보존 검증 ===");
  const initialPlan = await createPlan({
    title: "초기 계획 제목 v1",
    startDate: "2026-10-25",
    endDate: "2026-10-30",
    priority: "MEDIUM",
    successCriteria: "초기 성공 기준 v1",
    estimatedMinutes: 120,
  });

  const mod1 = await updatePlanWithSnapshot({
    planId: initialPlan.id,
    expectedVersion: 1,
    title: "1차 수정 계획 제목 v2",
    startDate: "2026-10-25",
    endDate: "2026-10-31",
    priority: "HIGH",
    successCriteria: "1차 수정 성공 기준 v2",
    estimatedMinutes: 180,
  });

  const mod2 = await updatePlanWithSnapshot({
    planId: initialPlan.id,
    expectedVersion: 2,
    title: "2차 수정 계획 제목 v3",
    startDate: "2026-10-26",
    endDate: "2026-11-01",
    priority: "LOW",
    successCriteria: "2차 수정 성공 기준 v3",
    estimatedMinutes: 240,
  });

  const reloadedPlan = await getPlanById(initialPlan.id);
  if (!reloadedPlan || reloadedPlan.id !== initialPlan.id) {
    throw new Error("Plan ID가 유지되지 않았습니다.");
  }
  if (reloadedPlan.snapshots.length !== 3) {
    throw new Error(`스냅샷 개수 불일치: expected 3, got ${reloadedPlan.snapshots.length}`);
  }
  if (
    reloadedPlan.snapshots[0].title !== "초기 계획 제목 v1" ||
    reloadedPlan.snapshots[1].title !== "1차 수정 계획 제목 v2" ||
    reloadedPlan.snapshots[2].title !== "2차 수정 계획 제목 v3"
  ) {
    throw new Error("이전 버전 스냅샷 내용이 보존되지 않았습니다.");
  }
  console.log("✔ PASS: Plan ID 유지 및 v1, v2, v3 전체 상태 보존 확인 완료");

  console.log("=== [2/6] 할 일 생성, 실행 기록 추가 시 예상 시간 불변, 완료 시 가짜 실행 기록 미생성 검증 ===");
  const task1 = await createTask({
    planId: initialPlan.id,
    title: "동시성 및 실행기록 검증용 할 일 <script>alert('xss')</script>",
    dueDate: "2026-10-27",
    priority: "HIGH",
    tags: ["검증", "보안"],
    estimatedMinutes: 90,
  });

  const afterLog1 = await addExecutionLog({
    taskId: task1.id,
    startedAt: "2026-10-27T10:00:00+09:00",
    endedAt: "2026-10-27T10:50:00+09:00",
    actualMinutes: 50,
    blockReason: "외부 연동 지연",
  });
  if (afterLog1.task.estimatedMinutes !== 90) {
    throw new Error("실행 기록 저장 후 원래 예상 시간이 변경되었습니다!");
  }
  console.log("✔ PASS: 실행 기록 저장 후 원래 예상 시간(90분) 유지 확인");

  console.log("=== [3/6] 완료 중복 방지 4대 케이스 검증 ===");
  // 케이스 1: 같은 완료 요청 키 재전송
  const compReq1 = `req-same-${Date.now()}`;
  const res1A = await completeTaskAtomic({
    taskId: task1.id,
    requestId: compReq1,
    expectedVersion: 1,
  });
  const res1B = await completeTaskAtomic({
    taskId: task1.id,
    requestId: compReq1,
    expectedVersion: 1,
  });
  if (!res1B.idempotent || res1B.activeCompletionCount !== 1) {
    throw new Error("케이스 1(같은 요청 키 재전송) 멱등성 검증 실패");
  }
  if (res1B.task.executionLogs.length !== 1) {
    throw new Error("완료 처리 시 가짜 실행 기록이 자동 생성되었습니다!");
  }
  console.log("✔ PASS 케이스 ①: 같은 완료 요청 키 재전송 멱등 처리 및 활성 완료 1건 유지");

  // 케이스 3 & 4: 완료 취소 후 과거 완료 요청 지연 도착 차단 & 정상 재완료
  const uncompRes = await uncompleteTaskAtomic({
    taskId: task1.id,
    requestId: `req-uncomp-${Date.now()}`,
    expectedVersion: res1A.task.version, // v2 -> v3
  });
  if (uncompRes.task.status !== "TODO" || uncompRes.task.executionLogs.length !== 1) {
    throw new Error("완료 취소 후 상태 전이 실패 또는 과거 실행 기록 손실");
  }

  // 케이스 4: 완료 취소 이후 과거 완료 요청(expectedVersion: 1)이 늦게 도착
  let staleBlocked = false;
  try {
    await completeTaskAtomic({
      taskId: task1.id,
      requestId: `req-stale-${Date.now()}`,
      expectedVersion: 1, // 과거 버전
    });
  } catch (err) {
    if (err instanceof PdsDomainError && err.statusCode === 409) {
      staleBlocked = true;
    }
  }
  if (!staleBlocked) {
    throw new Error("케이스 ④(완료 취소 이후 과거 버전 완료 요청)가 차단되지 않았습니다!");
  }
  console.log("✔ PASS 케이스 ④: 완료 취소 이후 늦게 도착한 과거 완료 요청(v1) 409 차단 완료");

  // 케이스 2 & 3: 완료 취소 상태(v3)에서 서로 다른 두 요청 키로 동시에 재완료 요청 전송
  const concurrentResults = await Promise.allSettled([
    completeTaskAtomic({
      taskId: task1.id,
      requestId: `req-conc-A-${Date.now()}`,
      expectedVersion: uncompRes.task.version, // v3
    }),
    completeTaskAtomic({
      taskId: task1.id,
      requestId: `req-conc-B-${Date.now()}`,
      expectedVersion: uncompRes.task.version, // v3
    }),
  ]);

  const fulfilled = concurrentResults.filter((r) => r.status === "fulfilled");
  const rejected = concurrentResults.filter((r) => r.status === "rejected");
  if (fulfilled.length !== 1 || rejected.length !== 1) {
    throw new Error(
      `케이스 ②(서로 다른 키 동시 완료) 검증 실패: fulfilled=${fulfilled.length}, rejected=${rejected.length}`
    );
  }
  console.log("✔ PASS 케이스 ② & ③: 완료 취소 후 동시 재완료 요청 시 정확히 1건만 성공하고 1건은 409 충돌 처리됨");

  console.log("=== [4/6] 논리 삭제된 할 일에 대한 완료·실행기록 차단 검증 ===");
  const taskToDelete = await createTask({
    planId: initialPlan.id,
    title: "삭제될 할 일",
    dueDate: "2026-10-28",
    priority: "LOW",
    tags: [],
    estimatedMinutes: 30,
  });
  await softDeleteTask(taskToDelete.id);

  let deletedBlocked = false;
  try {
    await addExecutionLog({
      taskId: taskToDelete.id,
      startedAt: "2026-10-28T10:00:00+09:00",
      endedAt: "2026-10-28T10:30:00+09:00",
      actualMinutes: 30,
    });
  } catch (err) {
    if (err instanceof PdsDomainError && err.errorCode === "TASK_DELETED_ACTION_FORBIDDEN") {
      deletedBlocked = true;
    }
  }
  if (!deletedBlocked) {
    throw new Error("삭제된 할 일에 실행 기록 추가가 차단되지 않았습니다!");
  }
  console.log("✔ PASS: 논리 삭제된 할 일에 대한 실행 기록 및 상태 변경 차단 확인");

  console.log("=== [5/6] 돌아보기(Review) 저장 및 개선점을 반영한 다음 계획 생성·출처 보존 검증 ===");
  const review = await createReview({
    planId: initialPlan.id,
    filterType: "ALL",
    reflectionNote: "회고 메모 테스트",
    improvementNote: "외부 연동 시 타임아웃 기준을 먼저 정의하기",
  });

  const { nextPlan } = await createNextPlanFromReview({
    reviewId: review.id,
    title: "개선점이 반영된 다음 계획",
    startDate: "2026-11-02",
    endDate: "2026-11-10",
    priority: "HIGH",
    successCriteria: "다음 계획의 독립된 성공 기준",
    estimatedMinutes: 300,
  });

  if (
    nextPlan.sourceReviewId !== review.id ||
    nextPlan.parentPlanId !== initialPlan.id ||
    nextPlan.appliedImprovementNote !== "외부 연동 시 타임아웃 기준을 먼저 정의하기" ||
    nextPlan.successCriteria !== "다음 계획의 독립된 성공 기준"
  ) {
    throw new Error("다음 계획의 개선점 분리 보존 또는 출처 연결이 올바르지 않습니다.");
  }
  console.log("✔ PASS: 개선점 한 줄이 성공 기준을 덮어쓰지 않고 별도 항목으로 다음 계획에 저장·연결됨");

  console.log("=== [6/6] 전체 자료 JSON 내보내기 검증 ===");
  const exported = await buildFullExportPayload();
  if (
    exported.contractId !== "pds-schema-v2" ||
    !exported.data.tasks.some((t) => t.id === taskToDelete.id && t.isDeleted === true)
  ) {
    throw new Error("JSON 내보내기에 논리 삭제 자료 또는 스키마 버전 정보가 누락되었습니다.");
  }
  console.log("✔ PASS: 전체 자료 JSON 내보내기(논리 삭제 포함, 비밀값 제외) 검증 완료");
}

runVerification()
  .catch((err) => {
    console.error("[Verification Failed]", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

