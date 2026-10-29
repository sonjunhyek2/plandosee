import { assertSafeTestDatabase, prisma } from "../src/lib/prisma";

async function main() {
  // 보호 장치: 운영(production) DB에서는 절대 실행되지 않도록 차단
  assertSafeTestDatabase({ destructive: true });

  console.log("[Test DB Reset] 보호 장치 통과. 테스트 데이터를 초기화합니다...");

  await prisma.$transaction([
    prisma.executionLog.deleteMany({}),
    prisma.taskCompletionEvent.deleteMany({}),
    prisma.task.deleteMany({}),
    prisma.review.deleteMany({}),
    prisma.planSnapshot.deleteMany({}),
    prisma.plan.deleteMany({}),
  ]);

  console.log("[Test DB Reset] 테스트 DB 초기화 완료.");
}

main()
  .catch((err) => {
    console.error("[Test DB Reset Error]", err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

