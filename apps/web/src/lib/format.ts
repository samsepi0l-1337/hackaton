export function period(start: string | null, end: string | null): string {
  if (!start && !end) return '상시';
  return `${start ?? ''} ~ ${end ?? '상시'}`;
}
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : '알 수 없는 오류가 났어요';
}
