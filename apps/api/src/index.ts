// Worker 입구. /api/* 는 GilApp Durable Object 로, 나머지는 정적 파일(웹 빌드)이 처리한다.
import type { Bindings } from './env';

export { DocWorker } from './container';
export { GilApp } from './gil-app';

export default {
  fetch(request: Request, env: Bindings & { APP: DurableObjectNamespace; ASSETS?: Fetcher }): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return env.APP.get(env.APP.idFromName('main')).fetch(request);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return Promise.resolve(new Response('Not found', { status: 404 }));
  },
} satisfies ExportedHandler<Bindings & { APP: DurableObjectNamespace; ASSETS?: Fetcher }>;
