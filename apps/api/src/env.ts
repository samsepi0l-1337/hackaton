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
  /** '0' 이면 컨테이너 인터넷을 끈다 (로컬 dev 확인용). 기본 켬. */
  DOC_WORKER_INTERNET?: string;
  /** 상담 횟수 제한에서 접속 IP 를 해시할 때 붙이는 솔트 (secret). 없으면 고정 문자열. 원본 IP 는 저장하지 않는다. */
  IP_HASH_SALT?: string;
  /** K-Startup 사업공고 조회 서비스 인증키 (secret). 없으면 수집을 건너뛰고 마지막 자료를 쓴다. */
  KSTARTUP_SERVICE_KEY?: string;
  /** 배포 버전 정보 (wrangler version_metadata). */
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
  /** Cloudflare Email Service 바인딩 (send_email). 없으면 개발용 메일러(메모리·로그)를 쓴다. */
  EMAIL?: { send(m: { to: string; from: string; subject: string; text: string; html: string }): Promise<{ messageId: string }> };
  /** 보내는 주소 (예: noreply@도메인). EMAIL 바인딩과 함께 필요하다. */
  MAIL_FROM?: string;
  /** 메일 링크의 주소 (예: https://gil.example.com). 없으면 요청의 origin. */
  APP_ORIGIN?: string;
  /** 비밀번호 pepper (secret). 없으면 개발용 상수(경고 로그). */
  PASSWORD_PEPPER?: string;
  /** /bufs 관리자 비밀번호의 bcrypt+pepper 해시 (secret). scripts/hash-admin-password.ts 로 만든다. */
  ADMIN_PASSWORD_HASH?: string;
}
