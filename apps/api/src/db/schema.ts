// DB 레코드 스키마 (Zod). 저장할 때와 읽을 때 모두 검사한다.
// 선택지 값은 shared constants 에서 가져와 폼·API·DB가 같은 값을 쓴다.
import { z } from 'zod';
import {
  AFFILIATIONS, APPLICATION_STATUS_LABEL, BIZ_FORMS, CUSTOMER_AGES, CUSTOMER_REGIONS, CUSTOMER_TYPES,
  INDUSTRIES, READINESS, REVENUE_MODELS, STAGES, SUPPORT_NEEDS, TEAM_SIZES,
} from '@gil/shared';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoTime = z.string().min(10);
const tuple = <T extends readonly string[]>(v: T) => z.enum(v as unknown as [string, ...string[]]);

export const ConsultProfileSchema = z.object({
  age: z.number().int().optional(),
  stage: z.enum(STAGES.map((s) => s.value) as [string, ...string[]]).optional(),
  openedAt: isoDate.optional(),
  district: z.string().max(20).optional(),
  affiliation: tuple(AFFILIATIONS).optional(),
  teamSize: tuple(TEAM_SIZES).optional(),
  typeCode: z.string().regex(/^[AP][ST][DH][CK]$/).optional(),
  idea: z.string().max(1000).optional(),
  industry: tuple(INDUSTRIES).optional(),
  bizForm: tuple(BIZ_FORMS).optional(),
  problem: z.string().max(1000).optional(),
  readiness: tuple(READINESS).optional(),
  revenue: z.array(tuple(REVENUE_MODELS)).optional(),
  customerType: tuple(CUSTOMER_TYPES).optional(),
  customerAges: z.array(tuple(CUSTOMER_AGES)).optional(),
  customerRegion: tuple(CUSTOMER_REGIONS).optional(),
  customerDesc: z.string().max(1000).optional(),
  alternative: z.string().max(1000).optional(),
  needs: z.array(tuple(SUPPORT_NEEDS)).optional(),
});

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  isTeam: z.boolean(),
  createdAt: isoTime,
  passwordHash: z.string().min(10),
});

export const SessionSchema = z.object({ userId: z.string().min(1), createdAt: isoTime });

const ChatMessageSchema = z.object({
  role: z.enum(['mentor', 'user']),
  text: z.string().max(5000),
  at: isoTime,
  questionIndex: z.number().int().min(0).optional(),
  skipped: z.boolean().optional(),
});

const IdeaSummarySchema = z.object({
  problem: z.string(), customer: z.string(), solution: z.string(), revenue: z.string(), busan: z.string(),
});

const PlanItemSchema = z.object({
  day: z.number().int().min(1).max(7), task: z.string(), programId: z.string().optional(), done: z.boolean(),
});

export const MentorStateSchema = z.object({
  step: z.enum(['form', 'chat', 'summary', 'result']),
  profile: ConsultProfileSchema,
  messages: z.array(ChatMessageSchema).max(200),
  questionIndex: z.number().int().min(0),
  summary: IdeaSummarySchema.nullable(),
  plan: z.array(PlanItemSchema).nullable(),
  feedback: z.record(z.string(), z.boolean()),
  survey: z.boolean().nullable(),
  updatedAt: isoTime.nullable(),
});

const statusEnum = z.enum(Object.keys(APPLICATION_STATUS_LABEL) as [string, ...string[]]);

export const ApplicationSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  programId: z.string().min(1),
  status: statusEnum,
  channel: z.enum(['web', 'email', 'mock']),
  formFileName: z.string(),
  fields: z.array(z.object({
    key: z.string(), label: z.string(), maxLength: z.number().int().nullable(), required: z.boolean(),
    identity: z.boolean().optional(), value: z.string(),
  })).max(60),
  approval: z.object({ at: isoTime, values: z.record(z.string(), z.string()) }).nullable(),
  receiptNo: z.string().nullable(),
  receiptImageUrl: z.string().nullable(),
  failReason: z.string().nullable(),
  retries: z.number().int().min(0),
  history: z.array(z.object({ status: statusEnum, at: isoTime })),
  createdAt: isoTime,
  updatedAt: isoTime,
});

// ---- 개정 기획(PR #7) 탐색 상태 ----
// 새 칸은 default 를 둬서, 나중에 칸이 늘어도 예전 레코드가 깨지지 않게 한다.
const provenance = z.enum(['user', 'ai', 'unknown']);
const SummaryItemSchema = z.object({ text: z.string().max(2000), provenance });
const directionStatus = z.enum(['user', 'ai_suggested', 'user_selected', 'hold']);
const conditionsSchema = z.object({
  age: z.union([z.number().int().min(0).max(120), z.literal('unknown')]).optional(),
  residence: z.string().max(40).optional(),
  affiliation: z.string().max(40).optional(),
  hasBusiness: z.union([z.boolean(), z.literal('unknown')]).optional(),
});

export const ExploreStateSchema = z.object({
  kind: z.enum(['guest', 'user']),
  createdAt: isoTime,
  updatedAt: isoTime.nullable().default(null),
  step: z.enum(['start', 'chat', 'summary', 'result']).default('start'),
  start: z.object({
    readiness: z.enum(['no_idea', 'has_idea', 'preparing']).optional(),
    idea: z.string().max(200).optional(),
    interests: z.array(z.string().max(40)).max(20).optional(),
    interestNote: z.string().max(200).optional(),
    district: z.string().max(20).optional(),
    reviewRegion: z.enum(['부산', '울산', '경남', '미정']).optional(),
    conditions: conditionsSchema.optional(),
  }).default({}),
  exploration: z.object({
    problemId: z.string().nullable(),
    origin: z.enum(['card', 'custom', 'hold']),
    customProblem: z.string().max(300).nullable(),
    selectionReason: z.string().max(300).nullable(),
    direction: z.string().max(300).nullable(),
    directionStatus: directionStatus,
    dataVersion: z.string(),
    suggestions: z.array(z.string().max(300)).max(2),
  }).nullable().default(null),
  messages: z.array(ChatMessageSchema).max(200).default([]),
  questionIndex: z.number().int().min(0).max(3).default(0),
  plan: z.array(z.string()).max(3).default([]),
  answers: z.array(z.object({ key: z.string(), text: z.string().max(1000).nullable(), how: z.enum(['answered', 'unknown', 'skipped']) })).max(10).default([]),
  finished: z.boolean().default(false),
  summary: z.object({
    interest: SummaryItemSchema, target: SummaryItemSchema, value: SummaryItemSchema, unknowns: SummaryItemSchema,
    exploration: z.object({
      problem: z.object({ title: z.string(), source: z.string().nullable(), evidenceLevel: z.string().nullable() }).nullable(),
      reason: SummaryItemSchema,
      direction: z.object({ text: z.string(), provenance, status: directionStatus }),
      hypotheses: SummaryItemSchema,
    }),
  }).nullable().default(null),
  regional: z.object({
    region: z.enum(['부산', '울산', '경남', '미정']), basis: z.string(), sourceIds: z.array(z.string()), customerHypothesis: SummaryItemSchema,
    resourceIds: z.array(z.string()), status: z.enum(['has_basis', 'needs_check', 'weak']),
  }).nullable().default(null),
  prepDone: z.record(z.string(), z.boolean()).default({}),
  /** AI 가 만든 이유 문장 (자료·입력 서명이 같을 때만 쓴다). */
  ai: z.object({ sig: z.string(), reasons: z.record(z.string(), z.string()) }).nullable().default(null),
  rejected: z.array(z.string().max(300)).max(20).default([]),
  lastBody: z.object({ sig: z.string(), at: z.string() }).nullable().default(null),
  feedback: z.object({
    helpful: z.boolean().optional(), reason: z.string().max(500).optional(), directionClear: z.boolean().optional(),
    wantToExplore: z.string().max(500).optional(), foundRegionalPath: z.boolean().optional(), pathName: z.string().max(200).optional(),
    knowWhatToPrepare: z.object({ before: z.number().min(1).max(5).optional(), after: z.number().min(1).max(5).optional() }).optional(),
    regionIntent: z.object({ before: z.number().min(1).max(5).optional(), after: z.number().min(1).max(5).optional() }).optional(),
    at: isoTime,
  }).nullable().default(null),
  /** 이 세션이 상담 1회로 이미 세어졌는지 (첫 질문 재요청을 두 번 세지 않는다). */
  counted: z.boolean().default(false),
  /** 현장 확인 질문 (문제·방향 서명이 같을 때만 쓴다). */
  fieldQ: z.object({ sig: z.string(), items: z.array(z.object({ id: z.string(), question: z.string().max(300), purpose: z.string().max(400), source: z.enum(['rule', 'ai']) })).max(3) }).nullable().default(null),
  /** 이벤트 횟수. 원문 대화는 넣지 않는다. */
  events: z.record(z.string(), z.number().int().min(0)).default({}),
});
export type ExploreState = z.infer<typeof ExploreStateSchema>;

/** 상담 시작 시각 목록 (키마다 `quota:<key>`). 7일이 지난 항목은 쓸 때 지운다. */
export const QuotaSchema = z.array(isoTime).max(100);
