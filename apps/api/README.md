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
