// 수집한 지원사업을 Durable Object KV 에 둔다: `ks:resource:<id>`, `ks:meta`. 읽을 때 Zod 로 검사하고 깨진 레코드는 건너뛴다.
import { z } from 'zod';
import type { Resource } from '@gil/shared';
import type { KvLike } from '../store';

const Region = z.enum(['부산', '울산', '경남', '미정', '부울경', '전국']);
export const ResourceSchema = z.object({
  id: z.string(),
  type: z.enum(['교육', '상담', '공간', '지원사업']),
  title: z.string(),
  agency: z.string(),
  url: z.string().nullable(),
  target: z.string().nullable(),
  stages: z.array(z.enum(['no_idea', 'has_idea', 'preparing'])),
  content: z.string(),
  procedure: z.string().nullable(),
  prep: z.string().nullable(),
  regions: z.array(Region),
  affiliationLimit: z.string().nullable(),
  costPeriod: z.string().nullable(),
  recruitStatus: z.enum(['open', 'closed', 'always', 'unknown']),
  endDate: z.string().nullable(),
  startDate: z.string().nullable().optional(),
  checkedAt: z.string().nullable(),
  sourceExcerpt: z.string().nullable(),
  industryTags: z.array(z.enum(['조선·해양', '자동차', '항공', '방산', '수소·에너지', '데이터센터', 'AI', '2차전지'])),
  capabilityTags: z.array(z.string()),
  contextIds: z.array(z.string()),
  conditions: z.object({
    ageMin: z.number().optional(), ageMax: z.number().optional(), ageAny: z.boolean().optional(), residence: z.string().optional(), business: z.enum(['pre', 'any', 'registered']).optional(),
  }).nullable(),
  test: z.boolean(),
});

export const MetaSchema = z.object({
  /** 마지막으로 수집에 성공한 시각 (ISO). 한 번도 없으면 null. */
  fetchedAt: z.string().nullable(),
  /** 마지막으로 수집을 시도한 시각 (ISO). */
  attemptedAt: z.string().nullable(),
  /** 마지막 시도의 오류. 성공하면 null. */
  lastError: z.string().nullable(),
  total: z.number(), open: z.number(), closed: z.number(),
  added: z.number(), updated: z.number(), closedNow: z.number(),
});
export type KStartupMeta = z.infer<typeof MetaSchema>;

const RES = 'ks:resource:';
const META = 'ks:meta';

export interface KStartupStore {
  /** 저장된 실제 지원사업 전체 (종료 표시된 것 포함). */
  resources(): Resource[];
  meta(): KStartupMeta | null;
  /** 자료를 id 로 덮어쓴다. */
  save(list: Resource[]): void;
  saveMeta(m: KStartupMeta): void;
  /** 동시에 두 번 도는 수집을 막는 진행 중 작업. */
  inflight: Promise<unknown> | null;
}

export function createKStartupStore(kv: KvLike): KStartupStore {
  let cache: Resource[] | null = null;
  return {
    inflight: null,
    resources() {
      if (cache) return cache;
      const out: Resource[] = [];
      for (const [, v] of kv.list({ prefix: RES })) {
        const r = ResourceSchema.safeParse(v);
        if (r.success) out.push(r.data as Resource);
      }
      return (cache = out);
    },
    meta() {
      const r = MetaSchema.safeParse(kv.get(META));
      return r.success ? r.data : null;
    },
    save(list) {
      for (const r of list) kv.put(`${RES}${r.id}`, ResourceSchema.parse(r));
      cache = null;
    },
    saveMeta(m) { kv.put(META, MetaSchema.parse(m)); },
  };
}
