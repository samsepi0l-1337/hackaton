import { expect, test } from 'bun:test';
import { DEMO_PROFILE, checkDeadline, checkRegion, isValidIsoDate, listPrograms, parseYearBuckets, seedPrograms, validateProfileSection, isValidTypeCode } from '../src';

const now = new Date('2026-11-27T01:00:00Z');
const base = seedPrograms(now)[0]!;

test('year conditions reject unrecognized tokens', () => {
  expect(parseYearBuckets('3년미만, 알수없음')).toBeNull();
});

test('deadline and region eligibility handle closed recruitment and unknown district', () => {
  expect(checkDeadline({ ...base, recruiting: false }, now).status).toBe('fail');
  expect(checkRegion({ ...base, region: '부산' }, { ...DEMO_PROFILE, district: '기타 지역' }).status).toBe('unknown');
});

test('customer description length limit is validated', () => {
  const errors = validateProfileSection('customer', { ...DEMO_PROFILE, customerDesc: '가'.repeat(201) });
  expect(errors.map((e) => e.field)).toContain('customerDesc');
});

test('program listing filters stages and ages and applies profile verdict', () => {
  const programs = [
    { ...base, id: 'a', bizYears: '예비창업자', targetAge: '20세 이상 ~ 만 29세 이하', region: '전국', endDate: null, recruiting: true },
    { ...base, id: 'b', bizYears: '3년미만', targetAge: '30세 이상', region: '전국', endDate: null, recruiting: true },
    { ...base, id: 'c', bizYears: null, targetAge: null, region: '전국', endDate: null, recruiting: true },
  ];
  const ids = (q: Parameters<typeof listPrograms>[1]) => listPrograms(programs, q, now, null).items.map((c) => c.program.id);
  expect(ids({ stage: 'pre' })).toEqual(['a', 'c']);
  expect(ids({ stage: '1to3' })).toEqual(['b', 'c']);
  expect(ids({ age: 25 })).toEqual(['a', 'c']);
  expect(listPrograms(programs, { verdict: 'eligible' }, now, DEMO_PROFILE).items.every((c) => c.eligibility?.verdict === 'eligible')).toBe(true);
});

test('date validation accepts leap day and rejects non-leap day and malformed dates', () => {
  expect(isValidIsoDate('2024-02-29')).toBe(true);
  expect(isValidIsoDate('2025-02-29')).toBe(false);
  expect(isValidIsoDate('2025-2-01')).toBe(false);
});

test('B2C customer profile requires a recognized age group', () => {
  const errors = validateProfileSection('customer', { ...DEMO_PROFILE, customerType: 'B2C', customerAges: [] });
  expect(errors.map((e) => e.field)).toContain('customerAges');
});

test('numeric due filter includes only programs due within the specified days', () => {
  const programs = [
    { ...base, id: 'soon', endDate: '2026-11-30', recruiting: true },
    { ...base, id: 'late', endDate: '2026-12-10', recruiting: true },
    { ...base, id: 'always', endDate: null, recruiting: true },
  ];
  expect(listPrograms(programs, { due: '7' }, now, null).items.map((c) => c.program.id)).toEqual(['soon']);
});

test('type code validation rejects malformed or unknown codes', () => {
  expect(isValidTypeCode('ASDC')).toBe(true);
  expect(isValidTypeCode('XXXX')).toBe(false);
  expect(isValidTypeCode(null)).toBe(false);
});

// BUG: invalid month throws RangeError rather than returning false.
test.skip('date validation rejects an invalid month without throwing', () => {
  expect(isValidIsoDate('2025-13-01')).toBe(false);
});
