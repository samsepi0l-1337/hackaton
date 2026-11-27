// app.ts 와 라우트 모듈이 같이 쓰는 오류 클래스·환경 타입.
import type { ConsultQuota, ErrorCode, FieldError } from '@gil/shared';
import type { createAiTasks } from './ai/tasks';
import type { Bindings } from './env';
import type { Store, UserRecord } from './store';

export type AppEnv = { Bindings: Bindings; Variables: { store: Store; user: UserRecord | null; now: Date; ai: ReturnType<typeof createAiTasks> } };

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 429, public code: ErrorCode, message: string, public fields?: FieldError[], public quota?: ConsultQuota) { super(message); }
}
