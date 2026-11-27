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
- 상담 횟수 제한: 1인 7일 3회 (`CONSULT_LIMIT`). 상담 1회 = 대화가 빈 세션에서 `POST /api/explore/chat` 첫 질문을 받는 순간 (`counted` 로 재요청은 세지 않음). 회원은 user id, 비회원은 쿠키 id 와 접속 IP 해시(SHA-256(ip + `IP_HASH_SALT`), 원본 IP 저장 안 함)를 KV `quota:<key>` 에 7일치만 둔다. 어느 쪽이든 3회면 429 `limit` (`error.quota`). 초기화는 횟수를 돌려주지 않고, 팀 계정은 제외. 테스트용 `createApp({ consultLimit })`. 막은 횟수는 `/api/admin/stats` 의 `explore.limitHits`.
- 로컬 AI: 요청 헤더 `x-local-ai: mentor,reason,field` 에 든 작업은 Solar 를 부르지 않고 규칙 문장만 돌려준다 (웹이 로컬에서 다듬고 shared `guardText` 로 검사). 헤더에 없는 작업은 그대로.
- 현장 확인 질문(F12 P1): `GET /api/explore/result` 의 `fieldQuestions` (최대 3개). 규칙 `buildFieldQuestions` 가 현재 방식·실제 경험부터 묻고, AI 는 'field'(mentor 모델) 로 문장만 다듬는다 (사실·전제 검사 통과 시에만, 문제·방향이 바뀌면 다시 만든다).

## 실제 지원사업 수집 (K-Startup, F8)

공식 지원사업은 공공데이터포털 「창업진흥원_K-Startup 조회서비스」 `getAnnouncementInformation02` 의 실제 응답으로 채운다. 부산 모집 중 + 전국 모집 중 공고를 `pbanc_sn` 기준으로 합쳐 Durable Object KV(`ks:resource:<id>`, `ks:meta`)에 `Resource`(type '지원사업', id `ks-<pbanc_sn>`)로 둔다.

- 키: `wrangler secret put KSTARTUP_SERVICE_KEY` (일반 인증키. 디코딩 키 또는 인코딩 키 모두 가능, 서버가 한 번만 인코딩한다). 로컬 실행은 `KSTARTUP_SERVICE_KEY=... bun run dev:api`. 키는 코드·`vars` 에 두지 않는다.
- 수집 방법: (1) 매일 03:00 KST cron (`0 18 * * *` UTC, wrangler `triggers.crons`) 이 `scheduled` → GilApp `syncKStartup()` 를 부른다. (2) 팀 계정이 `POST /api/admin/kstartup/sync` 를 부르면 바로 수집하고 `KStartupSyncResponse`(`ok`, `fetchedAt`, `added`, `updated`, `closed`, `total`, `error`)를 돌려준다.
- 실패(키 없음·401·시간 초과(요청당 15초)·형식 이상·빈 응답)면 마지막으로 수집한 자료를 그대로 쓰고 `ks:meta.lastError` 에 기록한다. 확인일(`checkedAt`)은 수집한 날이라 오래된 자료를 최신으로 보이게 하지 않는다. 키가 없어도 앱은 동작한다.
- 이번 조회에 없는 이전 모집 중 공고는 지우지 않고 종료(`closed`)로 표시한다. 조회를 끝까지 받지 못했으면(10쪽 제한) 종료 표시는 건너뛴다.
- 쓰임: `/api/resources`, `/api/resources/:id`, 탐색 결과 추천, `/api/explore/options` 의 지역 자료 수가 `팀 검수 자료(교육·상담·공간) + 실제 지원사업` 을 합쳐 쓴다. 실제 지원사업이 하나라도 있으면 테스트 지원사업(`rs-kstartup-pre`)은 빠진다. 종료·마감 지난 공고는 추천에서 빠지고 자료 수에도 세지 않는다.
- `/api/programs`, `/api/home` 은 아직 기존 시드 `Program` 을 쓴다.
- 테스트는 가짜 fetch 만 쓴다 (`test/kstartup*.test.ts`, `packages/shared/test/kstartup-resource.test.ts`).
