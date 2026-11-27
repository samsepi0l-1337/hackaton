// Worker 바인딩과 변수. 로컬 Bun 실행(server.ts)에서는 process.env 에서 같은 이름을 읽는다.
// 키가 없거나 AI_MODE=off(기본)면 외부 AI를 부르지 않고 규칙 결과를 쓴다.

export interface Bindings {
  /** 'off' | 'upstage' | 'route'. 기본 off. */
  AI_MODE?: string;
  /** Upstage API 키 (secret). Solar·Solar Decide·Document Parse 공통. */
  UPSTAGE_API_KEY?: string;
  /** Upstage 호출 기본 URL. AI Gateway 커스텀 프로바이더를 쓰면 게이트웨이 URL. 기본 UPSTAGE_BASE_URL. */
  UPSTAGE_BASE_URL?: string;
  /** AI Gateway 인증 토큰 (게이트웨이 인증을 켰을 때, cf-aig-authorization). */
  CF_AIG_TOKEN?: string;
  /** Workers AI 바인딩. route 모드에서 dynamic/gil 호출. 로컬 dev에서도 원격 호출이라 사용량이 잡힌다. */
  AI?: Ai;
  /** 동적 라우트가 있는 AI Gateway 이름. 기본 AI_GATEWAY_ID_DEFAULT. */
  AI_GATEWAY_ID?: string;
  /** '1' 이면 관련도에 Solar Decide 를 쓴다 (AI_MODE 가 off 가 아닐 때). */
  DECIDE_ENABLED?: string;
  /** doc-worker 컨테이너를 띄우는 Durable Object. 없으면 모의 양식을 쓴다. */
  DOC_WORKER?: DurableObjectNamespace;
}
