//! TS 원본: packages/shared/src/account.ts
use serde::Serialize;
use serde_json::Value;

/// TS: `export const PASSWORD_RULE = { min: 8, max: 64 } as const`.
pub const PASSWORD_RULE: (usize, usize) = (8, 64);
/// TS: `export const PASSWORD_RULE_TEXT: string`.
pub const PASSWORD_RULE_TEXT: &str = "8~64자, 영문과 숫자를 모두 포함";
/// TS: `export const EMAIL_RE: RegExp`.
pub const EMAIL_RE: &str = r"^[^\s@]+@[^\s@]+\.[^\s@]+$";
/// TS: `export const VERIFY_TTL_HOURS = 24`.
pub const VERIFY_TTL_HOURS: u32 = 24;
/// TS: `export const VERIFY_RESEND_SECONDS = 60`.
pub const VERIFY_RESEND_SECONDS: u32 = 60;
/// TS: `export const RECOVERY_TTL_MINUTES = 30`.
pub const RECOVERY_TTL_MINUTES: u32 = 30;
/// TS: `export const RECOVERY_REQUEST_MINUTES = 10`.
pub const RECOVERY_REQUEST_MINUTES: u32 = 10;
/// TS: `export const FORGOT_PASSWORD_NOTICE: string`.
pub const FORGOT_PASSWORD_NOTICE: &str =
    "가입된 이메일이면 복구 비밀번호를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.";
/// TS: `export const BCRYPT_COST = 10`.
pub const BCRYPT_COST: u32 = 10;
/// TS: `export const OCCUPATIONS: readonly string[]`.
pub const OCCUPATIONS: [&str; 8] = [
    "고등학생",
    "대학생",
    "대학원생",
    "직장인",
    "프리랜서",
    "자영업",
    "구직 중",
    "기타",
];
/// TS: `export const RESIDENCE_OPTIONS: readonly string[]`.
pub const RESIDENCE_OPTIONS: [&str; 4] = ["부산", "울산", "경남", "그 밖의 지역"];
/// TS: `export interface BasicProfile`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BasicProfile {
    pub age: Option<u32>,
    pub residence: Option<String>,
    pub has_business: Option<bool>,
    pub occupation: Option<String>,
    pub updated_at: Option<String>,
}
/// TS: `export const EMPTY_BASIC_PROFILE: BasicProfile`.
pub const EMPTY_BASIC_PROFILE: BasicProfile = BasicProfile {
    age: None,
    residence: None,
    has_business: None,
    occupation: None,
    updated_at: None,
};
/// TS: `export const BUFS_COOKIE = 'bufs_sid'`.
pub const BUFS_COOKIE: &str = "bufs_sid";
/// TS: `export const BUFS_SESSION_HOURS = 8`.
pub const BUFS_SESSION_HOURS: u32 = 8;
/// TS: `export interface BufsFeedbackItem`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BufsFeedbackItem {
    pub id: String,
    pub created_at: String,
    pub user: String,
    pub readiness: Option<String>,
    pub problem_id: Option<String>,
    pub review_region: Option<String>,
    pub helpful: Option<bool>,
    pub reason: Option<String>,
    pub direction_clear: Option<bool>,
    pub want_to_explore: Option<String>,
    pub know_what_to_prepare: Option<FeedbackScores>,
    pub region_intent: Option<FeedbackScores>,
    pub found_regional_path: Option<bool>,
    pub path_name: Option<String>,
}
/// TS: `{ before?: number; after?: number }`.
#[derive(Clone, Debug, Serialize)]
pub struct FeedbackScores {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<f64>,
}
/// TS: `export interface BufsFeedbackResponse`.
#[derive(Clone, Debug, Serialize)]
pub struct BufsFeedbackResponse {
    pub total: u64,
    pub items: Vec<BufsFeedbackItem>,
    pub summary: BufsFeedbackSummary,
}
/// TS: `BufsFeedbackResponse['summary']`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BufsFeedbackSummary {
    pub helpful_rate: Option<f64>,
    pub direction_clear_rate: Option<f64>,
    pub found_path_rate: Option<f64>,
    pub region_intent_avg: FeedbackAverages,
}
/// TS: `BufsFeedbackResponse['summary']['regionIntentAvg']`.
#[derive(Clone, Debug, Serialize)]
pub struct FeedbackAverages {
    pub before: Option<f64>,
    pub after: Option<f64>,
}
/// TS: `export interface PasswordCheck`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordCheck {
    pub ok: bool,
    pub length: bool,
    pub letter_and_digit: bool,
    #[serde(rename = "match")]
    pub matches: bool,
    pub messages: Vec<String>,
}
/// TS: `export function checkPassword(password: string, confirm: string): PasswordCheck`.
pub fn check_password(password: &str, confirm: &str) -> PasswordCheck {
    let length = (PASSWORD_RULE.0..=PASSWORD_RULE.1).contains(&crate::jsstr::len16(password));
    let letter_and_digit = password.bytes().any(|b| b.is_ascii_alphabetic())
        && password.bytes().any(|b| b.is_ascii_digit());
    let matches = !password.is_empty() && password == confirm;
    let mut messages = Vec::new();
    if !length {
        messages.push("비밀번호는 8~64자예요".into());
    }
    if !letter_and_digit {
        messages.push("비밀번호에 영문과 숫자를 모두 넣어 주세요".into());
    }
    if !matches {
        messages.push("두 비밀번호가 같지 않아요".into());
    }
    PasswordCheck {
        ok: length && letter_and_digit && matches,
        length,
        letter_and_digit,
        matches,
        messages,
    }
}
/// 함수 골든 진입점.
pub fn golden(f: &str, args: &[Value]) -> Option<Value> {
    match f {
        "checkPassword" => serde_json::to_value(check_password(
            args.first()?.as_str()?,
            args.get(1)?.as_str()?,
        ))
        .ok(),
        _ => None,
    }
}
