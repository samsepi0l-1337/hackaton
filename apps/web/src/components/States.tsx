import type { ReactNode } from 'react';
import { ApiClientError } from '../api/client';

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return <div className="state card"><p>{message}</p>{action}</div>;
}

export function ErrorState({ error, onRetry, message }: { error?: unknown; onRetry?: () => void; message?: string }) {
  const text = message ?? (error instanceof ApiClientError ? error.message : '불러오지 못했어요.');
  return (
    <div className="state card" role="alert">
      <p>{text}</p>
      {onRetry && <button className="btn" onClick={onRetry}>다시 시도</button>}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: string | number }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function CardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: count }, (_, i) => <div key={i} className="card stack"><Skeleton width="30%" /><Skeleton height={20} /><Skeleton width="50%" /></div>)}
    </div>
  );
}
