import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from '@neondatabase/serverless';
import { createApp } from '../../api/src/index.ts';
import type { Env } from '../../api/src/env.ts';
import { createSeedBook } from '../../src/state/seed.ts';

// Explicit integration command only. Uses the configured database, creates isolated
// synthetic accounts, captures email in memory, and removes only its own test rows.
test('real Postgres auth, account isolation, revision conflicts, uploads, reset and deletion', { skip: process.env.RUN_BACKEND_TESTS !== '1', timeout: 240_000 }, async (t) => {
  process.loadEnvFile('.env');
  const messages: { to: string; subject: string; code: string }[] = [];
  const objects = new Map<string, Uint8Array>();
  let failDelete = false;
  const env = { ...process.env, JOURNAL_FILES: {
    async put(key: string, bytes: Uint8Array) { objects.set(key, bytes.slice()); },
    async get(key: string) { const bytes = objects.get(key); return bytes ? { body: bytes, size: bytes.byteLength } : null; },
    async delete(keys: string | string[]) { if (failDelete) throw new Error('simulated storage outage'); for (const key of [keys].flat()) objects.delete(key); },
  } } as unknown as Env;
  const app = createApp(async (_env, to, subject, code) => { messages.push({ to, subject, code }); });
  const origin = env.APP_ORIGIN;
  const run = crypto.randomUUID();
  const password = `Test-Only-${crypto.randomUUID()}!`;
  const ids: string[] = [];
  const emails: string[] = [];
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  const ip = `198.51.100.${Math.floor(Math.random() * 240) + 1}`;
  let ipIndex = 1;
  const nextIp = () => `198.18.${parseInt(run.slice(0, 2), 16)}.${ipIndex++}`;
  async function req(path: string, opts: { method?: string; body?: unknown; cookie?: string; owner?: string; origin?: string; binary?: Uint8Array; ip?: string } = {}) {
    const headers = new Headers({ Origin: opts.origin ?? origin, 'CF-Connecting-IP': opts.ip ?? ip });
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
    emails.push(email);
    const signed = await req('/auth/sign-up/email', { method: 'POST', body: { email, password, name: 'QA writer', callbackURL: origin } });
    assert.equal(signed.status, 200, 'signup succeeds');
    ids.push(signed.data.user.id);
    const unverified = await req('/auth/sign-in/email', { method: 'POST', body: { email, password } });
    assert.equal(unverified.status, 403, 'unverified accounts cannot sign in');
    const mail = messages.findLast((message) => message.to === email && message.subject.includes('Verify'));
    assert.ok(mail && /^\d{6}$/.test(mail.code), 'signup dispatches a six-digit verification code');
    const stored = await admin.query('SELECT value, "expiresAt" FROM verification WHERE identifier=$1 ORDER BY "createdAt" DESC', [`email-verification-otp-${email}`]);
    assert.ok(stored.rows.length >= 1, 'a verification challenge is persisted');
    assert.ok(stored.rows.every(row => !/^\d{6}:/.test(row.value) && !row.value.includes(mail.code)), 'OTP is hashed in Postgres');
    const remaining = new Date(stored.rows[0].expiresAt).getTime() - Date.now();
    assert.ok(remaining > 540_000 && remaining <= 600_000, 'verification expires after ten minutes');
    const verified = await req('/auth/email-otp/verify-email', { method:'POST', ip:nextIp(), body:{email,otp:mail.code} });
    assert.equal(verified.status, 200, 'verification code succeeds');
    assert.ok(verified.cookie.includes('session_token'), 'verification signs the writer in');
    assert.equal((await req('/auth/email-otp/verify-email', { method:'POST', ip:nextIp(), body:{email,otp:mail.code} })).status, 400, 'verification code is single-use');
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
    await t.test('verification rejects wrong, replaced, expired and exhausted codes', async () => {
      const email = `dear-days-qa-${run}-otp@example.invalid`;
      emails.push(email);
      const signup = await req('/auth/sign-up/email', {method:'POST', body:{email,password,name:'OTP QA'}});
      assert.equal(signup.status, 200); ids.push(signup.data.user.id);
      const latest = () => messages.findLast(message => message.to === email && message.subject.includes('Verify'))!.code;
      const verify = (otp: string) => req('/auth/email-otp/verify-email', {method:'POST',ip:nextIp(),body:{email,otp}});
      const resend = () => req('/auth/email-otp/send-verification-otp', {method:'POST',ip:nextIp(),body:{email,type:'email-verification'}});
      const first = latest();
      const wrong = first === '000000' ? '111111' : '000000';
      assert.equal((await verify(wrong)).status, 400, 'incorrect code rejected');
      assert.equal((await resend()).status, 200);
      // A random generator may repeat a six-digit value. Rotate once more if so.
      if (latest() === first) assert.equal((await resend()).status, 200);
      assert.ok(latest() !== first, 'resending replaces the prior code');
      assert.equal((await verify(first)).status, 400, 'replaced code rejected');
      const identifier = `email-verification-otp-${email}`;
      await admin.query(`UPDATE verification SET "expiresAt"=now()-interval '1 second' WHERE identifier=$1`, [identifier]);
      assert.equal((await verify(latest())).status, 400, 'expired code rejected');
      assert.equal((await resend()).status, 200);
      const lockedCode = latest();
      const bad = lockedCode === '000000' ? '111111' : '000000';
      for (let attempt=0; attempt<5; attempt++) assert.equal((await verify(bad)).status, 400, 'incorrect attempt rejected');
      assert.equal((await verify(lockedCode)).status, 403, 'five wrong attempts lock out even the correct code');
      assert.equal((await resend()).status, 200);
      assert.equal((await verify(latest())).status, 200, 'a fresh code recovers after lockout');
      assert.equal((await req('/auth/sign-in/email-otp', {method:'POST',body:{email,otp:latest()}})).status, 404, 'passwordless login is not exposed');
      assert.equal((await req('/auth/request-password-reset', {method:'POST',body:{email}})).status, 404, 'legacy reset-link requests are disabled');
    });
    await t.test('OTP sender rejects malformed purposes and limits repeated requests per IP', async () => {
      const endpoint = '/auth/email-otp/send-verification-otp';
      const before = messages.length;
      for (const body of [null, {}, {email:a.email,type:'sign-in'}, {email:a.email,type:'forget-password'}, {email:a.email,type:'change-email'}]) {
        assert.equal((await req(endpoint, {method:'POST',ip:nextIp(),body})).status, 400, 'unsupported sender input is rejected');
      }
      assert.equal(messages.length, before, 'invalid requests dispatch no email');
      const limitedIp = nextIp();
      const sendCode = () => req(endpoint, {method:'POST',ip:limitedIp,body:{email:a.email,type:'email-verification'}});
      for (let request=0; request<3; request++) assert.equal((await sendCode()).status, 200);
      const delivered = messages.length;
      assert.equal(delivered, before+3, 'permitted test requests dispatch captured messages');
      assert.equal((await sendCode()).status, 429, 'fourth send in one minute is throttled');
      assert.equal(messages.length, delivered, 'throttled requests dispatch no email');
    });
    await t.test('password reset codes are purpose-bound, single-use and revoke sessions', async () => {
      assert.equal((await req('/auth/email-otp/request-password-reset',{method:'POST',body:{email:b.email}})).status,200);
      const mail=messages.findLast((message)=>message.to===b.email&&message.subject.includes('Reset'))!;
      assert.ok(mail && /^\d{6}$/.test(mail.code), 'password recovery sends a six-digit code');
      const replacement = `New-${crypto.randomUUID()}!`;
      assert.equal((await req('/auth/email-otp/verify-email',{method:'POST',ip:nextIp(),body:{email:b.email,otp:mail.code}})).status,400, 'reset code cannot verify an email');
      const wrong = mail.code === '000000' ? '111111' : '000000';
      assert.equal((await req('/auth/email-otp/reset-password',{method:'POST',body:{email:b.email,otp:wrong,password:replacement}})).status,400);
      assert.equal((await req('/auth/email-otp/reset-password',{method:'POST',body:{email:b.email,otp:mail.code,password:replacement}})).status,200);
      assert.equal((await req('/auth/email-otp/reset-password',{method:'POST',body:{email:b.email,otp:mail.code,password:replacement}})).status,400);
      assert.equal((await req('/books',b)).status,401);
      assert.equal((await req('/auth/sign-in/email',{method:'POST',body:{email:b.email,password:replacement}})).status,200);
      const before = messages.length;
      const absent = `dear-days-qa-${run}-missing@example.invalid`;
      assert.equal((await req('/auth/email-otp/request-password-reset',{method:'POST',body:{email:absent}})).status,200, 'unknown recovery email has the same response');
      assert.equal(messages.length, before, 'unknown address receives no email');
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
    if(emails.length) await admin.query('DELETE FROM verification WHERE identifier=ANY($1::text[])', [emails.flatMap(email => [`email-verification-otp-${email}`, `forget-password-otp-${email}`])]);
    await admin.end();
  }
});
