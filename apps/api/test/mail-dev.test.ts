import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { createDevMailer, recoveryMail, verificationMail } from '../src/mail';

describe('개발용 메일러 로그', () => {
  afterEach(() => { delete process.env.E2E_MAIL_LOG; });
  const logs = async (env?: string) => {
    if (env) process.env.E2E_MAIL_LOG = env;
    const spy = spyOn(console, 'log').mockImplementation(() => {});
    const m = createDevMailer();
    await m.send(verificationMail('a@example.com', 'http://x/verify?token=t1', '123456'));
    await m.send(recoveryMail('a@example.com', 'Recov-Pass-99'));
    const out = spy.mock.calls.map((c) => String(c[0])).join('\n');
    spy.mockRestore();
    return out;
  };
  test('기본: 링크만, 코드·복구 비밀번호는 없음', async () => {
    const out = await logs();
    expect(out).toContain('verify link: http://x/verify?token=t1');
    expect(out).not.toContain('123456');
    expect(out).not.toContain('Recov-Pass-99');
  });
  test('E2E_MAIL_LOG=1 이면 본문(코드·복구 비밀번호)을 남긴다', async () => {
    const out = await logs('1');
    expect(out).toContain('123456');
    expect(out).toContain('Recov-Pass-99');
  });
});
