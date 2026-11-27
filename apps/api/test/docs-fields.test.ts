import { describe, expect, test } from 'bun:test';
import { extractFields } from '../src/docs/fields';
import { GLOBAL_STARTUP, NOT_A_FORM, PRE_STARTUP_PLAN, YOUTH_APPLICATION } from './docs-fixtures';

const labels = (s: string) => extractFields(s).map((f) => f.label);
const find = (s: string, label: string) => extractFields(s).find((f) => f.label === label);

describe('extractFields', () => {
  test('예비창업패키지 사업계획서: 표 행, 제목, 기호 항목', () => {
    const l = labels(PRE_STARTUP_PLAN);
    for (const want of ['창업아이템명', '신청자 성명', '생년월일', '이메일', '창업 아이템 개요', '개발 동기 및 필요성', '시장 분석']) {
      expect(l).toContain(want);
    }
    expect(find(PRE_STARTUP_PLAN, '창업 아이템 개요')).toEqual({ label: '창업 아이템 개요', maxLength: 500, required: false });
    expect(find(PRE_STARTUP_PLAN, '개발 동기 및 필요성')?.required).toBe(true);
    expect(find(PRE_STARTUP_PLAN, '개발 방안 및 사업화 전략')?.maxLength).toBe(1000);
    expect(find(PRE_STARTUP_PLAN, '시장 분석')?.required).toBe(true);
  });

  test('안내 주석, 표 머리글, 서술문은 항목이 아니다', () => {
    const l = labels(PRE_STARTUP_PLAN);
    expect(l.some((x) => x.includes('파란색'))).toBe(false);
    expect(l).not.toContain('구분');
    expect(l).not.toContain('내용');
    expect(l.some((x) => x.includes('허위'))).toBe(false);
    expect(l.some((x) => x.includes('핵심 기능'))).toBe(false);
  });

  test('입교 신청서: 글자수, byte, 최대 표기', () => {
    expect(find(YOUTH_APPLICATION, '창업 아이템 개요')?.maxLength).toBe(500);
    expect(find(YOUTH_APPLICATION, '사업화 목표 및 계획')?.maxLength).toBe(800);
    expect(find(YOUTH_APPLICATION, '대표자 약력')?.maxLength).toBe(2000);
    expect(find(YOUTH_APPLICATION, '휴대전화')?.required).toBe(true);
    expect(labels(YOUTH_APPLICATION)).toContain('기술 보유 현황');
    expect(labels(YOUTH_APPLICATION)).toContain('주소');
    expect(labels(YOUTH_APPLICATION).some((x) => x.includes('증빙'))).toBe(false);
    expect(labels(YOUTH_APPLICATION).some((x) => x.includes('해당 사항'))).toBe(false);
  });

  test('번호 (1) ① 형식과 이하/내외 표기', () => {
    expect(find(GLOBAL_STARTUP, '기업명')?.required).toBe(true);
    expect(find(GLOBAL_STARTUP, '주요 제품 및 서비스')?.maxLength).toBe(300);
    expect(find(GLOBAL_STARTUP, '해외 진출 계획')?.maxLength).toBe(1000);
    expect(find(GLOBAL_STARTUP, '팀 소개')?.maxLength).toBe(400);
    expect(labels(GLOBAL_STARTUP)).toContain('신청 동기');
    expect(labels(GLOBAL_STARTUP).some((x) => x.includes('신청 자격'))).toBe(false);
  });

  test('양식이 아닌 공고문은 빈 배열', () => {
    expect(extractFields(NOT_A_FORM)).toEqual([]);
    expect(extractFields('')).toEqual([]);
  });

  test('중복 제거, 순서 유지, 40개 상한', () => {
    const dup = '1. 창업 아이템 개요\n□ 창업 아이템 개요 (500자 이내)\n| 창업 아이템 개요 | |';
    expect(extractFields(dup)).toEqual([{ label: '창업 아이템 개요', maxLength: 500, required: false }]);
    const many = Array.from({ length: 60 }, (_, i) => `□ 항목${String.fromCharCode(0xac00 + i)}`).join('\n');
    const out = extractFields(many);
    expect(out.length).toBe(40);
    expect(out[0].label).toBe('항목가');
    expect(out[39].label).toBe(`항목${String.fromCharCode(0xac00 + 39)}`);
  });
});
