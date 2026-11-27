// 로그인 안 한 사용자의 테스트 결과를 브라우저에 둔다.
const KEY = 'gil.typeTest';
export interface LocalTest { answers: Record<number, string>; code: string }

export function loadLocalTest(): LocalTest | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
export function saveLocalTest(t: LocalTest) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* 저장 불가 */ }
}
export function clearLocalTest() {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}
