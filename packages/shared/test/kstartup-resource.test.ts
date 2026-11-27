import { describe, expect, test } from 'bun:test';
import { RESOURCES, activeResources, kstartupToResource, mergeResources, recruitStatusOf, toIso, type KStartupItem } from '../src';

const NOW = new Date('2026-11-27T01:00:00Z'); // KST 2026-11-27 10:00
const item = (o: Partial<KStartupItem> = {}): KStartupItem => ({
  pbanc_sn: 170001, biz_pbanc_nm: '2026년 부산 예비창업패키지', pbanc_ntrp_nm: '부산테크노파크', supt_biz_clsfc: '사업화', supt_regin: '부산',
  pbanc_rcpt_bgng_dt: '20261101', pbanc_rcpt_end_dt: '20261231', rcrt_prgs_yn: 'Y', aply_trgt: '일반인, 대학생', biz_enyy: '예비창업자',
  biz_trgt_age: '만 20세 이상 ~ 만 39세 이하', support_ctnt: '사업화 자금 최대 1억원', pbanc_ctnt: '공고 본문', detl_pg_url: 'https://www.k-startup.go.kr/x', ...o,
});

describe('toIso', () => {
  test('yyyyMMdd, 하이픈, 시각이 붙은 값', () => {
    expect(toIso('20261231')).toBe('2026-12-31');
    expect(toIso('2026-12-31')).toBe('2026-12-31');
    expect(toIso('2026-12-31 23:59:59')).toBe('2026-12-31');
    expect(toIso('20261231235959')).toBe('2026-12-31');
    expect(toIso('')).toBeNull();
    expect(toIso(undefined)).toBeNull();
  });
});

describe('모집 상태', () => {
  const st = (end: string | undefined, yn: string | undefined) => recruitStatusOf({ pbanc_rcpt_end_dt: end, rcrt_prgs_yn: yn }, '2026-11-27');
  test('마감일이 오늘이면 모집 중', () => expect(st('20261127', 'Y')).toBe('open'));
  test('마감일이 어제면 종료', () => expect(st('20261126', 'Y')).toBe('closed'));
  test('N 은 마감 전이어도 종료', () => expect(st('20261231', 'N')).toBe('closed'));
  test('Y 인데 마감일이 없으면 확인 필요', () => expect(st(undefined, 'Y')).toBe('unknown'));
  test('표시가 없으면 확인 필요', () => expect(st('20261231', undefined)).toBe('unknown'));
});

describe('kstartupToResource', () => {
  test('기본 필드', () => {
    const r = kstartupToResource(item(), NOW)!;
    expect(r).toMatchObject({
      id: 'ks-170001', type: '지원사업', title: '2026년 부산 예비창업패키지', agency: '부산테크노파크', url: 'https://www.k-startup.go.kr/x',
      target: '일반인, 대학생', content: '사업화 자금 최대 1억원', regions: ['부산'], recruitStatus: 'open', endDate: '2026-12-31',
      checkedAt: '2026-11-27', capabilityTags: ['자금'], test: false, stages: ['has_idea', 'preparing'], prep: null,
    });
    expect(r.title).not.toContain('[테스트]');
    expect(r.sourceExcerpt).toBe('공고 본문');
  });

  test('번호·제목이 없거나 지역이 해당 없으면 null', () => {
    expect(kstartupToResource(item({ biz_pbanc_nm: ' ' }), NOW)).toBeNull();
    expect(kstartupToResource(item({ pbanc_sn: '' }), NOW)).toBeNull();
    expect(kstartupToResource(item({ supt_regin: '서울' }), NOW)).toBeNull();
    expect(kstartupToResource(item({ supt_regin: undefined }), NOW)).toBeNull();
  });

  test('지역: 전국·부산·울산·경남, 다른 지역은 버린다', () => {
    expect(kstartupToResource(item({ supt_regin: '전국' }), NOW)!.regions).toEqual(['전국']);
    expect(kstartupToResource(item({ supt_regin: '서울, 부산, 울산' }), NOW)!.regions).toEqual(['부산', '울산']);
    expect(kstartupToResource(item({ supt_regin: '경상남도' }), NOW)!.regions).toEqual(['경남']);
    expect(kstartupToResource(item({ supt_regin: '서울,전국' }), NOW)!.regions).toEqual(['전국']);
  });

  test('연령: 범위·이상·이하·제한 없음·읽을 수 없음', () => {
    const cond = (v: string | undefined) => kstartupToResource(item({ biz_trgt_age: v, biz_enyy: '' }), NOW)!.conditions;
    expect(cond('만 20세 이상 ~ 만 39세 이하')).toEqual({ ageMin: 20, ageMax: 39 });
    expect(cond('만 40세 이상')).toEqual({ ageMin: 40 });
    expect(cond('만 39세 이하')).toEqual({ ageMax: 39 });
    expect(cond('만 20세 미만')).toEqual({ ageMax: 19 });
    expect(cond('제한없음')).toBeNull();
    expect(cond('청년 우대')).toBeNull();
    expect(cond(undefined)).toBeNull();
  });

  test('창업 연차: 예비·N년미만·둘 다·읽을 수 없음', () => {
    const f = (v: string | undefined) => kstartupToResource(item({ biz_enyy: v, biz_trgt_age: undefined }), NOW)!;
    expect(f('예비창업자')).toMatchObject({ stages: ['has_idea', 'preparing'], conditions: { business: 'pre' } });
    expect(f('3년미만')).toMatchObject({ stages: ['preparing'], conditions: { business: 'registered' } });
    expect(f('예비창업자,1년미만')).toMatchObject({ stages: ['has_idea', 'preparing'], conditions: { business: 'any' } });
    expect(f('전체')).toMatchObject({ conditions: { business: 'any' } });
    expect(f(undefined)).toMatchObject({ stages: [], conditions: null });
  });

  test('신청 방법과 신청 URL 을 절차로 모은다', () => {
    const r = kstartupToResource(item({ aply_mthd_onli_rcpt_istc: 'K-Startup 온라인 접수', aply_mthd_eml_rcpt_istc: 'a@b.kr', aply_mthd_vst_rcpt_istc: '방문 접수', biz_aply_url: 'https://apply.example/x' }), NOW)!;
    expect(r.procedure).toBe('온라인 접수: K-Startup 온라인 접수 / 이메일 접수: a@b.kr / 방문 접수: 방문 접수 / 신청 URL: https://apply.example/x');
    expect(kstartupToResource(item(), NOW)!.procedure).toBeNull();
  });

  test('내용은 400자로 줄이고 HTML 태그를 뗀다', () => {
    const r = kstartupToResource(item({ support_ctnt: `<p>${'가'.repeat(500)}</p>` }), NOW)!;
    expect(r.content.length).toBe(400);
    expect(r.content.endsWith('…')).toBe(true);
    expect(r.content).not.toContain('<p>');
    expect(kstartupToResource(item({ support_ctnt: undefined, pbanc_ctnt: '본문만' }), NOW)!.content).toBe('본문만');
  });

  test('산업 태그는 본문에 이름이 있을 때만, AI 는 단어로만', () => {
    expect(kstartupToResource(item(), NOW)!.industryTags).toEqual([]);
    expect(kstartupToResource(item({ pbanc_ctnt: '조선·해양 분야 스타트업과 AI 활용 기업' }), NOW)!.industryTags).toEqual(['조선·해양', 'AI']);
    expect(kstartupToResource(item({ pbanc_ctnt: 'MAIN AIR 공고' }), NOW)!.industryTags).toEqual([]);
  });

  test('지원 분류 → 도움 종류', () => {
    const t = (v: string) => kstartupToResource(item({ supt_biz_clsfc: v }), NOW)!.capabilityTags;
    expect(t('멘토링ㆍ컨설팅ㆍ교육')).toEqual(['상담', '교육']);
    expect(t('시설ㆍ공간ㆍ보육')).toEqual(['공간']);
    expect(t('융자ㆍ보증ㆍ투자')).toEqual(['자금']);
    expect(t('글로벌')).toEqual([]);
  });

  test('숫자 pbanc_sn, 종료 공고', () => {
    const r = kstartupToResource(item({ pbanc_sn: 5, pbanc_rcpt_end_dt: '2026-11-01 18:00:00' }), NOW)!;
    expect(r.id).toBe('ks-5');
    expect(r.recruitStatus).toBe('closed');
  });
});

describe('mergeResources', () => {
  test('실제 지원사업이 있으면 테스트 지원사업을 뺀다', () => {
    const real = [kstartupToResource(item(), NOW)!];
    const merged = mergeResources(RESOURCES, real);
    expect(merged.some((r) => r.id === 'rs-kstartup-pre')).toBe(false);
    expect(merged.filter((r) => r.type !== '지원사업').length).toBe(RESOURCES.filter((r) => r.type !== '지원사업').length);
    expect(merged.at(-1)!.id).toBe('ks-170001');
  });
  test('실제 자료가 없으면 팀 자료를 그대로 둔다', () => expect(mergeResources(RESOURCES, [])).toEqual(RESOURCES));
  test('activeResources 는 종료·마감 지난 자료를 뺀다', () => {
    const open = kstartupToResource(item(), NOW)!;
    const closed = kstartupToResource(item({ pbanc_sn: 2, rcrt_prgs_yn: 'N' }), NOW)!;
    const past = { ...open, id: 'ks-3', recruitStatus: 'open' as const, endDate: '2026-11-01' };
    expect(activeResources([open, closed, past], NOW).map((r) => r.id)).toEqual(['ks-170001']);
  });
});
