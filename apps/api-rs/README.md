# api-rs: Rust(workers-rs) 백엔드

해보까의 백엔드. Rust → WebAssembly 로 빌드한 Cloudflare Worker 하나다. https://haeboka.dreamp.org 에서 운영 중이다.

- `core/`: `gil-core`. 플랫폼 독립 로직 (`worker` 의존 없음). `cargo test -p gil-core`.
- `worker/`: `gil-worker`. Workers 어댑터 (GilApp Durable Object, 저장소 동기화, fetch·메일·AI·DocWorker, cron). DocWorker 컨테이너는 `apps/doc-worker`.
- `goldens/fn/`: 공용 함수의 입력·출력 기록 → `cargo test -p gil-core --test fn_goldens <모듈>`.
- `goldens/http/`: HTTP 요청·응답 기록 → `cargo test -p gil-core --test http_goldens <파일>`.
- 골든은 고정된 회귀 데이터다. 동작을 일부러 바꿀 때만 고친다. 공용 함수 골든 기록은 `harness/README.md` 참고 (`GIL_RECORD_FN`).

## 지원서 작성 제한
- `AppOpts.application_limit: Option<(횟수, 일수)>` (`core/src/app.rs`). 운영 Worker 는 `Some((2, 7))`, 즉 계정당 7일에 2회다 (`worker/src/lib.rs`). `None` 이면 제한이 없다.
- `GET /api/applications/quota`: 로그인한 계정의 `{used, limit, remaining, resetAt, blocked}`. 제한이 없으면 `limit`·`remaining`·`resetAt` 이 null.
- `POST /api/applications`: 제한을 넘으면 429 `application_limit`. 이메일 인증 전이면 403 `email_unverified`.
- `POST /api/applications/:id/polish`: Solar 가 칸별 다듬은 글을 제안한다 (저장 안 함). 지원서당 5회(429 `polish_limit`), AI 가 꺼져 있으면 503 `ai_unavailable`.
- `GET /api/applications/:id/export?format=docx|hwpx`: base64 JSON. 원본 양식이 DOCX·HWPX·PPTX 면 원본 양식에 채우고(`source: "form"`, `format` 은 원본 형식), HWP·PDF 면 그 항목 이름으로 공통 양식(`standard_form_fields`), 없으면 공통 양식(`standard`). 공통 양식은 `core/src/api/app/export.rs` 의 공문 형식.
- `POST /api/applications/:id/form-fill` `{fileName, fileBase64}`: 사용자가 올린 DOCX·HWPX·PPTX 양식(4MB)을 DocWorker `/fill` 로 채운다. 항목 별칭 `LABEL_ALIASES`. 이 경로만 본문 6MB 허용 (`worker/src/lib.rs`).

## 상담 채팅 횟수
- 보낸 채팅(답·모르겠어요·건너뛰기) 1개가 1회, 한 주 12회다. 첫 질문은 세지 않는다. 달력 주(일요일 0시 KST)로 센다 (`core/src/api/explore/quota.rs` `week_start`, `chat_quota_config`). 저장 키는 `chat:<계정 id>`. 팀 계정은 제외한다.
- `POST /api/explore/chat` 에 `{more:true}` 를 보내면 같은 상담에서 후속 질문을 이어 받는다 (최대 12문항, `chat.rs` `MAX_TOTAL_QUESTIONS`). 응답에 `quota`·`maxQuestions` 가 있다.

## 코드 규칙 (꼭 지킨다)
골든이 JS 와 같은 결과를 기대한다. 아래 규칙을 어기면 골든 테스트가 깨진다.
- 길이·자르기는 UTF-16 (`jsstr::len16`, `take16`). 한글은 UTF-8 3바이트라 `str::len` 은 틀린다.
- 공백·숫자: `str::trim`, 정규식 `\s` `\d` `\b` `\w` 는 유니코드라 JS 와 다르다. `jsstr::js_trim`, `jsstr::JS_WS`(정규식 `[...]` 안), `[0-9]`, ASCII lookaround 를 쓴다.
- 숫자를 글자로: `jsstr::js_number_string` / `js_value_string` (20.0 -> "20", 1e21 -> "1e+21"). serde `Value::to_string` 은 20.0 을 "20.0" 으로 쓴다.
- lookaround 정규식은 `fancy_regex`. 정렬은 안정 정렬. `localeCompare` 는 쓰는 곳마다 확인.
- 출력 JSON 은 `serde_json::Map`(입력 순서 유지). undefined(키 없음)와 null 구분. zod 처럼 기본값 채우기·모르는 키 제거·깨진 레코드 건너뛰기.
- 시각은 ms 정수, ISO 문자열은 밀리초 포함 (`jsstr::iso`). KST 날짜 계산 유지.

## 명령
```bash
cargo test -p gil-core                          # apps/api-rs 에서
cargo install worker-build --version 0.9.0 --locked   # 처음 한 번
cd worker && bun run dev                        # wrangler dev -c wrangler.test.jsonc
cd worker && bun run deploy                     # wrangler deploy (apps/web 을 먼저 빌드)
```

## 관리자 비밀번호 해시
```bash
PASSWORD_PEPPER=<secret> cargo run -q -p gil-core --example hash-admin-password   # 비밀번호는 표준 입력
cd worker && bunx wrangler secret put ADMIN_PASSWORD_HASH
```
