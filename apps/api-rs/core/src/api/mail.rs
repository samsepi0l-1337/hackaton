//! TS 원본: apps/api/src/mail.ts
use crate::ports::{Env, Mail, Ports};
use crate::shared::account::{RECOVERY_TTL_MINUTES, VERIFY_TTL_HOURS};

/// TS: `const escapeHtml = (s: string): string`.
pub fn escape_html(s: &str) -> String {
    let mut out = String::new();
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}
fn wrap(body: &str) -> String {
    format!("<div style=\"font-family:system-ui,sans-serif;line-height:1.6;color:#1b1b1f\">{body}</div>")
}
/// TS: `export function verificationMail(to: string, link: string, code: string): MailMessage`.
pub fn verification_mail(to: &str, link: &str, code: &str) -> Mail {
    let text = format!("해보까 이메일 인증\n\n아래 링크를 눌러 이메일 인증을 마쳐 주세요.\n{link}\n\n링크를 쓸 수 없으면 인증 코드 {code} 를 입력해 주세요.\n링크와 코드는 {VERIFY_TTL_HOURS}시간 동안 쓸 수 있어요.\n\n가입하지 않았다면 이 메일을 무시해 주세요.");
    let html = wrap(&format!("<h2>이메일 인증</h2><p>아래 버튼을 눌러 이메일 인증을 마쳐 주세요.</p>\n<p><a href=\"{}\" style=\"display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none\">이메일 인증하기</a></p>\n<p>링크를 쓸 수 없으면 인증 코드를 입력해 주세요.</p><p style=\"font-size:24px;letter-spacing:4px\"><b>{}</b></p>\n<p>링크와 코드는 {VERIFY_TTL_HOURS}시간 동안 쓸 수 있어요.</p><p style=\"color:#666\">가입하지 않았다면 이 메일을 무시해 주세요.</p>", escape_html(link), escape_html(code)));
    Mail {
        to: to.into(),
        subject: "[해보까] 이메일 인증을 마쳐 주세요".into(),
        text,
        html,
    }
}
/// TS: `export function recoveryMail(to: string, password: string): MailMessage`.
pub fn recovery_mail(to: &str, password: &str) -> Mail {
    let text = format!("해보까 복구 비밀번호\n\n복구 비밀번호: {password}\n{RECOVERY_TTL_MINUTES}분 동안만 쓸 수 있고, 한 번 로그인하면 다시 쓸 수 없어요.\n로그인 후 바로 새 비밀번호를 정해 주세요.\n\n요청하지 않았다면 무시하세요, 기존 비밀번호는 그대로예요.");
    let html = wrap(&format!("<h2>복구 비밀번호</h2><p style=\"font-size:22px;letter-spacing:2px\"><b>{}</b></p>\n<p>{RECOVERY_TTL_MINUTES}분 동안만 쓸 수 있고, 한 번 로그인하면 다시 쓸 수 없어요.</p><p>로그인 후 바로 새 비밀번호를 정해 주세요.</p>\n<p style=\"color:#666\">요청하지 않았다면 무시하세요, 기존 비밀번호는 그대로예요.</p>", escape_html(password)));
    Mail {
        to: to.into(),
        subject: "[해보까] 복구 비밀번호를 보내드려요".into(),
        text,
        html,
    }
}
/// 인증 전에 같은 이메일로 가입이 두 번 이상 있었을 때: 어느 비밀번호도 쓰지 않고 임시 비밀번호를 보낸다.
pub fn contested_signup_mail(to: &str, password: &str) -> Mail {
    let text = format!("해보까 임시 비밀번호\n\n이메일 인증 전에 이 이메일로 가입이 두 번 이상 있었어요. 안전을 위해 가입할 때 정한 비밀번호는 쓰지 않아요.\n\n임시 비밀번호: {password}\n{RECOVERY_TTL_MINUTES}분 동안만 쓸 수 있어요. 인증한 화면에서 이 비밀번호를 '현재 비밀번호'로 넣고 새 비밀번호를 정해 주세요.\n시간이 지나면 '비밀번호 찾기'로 다시 받을 수 있어요.");
    let html = wrap(&format!("<h2>임시 비밀번호</h2><p>이메일 인증 전에 이 이메일로 가입이 두 번 이상 있었어요. 안전을 위해 가입할 때 정한 비밀번호는 쓰지 않아요.</p><p style=\"font-size:22px;letter-spacing:2px\"><b>{}</b></p>\n<p>{RECOVERY_TTL_MINUTES}분 동안만 쓸 수 있어요. 인증한 화면에서 이 비밀번호를 '현재 비밀번호'로 넣고 새 비밀번호를 정해 주세요.</p><p style=\"color:#666\">시간이 지나면 '비밀번호 찾기'로 다시 받을 수 있어요.</p>", escape_html(password)));
    Mail {
        to: to.into(),
        subject: "[해보까] 임시 비밀번호를 보내드려요".into(),
        text,
        html,
    }
}
/// TS: `pickMailer(env: Bindings, fallback: Mailer): Mailer` 및 `Mailer.send(m: MailMessage): Promise<void>`.
pub async fn send(env: &Env, ports: &dyn Ports, mail: &Mail) -> Result<(), String> {
    if env.contains_key("EMAIL") {
        if let Some(from) = env.get("MAIL_FROM").filter(|s| !s.is_empty()) {
            return match ports.send_email(from, mail).await {
                Some(Ok(())) => Ok(()),
                Some(Err(err)) => {
                    let code = if !err.is_empty()
                        && err.bytes().all(|b| b.is_ascii_uppercase() || b == b'_')
                    {
                        err.as_str()
                    } else {
                        "unknown"
                    };
                    ports.log("error", &format!("[mail] 전송 실패 code={code}"));
                    Err(err)
                }
                None => {
                    ports.log("error", "[mail] 전송 실패 code=unknown");
                    Err("unknown".into())
                }
            };
        }
        ports.log("error", "[mail] MAIL_FROM 이 없어 개발용 메일러를 씁니다");
    }
    ports.log(
        "log",
        &format!("[mail:dev] to={} subject={}", mail.to, mail.subject),
    );
    // 개발 전용: 인증 링크만 로그에 남긴다.
    if let Ok(re) = regex::Regex::new(r"https?://\S*/verify\?token=\S+") {
        if let Some(link) = re.find(&mail.text) {
            ports.log(
                "log",
                &format!(
                    "[mail:dev][DEV ONLY - 운영에서는 나오지 않음] verify link: {}",
                    link.as_str()
                ),
            );
        }
    }
    if env.get("E2E_MAIL_LOG").is_some_and(|v| v == "1") {
        if let Ok(text) = serde_json::to_string(&mail.text) {
            ports.log("log", &format!("[mail:e2e] to={} body={text}", mail.to));
        }
    }
    if !env.contains_key("EMAIL") {
        let _ = ports.send_email("", mail).await;
    }
    Ok(())
}
