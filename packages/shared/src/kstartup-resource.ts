// K-Startup 공고(KStartupItem) → Resource(지원사업). 순수 함수. 원문에 없는 값은 지어내지 않고 null·빈 배열로 둔다.
import { INDUSTRY_TAGS, type IndustryTag, type ReadinessStage, type RecruitStatus, type Resource, type ResourceType, type ReviewRegion } from './explore';
import { parseAgeRanges } from './eligibility';
import { kstDate } from './date';
import { toIso, type KStartupItem } from './kstartup';

const CONTENT_MAX = 400;
const METHOD_MAX = 120;
const OPEN_WORDS = ['전체', '무관', '제한없음', '제한 없음'];

const text = (v: unknown): string | null => {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return null;
  const t = v.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return t || null;
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const tokens = (raw: string | null) => (raw ?? '').split(/[,·/]/).map((t) => t.trim()).filter(Boolean);

type Region = Resource['regions'][number];

/** 지원 지역 문자열 → 지역. 부산·울산·경남·부울경·전국만 남기고 다른 지역은 버린다. */
export function regionsOf(raw: string | null | undefined): Region[] {
  const t = raw ?? '';
  const out: Region[] = [];
  if (/전국/.test(t)) out.push('전국');
  if (/부울경/.test(t)) out.push('부울경');
  if (/부산/.test(t)) out.push('부산');
  if (/울산/.test(t)) out.push('울산');
  if (/경남|경상남도/.test(t)) out.push('경남');
  return out;
}

/** 창업 연차 문자열 → 준비 단계·사업자 조건. 읽을 수 없으면 빈 단계·undefined. */
export function enyyOf(raw: string | null | undefined): { stages: ReadinessStage[]; business: 'pre' | 'any' | 'registered' | undefined } {
  const list = tokens(text(raw));
  if (list.length === 0) return { stages: [], business: undefined };
  if (list.some((t) => OPEN_WORDS.includes(t))) return { stages: ['has_idea', 'preparing'], business: 'any' };
  const pre = list.some((t) => t.includes('예비'));
  const registered = list.some((t) => /\d+\s*년\s*(미만|이내|이하|이상)/.test(t));
  const stages: ReadinessStage[] = pre ? ['has_idea', 'preparing'] : registered ? ['preparing'] : [];
  const business = pre && registered ? 'any' : pre ? 'pre' : registered ? 'registered' : undefined;
  return { stages, business };
}

/** 지원 분류 → 도움 종류. 목록에 없는 분류는 태그를 달지 않는다. */
export function capabilitiesOf(raw: string | null | undefined): string[] {
  const t = raw ?? '';
  const out: string[] = [];
  const add = (cond: boolean, tag: string) => { if (cond && !out.includes(tag)) out.push(tag); };
  add(/사업화|융자|보증|투자/.test(t), '자금');
  add(/멘토링|컨설팅/.test(t), '상담');
  add(/시설|공간|보육/.test(t), '공간');
  add(/교육/.test(t), '교육');
  add(/행사|네트워크/.test(t), '네트워킹');
  return out;
}

/** 도움 종류 태그 → 자료 유형. 공간 > 상담 > 교육 순으로 본다. 그 밖(자금·네트워킹·분류 없음)은 지원사업. */
export function typeOfCapabilities(tags: readonly string[]): ResourceType {
  if (tags.includes('공간')) return '공간';
  if (tags.includes('상담')) return '상담';
  if (tags.includes('교육')) return '교육';
  return '지원사업';
}

/** 본문에 태그 이름이 그대로 있을 때만 산업 태그를 단다. */
export function industryTagsOf(body: string): IndustryTag[] {
  return INDUSTRY_TAGS.filter((tag) => (tag === 'AI' ? /(?<![A-Za-z])AI(?![A-Za-z])/.test(body) : body.includes(tag)));
}

/** 나이 구간들이 빈틈 없이 이어지면 [최소, 최대]. 중간에 빈 나이가 있으면 null (하나의 범위로 줄이면 틀린다). */
export function contiguous(ranges: Array<[number, number]>): [number, number] | null {
  if (ranges.length === 0) return null;
  const s = [...ranges].sort((a, b) => a[0] - b[0]);
  let [lo, hi] = s[0];
  for (const [a, b] of s.slice(1)) {
    if (a > hi + 1) return null;
    hi = Math.max(hi, b);
  }
  return [lo, hi];
}

function conditionsOf(item: KStartupItem): Resource['conditions'] {
  const c: NonNullable<Resource['conditions']> = {};
  const ranges = parseAgeRanges(text(item.biz_trgt_age));
  const span = ranges === 'open' ? [0, Infinity] as const : Array.isArray(ranges) ? contiguous(ranges) : null;
  if (span) {
    const [lo, hi] = span;
    if (lo <= 0 && !Number.isFinite(hi)) c.ageAny = true;
    else {
      if (lo > 0) c.ageMin = lo;
      if (Number.isFinite(hi)) c.ageMax = hi;
    }
  }
  const { business } = enyyOf(item.biz_enyy);
  if (business) c.business = business;
  return Object.keys(c).length ? c : null;
}

function procedureOf(item: KStartupItem): string | null {
  const parts: string[] = [];
  const add = (label: string, v: unknown) => { const t = text(v); if (t) parts.push(`${label}: ${clip(t, METHOD_MAX)}`); };
  add('온라인 접수', item.aply_mthd_onli_rcpt_istc);
  add('이메일 접수', item.aply_mthd_eml_rcpt_istc);
  add('방문 접수', item.aply_mthd_vst_rcpt_istc);
  add('우편 접수', item.aply_mthd_pssr_rcpt_istc);
  add('팩스 접수', item.aply_mthd_fax_rcpt_istc);
  add('기타', item.aply_mthd_etc_istc);
  const url = text(item.biz_aply_url);
  if (url) parts.push(`신청 URL: ${url}`);
  return parts.length ? parts.join(' / ') : null;
}

export function recruitStatusOf(item: Pick<KStartupItem, 'rcrt_prgs_yn' | 'pbanc_rcpt_end_dt'>, today: string): RecruitStatus {
  const end = toIso(item.pbanc_rcpt_end_dt);
  const flag = text(item.rcrt_prgs_yn)?.toUpperCase();
  if (flag === 'N' || (end !== null && end < today)) return 'closed';
  if (flag === 'Y' && end !== null) return 'open';
  return 'unknown';
}

/** 공고 하나를 Resource 로. 번호·제목이 없거나 부산·울산·경남·전국 어디에도 해당하지 않으면 null. */
export function kstartupToResource(item: KStartupItem, now: Date): Resource | null {
  const sn = text(item.pbanc_sn);
  const title = text(item.biz_pbanc_nm);
  const regions = regionsOf(text(item.supt_regin));
  if (!sn || !title || regions.length === 0) return null;
  const today = kstDate(now);
  const body = text(item.support_ctnt) ?? text(item.pbanc_ctnt);
  const detail = text(item.pbanc_ctnt);
  const url = text(item.detl_pg_url);
  const capabilityTags = capabilitiesOf(text(item.supt_biz_clsfc));
  const target = text(item.aply_trgt_ctnt) ?? text(item.aply_trgt);
  return {
    id: `ks-${sn}`,
    type: typeOfCapabilities(capabilityTags),
    title,
    agency: text(item.pbanc_ntrp_nm) ?? text(item.sprv_inst) ?? '',
    url: url && /^https?:\/\//.test(url) ? url : null,
    target: target ? clip(target, 200) : null,
    stages: enyyOf(item.biz_enyy).stages,
    content: body ? clip(body, CONTENT_MAX) : '',
    procedure: procedureOf(item),
    prep: null,
    regions: regions as (ReviewRegion | '부울경' | '전국')[],
    affiliationLimit: null,
    costPeriod: null,
    recruitStatus: recruitStatusOf(item, today),
    endDate: toIso(item.pbanc_rcpt_end_dt),
    startDate: toIso(item.pbanc_rcpt_bgng_dt),
    checkedAt: today,
    sourceExcerpt: detail ? clip(detail, 120) : body ? clip(body, 120) : null,
    industryTags: industryTagsOf([title, detail ?? '', body ?? ''].join(' ')),
    capabilityTags,
    contextIds: [],
    conditions: conditionsOf(item),
    test: false,
  };
}

/** 팀 검수 자료와 실제 공고를 합친다. 실제 지원사업이 하나라도 있으면 테스트 지원사업은 뺀다. */
export function mergeResources(team: readonly Resource[], real: readonly Resource[]): Resource[] {
  const keepTestSupport = real.length === 0;
  // 예전에 저장된 공고는 유형이 모두 '지원사업'이므로 읽을 때 도움 종류 태그로 다시 정한다.
  return [...team.filter((r) => keepTestSupport || r.type !== '지원사업'), ...real.map((r) => (r.id.startsWith('ks-') ? { ...r, type: typeOfCapabilities(r.capabilityTags) } : r))];
}

/** 현재 모집 중일 수 있는 자료 (종료·마감 지난 자료 제외). 지역 자료 범위 안내에 센다. */
export function activeResources(list: readonly Resource[], now: Date): Resource[] {
  const today = kstDate(now);
  return list.filter((r) => r.recruitStatus !== 'closed' && !(r.endDate !== null && r.endDate < today));
}
