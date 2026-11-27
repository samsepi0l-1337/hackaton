// API 전체를 Durable Object 하나에서 실행한다.
// 데이터는 이 객체의 SQLite KV(ctx.storage.kv, 동기 API)에 Zod 로 검사한 레코드로 저장한다.
// 해커톤 규모(수십~수백 명)에서는 인스턴스 하나로 충분하고, 저장소 코드를 동기로 유지할 수 있다.
import { DurableObject } from 'cloudflare:workers';
import { createApp } from './app';
import { docWorkerClient } from './container';
import type { Bindings } from './env';
import { createKStartupStore, type KStartupStore } from './kstartup/store';
import { runSync } from './kstartup/sync';
import { createStore } from './store';
import type { KStartupSyncResponse } from '@gil/shared';

export class GilApp extends DurableObject<Bindings> {
  private readonly app: ReturnType<typeof createApp>;
  private readonly kstartup: KStartupStore;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    this.kstartup = createKStartupStore(ctx.storage.kv);
    this.app = createApp({
      kstartup: this.kstartup,
      store: () => createStore(new Date(), ctx.storage.kv),
      docWorkerFor: (e) => (e.DOC_WORKER ? docWorkerClient(e.DOC_WORKER, e.CF_VERSION_METADATA?.id) : null),
    });
  }

  /** 매일 새벽 cron(index.ts scheduled)이 RPC 로 부른다. 외부에서 HTTP 로는 닿지 않는다. */
  syncKStartup(): Promise<KStartupSyncResponse> {
    return runSync({ store: this.kstartup, env: this.env, now: new Date() });
  }

  fetch(request: Request): Promise<Response> | Response {
    return this.app.fetch(request, this.env);
  }
}
