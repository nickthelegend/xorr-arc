import { handle } from '@hono/node-server/vercel';
import { app } from './src/index';
import type { IncomingMessage, ServerResponse } from 'node:http';
const serve = handle(app);
export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://internal');
  const route = url.searchParams.get('route');
  url.searchParams.delete('route');
  req.url = (route ? '/' + route : url.pathname.replace(/^\/api(?=\/|$)/, '') || '/') + url.search;
  return serve(req, res);
}
