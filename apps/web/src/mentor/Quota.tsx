import { CONSULT_LIMIT } from '@gil/shared';
import type { ConsultQuota } from '@gil/shared';
import { LOCAL_AI_NOTE, localAiEnabled, setLocalAiEnabled } from '../lib/localAi';
import { useState } from 'react';
import { STORED_ITEMS } from './storage';

export function resetDate(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}시`;
}

/** "이번 주 상담 채팅 n/12회 남음". 0회면 다시 쓸 수 있는 날짜를 함께 보인다. */
export function QuotaLine({ quota }: { quota: ConsultQuota | null | undefined }) {
  if (!quota) return null;
  const date = resetDate(quota.resetAt);
  return (
    <p className="muted" role="status" aria-live="polite">
      이번 주 상담 채팅 {quota.remaining}/{quota.limit}회 남음
      {quota.remaining <= 0 && (date ? ` · ${date} 이후에 다시 보낼 수 있어요` : ' · 다시 보낼 수 있는 날짜는 확인 중이에요')}
    </p>
  );
}

export const QUOTA_NOTE = `AI 상담 채팅은 1인당 ${CONSULT_LIMIT.windowDays}일에 ${CONSULT_LIMIT.count}번 보낼 수 있어요. 답을 보낼 때마다 1번으로 세고, 첫 질문은 세지 않아요. 한 상담에서 길게 이야기해도 되고, 여러 번 나눠 상담해도 돼요. 초기화해도 이미 쓴 횟수는 돌아오지 않아요.`;

/** 이 기기에 저장되는 항목 안내 + 로컬 AI 켜기/끄기. */
export function DeviceNotice({ aiAvailable }: { aiAvailable: boolean }) {
  const [on, setOn] = useState(localAiEnabled());
  return (
    <details className="card">
      <summary><strong>이 기기에 저장되는 내용</strong></summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <p>{STORED_ITEMS.join(', ')}.</p>
        <p className="muted">다른 기기나 브라우저에서는 이어지지 않아요. '초기화'를 누르면 모두 지워져요.</p>
        <label className="check">
          <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setLocalAiEnabled(e.target.checked); }} />
          이 기기의 AI로 문장 다듬기 {on && aiAvailable ? '(사용 중)' : '(이 브라우저에서는 쓸 수 없으면 자동으로 서버 문장을 써요)'}
        </label>
        <p className="muted">켜져 있고 쓸 수 있을 때만 글이 이 기기 안에서 다듬어져요 ({LOCAL_AI_NOTE}). 설정 변경은 다음 요청부터 적용돼요.</p>
      </div>
    </details>
  );
}
