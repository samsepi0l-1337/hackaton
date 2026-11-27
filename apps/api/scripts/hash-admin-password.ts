// /bufs 관리자 비밀번호 해시를 만든다. 비밀번호는 표준 입력으로만 받는다 (명령줄·저장소에 남지 않는다).
// 사용: PASSWORD_PEPPER=<secret 과 같은 값> bun apps/api/scripts/hash-admin-password.ts   (비밀번호를 입력하고 Enter)
// 출력한 한 줄을 secret ADMIN_PASSWORD_HASH 로 넣는다: wrangler secret put ADMIN_PASSWORD_HASH
import { createPasswords } from '../src/password';

const pepper = process.env.PASSWORD_PEPPER;
if (!pepper) {
  console.error('PASSWORD_PEPPER 환경 변수가 필요해요 (배포한 secret 과 같은 값).');
  process.exit(1);
}
const password = (await Bun.stdin.text()).replace(/\r?\n$/, '');
if (!password) {
  console.error('표준 입력으로 비밀번호를 넣어 주세요.');
  process.exit(1);
}
console.log(await createPasswords(pepper).hash(password));
