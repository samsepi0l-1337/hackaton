# 골든 기록

```bash
# 공용 함수 (packages/shared/src export 호출)
GIL_RECORD_FN=apps/api-rs/goldens/fn bun test --preload ./packages/shared/test/setup-fixtures.ts --preload ./apps/api-rs/harness/record-fn.ts packages apps/api
# API 요청·응답 (apps/api/test/helpers.ts setup() 시나리오)
GIL_RECORD_HTTP=apps/api-rs/goldens/http bun test apps/api
```
기록은 TS 동작을 바꾸지 않는다 (환경 변수가 없으면 꺼짐).
