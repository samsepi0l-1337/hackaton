import type { PortalIconName } from '../components/PortalIcons';

export type TileColor = 'blue' | 'teal' | 'coral' | 'violet';

/** 자주 찾는 서비스. 처음엔 앞 4개, 펼쳐보기 뒤엔 8개 모두. */
export const SHORTCUTS: { label: string; to: string; icon: PortalIconName; color: TileColor }[] = [
  { label: '전체 지원공고', to: '/programs', icon: 'doc', color: 'blue' },
  { label: '부산 지역 공고', to: '/programs', icon: 'pin', color: 'teal' },
  { label: '창업 유형 테스트', to: '/test', icon: 'compass', color: 'violet' },
  { label: '사업화 자금', to: '/programs?type=지원사업', icon: 'bag', color: 'coral' },
  { label: '창업 공간', to: '/programs?type=공간', icon: 'layers', color: 'teal' },
  { label: '창업 교육', to: '/programs?type=교육', icon: 'book', color: 'teal' },
  { label: '상시 모집', to: '/programs?sort=deadline', icon: 'calendar', color: 'coral' },
  { label: '지난 상담', to: '/me', icon: 'chat', color: 'violet' },
];
export const SHORTCUTS_COLLAPSED = 4;

export const ACCOUNT_LINKS: { label: string; to: string; icon: PortalIconName }[] = [
  { label: '맞춤 상담', to: '/mentor', icon: 'chat' },
  { label: '지원서 내역', to: '/me', icon: 'doc' },
  { label: '추천 사업', to: '/mentor', icon: 'spark' },
  { label: '내 창업 유형', to: '/test', icon: 'compass' },
];

export const STAGE_TABS: { value: string; label: string; icon: string; prompt: string; link: string; to: string }[] = [
  { value: 'pre', label: '예비', icon: '🌱', prompt: '사업자 등록 전이신가요?', link: '예비창업자 공고', to: '/programs?stage=has_idea' },
  { value: 'lt1', label: '1년 미만', icon: '💡', prompt: '첫 사업을 시작하셨나요?', link: '1년 미만 창업자 공고', to: '/programs' },
  { value: '1to3', label: '1~3년', icon: '🚀', prompt: '사업을 키워가고 계신가요?', link: '1~3년차 창업자 공고', to: '/programs' },
  { value: '3to7', label: '3~7년', icon: '🌳', prompt: '다음 도약을 준비하시나요?', link: '3~7년차 창업자 공고', to: '/programs' },
];

export const FIELD_LINKS: { label: string; to: string }[] = [
  { label: '사업화', to: '/programs?type=지원사업' },
  { label: '창업교육', to: '/programs?type=교육' },
  { label: '시설·공간·보육', to: '/programs?type=공간' },
  { label: '멘토링·컨설팅', to: '/programs?type=상담' },
  { label: '판로·해외진출', to: '/programs' },
  { label: '행사·네트워크', to: '/programs' },
  { label: '기술개발(R&D)', to: '/programs' },
  { label: '융자', to: '/programs' },
];
