import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { coverageLine } from '../lib/coverage';
import { QuotaLine } from '../mentor/Quota';
import { readStore } from '../mentor/storage';

export function Home() {
  const opts = useAsync(() => api.exploreOptions(), []);
  const sess = useAsync(() => api.exploreSession(), []);
  const o = opts.data;
  const quota = sess.data?.quota ?? readStore().quota;
  return (
    <div className="container stack">
      <section className="hero stack">
        <h1>창업, 어디서 시작할지 몰라도 괜찮아요.</h1>
        <p>관심과 아이디어를 정리하고, 나에게 필요한 준비사항과 부산의 지원 경로를 확인하세요.</p>
        <p>내 구상을 부울경에서 어떻게 시작할 수 있을지 살펴보세요.</p>
        <p className="muted" aria-live="polite">
          {opts.loading ? '제공 지역을 확인하는 중이에요.' : o ? coverageLine(o.coverage) : '제공 지역 정보를 불러오지 못했어요. 창업 준비는 그대로 시작할 수 있어요.'}
        </p>
        <QuotaLine quota={quota} />
        <Link className="btn primary" to="/mentor">창업 준비 시작하기</Link>
      </section>

      <section>
        <h2 style={{ marginTop: 0 }}>지금 상황에 가까운 쪽을 골라 주세요</h2>
        <div className="grid cols-2">
          <Link className="card choice-card" to="/mentor?readiness=has_idea"><h3>아이디어가 있어요</h3><p className="muted">하고 싶은 일을 200자 이내로 적으면 돼요.</p></Link>
          <Link className="card choice-card" to="/mentor?readiness=no_idea"><h3>관심 분야부터 찾아볼게요</h3><p className="muted">관심 분야를 고르면 대화로 구체화해요.</p></Link>
        </div>
      </section>

      <section className="card stack" aria-labelledby="ex">
        <div className="row"><h2 id="ex" style={{ margin: 0 }}>결과 예시</h2><span className="badge">예시 · 실제 결과 아님</span></div>
        <p className="muted">아래는 화면 구성을 보여주는 설명용 예시예요. 실제 수요나 협력 성과가 아니에요.</p>
        <ol className="plain-list">
          <li><strong>창업 구상</strong>: 'AI + 조선·해양'에 관심 → 관련 업무를 돕는 서비스 (예시)</li>
          <li><strong>우선 준비사항</strong>: 도움을 받고 싶은 사람에게 확인할 질문 3가지 정리 (예시)</li>
          <li><strong>지역 지원 연결</strong>: 출처와 확인일이 있는 교육·상담 경로를 최대 3개까지 안내</li>
        </ol>
      </section>

      <section>
        <h2>이용 과정</h2>
        <div className="grid cols-3 steps-3">
          <div className="card"><h3>관심 입력</h3><p className="muted">관심 분야나 생각해둔 아이디어를 알려주세요.</p></div>
          <div className="card"><h3>구상 정리</h3><p className="muted">쉬운 질문 최대 3개로 구상을 정리해요.</p></div>
          <div className="card"><h3>준비 안내·지역 연결</h3><p className="muted">우선 준비사항과 공식 출처가 있는 지역 경로를 확인해요.</p></div>
        </div>
      </section>

      <details className="card">
        <summary><strong>저장·데이터 안내</strong></summary>
        <div className="stack" style={{ marginTop: 12 }}>
          <p>{o?.privacy ?? '입력한 내용은 구상 정리를 위해 서버와 외부 AI(Upstage)로 전송돼요. 현재 기기에도 임시 저장되고, 초기화하면 지워져요.'}</p>
          <p className="muted">로그인 없이 쓸 수 있어요. 지역 자료는 공식 출처와 확인일을 함께 보여줘요. <Link to="/licenses">오픈소스 라이선스 고지</Link></p>
        </div>
      </details>
    </div>
  );
}
