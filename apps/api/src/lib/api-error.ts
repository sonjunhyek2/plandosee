import { NextResponse } from "next/server";
import { DatabaseNotConfiguredError } from "./prisma";
import { PdsDomainError } from "./pds-service";

export function handleApiError(err: unknown) {
  if (err instanceof DatabaseNotConfiguredError) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: err.code,
        error: err.message,
        retryHint: ".env 파일에 유효한 DATABASE_URL을 설정한 뒤 다시 시도해 주세요.",
      },
      { status: 503 }
    );
  }

  if (err instanceof PdsDomainError) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: err.errorCode,
        error: err.message,
      },
      { status: err.statusCode }
    );
  }

  console.error("[PDS API Error]", err);
  return NextResponse.json(
    {
      ok: false,
      errorCode: "DATABASE_OR_SERVER_ERROR",
      error:
        "서버 데이터베이스 처리 중 오류가 발생했습니다. 입력하신 내용은 유지되니 잠시 후 다시 시도해 주세요.",
    },
    { status: 500 }
  );
}

