import type { ReactNode } from 'react';

export function ConfirmDialog({ title, children, confirmLabel, danger, busy, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet stack">
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {children}
        <div className="row">
          <button className="btn grow" onClick={onCancel} disabled={busy}>취소</button>
          <button className={`btn grow ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
