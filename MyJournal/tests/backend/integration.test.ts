import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from '@neondatabase/serverless';
import { createApp } from '../../api/src/index.ts';
import type { Env } from '../../api/src/env.ts';
import { createSeedBook } from '../../src/state/seed.ts';

// Explicit integration command only. Uses the configured database, creates isolated
// synthetic accounts, captures email in memory, and removes only its own test rows.
test('real Postgres auth, account isolation, revision conflicts, uploads, reset and deletion', { skip: process.env.RUN_BACKEND_TESTS !== '1', timeout: 180_000 }, async (t) => {
  process.loadEnvFile('.env');
  const messages: { to: string; subject: string; url: string }[] = [];
  const objects = new Map<string, Uint8Array>();
  let failDelete = false;
  const env = { ...process.env, JOURNAL_FILES: {
    async put(key: string, bytes: Uint8Array) { objects.set(key, bytes.slice()); },
    async get(key: string) { const bytes = objects.get(key); return bytes ? { body: bytes, size: bytes.byteLength } : null; },
    async delete(keys: string | string[]) { if (failDelete) throw new Error('simulated storage outage'); for (const key of [keys].flat()) objects.delete(key); },
  } } as unknown as Env;
  const app = createApp(async (_env, to, subject, url) => { messages.push({ to, subject, url }); });
  const origin = env.APP_ORIGIN;
  const run = crypto.randomUUID();
  const password = `Test-Only-${crypto.randomUUID()}!`;
  const ids: string[] = [];
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  const ip = `198.51.100.${Math.floor(Math.random() * 240) + 1}`;
  async function req(path: string, opts: { method?: string; body?: unknown; cookie?: string; owner?: string; origin?: string; binary?: Uint8Array } = {}) {
    const headers = new Headers({ Origin: opts.origin ?? origin, 'CF-Connecting-IP': ip });
    if (opts.cookie) headers.set('Cookie', opts.cookie);
    if (opts.owner) headers.set('X-Dear-Days-Account', opts.owner);
    if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil(promise: Promise<unknown>) { pending.push(promise); }, passThroughOnException() {} } as ExecutionContext;
    const response = await app.fetch(new Request(`${origin}/api${path}`, { method: opts.method ?? 'GET', headers, body: opts.binary ? opts.binary as BodyInit : opts.body !== undefined ? JSON.stringify(opts.body) : undefined }), env, ctx);
    const bytes = await response.arrayBuffer();
    await Promise.allSettled(pending);
    let data: any;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { data = bytes; }
    const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return { status: response.status, data, cookie, headers: response.headers, bytes };
  }
  async function register(label: string) {
    const email = `dear-days-qa-${run}-${label}@example.invalid`;
    const signed = await req('/auth/sign-up/email', { method: 'POST', body: { email, password, name: 'QA writer', callbackURL: origin } });
    assert.equal(signed.status, 200, 'signup succeeds');
    ids.push(signed.data.user.id);
    const unverified = await req('/auth/sign-in/email', { method: 'POST', body: { email, password } });
    assert.equal(unverified.status, 403, 'unverified accounts cannot sign in');
    const mail = messages.find((message) => message.to === email && message.subject.includes('Verify'));
    assert.ok(mail, 'signup dispatches verification');
    const url = new URL(mail.url);
    const verified = await req(url.pathname.replace(/^\/api/, '') + url.search);
    assert.ok([200,302].includes(verified.status), 'verification link succeeds');
    const signedIn = await req('/auth/sign-in/email', { method: 'POST', body: { email, password } });
    assert.equal(signedIn.status, 200, 'verified account can sign in');
    assert.ok(signedIn.cookie.includes('session_token'));
    assert.match(signedIn.headers.get('set-cookie') ?? '', /HttpOnly/i);
    assert.match(signedIn.headers.get('set-cookie') ?? '', /Secure/i);
    return { email, owner: signedIn.data.user.id as string, cookie: signedIn.cookie };
  }
  try {
    const a = await register('a');
    const b = await register('b');
    const doc = createSeedBook();
    doc.elements[0].w = 1;
    const send = (baseVersion: number, mutationId = crypto.randomUUID(), journal = doc) => req('/sync', { ...a, method: 'POST', body: { baseVersion, mutationId, doc: journal, bookmark: null } });
    await t.test('anonymous, wrong-origin and wrong-account requests are rejected', async () => {
      assert.equal((await req('/books')).status, 401);
      assert.equal((await req('/books', { ...a, owner: b.owner })).status, 401);
      assert.equal((await req('/sync', { ...a, method:'POST', origin:'https://untrusted.example', body:{} })).status,403);
    });
    await t.test('snapshot retries are idempotent and another device cannot overwrite a newer revision', async () => {
      const mutation = crypto.randomUUID();
      const first = await send(0, mutation);
      assert.equal(first.status, 200); assert.equal(first.data.version, 1);
      assert.equal((await send(0, mutation)).data.version, 1);
      assert.equal((await send(0)).status, 409);
      assert.equal((await req(`/books/${doc.book.id}`, b)).status, 404);
      const changed = structuredClone(doc); changed.book.title = 'Device two';
      const responses = await Promise.all([send(1, crypto.randomUUID(), changed), send(1)]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200,409]);
    });
    await t.test('document validation rejects foreign relationships and missing media', async () => {
      const bad = structuredClone(doc); bad.pages[0].sectionId = 'missing';
      assert.equal((await send(2, crypto.randomUUID(), bad)).status, 400);
      const missing = structuredClone(doc); missing.book.background = { kind:'upload', ref:'not-uploaded', fit:'cover' };
      assert.equal((await send(2, crypto.randomUUID(), missing)).status,422);
    });
    const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    const asset = { id:crypto.randomUUID(), kind:'sticker', mime:'image/png', w:1, h:1, bytes:png.length, createdAt:Date.now(), archived:false };
    await t.test('uploads are private, immutable, format-checked and archive metadata persists', async () => {
      assert.equal((await req('/assets',{ ...a, method:'POST',body:asset })).status,201);
      assert.equal((await req(`/assets/${asset.id}/content`,{ ...b, method:'PUT',binary:png })).status,404);
      assert.equal((await req(`/assets/${asset.id}/content`,{ ...a, method:'PUT',binary:Uint8Array.from([1,2,3]) })).status,422);
      assert.equal((await req(`/assets/${asset.id}/content`,{ ...a, method:'PUT',binary:png })).status,200);
      assert.equal((await req(`/assets/${asset.id}/content`,b)).status,404);
      assert.equal((await req(`/assets/${asset.id}/content`,a)).bytes.byteLength,png.length);
      assert.equal((await req('/assets',{ ...a, method:'POST',body:{...asset,archived:true} })).status,200);
      assert.equal((await req('/assets',a)).data.assets[0].meta.archived,true);
      const huge={...asset,id:crypto.randomUUID(),bytes:10485761};
      assert.equal((await req('/assets',{...a,method:'POST',body:huge})).status,400);
    });
    await t.test('password reset changes the password, revokes sessions, and cannot be reused', async () => {
      assert.equal((await req('/auth/request-password-reset',{method:'POST',body:{email:b.email,redirectTo:origin}})).status,200);
      const mail=messages.find((message)=>message.to===b.email&&message.subject.includes('Reset'))!;
      assert.ok(mail);
      const token = new URL(mail.url).pathname.split('/').at(-1)!;
      const replacement = `New-${crypto.randomUUID()}!`;
      assert.equal((await req('/auth/reset-password',{method:'POST',body:{token,newPassword:replacement}})).status,200);
      assert.equal((await req('/auth/reset-password',{method:'POST',body:{token,newPassword:replacement}})).status,400);
      assert.equal((await req('/books',b)).status,401);
      assert.equal((await req('/auth/sign-in/email',{method:'POST',body:{email:b.email,password:replacement}})).status,200);
    });
    await t.test('failed account deletion blocks new writes, remains retryable, and finally removes owned media', async () => {
      failDelete=true;
      const result=await req('/auth/delete-user',{...a,method:'POST',body:{password}});
      assert.ok(result.status>=400);
      assert.equal((await req('/assets',{...a,method:'POST',body:{...asset,id:crypto.randomUUID()}})).status,423);
      failDelete=false;
      assert.equal((await req('/auth/delete-user',{...a,method:'POST',body:{password}})).status,200);
      assert.equal(objects.size,0);
      assert.equal((await admin.query('SELECT count(*)::int AS count FROM journal_books WHERE user_id=$1',[a.owner])).rows[0].count,0);
    });
  } finally {
    if(ids.length) await admin.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[ids]);
    await admin.end();
  }
});
