// 작업별 AI 호출 + 사실 검사 + 규칙 대체. 여기서 null 을 돌려주면 호출한 쪽이 규칙 결과를 그대로 쓴다.
import { dDayLabel, type ConsultProfile, type FormField, type IdeaSummary, type PlanItem, type Program, type Recommendation } from '@gil/shared';
import type { Bindings } from '../env';
import { createDecide } from './decide';
import { guardText, parseJson } from './guard';
import { SYSTEM_PROMPTS } from './prompts';
import { createTextAi, type AiDeps } from './solar';

const SUMMARY_KEYS = ['problem', 'customer', 'solution', 'revenue', 'busan'] as const;
const str = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const profileText = (p: ConsultProfile) => JSON.stringify(p);

export function createAiTasks(env: Partial<Bindings> = {}, deps: AiDeps = {}) {
  const ai = createTextAi(env, deps);
  const decide = createDecide(env, deps);
  return {
    mode: ai.mode,

    /** F2. 질문 묶음은 규칙이 정하고 AI는 말투만 바꾼다. */
    async mentorQuestion(base: string, lastAnswer: string, userId?: string): Promise<string> {
      const out = await ai.generate('mentor', [
        { role: 'system', content: SYSTEM_PROMPTS.mentor },
        { role: 'user', content: `질문: ${base}\n사용자의 직전 답: ${lastAnswer || '(없음)'}` },
      ], { userId });
      return guardText(out, { allowedText: [base, lastAnswer], maxLength: 200 }) ?? base;
    },

    /** F3. JSON 5개 항목. 파싱·검사에 실패하면 null. */
    async summary(profile: ConsultProfile, answers: string[], userId?: string): Promise<IdeaSummary | null> {
      const out = await ai.generate('summary', [
        { role: 'system', content: SYSTEM_PROMPTS.summary },
        { role: 'user', content: `프로필: ${profileText(profile)}\n답변:\n${answers.join('\n')}` },
      ], { userId });
      const j = parseJson(out) as Record<string, unknown> | null;
      if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
      const res = {} as IdeaSummary;
      for (const k of SUMMARY_KEYS) {
        const v = j[k];
        if (!str(v)) return null;
        const g = guardText(v, { allowedText: [profileText(profile), ...answers], maxLength: 400 });
        if (!g) return null;
        res[k] = g;
      }
      return res;
    },

    /** F5 관련도. Decide 를 못 쓰면 null. */
    relevance(profile: ConsultProfile, candidates: Program[]) {
      return decide.relevance(`아이디어: ${profile.idea ?? ''}\n문제: ${profile.problem ?? ''}\n고객: ${profile.customerDesc ?? ''}\n업종: ${profile.industry ?? ''}\n필요한 지원: ${(profile.needs ?? []).join(', ')}`, candidates);
    },

    /** F6. 항목마다 병렬. 검사에 실패한 항목은 규칙 이유를 그대로 둔다. */
    async reasons(top: Recommendation[], profile: ConsultProfile, now: Date, userId?: string): Promise<Recommendation[]> {
      if (ai.mode === 'off') return top;
      return Promise.all(top.map(async (r) => {
        const p = r.program;
        const facts = `공고: ${p.title}\n분야: ${p.category}\n기관: ${p.agency}\n마감: ${dDayLabel(r.dDay)}\n규칙 근거: ${r.reason}\n사용자 아이디어: ${profile.idea ?? ''}`;
        const out = await ai.generate('reason', [{ role: 'system', content: SYSTEM_PROMPTS.reason }, { role: 'user', content: facts }], { userId });
        const g = guardText(out, { programs: [p], allowedText: [r.reason, profileText(profile), dDayLabel(r.dDay)], maxLength: 160 });
        return g ? { ...r, reason: g } : r;
      }));
    },

    /** F12. 1일차는 규칙 항목 그대로, 나머지만 AI 문장. 7개가 안 맞으면 null. */
    async plan(rule: PlanItem[], top: Recommendation[], profile: ConsultProfile, userId?: string): Promise<PlanItem[] | null> {
      const out = await ai.generate('prep', [
        { role: 'system', content: SYSTEM_PROMPTS.prep },
        { role: 'user', content: `1일차: ${rule[0]!.task}\n아이디어: ${profile.idea ?? ''}\n필요한 지원: ${(profile.needs ?? []).join(', ')}\n참고 공고: ${top.map((t) => t.program.title).join(' / ')}` },
      ], { userId });
      const j = parseJson(out);
      if (!Array.isArray(j) || j.length !== 7) return null;
      const programs = top.map((t) => t.program);
      const res: PlanItem[] = [];
      for (let i = 0; i < 7; i++) {
        const it = j[i] as { day?: unknown; task?: unknown } | null;
        if (!it || it.day !== i + 1 || !str(it.task)) return null;
        if (i === 0) { res.push({ ...rule[0]! }); continue; }
        const g = guardText(it.task, { programs, allowedText: [profileText(profile), rule[0]!.task], maxLength: 120 });
        if (!g) return null;
        res.push({ day: i + 1, task: g, done: false });
      }
      return res;
    },

    /** F13. 신원 항목은 건드리지 않고, 값이 있는 비신원 항목만 글자 수 안에서 덮어쓴다. */
    async draft(fields: FormField[], profile: ConsultProfile, program: Program, userId?: string): Promise<FormField[]> {
      const open = fields.filter((f) => !f.identity);
      if (ai.mode === 'off' || open.length === 0) return fields;
      const out = await ai.generate('draft', [
        { role: 'system', content: SYSTEM_PROMPTS.draft },
        { role: 'user', content: `프로필: ${profileText(profile)}\n공고: ${program.title}\n항목: ${JSON.stringify(open.map((f) => ({ key: f.key, label: f.label, maxLength: f.maxLength, current: f.value })))}` },
      ], { userId });
      const j = parseJson(out) as Record<string, unknown> | null;
      if (!j || typeof j !== 'object' || Array.isArray(j)) return fields;
      return fields.map((f) => {
        const v = j[f.key];
        if (f.identity || !str(v)) return f;
        const g = guardText(v, { programs: [program], allowedText: [profileText(profile), f.value], maxLength: f.maxLength ?? 500 });
        return g ? { ...f, value: f.maxLength !== null ? g.slice(0, f.maxLength) : g } : f;
      });
    },
  };
}
export type AiTasks = ReturnType<typeof createAiTasks>;
