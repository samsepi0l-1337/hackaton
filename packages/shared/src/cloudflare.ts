// 외부 AI·Cloudflare 연동 계약.
// - 문장 생성: Upstage Solar (AI Gateway 동적 라우트 또는 Upstage 직접 호출), 실패하면 규칙 문장
// - 관련도: Upstage Solar Decide (/v1/systemone, jev와 같은 형식), 실패하면 키워드 규칙 점수
// - 문서 읽기: Upstage Document Parse (HWP·HWPX·DOCX·PDF), 첨부 내려받기·양식 채우기는 doc-worker 컨테이너

/** AI 작업 종류. AI Gateway 라우트의 조건 노드가 metadata.task 로 모델을 고른다. */
export type AiTask =
  | 'mentor' // F2 되묻기 질문 문장 (빠른 모델)
  | 'reason' // F6 추천 이유 (빠른 모델)
  | 'summary' // F3 요약
  | 'prep' // F12 7일 계획·준비 안내
  | 'draft' // F13 지원서 초안
  | 'extract'; // F8·F21·F16 파싱된 문서에서 조건·양식 항목 정리

/** 작업별 기본 Solar 모델. 빠른 응답이 필요한 작업은 Mini. */
export const SOLAR_MODELS: Record<AiTask, string> = {
  mentor: 'solar-mini-4-5-preview',
  reason: 'solar-mini-4-5-preview',
  summary: 'solar-pro-4',
  prep: 'solar-mini-4-5-preview', // 운영에서 Pro 가 15초를 넘겨 Mini 로 바꿈
  draft: 'solar-pro-4',
  extract: 'solar-mini-4-5-preview', // 12,000자 문서에서 Pro 4.9초·양식 항목 누락, Mini 0.4초·정확 (2026-11-27 측정)
};

/** 동적 라우트 이름. 모델 이름 자리에 넣는다. 정의: infra/ai-gateway/route.json */
export const AI_ROUTE = 'dynamic/gil';
export const AI_GATEWAY_ID_DEFAULT = 'gil-gateway';
export const UPSTAGE_BASE_URL = 'https://api.upstage.ai/v1';
/** AI 응답을 기다리는 최대 시간. 넘으면 규칙 결과를 쓴다. */
export const AI_TIMEOUT_MS = 8000;
/** 작업별 시간 제한. Solar Pro 로 긴 JSON 을 만드는 작업은 더 기다린다. */
export const AI_TIMEOUT_BY_TASK: Record<AiTask, number> = { mentor: 8000, reason: 8000, summary: 15000, prep: 15000, draft: 15000, extract: 20000 };

/**
 * AI 모드.
 * - off: 외부 AI 호출 없음 (기본, 과금 0)
 * - upstage: Upstage API 직접 (UPSTAGE_BASE_URL 또는 AI Gateway 커스텀 프로바이더 URL)
 * - route: AI Gateway 동적 라우트 `dynamic/gil` (env.AI 바인딩)
 */
export type AiMode = 'off' | 'upstage' | 'route';

/** cf-aig-metadata. 값은 문자열·숫자·불리언만. 사용자 입력 원문은 넣지 않는다. */
export interface AiMetadata {
  app: 'gil';
  task: AiTask;
  user_id: string; // 로그인 사용자 id 또는 'anon'
}

// ---- Solar Decide (/v1/systemone) ----
export const DECIDE_MODEL = 'solar-decide-flash'; // 지연이 짧은 변형. 같은 요청·응답 형식
/** Decide 는 보통 1초 안에 답한다. 가끔 멈추는 연결을 대비해 짧게 끊고 한 번 더 시도한다. */
export const DECIDE_TIMEOUT_MS = 3000;
export const DECIDE_ATTEMPTS = 2;
export const DECIDE_MAX_CHOICES = 26;

// ---- Document Parse ----
export const DOCUMENT_PARSE_MODEL = 'document-parse';
export const DOCUMENT_PARSE_MAX_PAGES = 100; // 동기 호출 한도
export const DOCUMENT_PARSE_MAX_BYTES = 100 * 1024 * 1024;

export type DocKind = 'hwpx' | 'docx' | 'pdf' | 'hwp' | 'unknown';

export interface ExtractedField {
  label: string;
  maxLength: number | null; // '(500자 이내)' 같은 표기에서 읽음
  required: boolean;
}

/** Document Parse 결과를 정리한 모양. */
export interface ParsedDocument {
  fileName: string;
  kind: DocKind;
  text: string; // markdown 우선, 최대 50,000자
  fields: ExtractedField[]; // 신청 양식 항목 (양식이 아니면 빈 배열)
  warnings: string[];
}

// ---- doc-worker 컨테이너 (HTTP, 포트 8080) ----
// GET  /health                      → 200 'ok'
// POST /discover  DiscoverRequest   → DiscoverResponse   공고 상세 페이지에서 첨부파일 찾기
// POST /download  DownloadRequest   → DownloadResponse   첨부 1개 내려받기 (정부 사이트의 세션·리다이렉트 처리)
// POST /fill      FillRequest       → FillResponse       양식(DOCX·HWPX)에 값 채우기
// 오류: 4xx/5xx + DocWorkerError

export const DOC_WORKER_PORT = 8080;

export interface Attachment {
  name: string;
  url: string;
  kind: DocKind;
}

export interface DiscoverRequest { pageUrl: string }
export interface DiscoverResponse { pageUrl: string; title: string | null; attachments: Attachment[] }

export interface DownloadRequest { url: string; referer?: string }
export interface DownloadResponse { fileName: string; kind: DocKind; bytes: number; fileBase64: string }

/** values 의 key = ExtractedField.label */
export interface FillRequest { fileBase64: string; fileName: string; values: Record<string, string> }
export interface FillResponse { fileName: string; fileBase64: string; filled: string[]; missing: string[] }

export interface DocWorkerError { error: { code: 'bad_request' | 'unsupported' | 'fetch_failed' | 'too_large' | 'internal'; message: string } }
