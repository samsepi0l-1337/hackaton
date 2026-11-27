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

// ---- 비밀번호 저장 (2026-11-27 결정) ----
/**
 * bcrypt(cost BCRYPT_COST) + pepper. pepper 는 서버 secret PASSWORD_PEPPER (저장소·DB 에 없음).
 * 입력 = base64(HMAC-SHA256(pepper, password)) → bcrypt (72바이트 제한 회피). 예전 PBKDF2 해시는 로그인 성공 때 새 방식으로 바꾼다.
 */
export const BCRYPT_COST = 10;

// ---- 내 정보: 기본 정보 (F4 조건 확인의 기본값으로 쓴다, 모두 선택) ----
export const OCCUPATIONS = ['고등학생', '대학생', '대학원생', '직장인', '프리랜서', '자영업', '구직 중', '기타'] as const;
export const RESIDENCE_OPTIONS = ['부산', '울산', '경남', '그 밖의 지역'] as const;
export const ULSAN_DISTRICTS = ['중구', '남구', '동구', '북구', '울주군'] as const;
export const GYEONGNAM_DISTRICTS = ['창원시', '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시', '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군'] as const;
export interface BasicProfile {
  age: number | null; // 만 나이, 모르면 null
  residence: string | null; // RESIDENCE_OPTIONS 또는 부산 구·군 (BUSAN_DISTRICTS)
  hasBusiness: boolean | null; // 사업자등록 여부
  occupation: string | null; // OCCUPATIONS
  updatedAt: string | null;
}
export const EMPTY_BASIC_PROFILE: BasicProfile = { age: null, residence: null, hasBusiness: null, occupation: null, updatedAt: null };

// ---- /bufs 관리자 화면: 의견 남기기 데이터 ----
/** 관리자 비밀번호는 secret ADMIN_PASSWORD_HASH (bcrypt+pepper 해시)로만 둔다. 세션 쿠키 이름: */
export const BUFS_COOKIE = 'bufs_sid';
export const BUFS_SESSION_HOURS = 8;
export interface BufsFeedbackItem {
  id: string;
  createdAt: string;
  user: string; // 이메일 일부만 (예: ab***@gmail.com)
  readiness: string | null;
  problemId: string | null;
  reviewRegion: string | null;
  helpful: boolean | null;
  reason: string | null;
  directionClear: boolean | null;
  wantToExplore: string | null;
  knowWhatToPrepare: { before?: number; after?: number } | null;
  regionIntent: { before?: number; after?: number } | null;
  foundRegionalPath: boolean | null;
  pathName: string | null;
}
export interface BufsFeedbackResponse {
  total: number;
  items: BufsFeedbackItem[]; // 최신순
  summary: { helpfulRate: number | null; directionClearRate: number | null; foundPathRate: number | null; regionIntentAvg: { before: number | null; after: number | null } };
}
