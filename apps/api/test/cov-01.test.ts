import { expect, test } from 'bun:test';
import { kindOf, parseDocument } from '../src/docs/parse';
import { readAnnouncementForm } from '../src/docs/pipeline';
import { cloudflareMailer, createDevMailer, pickMailer, verificationMail } from '../src/mail';
import { createDecide } from '../src/ai/decide';
import { ruleSuggestions } from '../src/explore/chat';
import { setup } from './helpers';

const json = (v: unknown) => Response.json(v);

test('document format detection recognizes zip markers and rejects unknown zip', () => {
  const zip = (s: string) => new Uint8Array([...new Uint8Array([80, 75, 3, 4]), ...new TextEncoder().encode(s)]);
  expect(kindOf('file', zip('mimetype hwpml'))).toBe('hwpx');
  expect(kindOf('file', zip('[Content_Types]'))).toBe('docx');
  expect(kindOf('file', zip('other'))).toBe('unknown');
});

test('document parsing falls back to element text when content is empty', async () => {
  const result = await parseDocument({ UPSTAGE_API_KEY: 'test' }, { fileName: 'a.pdf', bytes: new Uint8Array([1]) }, {
    fetch: async () => json({ elements: [{ content: { markdown: 'first' } }, {}, { content: { text: 'second' } }] }),
  });
  expect(result?.text).toBe('first\nsecond');
});

test('document pipeline rejects invalid base64 download', async () => {
  const docWorker = { fetch: async (path: string) => path === '/discover'
    ? json({ attachments: [{ name: 'a.pdf', kind: 'pdf', url: 'https://example.test/a' }] })
    : json({ fileName: 'a.pdf', fileBase64: '%%%' }) };
  expect(await readAnnouncementForm({}, { docWorker }, 'https://example.test')).toEqual({ error: '내려받은 파일을 해석하지 못했습니다' });
});

test('mailer picks configured binding and propagates delivery failures', async () => {
  const fallback = createDevMailer({ quiet: true });
  const sent: unknown[] = [];
  const binding = { send: async (m: unknown) => { sent.push(m); } };
  const message = verificationMail('a@example.test', 'https://example.test/verify?token=a', '123456');
  expect(pickMailer({}, fallback)).toBe(fallback);
  expect(pickMailer({ EMAIL: binding } as never, fallback)).toBe(fallback);
  await pickMailer({ EMAIL: binding, MAIL_FROM: 'sender@example.test' } as never, fallback).send(message);
  expect(sent).toEqual([{ ...message, from: 'sender@example.test' }]);
  const err = new Error('delivery failed');
  const failing = cloudflareMailer({ send: async () => { throw err; } } as never, 'sender@example.test');
  await expect(failing.send(message)).rejects.toBe(err);
});

test('development mailer retains only the latest 50 messages', async () => {
  const mail = createDevMailer({ quiet: true });
  for (let i = 0; i < 51; i++) await mail.send(verificationMail(`${i}@example.test`, 'https://example.test/verify?token=a', '123456'));
  expect(mail.sent).toHaveLength(50);
  expect(mail.sent[0]?.to).toBe('1@example.test');
});

test('decide returns null when returned probabilities contain no positive finite values', async () => {
  const decide = createDecide({ UPSTAGE_API_KEY: 'test', DECIDE_ENABLED: '1' }, { fetch: (async () => json({ answers: { fit: { probabilities: { a: 0, b: -1 } } } })) as unknown as typeof fetch });
  expect(await decide.rank('state', [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], 'rank')).toBeNull();
});

test('suggestions exclude rejected directions ignoring whitespace', () => {
  const initial = ruleSuggestions({}, null, []);
  expect(initial).toHaveLength(2);
  expect(ruleSuggestions({}, null, [initial[0]!.replace(/ /g, '')])).not.toContain(initial[0]);
});

test('auth and application routes reject malformed JSON bodies', async () => {
  const { app } = setup();
  for (const path of ['/api/auth/login', '/api/auth/verify']) {
    const r = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[]' });
    expect(r.status).toBe(400);
  }
});
