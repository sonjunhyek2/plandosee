# 플랜두씨 다이어리 (Plan → Do → See)

로그인 없이 계획, 할 일, 실제 실행 기록, 돌아보기와 다음 계획을 연결하는 다이어리입니다. 실제 자료는 Neon PostgreSQL에 저장합니다.

## 무료 배포 구조

- 화면: GitHub Pages (`https://아이디.github.io/plandosee/`)
- 서버 API: Vercel Hobby의 Next.js Functions
- DB: Neon Free PostgreSQL
- 소스: 하나의 GitHub 저장소

유료 플랜, 유료 체험, 종량제, 유료 부가 기능은 사용하지 않습니다. 계정 확인과 배포 순서는 [무료 배포 안내](./docs/FREE_DEPLOYMENT.md)를 따릅니다.

## 폴더 구조

- `apps/web`: GitHub Pages용 정적 Next.js 화면
- `apps/api`: Vercel용 Next.js API와 Prisma
- `packages/shared`: 화면과 API가 함께 사용하는 타입·날짜·검증·집계 코드
- `contracts`: DB와 JSON 내보내기 계약
- `tests`: DB 없이 실행하는 단위 테스트

## 로컬 실행

```bash
npm install
npm run dev:api
npm run dev:web
```

웹은 `http://localhost:3000/plandosee/`, API는 `http://localhost:3001`을 사용합니다. 로컬 설정은 `apps/web/.env.example`과 `apps/api/.env.example`을 각각 같은 폴더의 `.env.local`로 복사해 작성합니다. 비밀 연결 문자열을 커밋하지 마세요.

## 안전한 검사

```bash
npm test
npm run build:web
npm run verify:web-secrets
npm run build:api
```

`build:web`은 완전한 정적 결과를 `apps/web/out`에 만듭니다. `verify:web-secrets`는 정적 결과에 DB 주소나 Prisma 코드가 섞이지 않았는지 검사합니다.

다음 명령은 실제 DB를 변경하므로 전용 Neon 테스트 브랜치를 설정하고 보호 장치를 확인하기 전에는 실행하지 마세요.

```bash
npm run db:migrate:deploy
npm run db:verify
npm run db:test-reset
```

테스트 DB 작업은 `PDS_DB_ENV=test`, 별도 `TEST_DATABASE_URL`, 정확한 테스트 host/database 식별자가 모두 일치해야 합니다. 전체 초기화에는 추가 확인 문구도 필요합니다.
