import { useId } from 'react';
import type { ReactNode } from 'react';

interface Common {
  label: string;
  name?: string;
  error?: string;
  required?: boolean;
  hint?: ReactNode;
  children?: ReactNode;
  /** 입력칸 id. 있으면 라벨을 그 칸에 연결하고, 오류 문구를 aria-describedby 로 잇는다. */
  inputId?: string;
}

export function Field({ label, name, error, required, hint, children, inputId }: Common) {
  const text = <>{label}{required && <span className="req"> *</span>}</>;
  return (
    <div className={`field${error ? ' has-error' : ''}`} data-field={name}>
      {inputId ? <label className="label" htmlFor={inputId}>{text}</label> : <span className="label">{text}</span>}
      {hint && <div className="muted">{hint}</div>}
      {children}
      {error && <p className="error-text" role="alert" id={inputId ? `${inputId}-error` : undefined}>{error}</p>}
    </div>
  );
}

export function TextField(p: Common & { value: string; onChange: (v: string) => void; type?: string; maxLength?: number; placeholder?: string; autoComplete?: string }) {
  const id = useId();
  return (
    <Field {...p} inputId={id}>
      <input id={id} aria-invalid={p.error ? true : undefined} aria-describedby={p.error ? `${id}-error` : undefined} className="input" type={p.type ?? 'text'} value={p.value} placeholder={p.placeholder} autoComplete={p.autoComplete} maxLength={p.maxLength} onChange={(e) => p.onChange(e.target.value)} />
      {p.maxLength !== undefined && <Counter n={p.value.length} max={p.maxLength} />}
    </Field>
  );
}

export function TextArea(p: Common & { value: string; onChange: (v: string) => void; maxLength?: number | null; placeholder?: string; rows?: number }) {
  const id = useId();
  return (
    <Field {...p} inputId={id}>
      <textarea id={id} aria-invalid={p.error ? true : undefined} aria-describedby={p.error ? `${id}-error` : undefined} className="input" rows={p.rows} value={p.value} placeholder={p.placeholder} onChange={(e) => p.onChange(e.target.value)} />
      {p.maxLength ? <Counter n={p.value.length} max={p.maxLength} /> : null}
    </Field>
  );
}

export function Counter({ n, max }: { n: number; max: number }) {
  return <div className={`counter${n > max ? ' over' : ''}`}>{n}/{max}자 (남은 글자 {max - n})</div>;
}
