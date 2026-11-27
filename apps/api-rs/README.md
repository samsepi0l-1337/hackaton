# api-rs — Rust(workers-rs) 백엔드

TS `apps/api` 와 같은 동작을 내는 Rust 백엔드. 동일성 검증을 통과하면 전환한다. 그 전까지 TS 가 운영된다.

- `core/`: 플랫폼 독립 로직 (`worker` 의존 없음). `cargo test -p gil-core`.
- `worker/`: Workers 어댑터 (GilApp DO, 저장소 동기화, fetch·메일·AI·doc-worker, cron). DocWorker 컨테이너는 TS(`js/entry.ts`).
- `goldens/fn/`: TS 테스트가 기록한 공용 함수 입력·출력 → `cargo test -p gil-core --test fn_goldens <모듈>`.
- `goldens/http/`: TS API 테스트가 기록한 요청·응답 → `cargo test -p gil-core --test http_goldens <파일>`.
- 골든 다시 기록: `harness/README` 참고 (`GIL_RECORD_FN`, `GIL_RECORD_HTTP`).

## JS 와 다른 점 (꼭 지킨다)
- 길이·자르기는 UTF-16 (`jsstr::len16`, `take16`). 한글은 UTF-8 3바이트라 `str::len` 은 틀린다.
- lookaround 정규식은 `fancy_regex`. 정렬은 안정 정렬. `localeCompare` 는 쓰는 곳마다 확인.
- 출력 JSON 은 `serde_json::Map`(입력 순서 유지). undefined(키 없음)와 null 구분. zod 처럼 기본값 채우기·모르는 키 제거·깨진 레코드 건너뛰기.
- 시각은 ms 정수, ISO 문자열은 밀리초 포함 (`jsstr::iso`). KST 날짜 계산 유지.

## 로컬 실행
```bash
cargo install worker-build --version 0.9.0 --locked
cd worker && ../../api/node_modules/.bin/wrangler dev -c wrangler.test.jsonc
```
