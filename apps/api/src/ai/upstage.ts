// Upstage 호출 공통: AI Gateway 경유인지, 직접 호출인지에 따라 인증 헤더를 고른다.
// - 게이트웨이 경유: UPSTAGE_BASE_URL = https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/custom-upstage
//   + CF_AIG_TOKEN(Run 권한). Upstage 키는 게이트웨이에 저장(BYOK)되어 Worker 는 키를 갖지 않는다.
// - 직접 호출: UPSTAGE_API_KEY (로컬 .dev.vars).
import type { Bindings } from '../env';

export function viaGateway(env: Partial<Bindings>): boolean {
  return !!env.CF_AIG_TOKEN && /gateway\.ai\.cloudflare\.com/.test(env.UPSTAGE_BASE_URL ?? '');
}

export function upstageReady(env: Partial<Bindings>): boolean {
  return viaGateway(env) || !!env.UPSTAGE_API_KEY;
}

export function upstageHeaders(env: Partial<Bindings>, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (viaGateway(env)) h['cf-aig-authorization'] = `Bearer ${env.CF_AIG_TOKEN}`;
  else if (env.UPSTAGE_API_KEY) h.authorization = `Bearer ${env.UPSTAGE_API_KEY}`;
  return h;
}
