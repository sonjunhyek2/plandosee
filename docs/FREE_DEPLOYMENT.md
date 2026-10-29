# 0원 배포 및 계정 확인 안내

이 프로젝트는 GitHub Pages + Vercel Hobby + Neon Free만 사용합니다. 유료 체험 시작, Pro/Launch 전환, 결제수단 등록, 유료 Marketplace 연동은 하지 않습니다.

## 1. 배포 전 무료 플랜 확인

### GitHub

1. 저장소를 개인 계정의 공개 저장소로 만듭니다.
2. 저장소 `Settings → Pages`에서 Source를 `GitHub Actions`로 선택합니다.
3. `Settings → Billing and licensing → Budgets and alerts`에서 Actions 유료 사용 예산이 있다면 `Stop usage when budget limit is reached`를 켭니다.
4. Larger runner, 유료 Actions Marketplace 앱, 유료 Codespaces는 사용하지 않습니다.

공개 저장소와 GitHub Pages의 표준 GitHub-hosted runner 사용은 무료입니다. 비공개 저장소로 바꿀 경우 계정 플랜과 Actions 한도를 다시 확인해야 합니다.

Pages 결과물은 1GB 이하여야 하고 월 100GB의 soft bandwidth limit이 있습니다. 초과 시 사이트 제공이 중단되거나 GitHub Support 안내를 받을 수 있습니다. 이 프로젝트의 현재 정적 결과물은 이 제한보다 매우 작지만, Actions와 Pages 사용량 화면을 정기적으로 확인합니다.

### Vercel

1. 로그인 후 왼쪽 위 team switcher에서 개인 Hobby 팀을 선택합니다.
2. 팀 이름 옆 플랜이 정확히 `Hobby`인지 확인합니다.
3. `Settings → Billing`에서 Pro, Pro Trial, Enterprise가 아닌지 확인합니다.
4. 결제수단 입력, `Start Pro Trial`, `Upgrade`, 유료 add-on을 누르지 않습니다.
5. `Usage`에서 최근 30일의 Active CPU, Provisioned Memory, Function Invocations, Fast Data Transfer를 확인합니다.
6. 저장소가 GitHub 조직 소유이면 Hobby Git 연결이 지원되지 않을 수 있으므로 개인 계정 저장소를 사용합니다.

Hobby는 추가 사용량을 구매할 수 없고 무료 한도를 넘으면 프로젝트가 일시 중지됩니다. 자동 종량제 결제로 넘어가지 않습니다.

### Neon

1. Neon Console에서 조직/계정의 플랜이 정확히 `Free`인지 확인합니다.
2. `Launch`, `Scale`, 유료 체험 또는 유료 add-on을 선택하지 않습니다.
3. 결제수단 등록을 요구하는 화면이 나오면 중단합니다.
4. 프로젝트의 `Monitoring` 또는 사용량 화면에서 Compute, Storage, Public network transfer를 확인합니다.
5. 운영 branch와 검증용 branch를 분리하고 각 endpoint host를 기록합니다.

Free 한도에 도달하면 해당 프로젝트 사용이 월말까지 잘릴 수 있습니다. 자동 유료 전환을 전제로 진행하지 않습니다.

## 2. Neon Free 설정

1. Free 프로젝트를 하나 만듭니다.
2. 운영 branch와 별도 테스트 branch를 만듭니다.
3. 각 branch에서 pooled URL과 direct URL을 구분해 복사합니다.
4. 실제 URL은 로컬 비밀 환경변수 또는 Vercel 환경변수에만 저장합니다.
5. 테스트 endpoint의 host와 database 이름을 `PDS_TEST_DB_HOST`, `PDS_TEST_DB_NAME`에 기록합니다.
6. 운영 URL을 테스트 URL로 복사하지 않았는지 다시 비교합니다.

Neon Free compute는 미사용 5분 후 scale-to-zero 됩니다. 장시간 미사용 뒤 첫 요청은 compute 재개 때문에 느릴 수 있습니다.

## 3. Vercel Hobby API 설정

1. 개인 Hobby 팀에서 `Add New → Project`를 선택합니다.
2. 이 저장소를 연결하고 Root Directory를 `apps/api`로 지정합니다.
3. Root Directory 설정의 `Include source files outside of the Root Directory in the Build Step`이 켜져 있는지 확인합니다. API가 `packages/shared`를 사용하므로 필요합니다.
4. Framework Preset은 Next.js를 사용합니다.
5. 다음 Production 환경변수를 추가합니다.

   - `DATABASE_URL`: Neon 운영 branch pooled URL
   - `DIRECT_URL`: Neon 운영 branch direct URL
   - `PDS_DB_ENV`: `production`
   - `ALLOWED_ORIGINS`: `https://아이디.github.io`

6. Pro Trial이나 유료 기능 제안은 건너뜁니다.
7. 배포 후 `/api/health`에서 `commitSha`가 제출 커밋과 같은지 확인합니다.

API 배포 전에 DB 마이그레이션과 통합 검증은 테스트 branch에서 먼저 수행해야 합니다. 운영 DB 초기화 명령은 실행하지 않습니다.

## 4. GitHub Pages 배포

1. Vercel이 제출 커밋의 API 배포를 마칠 때까지 기다립니다.
2. GitHub 저장소의 `Actions → Deploy GitHub Pages from verified free API → Run workflow`를 선택합니다.
3. `api_base_url`에 Vercel의 경로 없는 HTTPS 주소를 입력합니다.
4. 세 서비스가 모두 무료 플랜임을 대시보드에서 다시 확인한 뒤 체크박스를 선택합니다.
5. 워크플로는 API의 커밋 SHA와 CORS를 확인한 경우에만 같은 SHA의 Pages 결과를 배포합니다.

무료 플랜 확인 체크박스가 꺼져 있거나 API SHA/CORS가 다르면 Pages 배포는 실행되지 않습니다.

## 5. 중단 가능성과 확인 위치

- GitHub: `Settings → Billing and licensing`, Actions 사용량 및 workflow artifact 저장 공간
- Vercel: 팀 `Usage`; 한도 접근 알림과 프로젝트 pause 여부
- Neon: 프로젝트 사용량; compute, storage, network transfer 한도
- Neon 휴면: 오류가 아니라 scale-to-zero이며 첫 요청이 잠시 느릴 수 있음
- Vercel 한도 초과: API가 중지될 수 있고 Pages 화면에는 서버 연결 오류가 표시됨
- Neon 한도 초과: API는 살아 있어도 DB 요청이 실패할 수 있음

한도 문제를 해결하기 위해 유료 전환하지 않습니다. 다음 무료 주기까지 기다리거나 불필요한 배포·요청·데이터를 줄입니다.
