// Cloudflare 연동 계약: AI Gateway 동적 라우트(AI 호출)와 문서 처리 컨테이너(doc-worker).

/** AI 작업 종류. AI Gateway 라우트의 조건 노드가 metadata.task 로 모델을 고른다. */
export type AiTask =
  | 'mentor' // F2 되묻기 질문 문장
  | 'summary' // F3 요약
  | 'reason' // F6 추천 이유
  | 'prep' // F12 준비 안내
  | 'extract'; // F8·F21 공고 첨부에서 조건 뽑기 (사람이 검수)

/** 동적 라우트 이름. 모델 이름 자리에 넣는다. 정의: infra/ai-gateway/route.json */
export const AI_ROUTE = 'dynamic/gil';
export const AI_GATEWAY_ID_DEFAULT = 'gil-gateway';
/** AI 응답을 기다리는 최대 시간. 넘으면 규칙 문장을 쓴다. */
export const AI_TIMEOUT_MS = 8000;

/** cf-aig-metadata. 값은 문자열·숫자·불리언만. 사용자 입력 원문은 넣지 않는다. */
export interface AiMetadata {
  app: 'gil';
  task: AiTask;
  user_id: string; // 로그인 사용자 id 또는 'anon'
}

// ---- doc-worker 컨테이너 (HTTP, 포트 8080) ----
// GET  /health                → 200 'ok'
// POST /discover  DiscoverRequest → DiscoverResponse   공고 상세 페이지에서 첨부파일 찾기
// POST /extract   ExtractRequest  → ExtractResponse    첨부 1개를 받아 텍스트와 양식 항목 뽑기
// POST /fill      FillRequest     → FillResponse       양식(DOCX·HWPX)에 값 채우기
// 오류: 4xx/5xx + { error: { code, message } }

export const DOC_WORKER_PORT = 8080;

export type DocKind = 'hwpx' | 'docx' | 'pdf' | 'hwp' | 'unknown';

export interface Attachment {
  name: string;
  url: string;
  kind: DocKind;
}

export interface DiscoverRequest { pageUrl: string }
export interface DiscoverResponse { pageUrl: string; title: string | null; attachments: Attachment[] }

/** url 또는 fileBase64 중 하나. */
export interface ExtractRequest { url?: string; fileBase64?: string; fileName?: string }

export interface ExtractedField {
  label: string;
  maxLength: number | null; // '(500자 이내)' 같은 표기에서 읽음
  required: boolean;
}

export interface ExtractResponse {
  fileName: string;
  kind: DocKind;
  text: string; // 최대 50,000자
  fields: ExtractedField[];
  warnings: string[]; // 예: 'HWP 바이너리는 아직 읽지 못함'
}

export interface FillRequest { fileBase64: string; fileName: string; values: Record<string, string> } // key = ExtractedField.label
export interface FillResponse { fileName: string; fileBase64: string; filled: string[]; missing: string[] }

export interface DocWorkerError { error: { code: 'bad_request' | 'unsupported' | 'fetch_failed' | 'too_large' | 'internal'; message: string } }
