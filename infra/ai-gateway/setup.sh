#!/usr/bin/env bash
# AI Gateway 구성: 게이트웨이 gil-gateway, 커스텀 provider upstage, 동적 라우트 gil.
# 필요: CF_API_TOKEN (AI Gateway Edit 권한), CF_ACCOUNT_ID.
# Upstage 키(BYOK)는 대시보드 > AI Gateway > gil-gateway > Provider Keys 에서 넣는다.
set -euo pipefail
: "${CF_API_TOKEN:?}" "${CF_ACCOUNT_ID:?}"
B="https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai-gateway"
H=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "content-type: application/json")
DIR="$(cd "$(dirname "$0")" && pwd)"

curl -s -X POST "$B/gateways" "${H[@]}" -d '{"id":"gil-gateway","collect_logs":true,"cache_ttl":0,"cache_invalidate_on_update":true,"rate_limiting_interval":60,"rate_limiting_limit":120,"rate_limiting_technique":"sliding","authentication":true}' | head -c 200; echo
curl -s -X POST "$B/custom-providers" "${H[@]}" -d '{"name":"Upstage","slug":"upstage","base_url":"https://api.upstage.ai/v1","enable":true}' | head -c 200; echo
curl -s -X POST "$B/gateways/gil-gateway/routes" "${H[@]}" --data-binary @"$DIR/route.json" | head -c 300; echo
