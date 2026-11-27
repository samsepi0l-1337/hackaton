import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // E2E 는 WEB_PORT·API_URL 로 다른 세션과 겹치지 않는 포트를 쓴다.
  server: { port: Number(process.env.WEB_PORT) || 5173, proxy: { '/api': process.env.API_URL || 'http://localhost:8787' } },
});
