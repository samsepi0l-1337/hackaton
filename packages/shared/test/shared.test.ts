import { describe, expect, test } from 'bun:test';
import {
  DEMO_PROFILE, addYears, dDay, dDayLabel, homeSummary, judge, kstDate, listPrograms, parseAgeRanges,
  pickMentorQuestions, recommend, scoreTypeTest, seedPrograms, TYPE_QUESTIONS, validateProfile,
  validateProfileSection, buildPlan, fromKStartup, relevanceCandidates, type Program,
} from '../src';

// 2026-11-27 10:00 KST
const NOW = new Date('2026-11-27T01:00:00Z');

const base: Program = {
  id: 'x', title: 't', agency: 'a', category: '사업화', region: '부산', startDate: '2026-11-01', endDate: '2026-11-27',
  recruiting: true, target: null, bizYears: '예비창업자,3년미만', targetAge: '만 20세 이상 ~ 만 39세 이하',
  content: '', url: '', registeredAt: '2026-11-01', tags: [],
};

describe('date', () => {
  test('KST 날짜는 UTC 15시 이후 다음 날', () => {
    expect(kstDate(new Date('2026-11-27T14:59:59Z'))).toBe('2026-11-27');
    expect(kstDate(new Date('2026-11-27T15:00:00Z'))).toBe('2026-11-28');
  });
  test('D-day', () => {
    expect(dDay('2026-11-27', NOW)).toBe(0);
    expect(dDayLabel(0)).toBe('D-DAY');
    expect(dDayLabel(null)).toBe('상시');
    expect(dDayLabel(-1)).toBe('마감');
  });
  test('윤년 2월 29일 + 1년', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
  });
});

describe('F4 자격 판정', () => {
  const me = { ...DEMO_PROFILE };
  test('마감일 당일은 가능, 다음 날은 불가', () => {
    expect(judge(base, me, NOW).verdict).toBe('eligible');
    expect(judge({ ...base, endDate: '2026-11-26' }, me, NOW).verdict).toBe('ineligible');
  });
  test('상시 모집은 마감으로 떨어지지 않음', () => {
    expect(judge({ ...base, endDate: null }, me, NOW).verdict).toBe('eligible');
  });
  test('만 39세 가능, 40세 불가', () => {
    expect(judge(base, { ...me, age: 39 }, NOW).verdict).toBe('eligible');
    expect(judge(base, { ...me, age: 40 }, NOW).verdict).toBe('ineligible');
  });
  test('창업 3년 당일 가능, 3년+1일 불가', () => {
    const p = { ...base, bizYears: '3년미만' };
    expect(judge(p, { ...me, stage: '1to3', openedAt: '2023-11-27' }, NOW).verdict).toBe('eligible');
    expect(judge(p, { ...me, stage: '1to3', openedAt: '2023-11-26' }, NOW).verdict).toBe('ineligible');
  });
  test('조건 정보가 없으면 확인 필요', () => {
    const e = judge({ ...base, targetAge: null }, me, NOW);
    expect(e.verdict).toBe('check');
    expect(e.checks.find((c) => c.key === 'age')!.status).toBe('unknown');
  });
  test('읽을 수 없는 나이 조건은 확인 필요', () => {
    expect(parseAgeRanges('청년 우대')).toBeNull();
    expect(judge({ ...base, targetAge: '청년 우대' }, me, NOW).verdict).toBe('check');
  });
  test('다른 지역 한정은 불가, 전국은 가능, 부산 외 사용자는 부산 공고 불가', () => {
    expect(judge({ ...base, region: '경남' }, me, NOW).verdict).toBe('ineligible');
    expect(judge({ ...base, region: '전국' }, { ...me, district: '부산 외' }, NOW).verdict).toBe('eligible');
    expect(judge(base, { ...me, district: '부산 외' }, NOW).verdict).toBe('ineligible');
  });
  test('같은 입력은 같은 결과', () => {
    expect(judge(base, me, NOW)).toEqual(judge(base, me, NOW));
  });
});

describe('테스트 데이터', () => {
  const programs = seedPrograms(NOW);
  const verdicts = Object.fromEntries(programs.map((p) => [p.id, judge(p, DEMO_PROFILE, NOW).verdict]));
  test('주석의 판정과 맞음', () => {
    expect(verdicts).toEqual({
      'T-0001': 'eligible', 'T-0002': 'eligible', 'T-0003': 'eligible', 'T-0004': 'eligible', 'T-0005': 'eligible',
      'T-0006': 'ineligible', 'T-0007': 'ineligible', 'T-0008': 'ineligible', 'T-0009': 'check', 'T-0010': 'ineligible',
      'T-0011': 'ineligible', 'T-0012': 'eligible', 'T-0013': 'ineligible', 'T-0014': 'eligible',
    });
  });
  test('데모 프로필은 완성된 프로필', () => {
    expect(validateProfile(DEMO_PROFILE)).toEqual([]);
  });
});

describe('F5 Top3', () => {
  const programs = seedPrograms(NOW);
  test('불가·제외 공고는 나오지 않고 최대 3개', () => {
    const top = recommend({ programs, profile: DEMO_PROFILE, now: NOW });
    expect(top.length).toBe(3);
    expect(top.every((r) => r.eligibility!.verdict !== 'ineligible')).toBe(true);
    expect(top.every((r) => r.reason.length > 0)).toBe(true);
    const again = recommend({ programs, profile: DEMO_PROFILE, now: NOW, excludeIds: [top[0]!.program.id] });
    expect(again.map((r) => r.program.id)).not.toContain(top[0]!.program.id);
  });
  test('AI 관련도 확률이 있으면 순위에 반영', () => {
    const boost = recommend({ programs, profile: DEMO_PROFILE, now: NOW, relevance: { 'T-0005': 1 } });
    const base = recommend({ programs, profile: DEMO_PROFILE, now: NOW, relevance: { 'T-0005': 0 } });
    expect(boost.find((r) => r.program.id === 'T-0005')).toBeDefined();
    expect(base.find((r) => r.program.id === 'T-0005')).toBeUndefined();
    expect(relevanceCandidates(programs, DEMO_PROFILE, NOW).every((p) => judge(p, DEMO_PROFILE, NOW).verdict !== 'ineligible')).toBe(true);
  });
  test('7일 계획 첫 항목은 마감이 가장 가까운 사업', () => {
    const top = recommend({ programs, profile: DEMO_PROFILE, now: NOW });
    const plan = buildPlan(top, NOW);
    const nearest = [...top].sort((a, b) => (a.dDay ?? 1e9) - (b.dDay ?? 1e9))[0]!;
    expect(plan).toHaveLength(7);
    expect(plan[0]!.programId).toBe(nearest.program.id);
  });
});

describe('F18·F20 공고 목록', () => {
  const programs = seedPrograms(NOW);
  test('기본은 마감·모집 종료 숨김, 마감 임박순', () => {
    const r = listPrograms(programs, {}, NOW, null);
    expect(r.items.map((c) => c.program.id)).not.toContain('T-0010');
    expect(r.items.map((c) => c.program.id)).not.toContain('T-0011');
    const ds = r.items.map((c) => c.dDay ?? 1e9);
    expect([...ds].sort((a, b) => a - b)).toEqual(ds);
  });
  test('상시 필터, 검색, 판정 필터', () => {
    expect(listPrograms(programs, { due: 'always' }, NOW, null).items.every((c) => c.dDay === null)).toBe(true);
    expect(listPrograms(programs, { q: '관광' }, NOW, null).items.map((c) => c.program.id)).toContain('T-0014');
    const v = listPrograms(programs, { verdict: 'check' }, NOW, DEMO_PROFILE);
    expect(v.items.map((c) => c.program.id)).toEqual(['T-0009']);
  });
  test('메인 요약', () => {
    const h = homeSummary(programs, NOW);
    expect(h.openCount).toBe(12);
    expect(h.closingSoon.map((c) => c.program.id)).toEqual(['T-0014', 'T-0003', 'T-0001']);
  });
});

describe('F1·F2·F19', () => {
  test('섹션 필수 항목', () => {
    expect(validateProfileSection('me', {}).map((e) => e.field)).toEqual(['age', 'stage', 'district']);
    expect(validateProfileSection('me', { age: 20, stage: 'lt1', district: '중구' }).map((e) => e.field)).toEqual(['openedAt']);
    expect(validateProfileSection('me', { age: 35, stage: 'pre', district: '중구' }).map((e) => e.field)).toEqual(['age']);
  });
  test('멘토 질문은 정확히 3개', () => {
    expect(pickMentorQuestions({})).toHaveLength(3);
    expect(pickMentorQuestions(DEMO_PROFILE)).toHaveLength(3);
  });
  test('유형 테스트 12문항 → 4글자', () => {
    expect(TYPE_QUESTIONS).toHaveLength(12);
    const all = Object.fromEntries(TYPE_QUESTIONS.map((q) => [q.id, q.options[0].letter]));
    expect(scoreTypeTest(all).code).toBe('ASDC');
    const r = scoreTypeTest(Object.fromEntries(TYPE_QUESTIONS.map((q) => [q.id, q.options[1].letter])));
    expect(r.code).toBe('PTHK');
    expect(r.axisScores.AP).toEqual({ left: 0, right: 3 });
  });
  test('K-Startup 변환', () => {
    const p = fromKStartup({ pbanc_sn: 123, biz_pbanc_nm: 'x', pbanc_rcpt_end_dt: '20261130', rcrt_prgs_yn: 'Y', supt_regin: ' ' });
    expect(p).toMatchObject({ id: '123', endDate: '2026-11-30', recruiting: true, region: null });
  });
});
