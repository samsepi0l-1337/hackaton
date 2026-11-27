import { Link } from 'react-router-dom';
import { CONSULT_LIMIT, READINESS_OPTIONS, RESOURCE_SORTS, RESOURCE_SORT_LABEL, RESOURCE_TYPES } from '@gil/shared';
import '../styles/pages-guide.css';

const SORTS = RESOURCE_SORTS.map((s) => RESOURCE_SORT_LABEL[s]).join(', ');

export function Guide() {
  return (
    <div className="portal-width guide-page">
      <h1>이용 방법</h1>
      <p className="guide-lead">해보까는 부산에서 창업을 처음 준비하는 사람이 지원 공고를 찾고, AI 상담으로 먼저 준비할 것을 정리하도록 돕는 사이트예요. 공식 링크가 확인된 공고에는 출처 링크를 함께 보여줘요.</p>

      <section className="pane" aria-labelledby="g-consult">
        <div className="pane-title">
          <h2 id="g-consult">AI 창업 상담 순서</h2>
          <Link className="text-action" to="/mentor">상담 시작하기</Link>
        </div>
        <p className="muted">상담은 로그인하고 이메일 인증을 마친 계정으로 해요.</p>
        <ol className="guide-steps">
          <li>
            <b>지금 상황을 골라요</b>
            <span>{READINESS_OPTIONS.map((o) => `'${o.label}'`).join(', ')} 중 하나예요. 아이디어가 있다면 하고 싶은 일을 200자 안으로 적으면 돼요.</span>
          </li>
          <li>
            <b>관심 분야와 지역을 골라요</b>
            <span>'관심은 있지만 아이디어가 없어요'를 골랐다면 관심 분야를 하나 이상 고르거나 직접 적어야 시작할 수 있어요. 아직 정하지 못했다면 관심 분야에서 '아직 모름'을 고르면 돼요. 활동 지역은 선택 사항이고, 정하지 못했다면 '미정'을 고르면 돼요.</span>
          </li>
          <li>
            <b>쉬운 질문에 답해요</b>
            <span>질문에 하나씩 답해요. 모르는 질문은 '아직 모르겠어요'로 답하거나 건너뛸 수 있어요.</span>
          </li>
          <li>
            <b>구상 요약과 준비사항을 봐요</b>
            <span>답한 내용으로 아이디어 요약과 먼저 준비할 것을 정리해 줘요. 직접 입력한 내용과 AI가 제안한 내용은 따로 표시돼요.</span>
          </li>
          <li>
            <b>준비 경로를 확인해요</b>
            <span>교육·상담·공간·지원사업 중 맞는 경로를 최대 3개까지 보여줘요. 공식 링크가 확인된 경로에는 출처 링크가 붙어요.</span>
          </li>
        </ol>
      </section>

      <section className="pane" aria-labelledby="g-tools">
        <div className="pane-title">
          <h2 id="g-tools">공고를 찾고 확인하기</h2>
        </div>
        <ul className="guide-rows">
          <li>
            <div>
              <b><Link to="/programs">공고 검색</Link></b>
              <span>로그인 없이 볼 수 있어요. 유형({RESOURCE_TYPES.join('·')})과 준비 단계로 거르고, 정렬({SORTS})을 바꾸고, 기관·제목·지원 내용 키워드로 찾아요.</span>
            </div>
          </li>
          <li>
            <div>
              <b>관심 표시 (하트)</b>
              <span>마음에 드는 공고의 하트를 눌러요. 로그인이 필요해요. '나에게 맞는 순'으로 정렬하면 하트 누른 공고와 내 정보 조건, 준비 단계가 순서에 영향을 줘요. 마감된 공고는 뒤에 나와요.</span>
            </div>
          </li>
          <li>
            <div>
              <b><Link to="/me">내 정보 조건</Link></b>
              <span>내 정보에서 '기본 정보 (선택)' 칸을 찾아 만 나이, 거주지, 사업자등록 여부, 현재 직군을 저장해요. 모두 선택 사항이에요. 저장한 값은 상담 결과의 '내 조건 확인'에 기본값으로 채워지고, 공고의 신청 조건과 비교할 때 써요.</span>
            </div>
          </li>
          <li>
            <div>
              <b>지원서 연습</b>
              <span>마감 전 공고에서 '지원서 작성'을 누르면 AI가 초안을 써 줘요. 고쳐서 모의 제출까지 연습할 수 있고, 실제 신청은 공식 사이트에서 해야 해요.</span>
            </div>
          </li>
          <li>
            <div>
              <b><Link to="/test">창업 유형 테스트</Link></b>
              <span>12문항, 약 1분이에요. 결과는 재미와 참고용이에요.</span>
            </div>
          </li>
        </ul>
      </section>

      <section className="pane" aria-labelledby="g-limit">
        <div className="pane-title">
          <h2 id="g-limit">상담 채팅 횟수</h2>
          <Link className="text-action" to="/me">내 정보에서 남은 횟수 보기</Link>
        </div>
        <p>일반 계정은 한 주(일요일~토요일)에 AI 상담 채팅을 {CONSULT_LIMIT.count}번까지 보낼 수 있어요. 횟수는 일요일 0시에 다시 채워져요. 답을 보낼 때마다 1번으로 세고, 첫 질문은 세지 않아요. 한 상담에서 질문을 이어 받아 길게 구체화해도 되고, 짧은 상담을 여러 번 해도 돼요. 상담을 처음부터 다시 시작해도 이미 쓴 횟수는 돌아오지 않아요.</p>
        <p className="muted">남은 횟수는 이메일 인증을 마치면 내 정보에서 볼 수 있어요. 새 비밀번호를 정해야 하는 계정은 그것까지 마친 뒤에 볼 수 있어요.</p>
      </section>

      <section className="pane" aria-labelledby="g-tips">
        <div className="pane-title">
          <h2 id="g-tips">처음이라면 이렇게 하세요</h2>
        </div>
        <ul className="guide-rows">
          <li>
            <div>
              <b>상담 전에 준비할 것</b>
              <span>하고 싶은 일을 한 줄로 적어 두세요. 관심 분야와 활동 지역을 미리 정하면 편해요.</span>
            </div>
          </li>
          <li>
            <div>
              <b>'확인 필요'가 보이면</b>
              <span>수집한 자료에서 그 내용을 확인하지 못했다는 뜻이에요. 마감일이나 공식 링크가 '확인 필요'이면 공식 안내에서 직접 확인하세요.</span>
            </div>
          </li>
          <li>
            <div>
              <b>신청하기 전에 원문을 열어요</b>
              <span>공고의 공식 안내(원문) 링크를 열어 대상, 기간, 신청 방법을 직접 확인하세요. 해보까의 요약은 실제와 다를 수 있어요. 링크가 없으면 공고 제목을 주관 기관 사이트에서 검색하세요.</span>
            </div>
          </li>
          <li>
            <div>
              <b>자격 확인은 참고용이에요</b>
              <span>입력한 조건과 수집·검수한 공고 조건을 규칙으로 비교한 결과예요. '조건 맞음'이어도 최종 신청 자격을 보장하지 않아요.</span>
            </div>
          </li>
        </ul>
      </section>

      <section className="pane" aria-labelledby="g-data">
        <div className="pane-title">
          <h2 id="g-data">입력한 내용은 어떻게 되나요</h2>
        </div>
        <ul className="guide-rows">
          <li>
            <div>
              <b>저장과 전송</b>
              <span>로그인해서 보낸 상담 입력과 내 정보는 서버에 저장돼요. 상담 문장은 정리를 위해 외부 AI(Upstage)로 전송될 수 있어요. 아직 보내지 않은 입력 초안은 이 브라우저에만 남아요.</span>
            </div>
          </li>
          <li>
            <div>
              <b>상담 결과 화면의 초기화</b>
              <span>서버에 저장된 상담이면 서버의 탐색 기록을 지우고, 이 브라우저에 저장된 상담 데이터와 유형 테스트 결과도 지워요. 계정은 지워지지 않고 쓴 상담 횟수도 돌아오지 않아요.</span>
            </div>
          </li>
          <li>
            <div>
              <b>계정을 지우면</b>
              <span>서버에 저장된 데이터가 지워져요. 이 브라우저에 저장된 입력 초안, 대화, 요약, 유형 테스트 결과는 따로 지워야 해요. 로그인하지 않고 한 유형 테스트 결과는 이 브라우저에만 저장돼요.</span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}
