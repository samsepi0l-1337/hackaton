import { describe, expect, test } from 'bun:test';
import { DEMO_PROFILE, MENTOR_PROGRAM_DEFLECT, TYPE_QUESTIONS } from '@gil/shared';
import { setup, demo } from './helpers';

const newUser = async (t: ReturnType<typeof setup>, email = 'n@x.com') => {
  const c = t.client();
  await c.post('/api/auth/signup', { email, password: 'password1', consent: true });
  return c;
};

describe('mentor', () => {
  test('profile autosave merges, reports errors for all sections, chat blocked until complete', async () => {
    const t = setup();
    const c = await newUser(t);
    expect((await c.get('/api/mentor/session')).body.profileComplete).toBe(false);
    const r = await c.put('/api/mentor/profile', { profile: { age: 24, stage: 'pre' } });
    expect(r.status).toBe(200);
    expect(r.body.profile.age).toBe(24);
    expect(r.body.errors.some((e: any) => e.field === 'idea')).toBe(true);
    expect(r.body.errors.some((e: any) => e.field === 'age')).toBe(false);
    const r2 = await c.put('/api/mentor/profile', { profile: { district: '남구', age: 'x' } });
    expect(r2.body.profile.age).toBe(24); // 잘못된 형식은 저장 안 함
    expect(r2.body.profile.district).toBe('남구');
    const chat = await c.post('/api/mentor/chat');
    expect(chat.status).toBe(400);
    expect(chat.body.error.code).toBe('validation');
    expect(chat.body.error.fields.length).toBeGreaterThan(0);
    const fill = await c.put('/api/mentor/profile', { profile: DEMO_PROFILE });
    expect(fill.body.errors).toEqual([]);
    expect((await c.get('/api/mentor/session')).body.profileComplete).toBe(true);
  });

  test('full flow: chat(3 incl. skip) → summary → result', async () => {
    const t = setup();
    const c = await demo(t);
    const first = await c.post('/api/mentor/chat');
    expect(first.body.messages.length).toBe(2);
    expect(first.body.messages[1].questionIndex).toBe(0);
    expect(first.body.done).toBe(false);
    // 빈 요청 반복해도 중복 없음
    expect((await c.post('/api/mentor/chat')).body.messages.length).toBe(2);
    const a1 = await c.post('/api/mentor/chat', { message: '직접 중고거래 앱을 써요' });
    expect(a1.body.questionIndex).toBe(1);
    expect(a1.body.messages.at(-1).questionIndex).toBe(1);
    const a2 = await c.post('/api/mentor/chat', { skip: true });
    expect(a2.body.messages.at(-2).skipped).toBe(true);
    expect(a2.body.questionIndex).toBe(2);
    const a3 = await c.post('/api/mentor/chat', { message: '남구는 대학이 많아서요' });
    expect(a3.body.done).toBe(true);
    expect(a3.body.questionIndex).toBe(3);
    // 질문 이후 자유 질문
    const free = await c.post('/api/mentor/chat', { message: '지원금 얼마나 받아요?' });
    expect(free.body.messages.at(-1).text).toBe(MENTOR_PROGRAM_DEFLECT);
    expect(free.body.done).toBe(true);
    const other = await c.post('/api/mentor/chat', { message: '고마워요' });
    expect(other.body.messages.at(-1).text).not.toBe(MENTOR_PROGRAM_DEFLECT);
    expect(other.body.messages).toEqual((await c.get('/api/mentor/session')).body.messages);

    const sess = (await c.get('/api/mentor/session')).body;
    expect(sess.step).toBe('chat');
    expect(sess.messages.length).toBe(2 + 2 + 2 + 2 + 2 + 2 - 1);

    const sum = await c.post('/api/mentor/summary');
    expect(sum.body.summary.busan).toBe('남구는 대학이 많아서요'); // 3번째 질문(부산 연결점) 답
    const edited = await c.put('/api/mentor/summary', { summary: { ...sum.body.summary, problem: '수정됨' } });
    expect(edited.body.summary.problem).toBe('수정됨');
    expect((await c.put('/api/mentor/summary', { summary: { problem: 1 } })).status).toBe(400);

    const res = await c.get('/api/mentor/result');
    expect(res.status).toBe(200);
    expect(res.body.top.length).toBe(3);
    for (const r of res.body.top) {
      expect(r.eligibility.verdict).not.toBe('ineligible');
      expect(r.reason.length).toBeGreaterThan(0);
    }
    expect(res.body.agencies.length).toBeGreaterThan(0);
    expect(res.body.plan.length).toBe(7);
    expect((await c.get('/api/mentor/session')).body.step).toBe('result');
  });

  test('feedback excludes program, plan done persists, survey', async () => {
    const t = setup();
    const c = await demo(t);
    const before = (await c.get('/api/mentor/result')).body;
    const victim = before.top[0].program.id;
    expect((await c.post('/api/mentor/feedback', { programId: victim, relevant: false })).body).toEqual({ ok: true });
    expect((await c.post('/api/mentor/feedback', { programId: 'NOPE', relevant: true })).status).toBe(404);
    const after = (await c.get('/api/mentor/result')).body;
    expect(after.top.map((r: any) => r.program.id)).not.toContain(victim);
    const keep = after.top[0].program.id;
    await c.post('/api/mentor/feedback', { programId: keep, relevant: true });
    expect((await c.get('/api/mentor/result')).body.top.find((r: any) => r.program.id === keep).feedback).toBe(true);

    expect((await c.put('/api/mentor/plan', { day: 2, done: true })).body.plan.find((p: any) => p.day === 2).done).toBe(true);
    expect((await c.get('/api/mentor/result')).body.plan.find((p: any) => p.day === 2).done).toBe(true);
    expect((await c.put('/api/mentor/plan', { day: 9, done: true })).status).toBe(400);

    expect((await c.get('/api/mentor/result')).body.survey).toBeNull();
    await c.post('/api/mentor/survey', { discovered: true });
    expect((await c.get('/api/mentor/result')).body.survey).toBe(true);
  });

  test('DELETE session restarts but keeps profile; other account cannot see data', async () => {
    const t = setup();
    const c = await demo(t);
    await c.post('/api/mentor/chat');
    const s = await c.del('/api/mentor/session');
    expect(s.body.messages).toEqual([]);
    expect(s.body.profileComplete).toBe(true);
    const other = await newUser(t);
    const o = (await other.get('/api/mentor/session')).body;
    expect(o.profile).toEqual({});
    expect(o.messages).toEqual([]);
  });

  test('type test: validation, anonymous unsaved, logged-in saves typeCode', async () => {
    const t = setup();
    const answers = Object.fromEntries(TYPE_QUESTIONS.map((q) => [q.id, q.options[0].letter]));
    const anon = await t.client().post('/api/type-test', { answers });
    expect(anon.status).toBe(200);
    expect(anon.body.saved).toBe(false);
    expect(anon.body.result.code).toHaveLength(4);
    expect((await t.client().post('/api/type-test', { answers: { 1: 'A' } })).status).toBe(400);
    const c = await newUser(t);
    const r = await c.post('/api/type-test', { answers });
    expect(r.body.saved).toBe(true);
    expect((await c.get('/api/mentor/session')).body.profile.typeCode).toBe(r.body.result.code);
  });
});
