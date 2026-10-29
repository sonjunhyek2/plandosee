# 구현 및 검증 현황

구현 코드, DB 없는 자동 검사, 실제 외부 DB 검증을 구분합니다. 외부 DB에서 실행하지 않은 항목은 PASS로 표시하지 않습니다.

| 항목 | 구현 위치 | 현재 검증 상태 |
| --- | --- | --- |
| GitHub Pages 정적 화면 | `apps/web`, `output: export`, `/plandosee` basePath | **PASS** — 정적 빌드 성공 |
| 별도 서버 API | `apps/api/src/app/api` | **PASS** — Vercel용 API 빌드 성공 / 실제 배포는 PENDING |
| DB·Prisma의 브라우저 제외 | `apps/api`, `scripts/check-web-bundle.mjs` | **PASS** — 웹 산출물 22개 비밀값 경계 검사 통과 |
| Plan v1 및 수정 스냅샷 | `apps/api/src/lib/pds-service.ts`, `apps/api/prisma` | 코드·제약 구현 완료 / **PENDING_DB** |
| 완료 중복 방지 4개 시나리오 | 서비스 트랜잭션, 완료 이벤트 고유·부분 인덱스 | 코드·제약 구현 완료 / **PENDING_DB** |
| 할 일 논리 삭제와 기록 보존 | API 서비스 및 Prisma 관계 | 순수 필터 로직 PASS / DB 동작 **PENDING_DB** |
| 서울 날짜·시간과 입력 검증 | `packages/shared/src` | **PASS** — Vitest |
| 돌아보기 집계와 근거 목록 | `packages/shared/src/domain-logic.ts` | **PASS** — Vitest / DB 저장은 **PENDING_DB** |
| 회고에서 다음 계획 연결 | `apps/api/src/lib/pds-service.ts` | 코드 구현 완료 / **PENDING_DB** |
| 전체 JSON 내보내기 | `apps/api/src/app/api/export`, 계약 파일 | 계약 정적 검사 PASS / 실제 DB 내보내기 **PENDING_DB** |
| 테스트 DB 보호 | `apps/api/src/lib/prisma.ts` | **PASS** — test 전용, 정확한 host/DB 대조, 운영 URL 분리, 초기화 확인 문구 검사 |
| CORS | `apps/api/src/middleware.ts` | 빌드 PASS / 실제 배포 Origin 검증은 **PENDING_DEPLOY** |
| 동일 커밋 배포 | `/api/health`, Pages 수동 배포 workflow | 구현 완료 / 실제 배포 **PENDING_DEPLOY** |
| 실제 사용자 자료 | Neon 운영 DB | **PENDING** |

## 실행 결과

- `npm test`: 12개 통과
- `npm run build:web`: 정적 내보내기 통과
- `npm run verify:web-secrets`: 22개 파일 검사 통과
- `npm run build:api`: API 11개 경로와 middleware 빌드 통과

DB를 변경하는 `db:migrate:deploy`, `db:verify`, `db:test-reset`은 아직 실행하지 않았습니다.
