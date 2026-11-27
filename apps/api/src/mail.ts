// 메일 보내기. 운영: Cloudflare Email Service 바인딩(env.EMAIL). 바인딩이 없으면 개발용 메일러(메모리 보관 + 한 줄 로그).
// 토큰·코드·복구 비밀번호는 운영 로그에 남기지 않는다.
import { RECOVERY_TTL_MINUTES, VERIFY_TTL_HOURS } from '@gil/shared';
import type { Bindings } from './env';

export interface MailMessage { to: string; subject: string; text: string; html: string }
export interface Mailer { send(m: MailMessage): Promise<void> }

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Cloudflare Email Service. 오류는 code 만 로그에 남기고 다시 던진다. */
export function cloudflareMailer(binding: NonNullable<Bindings['EMAIL']>, from: string): Mailer {
  return {
    async send(m) {
      try {
        await binding.send({ to: m.to, from, subject: m.subject, text: m.text, html: m.html });
      } catch (e) {
        // 예: E_SENDER_DOMAIN_NOT_AVAILABLE, E_RECIPIENT_PLAN_RESTRICTED, E_RATE_LIMIT_EXCEEDED
        console.error(`[mail] 전송 실패 code=${(e as { code?: string })?.code ?? 'unknown'}`);
        throw e;
      }
    },
  };
}

export interface DevMailer extends Mailer {
  /** 최근 메시지 (테스트용). 최대 50개. */
  readonly sent: MailMessage[];
}

/** 개발용. 받는 사람과 제목만 한 줄로 로그에 남긴다. quiet 이면 로그도 없다. */
export function createDevMailer(opts: { quiet?: boolean } = {}): DevMailer {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(m) {
      sent.push(m);
      if (sent.length > 50) sent.shift();
      if (opts.quiet) return;
      console.log(`[mail:dev] to=${m.to} subject=${m.subject}`);
      // 개발 전용(바인딩 없음): 로컬에서 바로 눌러 볼 수 있게 인증 링크만 보여 준다. 코드·복구 비밀번호는 남기지 않는다.
      const link = m.text.match(/https?:\/\/\S*\/verify\?token=\S+/)?.[0];
      if (link) console.log(`[mail:dev][DEV ONLY - 운영에서는 나오지 않음] verify link: ${link}`);
    },
  };
}

/** 이번 요청에 쓸 메일러. 바인딩이 있어야 운영 메일러를 쓴다. */
export function pickMailer(env: Bindings, fallback: Mailer): Mailer {
  if (!env.EMAIL) return fallback;
  if (!env.MAIL_FROM) { console.error('[mail] MAIL_FROM 이 없어 개발용 메일러를 씁니다'); return fallback; }
  return cloudflareMailer(env.EMAIL, env.MAIL_FROM);
}

const wrap = (body: string) => `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#1b1b1f">${body}</div>`;

export function verificationMail(to: string, link: string, code: string): MailMessage {
  const text = [
    '길 이메일 인증',
    '',
    '아래 링크를 눌러 이메일 인증을 마쳐 주세요.',
    link,
    '',
    `링크를 쓸 수 없으면 인증 코드 ${code} 를 입력해 주세요.`,
    `링크와 코드는 ${VERIFY_TTL_HOURS}시간 동안 쓸 수 있어요.`,
    '',
    '가입하지 않았다면 이 메일을 무시해 주세요.',
  ].join('\n');
  const html = wrap(`<h2>이메일 인증</h2><p>아래 버튼을 눌러 이메일 인증을 마쳐 주세요.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">이메일 인증하기</a></p>
<p>링크를 쓸 수 없으면 인증 코드를 입력해 주세요.</p><p style="font-size:24px;letter-spacing:4px"><b>${escapeHtml(code)}</b></p>
<p>링크와 코드는 ${VERIFY_TTL_HOURS}시간 동안 쓸 수 있어요.</p><p style="color:#666">가입하지 않았다면 이 메일을 무시해 주세요.</p>`);
  return { to, subject: '[길] 이메일 인증을 마쳐 주세요', text, html };
}

export function recoveryMail(to: string, password: string): MailMessage {
  const text = [
    '길 복구 비밀번호',
    '',
    `복구 비밀번호: ${password}`,
    `${RECOVERY_TTL_MINUTES}분 동안만 쓸 수 있고, 한 번 로그인하면 다시 쓸 수 없어요.`,
    '로그인 후 바로 새 비밀번호를 정해 주세요.',
    '',
    '요청하지 않았다면 무시하세요, 기존 비밀번호는 그대로예요.',
  ].join('\n');
  const html = wrap(`<h2>복구 비밀번호</h2><p style="font-size:22px;letter-spacing:2px"><b>${escapeHtml(password)}</b></p>
<p>${RECOVERY_TTL_MINUTES}분 동안만 쓸 수 있고, 한 번 로그인하면 다시 쓸 수 없어요.</p><p>로그인 후 바로 새 비밀번호를 정해 주세요.</p>
<p style="color:#666">요청하지 않았다면 무시하세요, 기존 비밀번호는 그대로예요.</p>`);
  return { to, subject: '[길] 복구 비밀번호를 보내드려요', text, html };
}
