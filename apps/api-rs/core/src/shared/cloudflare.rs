//! TS 원본: packages/shared/src/cloudflare.ts
/// `SOLAR_MODELS: Record<AiTask, string>`
pub const SOLAR_MODELS: [(&str, &str); 6] = [
    ("mentor", "solar-mini-4-5-preview"),
    ("reason", "solar-mini-4-5-preview"),
    ("summary", "solar-pro-4"),
    ("prep", "solar-mini-4-5-preview"),
    ("draft", "solar-pro-4"),
    ("extract", "solar-mini-4-5-preview"),
];
/// `AI_ROUTE: string`
pub const AI_ROUTE: &str = "dynamic/gil";
/// `AI_GATEWAY_ID_DEFAULT: string`
pub const AI_GATEWAY_ID_DEFAULT: &str = "gil-gateway";
/// `UPSTAGE_BASE_URL: string`
pub const UPSTAGE_BASE_URL: &str = "https://api.upstage.ai/v1";
/// `AI_TIMEOUT_MS: number`
pub const AI_TIMEOUT_MS: u32 = 8000;
/// `AI_TIMEOUT_BY_TASK: Record<AiTask, number>`
pub const AI_TIMEOUT_BY_TASK: [(&str, u32); 6] = [
    ("mentor", 8000),
    ("reason", 8000),
    ("summary", 15000),
    ("prep", 15000),
    ("draft", 15000),
    ("extract", 20000),
];
/// `DECIDE_MODEL: string`
pub const DECIDE_MODEL: &str = "solar-decide-flash";
/// `DECIDE_TIMEOUT_MS: number`
pub const DECIDE_TIMEOUT_MS: u32 = 3000;
/// `DECIDE_ATTEMPTS: number`
pub const DECIDE_ATTEMPTS: u32 = 2;
/// `DECIDE_MAX_CHOICES: number`
pub const DECIDE_MAX_CHOICES: u32 = 26;
/// `DOCUMENT_PARSE_MODEL: string`
pub const DOCUMENT_PARSE_MODEL: &str = "document-parse";
/// `DOCUMENT_PARSE_MAX_PAGES: number`
pub const DOCUMENT_PARSE_MAX_PAGES: u32 = 100;
/// `DOCUMENT_PARSE_MAX_BYTES: number`
pub const DOCUMENT_PARSE_MAX_BYTES: u32 = 100 * 1024 * 1024;
/// `DOC_WORKER_PORT: number`
pub const DOC_WORKER_PORT: u32 = 8080;
