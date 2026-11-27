// Worker 바인딩과 변수. 로컬 Bun 실행(server.ts)에서는 모두 없다 → 규칙 폴백, 모의 양식.

export interface Bindings {
  /** Workers AI 바인딩. 로컬 dev에서도 원격 호출이라 사용량이 잡힌다. */
  AI?: Ai;
  /** '1' 일 때만 AI를 부른다. 기본은 규칙 문장(과금 0). */
  AI_ENABLED?: string;
  /** 동적 라우트가 있는 AI Gateway 이름. 기본 AI_GATEWAY_ID_DEFAULT. */
  AI_GATEWAY_ID?: string;
  /** doc-worker 컨테이너를 띄우는 Durable Object. 없으면 모의 양식을 쓴다. */
  DOC_WORKER?: DurableObjectNamespace;
}
