# 해보까

부산에서 창업하려는 청년에게 지금 신청할 수 있는 지원사업을 근거와 함께 추천하는 서비스.
ICT INNOHACK 2026 (동남권 이노베이션 해커톤) 참가 프로젝트. 기획 문서는 [docs/](docs/README.md).

운영 주소: https://haeboka.dreamp.org

## 구조

백엔드는 Rust → WebAssembly 로 빌드한 Cloudflare Worker 하나다. 웹은 같은 Worker 가 정적 파일(assets)로 내려준다.

- `gil-core` (`apps/api-rs/core`): 플랫폼 독립 로직. `worker` 의존이 없다.
- `gil-worker` (`apps/api-rs/worker`): workers-rs 어댑터.
  - Durable Object `GilApp`: API 와 저장소(Durable Object 안의 KV).
  - cron: 매일 K-Startup 공고를 수집한다.
  - `DocWorker`: 공고 첨부 문서를 처리하는 컨테이너. Upstage Document Parse 를 쓴다.
- AI: Upstage Solar 와 Document Parse. 모든 호출이 Cloudflare AI Gateway 를 지난다.
- 웹 (`apps/web`): React + Vite. 빌드 결과를 Worker assets 로 배포한다.

## 디렉터리

| 경로 | 내용 |
|---|---|
| `apps/api-rs/core` | `gil-core`: 자격 판정·추천 규칙 등 공용 로직 |
| `apps/api-rs/worker` | `gil-worker`: Worker, `wrangler.jsonc`, `wrangler.test.jsonc` |
| `apps/api-rs/goldens` | 동일성 검증용 기록 (`fn/`, `http/`) |
| `apps/api-rs/harness` | 골든 기록·비교 도구 (TS) |
| `apps/web` | 웹 앱 (React + Vite) |
| `apps/doc-worker` | DocWorker 컨테이너 이미지 |
| `apps/api` | TS 참조 구현 (아래 참고) |
| `packages/shared` | TS 공통 코드 (참조 구현과 웹이 쓴다) |
| `e2e` | 브라우저 E2E |
| `docs` | 기획 문서, 행사 자료 |

## 빌드와 테스트

Rust 명령은 `apps/api-rs` 에서 실행한다.

```sh
cd apps/api-rs
cargo test -p gil-core                              # 코어 테스트
cargo test -p gil-core --test fn_goldens            # 골든: 공용 함수
cargo test -p gil-core --test http_goldens          # 골든: HTTP 요청·응답
cargo install worker-build --version 0.9.0 --locked # 처음 한 번
cd worker && worker-build --release                 # wasm 빌드
```

골든을 다시 기록하는 방법은 [apps/api-rs/harness/README.md](apps/api-rs/harness/README.md).

## 로컬 실행

```sh
bun install
cd apps/api-rs/worker
../../api/node_modules/.bin/wrangler dev -c wrangler.test.jsonc   # 시험 설정
# 운영 설정으로 띄우려면 -c wrangler.jsonc
```

웹은 따로 띄운다: `bun run dev:web` (http://localhost:5173).

E2E 는 Rust 백엔드로 돌린다. 첫 빌드는 몇 분 걸린다. 자세한 내용은 [e2e/README.md](e2e/README.md).

```sh
E2E_BACKEND=rust e2e/run.sh
```

## 배포

웹을 먼저 빌드하고, Worker 디렉터리에서 배포한다.

```sh
cd apps/web && bunx vite build
cd ../api-rs/worker && ../../api/node_modules/.bin/wrangler deploy
```

배포 전 확인할 것은 `docs/todo.md` 5절.

## TS 참조 구현

`apps/api` 는 예전 TypeScript API 다. 지금은 Rust 백엔드와 동작이 같은지 비교하는 기준으로만 둔다. 골든은 이 코드의 테스트에서 기록하고, `apps/api-rs/harness/diff.ts` 가 비교한다.

## 데이터 출처

- 부산 창업지원 기관·자원 정보: 부산 지역 기관 자료
- 공고: 공공데이터포털 K-Startup (매일 03:00 KST 수집)

## 라이선스 고지

사용한 오픈소스의 라이선스는 서비스의 [/licenses](https://haeboka.dreamp.org/licenses) 페이지에 있다.
저장소 루트에는 별도 라이선스 파일이 없다.

## 팀

ICT INNOHACK 2026 참가팀. 결과물 제출 마감은 2026-11-28 12:00.
