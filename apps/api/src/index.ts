// Worker 입구. /api/* 는 GilApp Durable Object 로, 나머지는 정적 파일(웹 빌드)이 처리한다.
// scheduled: 매일 03:00 KST(wrangler cron `0 18 * * *` UTC)에 K-Startup 실제 공고를 수집한다.
import type { Bindings } from './env';
import type { GilApp } from './gil-app';

export { DocWorker } from './container';
export { GilApp } from './gil-app';

type WorkerEnv = Bindings & { APP: DurableObjectNamespace<GilApp>; ASSETS?: Fetcher };

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return env.APP.get(env.APP.idFromName('main')).fetch(request);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return Promise.resolve(new Response('Not found', { status: 404 }));
  },
  scheduled(_event, env, ctx) {
    ctx.waitUntil(env.APP.get(env.APP.idFromName('main')).syncKStartup().then((r) => console.log('[kstartup]', JSON.stringify(r))));
  },
} satisfies ExportedHandler<WorkerEnv>;
