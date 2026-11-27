import { Link } from 'react-router-dom';
import { EmptyState } from '../components/States';
import '../styles/pages-account.css';

export function NotFound() {
  return <div className="container account-page"><EmptyState message="페이지를 찾을 수 없어요." action={<Link className="btn primary" to="/">메인으로</Link>} /></div>;
}

export function Licenses() {
  return (
    <div className="container stack account-page">
      <h1>오픈소스 라이선스 고지</h1>
      <div className="card">
        <p>이 서비스는 아래 오픈소스를 사용해요. 각 라이선스 전문은 해당 프로젝트 저장소를 확인해 주세요.</p>
        <ul>
          <li>React, React DOM, React Router (MIT)</li>
          <li>Vite (MIT)</li>
          <li>Hono (MIT)</li>
        </ul>
        <p className="muted" style={{ marginBottom: 0 }}>지원사업 공고 데이터: 공공데이터포털 K-Startup 지원사업 공고 정보 (공공누리).</p>
      </div>
    </div>
  );
}
