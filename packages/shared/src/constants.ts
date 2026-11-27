// 설계가 바뀌면 이 파일만 고친다. 선택지·경계값·점수 가중치를 한곳에 둔다.

export const TIMEZONE = 'Asia/Seoul';

export const AGE_MIN = 15;
export const AGE_MAX = 34;
export const IDEA_MAX = 200;
export const PROBLEM_MAX = 300;
export const CUSTOMER_DESC_MAX = 200;
export const PASSWORD_MIN = 8;
export const MENTOR_QUESTION_COUNT = 3;
export const TOP_N = 3;
export const PAGE_SIZE = 20;
export const DUE_SOON_DAYS = 7;

export const STAGES = [
  { value: 'pre', label: '예비(사업자 없음)' },
  { value: 'lt1', label: '1년 미만' },
  { value: '1to3', label: '1~3년' },
  { value: '3to7', label: '3~7년' },
] as const;

export const BUSAN_DISTRICTS = [
  '중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구',
  '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군',
] as const;
export const OUTSIDE_BUSAN = '부산 외';

export const AFFILIATIONS = ['대학생', '대학원생', '직장인', '무직', '기타'] as const;
export const TEAM_SIZES = ['혼자', '2~3명', '4명 이상'] as const;

export const INDUSTRIES = [
  'IT·플랫폼', '제조', '식품·외식', '관광·문화', '교육', '헬스케어', '해양·물류', '친환경', '커머스', '기타',
] as const;
export const BIZ_FORMS = ['앱·웹 서비스', '제품 판매', '오프라인 매장', '대행·용역', '기타'] as const;
export const READINESS = ['아이디어만', '조사 중', '시제품 있음', '매출 있음'] as const;
export const REVENUE_MODELS = ['판매', '구독', '수수료', '광고', '아직 모름'] as const;

export const CUSTOMER_TYPES = ['B2C', 'B2B', 'B2G'] as const;
export const CUSTOMER_AGES = ['10대', '20대', '30대', '40대', '50대 이상', '무관'] as const;
export const CUSTOMER_REGIONS = ['부산', '동남권', '전국', '해외'] as const;
export const SUPPORT_NEEDS = ['자금', '공간', '멘토링·교육', '판로·마케팅', '시제품 제작', '네트워킹'] as const;

/** K-Startup 지원 분야 `supt_biz_clsfc` 값(테스트 데이터 기준). */
export const PROGRAM_CATEGORIES = [
  '사업화', '창업교육', '시설·공간·보육', '멘토링·컨설팅', '판로·해외진출', '행사·네트워크', '기술개발(R&D)', '융자',
] as const;

/** 지원 분야 → 사용자가 고르는 '필요한 지원' 연결. 추천 점수에 쓴다. */
export const CATEGORY_TO_NEEDS: Record<string, readonly string[]> = {
  '사업화': ['자금', '시제품 제작'],
  '창업교육': ['멘토링·교육'],
  '시설·공간·보육': ['공간'],
  '멘토링·컨설팅': ['멘토링·교육'],
  '판로·해외진출': ['판로·마케팅'],
  '행사·네트워크': ['네트워킹'],
  '기술개발(R&D)': ['자금', '시제품 제작'],
  '융자': ['자금'],
};

export const VERDICT_LABEL = { eligible: '가능', check: '확인 필요', ineligible: '불가' } as const;

/** 추천 점수(F5). 규칙 점수만 쓴다. jev 점수는 나중에 relevance 자리에 넣는다. */
export const SCORE = {
  relevancePerKeyword: 10,
  relevanceMax: 40,
  industryMatch: 15,
  needMatch: 20,
  dueSoonBonus: 10, // 마감 DUE_SOON_DAYS 이내
  checkPenalty: -15, // 판정 '확인 필요'
} as const;

export const APPLICATION_STATUS_LABEL = {
  preparing: '양식 준비',
  drafting: '작성 중',
  awaiting_approval: '승인 대기',
  filling: '입력 중',
  action_required: '사용자 조치 필요',
  submitting: '제출 중',
  completed: '완료',
  failed: '실패',
} as const;
