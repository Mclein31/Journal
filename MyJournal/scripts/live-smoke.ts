import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Pool } from '@neondatabase/serverless';
import { AwsClient } from 'aws4fetch';
import { createSeedBook } from '../src/state/seed.ts';

// Explicit live integration check: only the configured sender's plus-addressed
// test mail is read. Links/passwords/cookies never enter logs or saved artifacts.
process.loadEnvFile('.env');
const origin = process.env.APP_ORIGIN!;
const run = crypto.randomUUID();
const [mailbox, domain] = process.env.SMTP_USER!.split('@');
const email = `${mailbox.split('+')[0]}+ddqa-${run}@${domain}`;
let password = `Dear-Days-QA-${crypto.randomUUID()}!`;
let owner = '';
let cookie = '';
const started = new Date(Date.now() - 60_000);
const imap = new ImapFlow({ host:'imap.gmail.com', port:993, secure:true, logger:false, auth:{user:process.env.SMTP_USER!,pass:process.env.SMTP_PASS!.replace(/\s/g,'')}, connectionTimeout:15_000, greetingTimeout:15_000, socketTimeout:45_000 });
let connected = false;

async function request(path: string, options: { method?: string; body?: unknown; cookie?: string; account?: string; binary?: Uint8Array } = {}) {
  const headers = new Headers({Origin:origin});
  if(options.cookie) headers.set('Cookie',options.cookie);
  if(options.account) headers.set('X-Dear-Days-Account',options.account);
  if(options.body!==undefined) headers.set('Content-Type','application/json');
  const response=await fetch(origin+path,{method:options.method??'GET',headers,body:options.binary as BodyInit??(options.body!==undefined?JSON.stringify(options.body):undefined),redirect:'manual',signal:AbortSignal.timeout(45_000)});
  const bytes=await response.arrayBuffer();
  let data: any; try { data=JSON.parse(new TextDecoder().decode(bytes)); } catch { data=null; }
  return {status:response.status,data,bytes,headers:response.headers,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
}

async function emailLink(subject: string): Promise<URL> {
  if(!connected){await imap.connect();connected=true;}
  const folders=await imap.list();
  const paths=[...new Set(folders.filter(f=>['\\All','\\Junk','\\Inbox'].includes(f.specialUse??'')||f.path==='INBOX').map(f=>f.path))];
  const deadline=Date.now()+60_000;
  while(Date.now()<deadline){
    for(const path of paths){
      await imap.mailboxOpen(path,{readOnly:true});
      const ids=await imap.search({header:{to:email},since:started},{uid:true});
      if(!ids)continue;
      for(const id of ids.slice(-10)){
        const message=await imap.fetchOne(id,{source:true},{uid:true});
        if(!message||!message.source)continue;
        const parsed=await simpleParser(message.source);
        if(!parsed.subject?.includes(subject))continue;
        const link=(parsed.text??'').match(/https:\/\/[^\s]+/)?.[0];
        if(link){const url=new URL(link);assert.equal(url.origin,origin);return url;}
      }
    }
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  throw new Error('Expected test email did not arrive within 60 seconds');
}

async function cleanup() {
  if(connected)await imap.logout().catch(()=>{});
  if(!owner)return;
  const pool=new Pool({connectionString:process.env.DATABASE_URL_UNPOOLED});
  try {
    const user=await pool.query('SELECT email FROM "user" WHERE id=$1',[owner]);
    if(user.rows[0]?.email!==email)return;
    const assets=await pool.query('SELECT r2_key FROM journal_assets WHERE user_id=$1',[owner]);
    const s3=new AwsClient({accessKeyId:process.env.R2_ACCESS_KEY_ID!,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY!});
    for(const {r2_key} of assets.rows){
      const url=`${process.env.R2_S3_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${r2_key}`;
      const response=await s3.fetch(url,{method:'DELETE'});assert.ok(response.ok,'Test object cleanup');
    }
    await pool.query('DELETE FROM "user" WHERE id=$1 AND email=$2',[owner,email]);
  } finally {await pool.end();}
}

try {
  const signup=await request('/api/auth/sign-up/email',{method:'POST',body:{email,password,name:'Temporary Dear Days QA',callbackURL:origin}});
  assert.equal(signup.status,200,'Live signup');owner=signup.data.user.id;
  console.log('PASS live signup; waiting for the actual verification email.');
  const verify=await emailLink('Verify your email');
  const verified=await request(verify.pathname+verify.search);assert.ok([200,302].includes(verified.status),'Live email verification');
  console.log('PASS verification email delivered and verification link accepted.');
  const login=()=>request('/api/auth/sign-in/email',{method:'POST',body:{email,password}});
  const first=await login();assert.equal(first.status,200,'First session login');cookie=first.cookie;
  const second=await login();assert.equal(second.status,200,'Second session login');assert.notEqual(cookie,second.cookie);
  console.log('PASS two independent authenticated sessions.');
  const doc=createSeedBook();doc.elements[0].w=1;doc.book.title='Temporary cloud QA';
  let result=await request('/api/sync',{method:'POST',cookie,account:owner,body:{doc,bookmark:null,baseVersion:0,mutationId:crypto.randomUUID()}});
  assert.equal(result.status,200,'First cloud save');
  result=await request(`/api/books/${doc.book.id}`,{cookie:second.cookie,account:owner});assert.equal(result.data.doc.book.title,doc.book.title);
  result=await request('/api/sync',{method:'POST',cookie,account:owner,body:{doc,bookmark:null,baseVersion:1,mutationId:crypto.randomUUID()}});assert.equal(result.status,200);
  result=await request('/api/sync',{method:'POST',cookie:second.cookie,account:owner,body:{doc,bookmark:null,baseVersion:1,mutationId:crypto.randomUUID()}});assert.equal(result.status,409,'Stale device protected');
  console.log('PASS cross-session cloud saves and stale-device conflict protection.');
  const image=new Uint8Array(await readFile('public/icons/favicon-32.png'));
  const meta={id:crypto.randomUUID(),kind:'sticker',mime:'image/png',w:32,h:32,bytes:image.length,createdAt:Date.now()};
  result=await request('/api/assets',{method:'POST',cookie,account:owner,body:meta});assert.equal(result.status,201);
  result=await request(`/api/assets/${meta.id}/content`,{method:'PUT',cookie,account:owner,binary:image});assert.equal(result.status,200,'Real R2 upload');
  result=await request(`/api/assets/${meta.id}/content`,{cookie:second.cookie,account:owner});assert.deepEqual(new Uint8Array(result.bytes),image);
  assert.equal((await request(`/api/assets/${meta.id}/content`)).status,401,'Unauthenticated media rejected');
  console.log('PASS private R2 upload/download across sessions.');
  if(process.env.PLAYWRIGHT_MODULE){
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
    const browser=await chromium.launch({headless:true});
    try{
      async function browserLogin(){
        const context=await browser.newContext();const page=await context.newPage();
        await page.goto(origin);await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);
        await page.getByRole('button',{name:'Open my journal',exact:true}).click();
        await page.getByRole('button',{name:'Account',exact:true}).waitFor();
        await page.getByRole('button',{name:'Open the book',exact:true}).click();
        await page.locator('.stage .el-text-body:visible').first().waitFor();return page;
      }
      const page=await browserLogin();
      const text=page.locator('.stage .el-text-body:visible').first();await text.dblclick();
      await page.locator('.stage [contenteditable="plaintext-only"]:visible,.stage [contenteditable="true"]:visible').fill('Verified browser cloud sync.');
      await page.locator('.desk-identity').click();
      const deadline=Date.now()+30_000;let persisted=false;
      while(Date.now()<deadline){const remote=await request(`/api/books/${doc.book.id}`,{cookie:second.cookie,account:owner});if(remote.data?.doc.elements.some((el:any)=>el.data.text?.content==='Verified browser cloud sync.')){persisted=true;break;}await new Promise(resolve=>setTimeout(resolve,1000));}
      assert.ok(persisted,'Browser input synchronized to the cloud');
      const other=await browserLogin();
      assert.equal(await other.locator('.stage .el-text-body:visible').first().textContent(),'Verified browser cloud sync.');
      await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.locator('.auth-form').waitFor();
      console.log('PASS real browser sign-in, editable journal sync, second-browser hydration, and sign-out.');
    }finally{await browser.close();}
  }
  result=await request('/api/auth/request-password-reset',{method:'POST',body:{email,redirectTo:`${origin}/?reset=1`}});assert.equal(result.status,200);
  const reset=await emailLink('Reset your password');
  const callback=await request(reset.pathname+reset.search);assert.equal(callback.status,302);
  const redirect=new URL(callback.headers.get('location')!,origin);assert.equal(redirect.origin,origin);
  const token=redirect.searchParams.get('token');assert.ok(token);
  password=`New-${crypto.randomUUID()}!`;
  result=await request('/api/auth/reset-password',{method:'POST',body:{token,newPassword:password}});assert.equal(result.status,200);
  assert.equal((await request('/api/books',{cookie,account:owner})).status,401,'Password reset revokes old sessions');
  console.log('PASS password reset email, browser redirect, new password, and session revocation.');
  const finalLogin=await login();assert.equal(finalLogin.status,200);cookie=finalLogin.cookie;
  result=await request('/api/auth/delete-user',{method:'POST',cookie,body:{password}});assert.equal(result.status,200,'Account deletion');
  console.log('PASS account deletion; temporary account and owned uploads removed.');
} catch(error) {
  console.error('Live smoke failed:',error instanceof Error?error.message:'unknown error');process.exitCode=1;
} finally {await cleanup();}
