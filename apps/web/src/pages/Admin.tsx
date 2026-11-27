import { api, ApiClientError } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States';

const pct = (v: number | null) => (v === null ? '-' : `${Math.round(v * 100)}%`);

export function Admin() {
  const { data, error, loading, reload } = useAsync(() => api.stats(), []);
  if (loading) return <div className="container"><CardSkeletons count={3} /></div>;
  if (error instanceof ApiClientError && error.code === 'forbidden') return <div className="container"><EmptyState message="팀 계정만 볼 수 있어요." /></div>;
  if (error || !data) return <div className="container"><ErrorState error={error} onRetry={reload} /></div>;
  const cards: [string, string][] = [
    ['가입자', String(data.users)], ['상담 완료', String(data.consultsCompleted)],
    ['지원사업 발견율', pct(data.discoveryRate)], ['추천 관련도', pct(data.relevanceRate)],
    ['제출 성공률', pct(data.submitSuccessRate)], ['테스트 → 상담 전환', pct(data.testToConsultRate)],
  ];
  return (
    <div className="container stack">
      <h1>팀 통계</h1>
      <div className="grid cols-3">{cards.map(([k, v]) => <div key={k} className="card stat"><div className="num">{v}</div>{k}</div>)}</div>
    </div>
  );
}
