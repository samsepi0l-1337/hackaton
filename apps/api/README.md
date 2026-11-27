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

## 계정 API (2026-11-27)

코드: `src/auth.ts`(라우트), `src/mail.ts`(메일), `src/password.ts`(비밀번호), `src/bufs.ts`(관리자). 규칙·상수: `packages/shared/src/account.ts`.

- 가입 `POST /api/auth/signup`: `passwordConfirm` 필수, `checkPassword`·이메일·동의 검사(400 `validation`). 계정은 `emailVerified:false`, 인증 메일 1통, 201 `SignupResponse`, 로그인 안 됨. 미인증 이메일로 다시 가입하면 비밀번호를 새 값으로 바꾸고 메일을 다시 보낸다(60초 제한 안이면 `verificationSent:false`). 인증된 이메일은 409.
- 인증 `POST /api/auth/verify`: `{token}` 또는 `{email, code}`. 토큰(32바이트 base64url)과 6자리 코드는 SHA-256 해시만 KV `verify:<userId>`(24시간)에 둔다. 틀린 코드 5번이면 429 `too_many`, 다시 보내야 한다. 성공하면 세션 쿠키와 `AuthResponse`. `POST /api/auth/verify/resend {email}`: 항상 `{ok:true}`, 이메일(해시)당 60초 1회 아니면 429 `too_many`(계정이 없어도 같은 제한).
- 로그인: 미인증도 되지만 `emailVerified:false` 라 `/api/explore/*`(options·problems 제외)는 403 `email_unverified`, 비로그인은 401. `/api/resources` 는 공개. 시드 사용자는 인증됨. 필드가 없는 예전 사용자 레코드는 미인증(시드 제외).
- 비밀번호 찾기 `POST /api/auth/forgot`: 항상 200 + `FORGOT_PASSWORD_NOTICE`. 인증을 마친 계정에만 12자(영문+숫자) 복구 비밀번호를 메일로 보낸다(미인증 계정은 인증 메일 다시 받기). 해시만 KV `recovery:<userId>`(30분, 1회 로그인용). 이메일당 10분 1회(넘으면 조용히 무시). 복구 비밀번호를 쓰기 전까지 기존 비밀번호도 된다. 복구 비밀번호로 로그인한 세션은 `mustChangePassword:true`: `/api/auth/me`·`/api/auth/password`·`/api/auth/logout` 말고는 모두 403 `password_change_required`.
- 변경 `POST /api/auth/password`: 로그인 필요. 현재 비밀번호(복구 세션은 복구 비밀번호도) 확인, 새 비밀번호 규칙·확인 일치, 현재와 달라야 한다. 성공하면 복구 레코드와 다른 세션을 지우고 현재 세션만 남긴다.
- 비밀번호 저장: `bcrypt$` + bcrypt(cost `BCRYPT_COST`) 해시. 입력은 base64(HMAC-SHA256(secret `PASSWORD_PEPPER`, 비밀번호)). 예전 `pbkdf2$` 해시(시드·이전 계정)도 검증하고 로그인 성공 때 새 방식으로 바꾼다. `PASSWORD_PEPPER` 가 없으면 개발용 상수를 쓰고 경고 한 줄을 남긴다(운영에서는 반드시 설정).
- 메일: 인터페이스 `Mailer`. `env.EMAIL`(Cloudflare Email Service 바인딩) + `MAIL_FROM` 이 있으면 그것으로 보낸다(오류는 `code` 만 로그). 없으면 개발용 메일러: 받는 사람·제목만 로그에 쓰고, 개발 전용으로 인증 링크도 한 줄 보여 준다(복구 비밀번호·코드는 안 남김). `createApp({ mailer })` 로 바꿀 수 있고, 개발용 `createDevMailer().sent` 에 최근 메일이 남는다. 링크는 `APP_ORIGIN`(없으면 요청 origin)`/verify?token=...`. 메일 전송이 실패해도 resend·forgot 응답은 같다.
- 내 정보 `GET/PUT /api/me/profile`: `BasicProfile`(나이 0~120, 거주지, 사업자 여부, 직업). 탐색 결과·`/api/resources` 에서 직접 입력한 조건이 없을 때 기본 조건(직업은 affiliation)으로 쓴다. 계정과 함께 지워진다.
- 계정 삭제 `DELETE /api/me`: 세션·상담·지원서와 인증·복구·한도·내 정보 레코드를 지운다. `/api/admin/stats` 에 `accounts: {verified, unverified}`(팀 제외) 가 붙는다.

### /bufs 관리자

- `POST /api/bufs/login {password}`: secret `ADMIN_PASSWORD_HASH`(bcrypt+pepper 해시)와 비교. IP 해시별로 5번 틀리면 10분 잠금(429 `too_many`, KV `bufslock:*`). 성공하면 `bufs_sid` 쿠키(HttpOnly, SameSite=Strict, https 면 Secure, 8시간)와 KV 세션. 사용자 세션과 따로다. `GET /api/bufs/me`, `POST /api/bufs/logout`.
- `GET /api/bufs/feedback?limit=&offset=`: 관리자만(없으면 401). 의견 제출은 한 건씩 KV `feedback:<id>` 에 남는다(제출 시점의 준비 단계·문제·검토 지역, 가린 이메일 `ab***@도메인`, 원문 대화 없음). 최신순과 요약 비율·평균.
- 해시 만들기(평문이 저장소에 들어가지 않게 표준 입력으로): `echo -n '<비밀번호>' | PASSWORD_PEPPER=<secret 과 같은 값> bun apps/api/scripts/hash-admin-password.ts`, 출력을 `wrangler secret put ADMIN_PASSWORD_HASH` 로 넣는다.

## 탐색 API (개정 기획, 로그인 필요)

`/api/explore/options`, `/api/explore/problems`, `/api/resources` 만 공개. 나머지 `/api/explore/*` 는 로그인한 인증 사용자만(401 `unauthorized` / 403 `email_unverified` / 403 `password_change_required`). 비회원 세션(게스트 쿠키)은 없다. 상태는 KV `explore:<userId>`. 예전 게스트 기록은 무시한다. `DELETE /api/explore/session` 은 내 탐색 기록만 지운다(로그인 쿠키는 그대로).

- 규칙(검증·문제 카드·조건 대조·추천·준비 안내·요약·지역 카드): `packages/shared/src/explore-rules.ts` (순수 함수)
- 라우트: `src/explore/routes.ts`, 질문 표: `src/explore/chat.ts`, AI 보조(사실 검사·실패 시 규칙 문장): `src/explore/ai.ts`
- AI 호출은 행위자당 시간당 40회(메모리). 넘으면 규칙 문장을 쓴다. `AI_MODE=off` 면 AI 를 부르지 않는다.
- 저장소는 모양이 맞지 않는 레코드를 건너뛰고(경고 한 줄), `meta:schema` 에 버전을 기록한다.
- `POST /api/explore/chat` 의 선택 필드 `questionIndex`: 화면이 보던 질문 번호. 이미 지난 번호면 재전송으로 보고 무시한다.
- `/api/admin/stats` 에 `explore`(예전 게스트 기록은 `guests`, 계정은 `accounts`) 가 추가된다.
- 상담 횟수 제한: 1인 7일 3회 (`CONSULT_LIMIT`). 상담 1회 = 대화가 빈 세션에서 `POST /api/explore/chat` 첫 질문을 받는 순간 (`counted` 로 재요청은 세지 않음). 계정 id 로만 센다(KV `quota:u:<id>`, 7일치). 행사장처럼 같은 IP 를 여럿이 써도 각자 3회이고, 쿠키·IP 키는 쓰지 않는다. 3회면 429 `limit` (`error.quota`). 초기화는 횟수를 돌려주지 않고, 팀 계정은 제외. 테스트용 `createApp({ consultLimit })`. 막은 횟수는 `/api/admin/stats` 의 `explore.limitHits`.
- 로컬 AI: 요청 헤더 `x-local-ai: mentor,reason,field` 에 든 작업은 Solar 를 부르지 않고 규칙 문장만 돌려준다 (웹이 로컬에서 다듬고 shared `guardText` 로 검사). 헤더에 없는 작업은 그대로.
- 현장 확인 질문(F12 P1): `GET /api/explore/result` 의 `fieldQuestions` (최대 3개). 규칙 `buildFieldQuestions` 가 현재 방식·실제 경험부터 묻고, AI 는 'field'(mentor 모델) 로 문장만 다듬는다 (사실·전제 검사 통과 시에만, 문제·방향이 바뀌면 다시 만든다).
