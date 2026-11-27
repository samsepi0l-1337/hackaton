import type { PortalIconName } from '../components/PortalIcons';

export type TileColor = 'blue' | 'teal' | 'coral' | 'violet';

/**
 * 메인 화면 링크. 이름은 도착 화면이 실제로 하는 일과 같다.
 * /programs 는 type(교육|상담|공간|지원사업), stage(no_idea|has_idea|preparing), sort(fit|recent|popular|deadline), q 를 받는다.
 * 기본 정렬이 deadline 이라 /programs 와 ?sort=deadline 은 같은 화면이다.
 * 같은 도착지는 메인 화면에서 최대 2번만 쓴다.
 */

/** 자주 찾는 서비스. 처음엔 앞 4개, 펼쳐보기 뒤엔 8개 모두. */
export const SHORTCUTS: { label: string; to: string; icon: PortalIconName; color: TileColor }[] = [
  { label: '전체 지원공고', to: '/programs', icon: 'doc', color: 'blue' },
  { label: '나에게 맞는 순 공고', to: '/programs?sort=fit', icon: 'spark', color: 'violet' },
  { label: '최근 공모', to: '/programs?sort=recent', icon: 'calendar', color: 'teal' },
  { label: '많이 본 공모', to: '/programs?sort=popular', icon: 'flag', color: 'coral' },
  { label: '지원사업 공고', to: '/programs?type=지원사업', icon: 'bag', color: 'coral' },
  { label: '창업 교육', to: '/programs?type=교육', icon: 'book', color: 'teal' },
  { label: '창업 공간', to: '/programs?type=공간', icon: 'layers', color: 'teal' },
  { label: '상담 공고', to: '/programs?type=상담', icon: 'chat', color: 'violet' },
];
export const SHORTCUTS_COLLAPSED = 4;

/** 계정 패널 2x2. 도착지가 위 타일과 겹쳐도 2번을 넘지 않는다. */
export const ACCOUNT_LINKS: { label: string; to: string; icon: PortalIconName }[] = [
  { label: '나에게 맞는 공고', to: '/programs?sort=fit', icon: 'spark' },
  { label: '마감 임박 공고', to: '/programs?sort=deadline', icon: 'calendar' },
  { label: '내 정보 조건', to: '/me', icon: 'user' },
  { label: '내 창업 유형', to: '/test', icon: 'compass' },
];

/** 단계 탭은 공고의 아이디어 단계(stage) 필터와 같다. 사업 연차 필터는 없다. */
const stageLinks = (stage: string, name: string): { label: string; to: string }[] => [
  { label: `${name} 단계 공고`, to: `/programs?stage=${stage}` },
  { label: `${name} 단계 교육`, to: `/programs?stage=${stage}&type=${encodeURIComponent('교육')}` },
  { label: `${name} 단계 지원사업`, to: `/programs?stage=${stage}&type=${encodeURIComponent('지원사업')}` },
];

export const STAGE_TABS: { value: string; label: string; icon: string; prompt: string; links: { label: string; to: string }[] }[] = [
  { value: 'no_idea', label: '탐색', icon: '🌱', prompt: '아직 아이디어를 찾고 있나요?', links: stageLinks('no_idea', '아이디어 탐색') },
  { value: 'has_idea', label: '구상', icon: '💡', prompt: '아이디어는 있는데 아직 시작 전인가요?', links: stageLinks('has_idea', '아이디어 구상') },
  { value: 'preparing', label: '준비', icon: '🚀', prompt: '창업을 구체적으로 준비하고 있나요?', links: stageLinks('preparing', '창업 준비') },
];

/** 분야별. type 필터가 있는 분야는 그 필터로, 없는 분야는 키워드 검색(q)으로 보낸다. */
export const FIELD_LINKS: { label: string; to: string }[] = [
  { label: '사업화', to: '/programs?type=' + encodeURIComponent('지원사업') },
  { label: '창업교육', to: '/programs?type=' + encodeURIComponent('교육') },
  { label: '시설·공간·보육', to: '/programs?type=' + encodeURIComponent('공간') },
  { label: '멘토링·컨설팅', to: '/programs?type=' + encodeURIComponent('상담') },
  { label: '판로·해외진출', to: '/programs?q=' + encodeURIComponent('판로') },
  { label: '행사·네트워크', to: '/programs?q=' + encodeURIComponent('행사') },
  { label: '기술개발(R&D)', to: '/programs?q=' + encodeURIComponent('기술개발') },
  { label: '융자', to: '/programs?q=' + encodeURIComponent('융자') },
];
