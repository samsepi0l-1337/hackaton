// F1 사전 상담 폼 검사. 웹(제출 전)과 API(저장 시) 양쪽에서 같은 규칙을 쓴다.
import {
  AGE_MAX, AGE_MIN, BIZ_FORMS, BUSAN_DISTRICTS, CUSTOMER_AGES, CUSTOMER_DESC_MAX, CUSTOMER_REGIONS,
  CUSTOMER_TYPES, IDEA_MAX, INDUSTRIES, OUTSIDE_BUSAN, PROBLEM_MAX, READINESS, STAGES, SUPPORT_NEEDS,
} from './constants';
import { isValidIsoDate } from './date';
import type { ConsultProfile, FieldError, ProfileSection } from './types';

const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null);
const oneOf = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);

export const SECTION_FIELDS: Record<ProfileSection, (keyof ConsultProfile)[]> = {
  me: ['age', 'stage', 'openedAt', 'district', 'affiliation', 'teamSize', 'typeCode'],
  business: ['idea', 'industry', 'bizForm', 'problem', 'readiness', 'revenue'],
  customer: ['customerType', 'customerAges', 'customerRegion', 'customerDesc', 'alternative', 'needs'],
};

/** 한 섹션의 필수·형식 오류. 빈 배열이면 다음 섹션으로 갈 수 있다. */
export function validateProfileSection(section: ProfileSection, p: ConsultProfile): FieldError[] {
  const e: FieldError[] = [];
  const req = (field: keyof ConsultProfile, label: string) => { if (!has(p[field])) e.push({ field, message: `${label}을(를) 입력해 주세요` }); };
  if (section === 'me') {
    if (!has(p.age)) e.push({ field: 'age', message: '나이를 입력해 주세요' });
    else if (!Number.isInteger(p.age) || p.age! < AGE_MIN || p.age! > AGE_MAX) e.push({ field: 'age', message: `나이는 만 ${AGE_MIN}~${AGE_MAX}세예요` });
    if (!oneOf(STAGES.map((s) => s.value), p.stage)) e.push({ field: 'stage', message: '창업 단계를 골라 주세요' });
    if (p.stage && p.stage !== 'pre' && !isValidIsoDate(p.openedAt)) e.push({ field: 'openedAt', message: '사업자 개업일을 입력해 주세요' });
    if (!oneOf([...BUSAN_DISTRICTS, OUTSIDE_BUSAN], p.district)) e.push({ field: 'district', message: '사업장 지역을 골라 주세요' });
  }
  if (section === 'business') {
    req('idea', '아이디어');
    if ((p.idea ?? '').length > IDEA_MAX) e.push({ field: 'idea', message: `아이디어는 ${IDEA_MAX}자 이하예요` });
    if (!oneOf(INDUSTRIES, p.industry)) e.push({ field: 'industry', message: '업종을 골라 주세요' });
    if (!oneOf(BIZ_FORMS, p.bizForm)) e.push({ field: 'bizForm', message: '사업 형태를 골라 주세요' });
    req('problem', '해결하려는 문제');
    if ((p.problem ?? '').length > PROBLEM_MAX) e.push({ field: 'problem', message: `문제는 ${PROBLEM_MAX}자 이하예요` });
    if (!oneOf(READINESS, p.readiness)) e.push({ field: 'readiness', message: '준비 상태를 골라 주세요' });
  }
  if (section === 'customer') {
    if (!oneOf(CUSTOMER_TYPES, p.customerType)) e.push({ field: 'customerType', message: '고객 유형을 골라 주세요' });
    if (p.customerType === 'B2C' && !(p.customerAges ?? []).some((a) => (CUSTOMER_AGES as readonly string[]).includes(a))) {
      e.push({ field: 'customerAges', message: '고객 연령대를 골라 주세요' });
    }
    if (!oneOf(CUSTOMER_REGIONS, p.customerRegion)) e.push({ field: 'customerRegion', message: '고객 지역을 골라 주세요' });
    req('customerDesc', '고객 설명');
    if ((p.customerDesc ?? '').length > CUSTOMER_DESC_MAX) e.push({ field: 'customerDesc', message: `고객 설명은 ${CUSTOMER_DESC_MAX}자 이하예요` });
    if (!(p.needs ?? []).some((n) => (SUPPORT_NEEDS as readonly string[]).includes(n))) e.push({ field: 'needs', message: '필요한 지원을 하나 이상 골라 주세요' });
  }
  return e;
}

export function validateProfile(p: ConsultProfile): FieldError[] {
  return (['me', 'business', 'customer'] as const).flatMap((s) => validateProfileSection(s, p));
}

export function isProfileComplete(p: ConsultProfile | null | undefined): p is ConsultProfile {
  return !!p && validateProfile(p).length === 0;
}
