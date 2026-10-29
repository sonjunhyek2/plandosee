/**
 * Asia/Seoul 시간대 및 날짜 전용(YYYY-MM-DD) 처리 유틸리티
 *
 * 규칙:
 * 1. 마감일(dueDate), 계획 기간(startDate~endDate), 회고 기간(periodStartDate~periodEndDate)은
 *    시각이 없는 날짜 전용 값(YYYY-MM-DD)으로 다룬다.
 *    PostgreSQL DATE 컬럼과 교환할 때는 UTC 00:00:00 Date 객체(예: 2026-10-29T00:00:00.000Z)로 매핑한다.
 * 2. 실제 실행 시각(startedAt, endedAt), 생성/수정/완료 시각은 시간대가 포함된 TIMESTAMPTZ로 저장하고,
 *    화면 표시 및 날짜 경계 판정 시 항상 Asia/Seoul(UTC+09:00)을 기준으로 변환한다.
 * 3. 시각 범위 조회 시 종료일 23:59:59 대신 [시작일 00:00:00+09:00 이상, 다음 날 00:00:00+09:00 미만)의
 *    반열린 구간(half-open interval)을 사용한다.
 */

export const SEOUL_TIMEZONE = "Asia/Seoul";
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * YYYY-MM-DD 형식의 유효한 날짜 문자열인지 검증한다.
 */
export function isValidDateOnlyString(value: string): boolean {
  if (!DATE_ONLY_REGEX.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * YYYY-MM-DD 문자열을 PostgreSQL DATE 저장용 UTC 자정 Date 객체로 변환한다.
 */
export function parseDateOnlyToUtcDate(dateStr: string): Date {
  if (!isValidDateOnlyString(dateStr)) {
    throw new Error(`유효하지 않은 날짜 형식입니다 (YYYY-MM-DD 필요): ${dateStr}`);
  }
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * PostgreSQL DATE 컬럼에서 읽은 Date 객체(또는 문자열)를 YYYY-MM-DD 날짜 전용 문자열로 변환한다.
 */
export function formatUtcDateToDateOnly(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === "string") {
    if (DATE_ONLY_REGEX.test(date)) return date;
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * 주어진 시각(기본값: 현재 시각)을 Asia/Seoul 기준의 YYYY-MM-DD 날짜 문자열로 반환한다.
 * 서버 기본 시간대(UTC 등)와 무관하게 항상 한국 표준시(UTC+9) 기준 오늘 날짜를 구한다.
 */
export function getSeoulDateString(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now); // YYYY-MM-DD
}

/**
 * YYYY-MM-DD 날짜에 일(days) 수를 더한 새로운 YYYY-MM-DD 문자열을 반환한다.
 */
export function addDaysToDateOnly(dateStr: string, days: number): string {
  const dt = parseDateOnlyToUtcDate(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Asia/Seoul 기준 특정 날짜(YYYY-MM-DD)의 시작 시각(00:00:00.000+09:00)을 Date 객체로 반환한다.
 */
export function getSeoulDayStart(dateStr: string): Date {
  if (!isValidDateOnlyString(dateStr)) {
    throw new Error(`유효하지 않은 날짜 형식입니다: ${dateStr}`);
  }
  return new Date(`${dateStr}T00:00:00.000+09:00`);
}

/**
 * 시각(TIMESTAMPTZ) 범위 조회를 위한 반열린 구간 [startInclusive, endExclusive)을 반환한다.
 * 종료일 23:59:59 대신 '종료일 다음 날 00:00:00.000+09:00 미만'을 사용한다.
 */
export function getSeoulTimestampHalfOpenRange(
  startDateStr: string,
  endDateStr: string
): { startInclusive: Date; endExclusive: Date } {
  if (endDateStr < startDateStr) {
    throw new Error("종료일은 시작일보다 앞설 수 없습니다.");
  }
  const startInclusive = getSeoulDayStart(startDateStr);
  const nextDayStr = addDaysToDateOnly(endDateStr, 1);
  const endExclusive = getSeoulDayStart(nextDayStr);
  return { startInclusive, endExclusive };
}

/**
 * 할 일의 지연(Delayed) 여부를 판정한다.
 * 규칙:
 * - 현재 완료(DONE) 상태가 아니어야 함 (완료된 것은 마감일이 지났더라도 지연에서 제외)
 * - 마감일(dueDate, YYYY-MM-DD)이 Asia/Seoul 기준 오늘(todaySeoul, YYYY-MM-DD)보다 앞서야 함 (dueDate < todaySeoul)
 *   - 즉, 오늘 마감인 미완료 할 일은 아직 지연이 아니며, 어제 이전 마감인 미완료 할 일만 지연으로 판정한다.
 */
export function isTaskDelayedInSeoul(
  task: { status: "TODO" | "DONE" | string; dueDate: Date | string },
  referenceNow: Date = new Date()
): boolean {
  if (task.status === "DONE") return false;
  const dueDateStr = formatUtcDateToDateOnly(task.dueDate);
  if (!dueDateStr) return false;
  const todaySeoul = getSeoulDateString(referenceNow);
  return dueDateStr < todaySeoul;
}

/**
 * 시작 시각과 종료 시각으로부터 실제 소요 시간(정수 '분')을 계산한다.
 * 계약 문서(pds-schema-v2.json) 반올림 규칙:
 * Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)
 */
export function calculateActualMinutes(startedAt: Date, endedAt: Date): number {
  const diffMs = endedAt.getTime() - startedAt.getTime();
  if (diffMs < 0) {
    throw new Error("종료 시각은 시작 시각보다 빠를 수 없습니다.");
  }
  return Math.round(diffMs / 60000);
}

/**
 * TIMESTAMPTZ Date 객체를 Asia/Seoul 기준 읽기 쉬운 문자열(YYYY-MM-DD HH:mm)로 포맷팅한다.
 */
export function formatDateTimeSeoul(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day} ${hour}:${map.minute}`;
}

/**
 * datetime-local input용 Asia/Seoul 기준 YYYY-MM-DDTHH:mm 문자열 반환
 */
export function toSeoulDateTimeLocalValue(date: Date = new Date()): string {
  const formatted = formatDateTimeSeoul(date);
  return formatted.replace(" ", "T");
}

/**
 * datetime-local 문자열(예: "2026-10-29T14:30") 또는 ISO 문자열을 Asia/Seoul 기준 Date로 파싱한다.
 */
export function parseSeoulDateTimeInput(input: string): Date {
  const trimmed = input.trim();
  // 이미 타임존 오프셋(Z 또는 +09:00 등)이 포함된 경우 그대로 파싱
  if (/([Zz]|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    const dt = new Date(trimmed);
    if (isNaN(dt.getTime())) {
      throw new Error(`유효하지 않은 시각 형식입니다: ${input}`);
    }
    return dt;
  }
  // YYYY-MM-DDTHH:mm 형태인 경우 Asia/Seoul(+09:00) 부여
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(trimmed)) {
    const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    const dt = new Date(`${withSeconds}+09:00`);
    if (isNaN(dt.getTime())) {
      throw new Error(`유효하지 않은 시각 형식입니다: ${input}`);
    }
    return dt;
  }
  throw new Error(`지원하지 않는 시각 형식입니다 (YYYY-MM-DDTHH:mm 또는 ISO-8601 필요): ${input}`);
}

/**
 * 정수 '분' 단위를 화면 표시용 문자열로 변환한다. (단위 '분'을 항상 명시)
 */
export function formatMinutesWithUnit(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minutes));
  if (abs >= 60) {
    const hours = Math.floor(abs / 60);
    const rem = abs % 60;
    return rem > 0
      ? `${sign}${abs}분 (${sign}${hours}시간 ${rem}분)`
      : `${sign}${abs}분 (${sign}${hours}시간)`;
  }
  return `${minutes}분`;
}

