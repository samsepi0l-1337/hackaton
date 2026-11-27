import { describe, expect, test } from 'bun:test';
import { checkPassword } from '../src';

describe('비밀번호 규칙', () => {
  test('통과', () => expect(checkPassword('abcd1234', 'abcd1234').ok).toBe(true));
  test('불일치', () => { const r = checkPassword('abcd1234', 'abcd1235'); expect(r.ok).toBe(false); expect(r.match).toBe(false); });
  test('길이·문자 종류', () => {
    expect(checkPassword('ab12', 'ab12').length).toBe(false);
    expect(checkPassword('abcdefgh', 'abcdefgh').letterAndDigit).toBe(false);
    expect(checkPassword('12345678', '12345678').letterAndDigit).toBe(false);
    expect(checkPassword('a1'.repeat(33), 'a1'.repeat(33)).length).toBe(false);
  });
});
