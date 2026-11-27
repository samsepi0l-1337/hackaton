import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // E2E 는 WEB_PORT·API_URL 로 다른 세션과 겹치지 않는 포트를 쓴다.
  // E2E 러너는 e2e-<포트>.localhost 호스트로 접속한다 (러너끼리 쿠키를 나누기 위해).
  server: { allowedHosts: ['.localhost'], port: Number(process.env.WEB_PORT) || 5173, proxy: { '/api': process.env.API_URL || 'http://localhost:8787' } },
});
