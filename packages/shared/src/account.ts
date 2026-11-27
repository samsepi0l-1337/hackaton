// 계정 규칙 (2026-11-27 결정): 창업 준비는 회원가입·이메일 인증·로그인 후. 화면과 서버가 같은 검사를 쓴다.

export const PASSWORD_RULE = { min: 8, max: 64 } as const;
export const PASSWORD_RULE_TEXT = '8~64자, 영문과 숫자를 모두 포함';

export interface PasswordCheck {
  ok: boolean;
  length: boolean; // 8~64자
  letterAndDigit: boolean; // 영문과 숫자를 모두 포함
  match: boolean; // 비밀번호 확인과 같음
  messages: string[]; // 화면에 보여줄 오류 (비어 있으면 통과)
}

/** 비밀번호 규칙과 2회 입력 일치를 검사한다. */
export function checkPassword(password: string, confirm: string): PasswordCheck {
  const length = password.length >= PASSWORD_RULE.min && password.length <= PASSWORD_RULE.max;
  const letterAndDigit = /[A-Za-z]/.test(password) && /\d/.test(password);
  const match = password.length > 0 && password === confirm;
  const messages: string[] = [];
  if (!length) messages.push(`비밀번호는 ${PASSWORD_RULE.min}~${PASSWORD_RULE.max}자예요`);
  if (!letterAndDigit) messages.push('비밀번호에 영문과 숫자를 모두 넣어 주세요');
  if (!match) messages.push('두 비밀번호가 같지 않아요');
  return { ok: length && letterAndDigit && match, length, letterAndDigit, match, messages };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 이메일 인증: 링크(토큰) + 6자리 코드, 24시간 유효. 다시 보내기는 1분에 1회. */
export const VERIFY_TTL_HOURS = 24;
export const VERIFY_RESEND_SECONDS = 60;
/** 비밀번호 찾기: 복구 비밀번호(임시, 1회용) 30분 유효. 같은 이메일 요청은 10분에 1회. */
export const RECOVERY_TTL_MINUTES = 30;
export const RECOVERY_REQUEST_MINUTES = 10;
/** 계정 존재를 드러내지 않는 같은 안내 문구 */
export const FORGOT_PASSWORD_NOTICE = '가입된 이메일이면 복구 비밀번호를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.';
