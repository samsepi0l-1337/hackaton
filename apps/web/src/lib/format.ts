export function period(start: string | null, end: string | null): string {
  if (!start && !end) return '상시';
  return `${start ?? ''} ~ ${end ?? '상시'}`;
}
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : '알 수 없는 오류가 났어요';
}

/** http(s) 주소만 링크로 쓴다. 그 밖의 값(javascript: 등)은 undefined. */
export function safeHref(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;
}
