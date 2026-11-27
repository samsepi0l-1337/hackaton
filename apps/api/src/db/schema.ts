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
