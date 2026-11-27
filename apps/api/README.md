# @gil/api

Hono API. 구현은 `feat/api` 브랜치에서 한다. 계약: `packages/shared/src/api.ts`.

## AI (Upstage Solar, Solar Decide)

기본은 꺼짐(`AI_MODE=off`)이라 외부 호출이 없고 규칙 결과만 나온다. 켜는 법:

```sh
AI_MODE=upstage UPSTAGE_API_KEY=... bun run dev:api            # 문장 생성(Solar)
AI_MODE=upstage UPSTAGE_API_KEY=... DECIDE_ENABLED=1 bun run dev:api   # + 관련도(Solar Decide)
```

- `AI_MODE=route`: Workers AI 바인딩으로 AI Gateway 동적 라우트 `dynamic/gil` 호출 (로컬에서도 원격 호출).
- `UPSTAGE_BASE_URL`, `CF_AIG_TOKEN`, `AI_GATEWAY_ID`로 게이트웨이 경유 설정.
- 작업: F2 되묻기 말투, F3 요약(JSON), F6 추천 이유, F12 7일 계획(1일차는 규칙 고정), F13 지원서 초안(신원 항목 제외). Decide는 Top3 순서에만 영향을 주고 자격 불가 공고는 후보에서 빠진다.
- 모든 생성 문장은 `src/ai/guard.ts`가 금액·날짜·공고 이름을 검사한다. 지어낸 값이 있거나 시간 초과(8초)·HTTP 오류·JSON 파싱 실패면 규칙 결과를 쓴다.
- 비용: Upstage 호출은 사용량 과금이다. 결과 화면 한 번에 이유 3회 + 계획 1회(+ Decide 1회)를 부른다. 테스트는 가짜 fetch만 쓴다.
- Solar Decide는 베타 약관 동의가 필요하다(미동의 시 403 → 규칙 점수).

## 탐색 API (개정 기획, 비회원)

`/api/explore/*`, `/api/resources` 는 로그인 없이 쓴다. 첫 쓰기 요청에서 게스트 id 와 HttpOnly 쿠키 `sid`(`g-…`)를 만들고, 상태는 KV `explore:<id>` 에 저장한다 (회원은 user id). `DELETE /api/explore/session` 은 기록과 게스트 쿠키를 지운다.

- 규칙(검증·문제 카드·조건 대조·추천·준비 안내·요약·지역 카드): `packages/shared/src/explore-rules.ts` (순수 함수)
- 라우트: `src/explore/routes.ts`, 질문 표: `src/explore/chat.ts`, AI 보조(사실 검사·실패 시 규칙 문장): `src/explore/ai.ts`
- AI 호출은 행위자당 시간당 40회(메모리). 넘으면 규칙 문장을 쓴다. `AI_MODE=off` 면 AI 를 부르지 않는다.
- 저장소는 모양이 맞지 않는 레코드를 건너뛰고(경고 한 줄), `meta:schema` 에 버전을 기록한다.
- `POST /api/explore/chat` 의 선택 필드 `questionIndex`: 화면이 보던 질문 번호. 이미 지난 번호면 재전송으로 보고 무시한다.
- `/api/admin/stats` 에 `explore`(비회원·회원 분리, 기기 세션 단위) 가 추가된다.
