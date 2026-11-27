# 해보까 (가칭)

ICT INNOHACK 2026 해커톤 프로젝트. 기획 문서는 [docs/](docs/README.md).

## 구조

| 경로 | 내용 |
|---|---|
| `packages/shared` | 공통: 타입, API 계약(`src/api.ts`), 상수(`src/constants.ts`), 자격 판정·추천 규칙, 테스트 데이터(`src/seed.ts`) |
| `apps/api` | API (Hono, Cloudflare Workers 대상). 저장은 메모리, 테스트 데이터로 시작 |
| `apps/web` | 목업 웹 (Vite + React). 디자인은 팀원이 교체 |

설계가 바뀌면 먼저 `packages/shared/src/constants.ts`와 `api.ts`를 고친다.

## 실행

```sh
bun install
bun test          # 공통 + API 테스트
bun run dev:api   # http://localhost:8787
bun run dev:web   # http://localhost:5173 (/api 는 8787로 프록시)
```

테스트 계정: `demo@test.local` / `demo1234!` (프로필 있음), `new@test.local` / `new1234!`, 팀 계정 `team@test.local` / `team1234!`.
공고는 모두 `[테스트]` 데이터이며, 마감일은 실행한 날 기준으로 만든다.

## 라이선스 고지

사용한 오픈소스: Hono (MIT), React (MIT), React Router (MIT), Vite (MIT), TypeScript (Apache-2.0), Bun (MIT).
