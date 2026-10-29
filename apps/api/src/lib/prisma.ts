import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function configuredDatabaseUrl(): string {
  if (process.env.PDS_DB_ENV === "test") {
    return process.env.TEST_DATABASE_URL?.trim() ?? "";
  }
  return process.env.DATABASE_URL?.trim() ?? "";
}

function isPostgresUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes("USER:PASSWORD@HOST")) return false;
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

export function isDatabaseConfigured(): boolean {
  return isPostgresUrl(configuredDatabaseUrl());
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: configuredDatabaseUrl() || undefined,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * DB 연결 상태를 확인하고 미연결 시 명시적인 에러를 던진다.
 * 절대 가짜 저장 성공이나 메모리 폴백으로 대체하지 않는다.
 */
export async function ensureDatabaseConnected(): Promise<void> {
  if (!isDatabaseConfigured()) {
    throw new DatabaseNotConfiguredError(
      "실제 서버 데이터베이스(DATABASE_URL)가 설정되지 않았습니다. .env 파일에 유효한 Neon PostgreSQL 연결 문자열을 설정해 주세요."
    );
  }
}

export class DatabaseNotConfiguredError extends Error {
  public readonly code = "DATABASE_NOT_CONFIGURED";
  constructor(message: string) {
    super(message);
    this.name = "DatabaseNotConfiguredError";
  }
}

/**
 * 테스트 실행 및 테스트 DB 초기화 보호 장치 (Safety Guard)
 * 실제 자료가 들어간 운영(production) DB에 테스트 시드나 초기화가 실행되는 것을 원천 차단한다.
 */
export function assertSafeTestDatabase(options: { destructive?: boolean } = {}): void {
  const nodeEnv = process.env.NODE_ENV;
  const pdsDbEnv = process.env.PDS_DB_ENV;
  const testDbUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
  const productionDbUrl = process.env.DATABASE_URL?.trim() ?? "";
  const expectedHost = process.env.PDS_TEST_DB_HOST?.trim() ?? "";
  const expectedDatabase = process.env.PDS_TEST_DB_NAME?.trim() ?? "";

  if (nodeEnv === "production" || pdsDbEnv === "production") {
    throw new Error(
      "[보안 차단] 운영 환경(production)에서는 테스트 DB 초기화나 가상 시드 실행이 엄격히 금지되어 있습니다."
    );
  }

  if (pdsDbEnv !== "test") {
    throw new Error(
      `[보호 장치 차단] 테스트 스크립트는 PDS_DB_ENV="test"인 전용 테스트 DB에서만 실행할 수 있습니다. (현재 값: ${pdsDbEnv ?? "미설정"})`
    );
  }

  if (!isPostgresUrl(testDbUrl)) {
    throw new Error(
      "[보호 장치 차단] 유효한 전용 TEST_DATABASE_URL이 설정되어 있지 않습니다."
    );
  }

  if (!expectedHost || !expectedDatabase) {
    throw new Error(
      "[보호 장치 차단] PDS_TEST_DB_HOST와 PDS_TEST_DB_NAME으로 테스트 DB를 정확히 지정해야 합니다."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(testDbUrl);
  } catch {
    throw new Error("[보호 장치 차단] TEST_DATABASE_URL을 안전하게 해석할 수 없습니다.");
  }

  const actualDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (parsed.hostname !== expectedHost || actualDatabase !== expectedDatabase) {
    throw new Error(
      "[보호 장치 차단] TEST_DATABASE_URL의 호스트 또는 DB 이름이 등록된 테스트 DB 식별자와 일치하지 않습니다."
    );
  }

  if (productionDbUrl && testDbUrl === productionDbUrl) {
    throw new Error(
      "[보호 장치 차단] TEST_DATABASE_URL과 운영 DATABASE_URL이 같습니다. 테스트 DB를 분리해 주세요."
    );
  }

  if (
    options.destructive &&
    process.env.PDS_TEST_RESET_CONFIRM !== "RESET_plandosee_TEST_ONLY"
  ) {
    throw new Error(
      "[보호 장치 차단] 전체 초기화에는 PDS_TEST_RESET_CONFIRM 확인 문구가 필요합니다."
    );
  }
}

