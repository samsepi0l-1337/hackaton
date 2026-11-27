import { createApp } from './app';
import { docWorkerClient } from './container';

export { DocWorker } from './container';

export default createApp({ docWorkerFor: (env) => (env.DOC_WORKER ? docWorkerClient(env.DOC_WORKER) : null) });
