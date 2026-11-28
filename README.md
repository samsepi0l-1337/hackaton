# 해보까

부산에서 창업하려는 청년에게 지금 신청할 수 있는 지원사업을 근거와 함께 추천하는 서비스.
ICT INNOHACK 2026 (동남권 이노베이션 해커톤) 참가 프로젝트. 기획 문서는 [docs/](docs/README.md).

운영 주소: https://haeboka.dreamp.org

## 구조

백엔드는 Rust → WebAssembly 로 빌드한 Cloudflare Worker 하나다. 웹은 같은 Worker 가 정적 파일(assets)로 내려준다.

- `gil-core` (`apps/api-rs/core`): 플랫폼 독립 로직. `worker` 의존이 없다.
- `gil-worker` (`apps/api-rs/worker`): workers-rs 어댑터.
  - Durable Object `GilApp`: API 와 저장소(Durable Object 안의 KV).
  - cron: 매일 K-Startup 공고를 수집한다. 메인의 모집 중 건수·마감 임박 공고도 이 공고로 계산한다.
  - `DocWorker`: 공고 첨부 문서를 처리하는 컨테이너. Upstage Document Parse 를 쓴다.
- AI: Upstage Solar 와 Document Parse. 모든 호출이 Cloudflare AI Gateway 를 지난다.
- 웹 (`apps/web`): React + Vite. 해보까 포털 디자인([DESIGN.md](DESIGN.md)). 빌드 결과를 Worker assets 로 배포한다.

## 주요 기능

- 공고 모음 (`/programs`): K-Startup 실제 공고와 팀이 검수한 부산 교육·상담 자료. 모집 상태와 내 조건 대조 결과를 배지로 보여 준다. 정렬 select, 지역 선택(부산·울산·경남의 구·군·시·군), 마감 7일 이내 D-n·오늘 마감 배지, 5개 창 페이지 이동이 있다.
- AI 창업 상담 (`/mentor`): 관심·상황 → 구상 정리 → 준비 안내 3단계. 로그인한 사용자만 쓰고, 로그인 전에는 소개를 보여 준다. 공고 상세의 ‘내 구상에 맞는 준비 안내 받기’로 관심 공고를 정해 시작하면 그 공고, 하트, 최근 본 공고를 반영한다. 결과에 ‘다음에 할 일’과 추천 공고별 ‘지원서 작성’이 있다. 상담 채팅은 보낸 답 1개가 1회, 한 주 12회다 (일요일 0시 한국 시간에 다시 채운다). 요약 화면의 ‘AI와 더 이야기하기’로 한 상담에서 질문을 이어 받을 수 있다.
- 지원서 작성: 모집 중인 공고 상세(`/programs/:id`)에서 로그인한 사용자가 지원서 초안을 만든다. 공고 양식은 DocWorker 컨테이너가 받아 Upstage Document Parse 로 읽고(URL 별 캐시), Solar 가 신원 정보가 아닌 칸의 초안을 쓴다. `/applications/:id` 에서 수정 → 제출 전 확인 → 작성 완료 순서로 진행한다. 'AI로 다듬기'(지원서당 5회)로 칸별 다듬은 글을 받아 고를 수 있고, 작성한 지원서는 워드(DOCX)·파워포인트(PPTX)·한글(HWPX) 파일로 같은 내용을 내려받거나 인쇄 화면에서 PDF 로 저장한다. 공고에 공식 양식(DOCX·HWPX·PPTX)이 있으면 그 양식에 채우고, 없으면 공문 형식의 공통 양식을 쓴다. 사용자가 찾은 제출 양식(DOCX·HWPX·PPTX)을 올리면 그 양식에 채워 돌려준다. 해보까는 대신 제출하지 않는다. 파일을 받아 공식 사이트에서 직접 신청한다. 상담 자료로 초안을 미리 채우고, 이메일 인증을 마친 계정만 쓸 수 있으며, 지원서 작성은 계정당 7일에 2회까지다. 내 지원서는 `/me` 에서 본다.
- 창업 유형 테스트 (`/test`), 이용 방법 (`/guide`), 내 정보 (`/me`).
- `/bufs`: 팀 관리자 화면. 메뉴에는 링크가 없다.

페이지별 설명은 [docs/web-pages.md](docs/web-pages.md).

## 디렉터리

| 경로 | 내용 |
|---|---|
| `apps/api-rs/core` | `gil-core`: 자격 판정·추천 규칙 등 공용 로직 |
| `apps/api-rs/worker` | `gil-worker`: Worker, `wrangler.jsonc`, `wrangler.test.jsonc` |
| `apps/api-rs/goldens` | 고정 회귀 데이터 (`fn/`, `http/`) |
| `apps/api-rs/harness` | 공용 함수 골든 기록 도구 (`record-fn.ts`) |
| `apps/web` | 웹 앱 (React + Vite) |
| `apps/doc-worker` | DocWorker 컨테이너 이미지 |
| `packages/shared` | TS 공통 코드 (웹이 쓴다) |
| `e2e` | 브라우저 E2E |
| `docs` | 기획 문서, 행사 자료 |

## 빌드와 테스트

```sh
bun install                                   # 처음 한 번 (웹, shared, Worker 의 wrangler)
cd apps/web && bun run build                  # 웹 빌드
cd apps/api-rs && cargo test -p gil-core      # 코어 테스트 (골든 포함)
```

골든은 고정된 회귀 데이터다. 공용 함수 골든을 다시 기록하는 방법은 [apps/api-rs/harness/README.md](apps/api-rs/harness/README.md).

## 로컬 실행

```sh
bun install
cd apps/api-rs/worker && bun run dev    # wrangler dev -c wrangler.test.jsonc (시험 설정)
```

웹은 따로 띄운다: `bun run dev:web` (http://localhost:5173).

E2E 는 항상 Rust Worker 로 돌린다. 첫 빌드는 몇 분 걸린다. 자세한 내용은 [e2e/README.md](e2e/README.md).

```sh
e2e/run.sh
```

## 배포

웹을 먼저 빌드하고, Worker 디렉터리에서 배포한다.

```sh
cd apps/web && bun run build
cd ../api-rs/worker && bun run deploy    # wrangler deploy
```

배포 전 확인할 것은 `docs/todo.md` 5절.

관리자 비밀번호 해시는 이렇게 만든다. 비밀번호는 표준 입력으로 넣는다.

```sh
cd apps/api-rs
PASSWORD_PEPPER=<secret> cargo run -q -p gil-core --example hash-admin-password
cd worker && bunx wrangler secret put ADMIN_PASSWORD_HASH
```

## 데이터 출처

- 부산 창업지원 기관·자원 정보: 부산 지역 기관 자료
- 공고: 공공데이터포털 K-Startup (매일 03:00 KST 수집)

## 라이선스 고지

사용한 오픈소스의 라이선스는 서비스의 [/licenses](https://haeboka.dreamp.org/licenses) 페이지에 있다.
저장소 루트에는 별도 라이선스 파일이 없다.

## 팀

ICT INNOHACK 2026 참가팀. 결과물 제출 마감은 2026-11-28 12:00.
