# 골든 기록

`apps/api-rs/goldens` 는 고정된 회귀 데이터다. 평소에는 다시 기록하지 않는다.

공용 함수 골든(`goldens/fn`)은 `packages/shared` 테스트에서 기록한다. `record-fn.ts` 가 `packages/shared/src` 의 export 호출을 가로챈다.

```bash
GIL_RECORD_FN=apps/api-rs/goldens/fn bun test --preload ./packages/shared/test/setup-fixtures.ts --preload ./apps/api-rs/harness/record-fn.ts packages
```
환경 변수가 없으면 기록은 꺼진다.

`goldens/http` 는 더 이상 기록하지 않는다. 고칠 때는 JSON 을 직접 고치고 `cargo test -p gil-core --test http_goldens` 로 확인한다.
