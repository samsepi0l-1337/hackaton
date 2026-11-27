# E2E (ego lite)

브라우저는 ego lite(`ego-browser`)를 쓴다. `ego-browser skill` 로 API 를 확인한다.

```bash
e2e/run.sh                      # e2e/specs/*.mjs 전부
e2e/run.sh e2e/specs/10-explore.mjs
```

- spec 은 16개: `00-smoke`, `10-explore-01~03`, `20-auth-01~03`, `30-browse-01~05`, `31-portal-nav`, `32-applications`, `33-focus-quota`, `99-bufs-lockout`. `33-focus-quota` 는 공고에서 관심 공고로 상담을 시작하는 흐름과 지원서 주 2회 제한을 본다.
- API 는 Rust Worker(`apps/api-rs/worker`, `wrangler dev -c wrangler.test.jsonc`) + `AI_MODE=off`(외부 AI 호출 없음, 과금 0)로 18787 에, 웹은 Vite 로 15173 에 뜬다. 저장소는 실행마다 `e2e/.out/<웹 포트>/rs-state` 에 새로 만든다. 첫 빌드는 몇 분 걸린다. 주소는 `http://e2e-<웹 포트>.localhost:<웹 포트>` 이다. 쿠키는 포트가 아니라 호스트로 나뉘므로, 러너마다 호스트를 달리해 동시에 돌려도 서로의 쿠키를 지우지 않는다.
- spec 은 prelude(`e2e/lib/prelude.mjs`) 도우미를 쓴다: `step`, `assert`, `eq`, `go`, `seeText`, `api`, `resetOrigin`, `newAccount`.
- 상태 정리는 `Storage.clearDataForOrigin`(이 출처만)으로 한다. 프로필 전체를 지우는 CDP 명령은 쓰지 않는다.
- 상담은 계정당 7일 3회라서, 상담하는 spec 은 `newAccount()` 로 새 계정을 만든다.
- `/bufs` 관리자 비밀번호는 `ADMIN_PASSWORD`(E2E 전용), 팀 계정은 시드 `team@test.local` / `team1234!`.
- 없는 spec 파일을 넘기면 FAIL 이다.
- `E2E_PREVIEW=1 e2e/run.sh` 는 `vite build` 결과를 `vite preview` 로 띄워 운영 번들(코드 분할 청크, 에러 경계)을 시험한다.
- 러너는 `E2E_MAIL_LOG=1` 로 Worker 를 띄운다. 메일 본문이 Worker 로그에 남아 `lastMailBody(email)`·`lastVerifyCode(email)` 로 인증 코드와 복구 비밀번호를 읽는다 (E2E 전용).
- 결과와 로그, 실패 스크린숏은 `e2e/.out/<웹 포트>/` 에 남는다 (러너마다 폴더가 달라 동시에 돌려도 서로 지우지 않는다).
