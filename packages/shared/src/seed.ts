// 테스트 데이터. 실제 공고가 아니다. 마감일은 now 기준 상대값이라 언제 실행해도 같은 경우가 나온다.
// 각 공고 주석은 데모 사용자(DEMO_PROFILE) 기준 판정이다.
import { addDays, kstDate } from './date';
import type { Agency, ConsultProfile, FormField, Program } from './types';

const K_URL = 'https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do';

interface SeedProgram extends Omit<Program, 'startDate' | 'endDate' | 'registeredAt' | 'url'> {
  end: number | null; // 오늘부터 며칠 뒤 마감, null = 상시
  start?: number;
}

const SEED_PROGRAMS: SeedProgram[] = [
  { id: 'T-0001', title: '[테스트] 2026 부산 예비창업패키지 추가 모집', agency: '부산창조경제혁신센터', category: '사업화', region: '부산', end: 5, recruiting: true,
    target: '예비창업자', bizYears: '예비창업자', targetAge: '만 20세 이상 ~ 만 39세 이하', tags: ['IT·플랫폼', '사업화', '시제품', '플랫폼'],
    content: '사업화 자금, 창업 교육, 전담 멘토링을 지원합니다. 시제품 제작과 마케팅에 쓸 수 있습니다.' }, // 가능, D-5
  { id: 'T-0002', title: '[테스트] 청년창업사관학교 동남권 입교생 모집', agency: '중소벤처기업진흥공단', category: '사업화', region: '전국', end: 12, recruiting: true,
    target: '예비창업자, 3년 미만 창업기업', bizYears: '예비창업자,1년미만,2년미만,3년미만', targetAge: '만 39세 이하', tags: ['제조', 'IT·플랫폼', '기술창업'],
    content: '사업화 자금과 공간, 코칭을 1년 동안 지원합니다.' }, // 가능
  { id: 'T-0003', title: '[테스트] 부산 대학생 창업 아이디어 경진대회', agency: '부산경제진흥원', category: '행사·네트워크', region: '부산', end: 3, recruiting: true,
    target: '부산 소재 대학 재학생', bizYears: '예비창업자,1년미만', targetAge: '만 20세 이상 ~ 만 29세 이하', tags: ['대학생', '아이디어', '자취생', '경진대회'],
    content: '대학생 창업 아이디어를 발표하고 네트워킹 행사에 참여합니다. 우수팀은 후속 멘토링을 받습니다.' }, // 가능, D-3
  { id: 'T-0004', title: '[테스트] 부산 청년 창업공간 입주기업 상시 모집', agency: '부산테크노파크', category: '시설·공간·보육', region: '부산', end: null, recruiting: true,
    target: '부산 소재 예비·초기 창업자', bizYears: '예비창업자,3년미만', targetAge: '만 39세 이하', tags: ['공간', '입주', '보육'],
    content: '사무 공간과 회의실, 보육 프로그램을 제공합니다.' }, // 가능, 상시
  { id: 'T-0005', title: '[테스트] 온라인 창업 기초 교육 과정', agency: '창업진흥원', category: '창업교육', region: '전국', end: null, recruiting: true,
    target: '누구나', bizYears: '전체', targetAge: '전체', tags: ['교육', '온라인', '사업계획서'],
    content: '사업계획서 작성과 고객 인터뷰 방법을 온라인으로 배웁니다.' }, // 가능, 상시
  { id: 'T-0006', title: '[테스트] 부산 해양 스타트업 액셀러레이팅', agency: '부산항만공사', category: '멘토링·컨설팅', region: '부산', end: 20, recruiting: true,
    target: '7년 미만 창업기업', bizYears: '1년미만,3년미만,5년미만,7년미만', targetAge: '만 39세 이하', tags: ['해양·물류', '항만', '물류'],
    content: '해양·물류 분야 창업기업의 멘토링과 투자 연계를 지원합니다.' }, // 불가: 예비창업자 대상 아님
  { id: 'T-0007', title: '[테스트] 중장년 기술창업 지원사업', agency: '창업진흥원', category: '사업화', region: '전국', end: 15, recruiting: true,
    target: '만 40세 이상 예비·초기 창업자', bizYears: '예비창업자,3년미만', targetAge: '만 40세 이상', tags: ['기술창업', '제조'],
    content: '경력 기반 기술창업에 사업화 자금을 지원합니다.' }, // 불가: 나이
  { id: 'T-0008', title: '[테스트] 경남 제조 창업 지원사업', agency: '경남창조경제혁신센터', category: '사업화', region: '경남', end: 18, recruiting: true,
    target: '경남 소재 창업기업', bizYears: '예비창업자,3년미만', targetAge: '만 39세 이하', tags: ['제조'],
    content: '경남 소재 제조 창업기업에 시제품 제작을 지원합니다.' }, // 불가: 지역
  { id: 'T-0009', title: '[테스트] 로컬크리에이터 활성화 지원', agency: '중소벤처기업부', category: '판로·해외진출', region: '전국', end: 25, recruiting: true,
    target: '지역 기반 창업자', bizYears: null, targetAge: null, tags: ['로컬', '관광·문화', '식품·외식', '판로'],
    content: '지역 자원을 활용한 창업자의 브랜딩과 판로 개척을 지원합니다.' }, // 확인 필요: 조건 정보 없음
  { id: 'T-0010', title: '[테스트] 부산 청년 창업 오디션 (마감)', agency: '부산광역시', category: '사업화', region: '부산', end: -2, recruiting: true,
    target: '부산 청년', bizYears: '예비창업자,3년미만', targetAge: '만 39세 이하', tags: ['오디션', '사업화'],
    content: '청년 창업가 오디션으로 사업화 자금을 지원합니다.' }, // 불가: 마감 지남
  { id: 'T-0011', title: '[테스트] 부산 소셜벤처 육성 (모집 종료)', agency: '부산사회적경제지원센터', category: '멘토링·컨설팅', region: '부산', end: 10, recruiting: false,
    target: '소셜벤처', bizYears: '예비창업자,3년미만', targetAge: '만 39세 이하', tags: ['소셜벤처'],
    content: '사회 문제를 해결하는 창업팀에 컨설팅을 지원합니다.' }, // 불가: 모집 종료
  { id: 'T-0012', title: '[테스트] 친환경 창업 기술개발 지원', agency: '부산테크노파크', category: '기술개발(R&D)', region: '전국', end: 40, recruiting: true,
    target: '예비·초기 창업자', bizYears: '예비창업자,3년미만', targetAge: '만 39세 이하', tags: ['친환경', '기술개발', '구독'],
    content: '친환경 제품·서비스의 기술개발과 시제품 제작 비용을 지원합니다.' }, // 가능
  { id: 'T-0013', title: '[테스트] 부산 소상공인 온라인 판로 지원', agency: '부산경제진흥원', category: '판로·해외진출', region: '부산', end: 9, recruiting: true,
    target: '부산 소재 소상공인', bizYears: '1년미만,3년미만,5년미만', targetAge: '청년 우대', tags: ['커머스', '판로', '온라인'],
    content: '온라인 쇼핑몰 입점과 마케팅 비용 일부를 지원합니다.' }, // 불가: 예비창업자 대상 아님 (나이 조건은 읽을 수 없음)
  { id: 'T-0014', title: '[테스트] 부산 관광 스타트업 공모전', agency: '부산관광공사', category: '사업화', region: '부산', end: 1, recruiting: true,
    target: '관광 분야 예비·초기 창업자', bizYears: '예비창업자,7년미만', targetAge: '만 39세 이하', tags: ['관광·문화', '관광', '사업화'],
    content: '관광 분야 아이디어를 공모하고 사업화 자금을 지원합니다.' }, // 가능, D-1
];

/** now 기준 테스트 공고. */
export function seedPrograms(now: Date): Program[] {
  const today = kstDate(now);
  return SEED_PROGRAMS.map(({ end, start, ...p }) => {
    const startDate = addDays(today, start ?? (end === null ? -60 : Math.min(end, 0) - 20));
    return { ...p, startDate, endDate: end === null ? null : addDays(today, end), registeredAt: startDate, url: K_URL };
  });
}

/** 데모 사용자의 완성된 상담 프로필. */
export const DEMO_PROFILE: ConsultProfile = {
  age: 24,
  stage: 'pre',
  district: '남구',
  affiliation: '대학생',
  teamSize: '2~3명',
  idea: '부산 대학가 자취생을 위한 중고 가전 구독 플랫폼',
  industry: 'IT·플랫폼',
  bizForm: '앱·웹 서비스',
  problem: '자취생은 1~2년만 살 집에 가전을 새로 사기 부담스럽고, 이사할 때 처분도 어렵다.',
  readiness: '조사 중',
  revenue: ['구독', '수수료'],
  customerType: 'B2C',
  customerAges: ['20대'],
  customerRegion: '부산',
  customerDesc: '부산 대학가 자취생',
  alternative: '중고 거래 앱에서 직접 사고팔기',
  needs: ['자금', '멘토링·교육', '공간'],
};

export interface SeedUser {
  id: string;
  email: string;
  password: string; // 평문. API가 시작할 때 해시로 바꾼다. 테스트 전용.
  isTeam: boolean;
  profile: ConsultProfile | null;
}

export const SEED_USERS: SeedUser[] = [
  { id: 'u-demo', email: 'demo@test.local', password: 'demo1234!', isTeam: false, profile: DEMO_PROFILE },
  { id: 'u-new', email: 'new@test.local', password: 'new1234!', isTeam: false, profile: null },
  { id: 'u-team', email: 'team@test.local', password: 'team1234!', isTeam: true, profile: null },
];

/** F11 기관 테스트 데이터. 주소는 팀(D)이 확인해서 바꾼다. */
export const SEED_AGENCIES: Agency[] = [
  { id: 'ag-ccei', name: '부산창조경제혁신센터', address: '부산광역시 (주소 확인 필요)', role: '예비창업 지원사업 운영, 창업 상담', url: 'https://ccei.creativekorea.or.kr/busan/', districts: [], forAffiliations: [] },
  { id: 'ag-bepa', name: '부산경제진흥원', address: '부산광역시 (주소 확인 필요)', role: '청년 창업·소상공인 지원, 판로 지원', url: 'https://www.bepa.kr', districts: [], forAffiliations: [] },
  { id: 'ag-btp', name: '부산테크노파크', address: '부산광역시 (주소 확인 필요)', role: '기술창업 보육, 입주 공간', url: 'https://www.btp.or.kr', districts: ['강서구', '사하구', '사상구'], forAffiliations: [] },
  { id: 'ag-pnu', name: '부산대학교 창업지원단', address: '부산광역시 금정구 (주소 확인 필요)', role: '재학생 창업 동아리·교육·공간', url: 'https://www.pusan.ac.kr', districts: ['금정구', '동래구'], forAffiliations: ['대학생', '대학원생'] },
  { id: 'ag-pknu', name: '부경대학교 창업지원단', address: '부산광역시 남구 (주소 확인 필요)', role: '재학생 창업 교육·멘토링', url: 'https://www.pknu.ac.kr', districts: ['남구', '수영구'], forAffiliations: ['대학생', '대학원생'] },
];

/** F16 모의 접수 양식. 실제 공고 양식을 내려받기 전까지 이 항목을 쓴다. */
export const MOCK_FORM_FIELDS: Omit<FormField, 'value'>[] = [
  { key: 'name', label: '대표자 이름', maxLength: 20, required: true, identity: true },
  { key: 'phone', label: '연락처', maxLength: 20, required: true, identity: true },
  { key: 'email', label: '이메일', maxLength: 100, required: true, identity: true },
  { key: 'itemName', label: '창업 아이템명', maxLength: 50, required: true },
  { key: 'problem', label: '문제 인식', maxLength: 500, required: true },
  { key: 'solution', label: '해결 방안', maxLength: 500, required: true },
  { key: 'market', label: '목표 시장과 고객', maxLength: 500, required: true },
  { key: 'plan', label: '사업화 계획', maxLength: 500, required: false },
];
