import { createApp } from './app';

const app = createApp();
// 로컬 실행: process.env 의 AI_MODE, UPSTAGE_API_KEY 등을 Worker 바인딩처럼 넘긴다.
const server = Bun.serve({ port: 8787, fetch: (req) => app.fetch(req, process.env as Record<string, string>) });
console.log(`API listening on http://localhost:${server.port}`);
