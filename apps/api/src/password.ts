// 비밀번호 저장.
// - 새 방식: `bcrypt$<bcrypt 해시>`. 입력 = base64(HMAC-SHA256(pepper, password)), cost = BCRYPT_COST.
// - 예전 방식: `pbkdf2$반복횟수$salt(hex)$hash(hex)` (WebCrypto PBKDF2). 시드 사용자와 이전 계정. 로그인 성공 때 새 방식으로 바꾼다.
import bcrypt from 'bcryptjs';
import { BCRYPT_COST } from '@gil/shared';
const ITER = 100_000; // Workers 상한
const enc = new TextEncoder();

const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b instanceof Uint8Array ? b.buffer as ArrayBuffer : b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));

async function derive(password: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256);
  return toHex(bits);
}

export async function hashLegacyPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${toHex(salt)}$${await derive(password, salt, ITER)}`;
}

export async function verifyLegacyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, iter, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const got = await derive(password, fromHex(salt), Number(iter));
  if (got.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export function randomToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

// ---- bcrypt + pepper ----
/** pepper 가 없을 때(로컬 개발·테스트)만 쓰는 상수. 운영에서는 secret PASSWORD_PEPPER 를 꼭 넣는다. */
export const INSECURE_DEV_PEPPER = 'INSECURE-DEV-PEPPER-DO-NOT-USE-IN-PRODUCTION';
let warned = false;

async function pepperInput(password: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(password)));
  return btoa(String.fromCharCode(...mac));
}

export interface Passwords {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
  /** 예전 방식 해시라서 새 방식으로 바꿔야 하는가. */
  needsRehash(stored: string): boolean;
}

export function createPasswords(pepper?: string): Passwords {
  if (!pepper && !warned) { warned = true; console.warn('[password] PASSWORD_PEPPER 가 없어 개발용 pepper 를 씁니다. 운영에서는 secret 을 설정하세요'); }
  const key = pepper || INSECURE_DEV_PEPPER;
  return {
    async hash(password) { return `bcrypt$${await bcrypt.hash(await pepperInput(password, key), BCRYPT_COST)}`; },
    async verify(password, stored) {
      if (stored.startsWith('bcrypt$')) return bcrypt.compare(await pepperInput(password, key), stored.slice('bcrypt$'.length)).catch(() => false);
      return verifyLegacyPassword(password, stored);
    },
    needsRehash: (stored) => !stored.startsWith('bcrypt$'),
  };
}
