// doc-worker 컨테이너를 띄우는 Durable Object (Cloudflare Containers, Durable Object Container API).
// 공식 get-started 예시 구조를 따른다. 양식 내려받기 때문에 인터넷을 켠다.
import { DurableObject } from 'cloudflare:workers';
// Keep in sync with packages/shared/src/cloudflare.ts.
const DOC_WORKER_PORT = 8080;
type Bindings = { DOC_WORKER_INTERNET?: string };
type DocWorkerClient = { fetch(path: string, body: unknown): Promise<Response> };


const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2분 쉬면 멈춤 → 비용 0
const READY_ATTEMPTS = 100;

export class DocWorker extends DurableObject<Bindings> {
  private starting: Promise<void> | undefined;
  private monitoring: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
      this.observeExit();
    }
  }

  async fetch(request: Request): Promise<Response> {
    this.starting ??= this.startAndWaitForPort().finally(() => { this.starting = undefined; });
    await this.starting;
    const url = new URL(request.url);
    url.protocol = 'http:';
    url.host = 'container';
    const forwarded = new Request(url, request);
    forwarded.headers.delete('host');
    return this.ctx.container!.getTcpPort(DOC_WORKER_PORT).fetch(forwarded);
  }

  private async startAndWaitForPort(): Promise<void> {
    const container = this.ctx.container!;
    if (!container.running) {
      // 로컬 wrangler dev 에서는 인터넷 켜기가 실패할 수 있어 DOC_WORKER_INTERNET=0 으로 끌 수 있다.
      container.start({ image: container.images.base, instance: 'lite', enableInternet: this.env.DOC_WORKER_INTERNET !== '0' });
    }
    this.observeExit();
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    const port = container.getTcpPort(DOC_WORKER_PORT);
    for (let i = 0; i < READY_ATTEMPTS; i++) {
      try {
        const r = await port.fetch('http://container/health', { signal: AbortSignal.timeout(1000) });
        await r.body?.cancel();
        if (r.ok) return;
      } catch { /* 아직 포트가 안 열림 */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`doc-worker did not become ready on port ${DOC_WORKER_PORT}`);
  }

  private observeExit(): void {
    if (this.monitoring) return;
    this.monitoring = this.ctx.container!.monitor()
      .then(() => console.log('[doc-worker] exited'))
      .catch((e: unknown) => console.error('[doc-worker] failed:', e))
      .finally(() => { this.monitoring = undefined; });
    this.ctx.waitUntil(this.monitoring);
  }
}

/**
 * 하나의 doc-worker 인스턴스로 보낸다. 해커톤 사용량에서는 하나면 충분하다.
 * 배포 버전마다 이름을 바꿔, 새 배포는 새 이미지로 컨테이너를 띄운다 (이전 인스턴스는 2분 뒤 멈춤).
 */
export function docWorkerClient(ns: DurableObjectNamespace, version = 'local'): DocWorkerClient {
  return {
    fetch: (path, body) =>
      ns.get(ns.idFromName(`doc-worker-${version}`)).fetch(`http://doc-worker${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
  };
}
