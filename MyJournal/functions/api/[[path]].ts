/* Cloudflare Pages Function: every /api/* request goes to the Hono API; other paths are static assets. */
import { handle } from 'hono/cloudflare-pages';
import { app } from '../../api/src/index';

export const onRequest = handle(app);
