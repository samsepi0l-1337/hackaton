import { createApp } from './app';

const app = createApp();
const server = Bun.serve({ port: 8787, fetch: app.fetch });
console.log(`API listening on http://localhost:${server.port}`);
