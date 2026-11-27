import { createApp } from './app';

// 로컬 실행: process.env 의 AI_MODE, UPSTAGE_API_KEY 등을 Worker 바인딩처럼 넘긴다.
// TEST_MODE=1 (Rust 동일성 하네스용, 로컬 전용): TEST_NOW 고정 시각, POST /api/__test/reset 으로 저장소 초기화.
const test = process.env.TEST_MODE === '1';
const fixedNow = test && process.env.TEST_NOW ? new Date(process.env.TEST_NOW) : null;
const make = () => createApp(fixedNow ? { now: () => fixedNow } : {});
let app = make();
const server = Bun.serve({
  port: Number(process.env.PORT) || 8787,
  fetch: (req) => {
    if (test && new URL(req.url).pathname === '/api/__test/reset') { app = make(); return Response.json({ ok: true }); }
    return app.fetch(req, process.env as Record<string, string>);
  },
});
console.log(`API listening on http://localhost:${server.port}`);
