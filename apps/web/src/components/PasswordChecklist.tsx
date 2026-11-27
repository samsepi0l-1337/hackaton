import { PASSWORD_RULE_TEXT, checkPassword } from '@gil/shared';

function Line({ ok, children }: { ok: boolean; children: string }) {
  return <li style={{ color: ok ? 'var(--color-ok)' : 'var(--color-danger)' }}>{ok ? '✓' : '✗'} {children}</li>;
}

/** 비밀번호 규칙과 2회 일치를 글자로 보여준다 (색만으로 구분하지 않는다). */
export function PasswordChecklist({ password, confirm }: { password: string; confirm: string }) {
  const c = checkPassword(password, confirm);
  return (
    <ul className="plain-list" aria-live="polite">
      <Line ok={c.length && c.letterAndDigit}>{`규칙: ${PASSWORD_RULE_TEXT}`}</Line>
      {confirm.length > 0
        ? <Line ok={c.match}>{c.match ? '두 비밀번호가 같아요' : '두 비밀번호가 달라요'}</Line>
        : <li className="muted">비밀번호를 한 번 더 입력해 주세요</li>}
    </ul>
  );
}
