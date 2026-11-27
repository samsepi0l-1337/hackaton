#!/usr/bin/env bash
# ego lite E2E 러너. API(메모리 저장소, AI 꺼짐)와 웹(Vite)을 전용 포트로 띄우고 spec 을 하나씩 ego-browser 로 돌린다.
# 사용: e2e/run.sh [spec 파일 ...]   (없으면 e2e/specs/*.mjs 전부)
# 환경: E2E_API_PORT(18787) E2E_WEB_PORT(15173) E2E_OUT(e2e/.out) E2E_PREVIEW(1 이면 운영 빌드를 vite preview 로)
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
API_PORT=${E2E_API_PORT:-18787}
WEB_PORT=${E2E_WEB_PORT:-15173}
# 쿠키는 포트가 아니라 호스트로 나뉜다. 러너마다 다른 *.localhost 호스트를 써서 동시에 돌려도 서로의 쿠키를 지우지 않는다.
E2E_HOST=${E2E_HOST:-e2e-$WEB_PORT.localhost}
BASE="http://$E2E_HOST:$WEB_PORT"
OUT=${E2E_OUT:-$ROOT/e2e/.out}
mkdir -p "$OUT"
API_LOG="$OUT/api.log"

for p in "$API_PORT" "$WEB_PORT"; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then echo "포트 $p 를 이미 쓰고 있어요. E2E_API_PORT/E2E_WEB_PORT 를 바꾸세요." >&2; exit 2; fi
done

# /bufs 관리자 비밀번호 (E2E 전용, 실제 값 아님). prelude 의 ADMIN_PASSWORD 와 같다.
ADMIN_HASH=$(cd "$ROOT/apps/api-rs" && printf '%s' 'e2e-admin-pass-1234' | PATH="$HOME/.cargo/bin:$PATH" cargo run -q -p gil-core --example hash-legacy-password) || exit 2
# Rust(workers-rs) worker; the first build can take several minutes.
rm -rf "$OUT/rs-state"
(cd "$ROOT/apps/api-rs/worker" && PATH="$HOME/.cargo/bin:$PATH" exec ./node_modules/.bin/wrangler dev -c wrangler.test.jsonc --port "$API_PORT" --ip 127.0.0.1 --persist-to "$OUT/rs-state" \
  --var AI_MODE:off --var DECIDE_ENABLED:0 --var PASSWORD_PEPPER:e2e-pepper-not-a-secret --var "ADMIN_PASSWORD_HASH:$ADMIN_HASH" --var E2E_MAIL_LOG:1 >"$API_LOG" 2>&1) &
API_PID=$!
if [ "${E2E_PREVIEW:-0}" = 1 ]; then
  # 운영 빌드(코드 분할 청크·에러 경계)를 시험한다: vite build 후 vite preview (server 의 proxy·allowedHosts 를 그대로 쓴다)
  (cd "$ROOT/apps/web" && bunx vite build >"$OUT/build.log" 2>&1) || { echo "vite build 실패: $OUT/build.log" >&2; exit 2; }
  (cd "$ROOT/apps/web" && WEB_PORT="$WEB_PORT" API_URL="http://127.0.0.1:$API_PORT" exec bunx vite preview --host 127.0.0.1 --port "$WEB_PORT" --strictPort >"$OUT/web.log" 2>&1) &
else
  (cd "$ROOT/apps/web" && WEB_PORT="$WEB_PORT" API_URL="http://127.0.0.1:$API_PORT" exec bunx vite --host 127.0.0.1 --strictPort >"$OUT/web.log" 2>&1) &
fi
WEB_PID=$!
cleanup() { pkill -P "$API_PID" 2>/dev/null; kill "$API_PID" "$WEB_PID" 2>/dev/null; wait "$API_PID" "$WEB_PID" 2>/dev/null; }
trap cleanup EXIT

WAIT=1200
for i in $(seq 1 $WAIT); do
  curl -sf "http://127.0.0.1:$API_PORT/api/health" >/dev/null && curl -sf "$BASE/" >/dev/null && break
  sleep 0.5
  [ "$i" = $WAIT ] && { echo "서버가 뜨지 않았어요. $OUT/*.log 를 보세요." >&2; exit 2; }
done

SPECS=("$@")
[ ${#SPECS[@]} -eq 0 ] && SPECS=("$ROOT"/e2e/specs/*.mjs)
pass=0; fail=0; failed=()
for f in "${SPECS[@]}"; do
  name=$(basename "$f" .mjs)
  if [ ! -f "$f" ]; then fail=$((fail + 1)); failed+=("$name"); echo "FAIL $name: spec 파일이 없어요 ($f)"; continue; fi
  run="$OUT/$name.run.mjs"
  {
    sed -e "s|__BASE__|$BASE|" -e "s|__SPEC__|$name|" -e "s|__API_LOG__|$API_LOG|" -e "s|__OUT__|$OUT|" "$ROOT/e2e/lib/prelude.mjs"
    echo 'let __err = null;'
    echo 'try {'
    cat "$f"
    echo '} catch (e) { __err = e; }'
    cat "$ROOT/e2e/lib/epilogue.mjs"
  } >"$run"
  start=$(date +%s)
  ego-browser nodejs <"$run" >"$OUT/$name.log" 2>&1
  rc=$?
  secs=$(( $(date +%s) - start ))
  if [ $rc -eq 0 ]; then pass=$((pass + 1)); echo "PASS $name (${secs}s)"; else fail=$((fail + 1)); failed+=("$name"); echo "FAIL $name (${secs}s) → $OUT/$name.log"; grep -h '"ok":false' "$OUT/$name.log" | head -3; fi
done
echo "E2E: $pass pass, $fail fail"
[ $fail -eq 0 ]
