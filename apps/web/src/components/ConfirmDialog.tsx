import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function ConfirmDialog({ title, children, confirmLabel, danger, busy, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // 열면 취소 버튼에 포커스, Esc 로 닫기, Tab 은 대화상자 안에서만, 닫으면 원래 자리로 포커스를 돌려준다.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) { e.preventDefault(); cancel.current(); return; }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); before?.focus?.(); };
  }, []);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet stack" ref={sheetRef}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {children}
        <div className="row">
          <button ref={cancelRef} className="btn grow" onClick={onCancel} disabled={busy}>취소</button>
          <button className={`btn grow ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
