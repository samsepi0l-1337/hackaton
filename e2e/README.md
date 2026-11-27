# E2E (ego lite)

브라우저는 ego lite(`ego-browser`)를 쓴다. `ego-browser skill` 로 API 를 확인한다.

```bash
e2e/run.sh                      # e2e/specs/*.mjs 전부
e2e/run.sh e2e/specs/10-explore.mjs
```

- API 는 메모리 저장소 + `AI_MODE=off`(외부 AI 호출 없음, 과금 0)로 18787 에, 웹은 Vite 로 15173 에 뜬다. 주소는 `127.0.0.1` 이다 (localhost 쿠키와 섞이지 않게).
- spec 은 prelude(`e2e/lib/prelude.mjs`) 도우미를 쓴다: `step`, `assert`, `eq`, `go`, `seeText`, `api`, `resetOrigin`, `newAccount`.
- 상태 정리는 `Storage.clearDataForOrigin`(이 출처만)으로 한다. 프로필 전체를 지우는 CDP 명령은 쓰지 않는다.
- 상담은 계정당 7일 3회라서, 상담하는 spec 은 `newAccount()` 로 새 계정을 만든다.
- `/bufs` 관리자 비밀번호는 `ADMIN_PASSWORD`(E2E 전용), 팀 계정은 시드 `team@test.local` / `team1234!`.
- 없는 spec 파일을 넘기면 FAIL 이다.
- 러너는 `E2E_MAIL_LOG=1` 로 API 를 띄운다. 메일 본문이 API 로그에 남아 `lastMailBody(email)`·`lastVerifyCode(email)` 로 인증 코드와 복구 비밀번호를 읽는다 (E2E 전용).
- 결과와 로그, 실패 스크린숏은 `e2e/.out/` 에 남는다.
