# AI Gateway (gil-gateway)

| 항목 | 값 |
|---|---|
| 게이트웨이 | `gil-gateway` (인증 켬, 로그 수집, 분당 120회 sliding) |
| 커스텀 provider | `upstage` → `https://api.upstage.ai/v1` (요청 시 `custom-upstage`) |
| Upstage 키 | 게이트웨이 BYOK (Provider Keys, alias `default`). Worker 에는 키가 없다 |
| Worker 인증 | secret `CF_AIG_TOKEN` (AI Gateway Run 권한만) |
| 운영 경로 | `UPSTAGE_BASE_URL=https://gateway.ai.cloudflare.com/v1/{account}/gil-gateway/custom-upstage` 로 Solar(`/chat/completions`)·Solar Decide(`/systemone`)·Document Parse(`/document-digitization`) 모두 게이트웨이를 지난다 |
| 메타데이터 | `cf-aig-metadata`: `app`, `task`(mentor·reason·summary·prep·draft·decide), `user_id` — 게이트웨이 로그·분석에서 작업별로 본다 |

## 동적 라우트 `dynamic/gil` (`route.json`)

만들고 배포했다 (사용자별 시간당 40회 → 하루 비용 한도 → mentor·reason·prep 은 Solar Mini, 나머지는 Solar Pro → 실패 시 Mini).
**아직 앱에서 쓰지 않는다 (`AI_MODE=route`).** 2026-11-27 확인 결과:

- Worker 바인딩 `env.AI.run('dynamic/gil')`: 커스텀 provider 노드가 업스트림 경로를 `/run` 으로 만들어 Upstage 404.
- `/compat/chat/completions` + `model: dynamic/gil`: 노드의 `custom-upstage` 가 `upstage` 로 바뀌어 `Provider not found` (2002).
- 노드 model 에 `custom-upstage/…` 를 넣으면 Upstage 까지 가지만 접두어가 붙은 모델 이름이라 거부.
- 기본 provider `upstage`: `Model execution failed`.

동적 라우트가 커스텀 provider 를 제대로 지원하면 `apps/api-rs/worker/wrangler.jsonc` 의 `AI_MODE` 를 `route` 로 바꾸면 된다 (코드는 `apps/api-rs/core/src/api/ai/` 에 있다).
그때까지 작업별 모델 선택(`SOLAR_MODELS`)과 실패 시 규칙 결과는 앱이, 요청 수 한도와 로그는 게이트웨이가 맡는다.

다시 만들기: `CF_API_TOKEN=… CF_ACCOUNT_ID=… infra/ai-gateway/setup.sh`
