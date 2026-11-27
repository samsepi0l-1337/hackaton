import type { ReactNode } from 'react';

interface Common {
  label: string;
  name?: string;
  error?: string;
  required?: boolean;
  hint?: ReactNode;
  children?: ReactNode;
}

export function Field({ label, name, error, required, hint, children }: Common) {
  return (
    <div className={`field${error ? ' has-error' : ''}`} data-field={name}>
      <span className="label">{label}{required && <span className="req"> *</span>}</span>
      {hint && <div className="muted">{hint}</div>}
      {children}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}

export function TextField(p: Common & { value: string; onChange: (v: string) => void; type?: string; maxLength?: number; placeholder?: string; autoComplete?: string }) {
  return (
    <Field {...p}>
      <input className="input" type={p.type ?? 'text'} value={p.value} placeholder={p.placeholder} autoComplete={p.autoComplete} maxLength={p.maxLength} onChange={(e) => p.onChange(e.target.value)} />
      {p.maxLength !== undefined && <Counter n={p.value.length} max={p.maxLength} />}
    </Field>
  );
}

export function TextArea(p: Common & { value: string; onChange: (v: string) => void; maxLength?: number | null; placeholder?: string; rows?: number }) {
  return (
    <Field {...p}>
      <textarea className="input" rows={p.rows} value={p.value} placeholder={p.placeholder} onChange={(e) => p.onChange(e.target.value)} />
      {p.maxLength ? <Counter n={p.value.length} max={p.maxLength} /> : null}
    </Field>
  );
}

export function Counter({ n, max }: { n: number; max: number }) {
  return <div className={`counter${n > max ? ' over' : ''}`}>{n}/{max}자 (남은 글자 {max - n})</div>;
}
