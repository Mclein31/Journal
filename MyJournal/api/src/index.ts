import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Pool } from '@neondatabase/serverless';
import type { Env } from './env';
import { createAuth } from './auth';
import { sendEmail } from './email';
import { AccountDeletingError, lockWritableAccount } from './db';
import { assetSchema, chibiSchema, idSchema, matchesImage, referencedAssets, syncSchema } from './validation';

type User = { id: string; email: string; emailVerified: boolean; name: string };
type Context = { Bindings: Env; Variables: { pool: Pool; auth: ReturnType<typeof createAuth>; user: User } };
const MAX_BYTES = 500 * 1024 * 1024;
export function createApp(deliver = sendEmail) {
const app = new Hono<Context>();

app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header('Origin') !== c.env.APP_ORIGIN) return c.json({ error: 'Untrusted request origin' }, 403);
  await next();
});
app.get('/api/health', (c) => c.json({ ok: true, app: 'Dear Days' }));
app.use('/api/*', bodyLimit({ maxSize: 10 * 1024 * 1024, onError: (c) => c.json({ error: 'Uploads must be 10 MB or smaller' }, 413) }));
app.use('/api/*', async (c, next) => {
  const pool = new Pool({ connectionString: c.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000 });
  c.set('pool', pool);
  c.set('auth', createAuth(c.env, pool, (task) => c.executionCtx.waitUntil(task.catch((error: unknown) => {
    // Never log recipient addresses, auth links, passwords or tokens.
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
    const detail = (error instanceof Error ? error.message : 'Unknown transport error')
      .replaceAll(c.env.SMTP_PASS, '[private]').replaceAll(c.env.SMTP_USER, '[address]')
      .replace(/[\w.+-]+@[\w.-]+/g, '[address]').replace(/https?:\/\/\S+/g, '[url]').slice(0, 240);
    console.error('Dear Days email delivery failed', /^[A-Z_]+$/.test(code) ? code : 'unknown', detail);
  })), deliver));
  try { await next(); }
  finally { c.executionCtx.waitUntil(pool.end()); }
});
app.on(['GET', 'POST'], '/api/auth/*', (c) => c.get('auth').handler(c.req.raw));
app.use('/api/*', async (c, next) => {
  const session = await c.get('auth').api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'Sign in to continue' }, 401);
  if (!session.user.emailVerified) return c.json({ error: 'Verify your email before using cloud storage' }, 403);
  if (c.req.header('X-Dear-Days-Account') !== session.user.id) return c.json({ error: 'Your account changed. Reload to continue.' }, 401);
  c.set('user', session.user);
  await next();
});

app.get('/api/books', async (c) => {
  const result = await c.get('pool').query('SELECT id, doc->\'book\'->>\'title\' AS title, version, updated_at FROM journal_books WHERE user_id=$1 ORDER BY updated_at DESC', [c.get('user').id]);
  return c.json({ books: result.rows });
});
app.get('/api/books/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id'));
  const result = await c.get('pool').query('SELECT doc, bookmark, version, mutation_id FROM journal_books WHERE user_id=$1 AND id=$2', [c.get('user').id, id]);
  return result.rows[0] ? c.json(result.rows[0]) : c.json({ error: 'Journal not found' }, 404);
});
app.post('/api/sync', async (c) => {
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > 2 * 1024 * 1024) return c.json({ error: 'This journal exceeds the 2 MB text/layout limit. Start another journal to keep writing.' }, 413);
  const input = syncSchema.parse(JSON.parse(raw));
  const owner = c.get('user').id;
  const client = await c.get('pool').connect();
  try {
    await client.query('BEGIN');
    await lockWritableAccount(client, owner);
    const ids = referencedAssets(input.doc);
    if (ids.length) {
      const ready = await client.query('SELECT id FROM journal_assets WHERE user_id=$1 AND id=ANY($2::text[]) AND state=\'ready\'', [owner, ids]);
      if (ready.rows.length !== ids.length) { await client.query('ROLLBACK'); return c.json({ error: 'Some photos or stickers have not finished uploading' }, 422); }
    }
    const current = await client.query('SELECT version, mutation_id FROM journal_books WHERE user_id=$1 AND id=$2 FOR UPDATE', [owner, input.doc.book.id]);
    const row = current.rows[0];
    if (row?.mutation_id === input.mutationId) {
      await client.query('COMMIT');
      return c.json({ version: row.version }); // Response-loss retries are idempotent.
    }
    if ((row?.version ?? 0) !== input.baseVersion) { await client.query('ROLLBACK'); return c.json({ error: 'This journal changed on another device. Both copies are safe.', version: row?.version ?? 0 }, 409); }
    if (!row) {
      const count = await client.query('SELECT count(*)::int AS count FROM journal_books WHERE user_id=$1', [owner]);
      if (count.rows[0].count >= 20) { await client.query('ROLLBACK'); return c.json({ error: 'An account can keep up to 20 journals' }, 413); }
    }
    const result = await client.query(`INSERT INTO journal_books(user_id,id,doc,bookmark,version,mutation_id)
      VALUES($1,$2,$3::jsonb,$4::jsonb,1,$5)
      ON CONFLICT(user_id,id) DO UPDATE SET doc=EXCLUDED.doc,bookmark=EXCLUDED.bookmark,
      version=journal_books.version+1,mutation_id=EXCLUDED.mutation_id,updated_at=now() RETURNING version`,
    [owner, input.doc.book.id, JSON.stringify(input.doc), JSON.stringify(input.bookmark), input.mutationId]);
    await client.query('COMMIT');
    return c.json({ version: result.rows[0].version });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
});

app.get('/api/assets', async (c) => {
  const result = await c.get('pool').query('SELECT meta, state FROM journal_assets WHERE user_id=$1', [c.get('user').id]);
  return c.json({ assets: result.rows });
});
app.post('/api/assets', async (c) => {
  const meta = assetSchema.parse(await c.req.json());
  const owner = c.get('user').id;
  const client = await c.get('pool').connect();
  try {
    await client.query('BEGIN');
    await lockWritableAccount(client, owner);
    const existing = await client.query('SELECT meta, state FROM journal_assets WHERE user_id=$1 AND id=$2', [owner, meta.id]);
    if (existing.rows[0]) {
      const old = existing.rows[0].meta;
      if (old.bytes !== meta.bytes || old.mime !== meta.mime || old.w !== meta.w || old.h !== meta.h || old.kind !== meta.kind) {
        await client.query('ROLLBACK'); return c.json({ error: 'This upload ID belongs to a different file' }, 409);
      }
      await client.query('UPDATE journal_assets SET meta=$3::jsonb WHERE user_id=$1 AND id=$2', [owner, meta.id, JSON.stringify(meta)]);
      await client.query('COMMIT');
      return c.json({ state: existing.rows[0].state });
    }
    const usage = await client.query('SELECT COALESCE(sum(bytes),0)::bigint AS bytes, count(*)::int AS count FROM journal_assets WHERE user_id=$1', [owner]);
    if (Number(usage.rows[0].bytes) + meta.bytes > MAX_BYTES || usage.rows[0].count >= 5000) {
      await client.query('ROLLBACK'); return c.json({ error: 'Your account has reached its 500 MB upload limit' }, 413);
    }
    await client.query('INSERT INTO journal_assets(user_id,id,meta,bytes,r2_key) VALUES($1,$2,$3::jsonb,$4,$5)', [owner, meta.id, JSON.stringify(meta), meta.bytes, `users/${owner}/${meta.id}`]);
    await client.query('COMMIT');
    return c.json({ state: 'pending' }, 201);
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
});
app.put('/api/assets/:id/content', async (c) => {
  const id = idSchema.parse(c.req.param('id'));
  const owner = c.get('user').id;
  const client = await c.get('pool').connect();
  try {
  await client.query('BEGIN');
  await lockWritableAccount(client, owner);
  const found = await client.query('SELECT meta, r2_key, state FROM journal_assets WHERE user_id=$1 AND id=$2 FOR UPDATE', [owner, id]);
  const asset = found.rows[0];
  if (!asset) { await client.query('ROLLBACK'); return c.json({ error: 'Upload not found' }, 404); }
  if (asset.state === 'ready') { await client.query('COMMIT'); return c.json({ ok: true }); } // Immutable original.
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength !== asset.meta.bytes || !matchesImage(bytes, asset.meta.mime)) { await client.query('ROLLBACK'); return c.json({ error: 'Upload size or image format does not match' }, 422); }
  await c.env.JOURNAL_FILES.put(asset.r2_key, bytes, { httpMetadata: { contentType: asset.meta.mime }, customMetadata: { owner, asset: id } });
  await client.query('UPDATE journal_assets SET state=\'ready\' WHERE user_id=$1 AND id=$2', [owner, id]);
  await client.query('COMMIT');
  return c.json({ ok: true });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
});
app.get('/api/assets/:id/content', async (c) => {
  const id = idSchema.parse(c.req.param('id'));
  const found = await c.get('pool').query('SELECT meta,r2_key FROM journal_assets WHERE user_id=$1 AND id=$2 AND state=\'ready\'', [c.get('user').id, id]);
  const asset = found.rows[0];
  if (!asset) return c.json({ error: 'Image not found' }, 404);
  const object = await c.env.JOURNAL_FILES.get(asset.r2_key);
  if (!object) return c.json({ error: 'Image not found' }, 404);
  return new Response(object.body, { headers: { 'Content-Type': asset.meta.mime, 'Content-Length': String(object.size), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});
app.get('/api/account/export', async (c) => {
  const owner = c.get('user').id;
  const books = await c.get('pool').query('SELECT doc,bookmark,version FROM journal_books WHERE user_id=$1', [owner]);
  const assets = await c.get('pool').query('SELECT meta FROM journal_assets WHERE user_id=$1 AND state=\'ready\'', [owner]);
  const state = await c.get('pool').query('SELECT chibi FROM journal_account_state WHERE user_id=$1', [owner]);
  return c.json({ format: 'dear-days-backup-v1', books: books.rows, assets: assets.rows.map((r) => r.meta), chibi: state.rows[0]?.chibi ?? null });
});
app.get('/api/account/chibi', async (c) => {
  const result = await c.get('pool').query('SELECT chibi FROM journal_account_state WHERE user_id=$1', [c.get('user').id]);
  return c.json({ chibi: result.rows[0]?.chibi ?? null });
});
app.put('/api/account/chibi', async (c) => {
  const chibi = chibiSchema.parse(await c.req.json());
  const owner = c.get('user').id;
  const client = await c.get('pool').connect();
  try {
    await client.query('BEGIN');
    await lockWritableAccount(client, owner);
    // Newer device edits win; an older retry never replaces a later look.
    const saved = await client.query(`INSERT INTO journal_account_state(user_id, chibi) VALUES($1, $2::jsonb)
      ON CONFLICT(user_id) DO UPDATE SET chibi = EXCLUDED.chibi
      WHERE journal_account_state.chibi IS NULL OR (journal_account_state.chibi->>'updatedAt')::float8 <= (EXCLUDED.chibi->>'updatedAt')::float8
      RETURNING chibi`, [owner, JSON.stringify(chibi)]);
    const current = saved.rows[0]?.chibi ?? (await client.query('SELECT chibi FROM journal_account_state WHERE user_id=$1', [owner])).rows[0]?.chibi;
    await client.query('COMMIT');
    return c.json({ chibi: current });
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { client.release(); }
});
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
app.onError((error, c) => {
  if (error instanceof AccountDeletingError) return c.json({ error: error.message }, 423);
  if (error.name === 'ZodError' || error instanceof SyntaxError) return c.json({ error: 'Invalid request data' }, 400);
  console.error('Dear Days API error', error.name); // No SQL values or auth details in logs/responses.
  return c.json({ error: 'The server could not complete this request. Your local changes are safe.' }, 500);
});
return app;
}

const app = createApp();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    return path === '/api' || path.startsWith('/api/') ? app.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
};
export { app };
