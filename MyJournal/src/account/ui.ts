import './account.css';
import { zipSync, strToU8 } from 'fflate';
import type { Asset, BookDoc, Bookmark } from '../state/schema';
import { flush, getDoc } from '../state/store';
import { getMeta, replaceSnapshot, setMeta, storageKey } from '../sync/local';
import { cloudBooks, importDeviceJournal, keepAsSeparateJournal, requireSyncedJournal, snapshotHash, stopSync, syncNow } from '../sync/cloud';
import { getPendingDrafts, getDraftConflicts } from '../book/bookmark';
import { api, mediaBlob, post, type Account, type Session } from './api';
import { mountChibi } from '../login/Chibi';
import { openChibiEditor } from '../login/ChibiEditor';
import { CHIBI_EVENT, loadChibi } from '../login/chibiStore';
import type { ChibiConfig } from '../state/schema';

const CACHE = 'dd:last-account';
const GENERATION = 'dd:account-generation';
export const escapeHTML = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function rememberAccount(account: Account | null): void {
  try { if (account) localStorage.setItem(CACHE, JSON.stringify(account)); else localStorage.removeItem(CACHE); } catch { /* Session remains server-authoritative. */ }
}
export function rememberedAccount(): Account | null {
  try { return JSON.parse(localStorage.getItem(CACHE) ?? 'null') as Account | null; } catch { return null; }
}
export function accountChanged(): void {
  try { localStorage.setItem(GENERATION, crypto.randomUUID()); } catch { /* Next request still validates the immutable account ID. */ }
}
export function watchAccountChanges(): void {
  addEventListener('storage', (event) => { if ((event as StorageEvent).key === GENERATION) { stopSync(); location.reload(); } });
}
export async function readSession(): Promise<Session | null> { return api<Session | null>('/auth/get-session'); }
type Mode = 'signin' | 'signup' | 'forgot' | 'reset' | 'verify';

/** Native labelled inputs work with paste, browser autofill, and password managers. */
export function mountLogin(root: HTMLElement, initial: Mode = 'signin', initialEmail = ''): void {
  const params = new URLSearchParams(location.search);
  let mode: Mode = params.get('token') ? 'reset' : initial;
  let email = initialEmail;
  let password = '';
  let name = '';
  // One live chibi survives re-renders between sign in / sign up / reset; only its slot is rebuilt.
  const chibiHost = document.createElement('div'); chibiHost.className = 'auth-chibi';
  const chibi = mountChibi(chibiHost, loadChibi(), 'Your Dear Days companion. Her eyes follow your cursor.');
  addEventListener(CHIBI_EVENT, (event) => chibi.update((event as CustomEvent<ChibiConfig>).detail));
  const syncHands = () => setTimeout(() => {
    const input = root.querySelector<HTMLInputElement>('[name="password"]');
    const active = document.activeElement;
    const typing = !!input && (active === input || active === root.querySelector('.password-toggle'));
    chibi.setHands(!typing ? 'rest' : input!.type === 'password' ? 'cover' : 'peek');
    if (typing && input!.type !== 'password') chibi.setMood('shy'); else if (!typing) chibi.setMood('idle');
  });
  root.addEventListener('focusin', syncHands); root.addEventListener('focusout', syncHands);
  function render() {
    const heading = { signin: 'Welcome back.', signup: 'A place for your days.', forgot: 'Let’s get you back in.', reset: 'A fresh start.', verify: 'A little note in your inbox.' }[mode];
    root.innerHTML = `<section class="auth-screen"><div class="auth-intro"><a class="auth-wordmark" href="/">✿ Dear Days</a><div class="auth-stage"><div class="auth-book" aria-hidden="true"><span>Dear<br>Days</span><small>the little things,<br>kept close.</small></div><div class="auth-chibi-slot"></div></div><button type="button" class="auth-chibi-edit">Customize her</button><p>Your days, tucked between pages.</p></div><div class="auth-card"><p class="auth-eyebrow">YOUR PERSONAL JOURNAL</p><h1>${heading}</h1><p class="auth-description">${mode === 'verify' ? `Open the verification link we sent to <strong>${escapeHTML(email)}</strong>. Check Spam if it isn’t in your inbox.` : mode === 'forgot' ? 'We’ll email you a link to reset your password.' : mode === 'reset' ? 'Choose a new password for your account.' : 'Write a little. Keep a memory. Make these pages yours.'}</p>
      <form class="auth-form">
      ${mode === 'signup' ? `<label>Your name<input name="name" autocomplete="name" maxlength="100" required value="${escapeHTML(name)}"></label>` : ''}
      ${!['verify','reset'].includes(mode) ? `<label>Email address<input name="email" type="email" autocomplete="email" required value="${escapeHTML(email)}"></label>` : ''}
      ${['signin','signup','reset'].includes(mode) ? `<label>Password<span class="password-field"><input name="password" type="password" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}" minlength="${mode === 'signin' ? 1 : 10}" maxlength="128" required value="${escapeHTML(password)}"><button type="button" class="password-toggle" aria-label="Show password">Show</button></span></label>${mode !== 'signin' ? '<p class="auth-hint">Use at least 10 characters. A password manager can help.</p>' : ''}` : ''}
      <p class="auth-feedback" role="status" aria-live="polite"></p>
      <button class="auth-primary" type="submit">${{ signin: 'Open my journal', signup: 'Create my account', forgot: 'Send reset link', reset: 'Save new password', verify: 'Send another email' }[mode]}</button>
      </form>
      ${mode === 'signin' ? '<button class="auth-link" data-mode="forgot">Forgot password?</button><p class="auth-switch">New here? <button class="auth-link" data-mode="signup">Create an account</button></p>' : '<button class="auth-link" data-mode="signin">Back to sign in</button>'}
      ${mode === 'signup' ? '<p class="auth-privacy">Your journal is private to your account. Your email is used for sign-in, verification, and password recovery. You can export your journals or delete your account in Account.</p>' : ''}
      <div class="auth-divider"></div><button class="auth-guest" type="button">Continue on this device</button><p class="auth-hint">No account needed. Device-only journals stay in this browser until you choose to import them.</p>
      </div></section>`;
    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => button.addEventListener('click', () => { saveFields(); mode = button.dataset.mode as Mode; password = ''; render(); }));
    root.querySelector('.auth-chibi-slot')!.appendChild(chibiHost);
    root.querySelector('.auth-chibi-edit')!.addEventListener('click', () => openChibiEditor(false));
    root.querySelector('.auth-guest')!.addEventListener('click', () => { sessionStorage.setItem('dd:guest', '1'); history.replaceState(null, '', '/'); location.reload(); });
    root.querySelector('.password-toggle')?.addEventListener('click', (event) => {
      const input = root.querySelector<HTMLInputElement>('[name="password"]')!;
      input.type = input.type === 'password' ? 'text' : 'password';
      (event.currentTarget as HTMLButtonElement).textContent = input.type === 'password' ? 'Show' : 'Hide';
      (event.currentTarget as HTMLButtonElement).setAttribute('aria-label', `${input.type === 'password' ? 'Show' : 'Hide'} password`);
      syncHands();
    });
    root.querySelector('form')!.addEventListener('submit', (event) => { event.preventDefault(); void submit(); });
    root.querySelector<HTMLInputElement>('input')?.focus();
  }
  function saveFields() {
    email = root.querySelector<HTMLInputElement>('[name="email"]')?.value.trim() ?? email;
    name = root.querySelector<HTMLInputElement>('[name="name"]')?.value.trim() ?? name;
    password = root.querySelector<HTMLInputElement>('[name="password"]')?.value ?? password;
  }
  async function submit() {
    saveFields();
    const button = root.querySelector<HTMLButtonElement>('[type="submit"]')!;
    const feedback = root.querySelector<HTMLElement>('.auth-feedback')!;
    button.disabled = true; feedback.textContent = 'One moment…';
    try {
      if (mode === 'signin') {
        await post('/auth/sign-in/email', { email, password, callbackURL: location.origin });
        sessionStorage.removeItem('dd:guest'); accountChanged();
        chibi.setHands('rest'); chibi.setMood('happy');
        const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        await new Promise((resolve) => setTimeout(resolve, reduce ? 200 : 650)); // a quick smile before the book opens
        location.assign('/'); return;
      }
      if (mode === 'signup') {
        await post('/auth/sign-up/email', { email, password, name: name || 'Dear Days writer', callbackURL: location.origin });
        password = ''; mode = 'verify'; render(); chibi.setHands('rest'); chibi.setMood('happy', 2400); return;
      }
      if (mode === 'forgot') {
        await post('/auth/request-password-reset', { email, redirectTo: `${location.origin}/?reset=1` });
        feedback.textContent = 'If an account uses this address, a reset link is on its way. Check your inbox and Spam folder.';
      }
      if (mode === 'verify') {
        await post('/auth/send-verification-email', { email, callbackURL: location.origin });
        feedback.textContent = 'Another verification email has been requested. Check your inbox and Spam folder.';
      }
      if (mode === 'reset') {
        await post('/auth/reset-password', { token: params.get('token'), newPassword: password });
        history.replaceState(null, '', '/'); mode = 'signin'; password = ''; render();
        root.querySelector<HTMLElement>('.auth-feedback')!.textContent = 'Password updated. Sign in with your new password.';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not complete this request. Try again.';
      if (mode === 'signin' && /verif/i.test(message)) { mode = 'verify'; password = ''; render(); }
      else { feedback.textContent = message; feedback.setAttribute('role', 'alert'); chibi.setHands('rest'); chibi.setMood('confused', 2600); }
    } finally { button.disabled = false; }
  }
  render();
  if (params.has('error')) root.querySelector<HTMLElement>('.auth-feedback')!.textContent = 'That link is invalid or expired. Request a new email to continue.';
}

const download = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};
export async function commitEditor(): Promise<void> {
  (document.activeElement as HTMLElement | null)?.blur();
  await flush();
}

export function mountAccountControls(root: HTMLElement, account: Account | null): void {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'tool-btn account-button';
  button.textContent = account ? 'Account' : 'Sign in';
  root.querySelector('[data-act="sections"]')?.parentElement?.appendChild(button);
  button.addEventListener('click', () => {
    if (!account) { sessionStorage.removeItem('dd:guest'); location.assign('/'); return; }
    void openAccount(account);
  });
  if (!account) return;
  addEventListener('dd:cloud-status', (event) => {
    const { state, message } = (event as CustomEvent<{ state: string; message: string }>).detail;
    const label = root.querySelector<HTMLElement>('.save-status');
    if (label) { label.textContent = message; label.dataset.state = state; }
    let banner = root.querySelector<HTMLElement>('.cloud-banner');
    if (['conflict', 'remote', 'error'].includes(state)) {
      if (!banner) { banner = document.createElement('div'); banner.className = 'cloud-banner'; banner.setAttribute('role','status'); root.appendChild(banner); }
      banner.replaceChildren(document.createTextNode(message));
      const action = document.createElement('button'); action.textContent = 'Review'; action.addEventListener('click', () => void openAccount(account)); banner.appendChild(action);
    } else banner?.remove();
  });
}

async function openAccount(account: Account): Promise<void> {
  if (document.querySelector('.account-dialog')) return;
  await commitEditor();
  const dialog = document.createElement('dialog'); dialog.className = 'account-dialog';
  dialog.setAttribute('aria-labelledby', 'account-title');
  dialog.innerHTML = `<div class="account-head"><div><p class="auth-eyebrow">DEAR DAYS</p><h2 id="account-title">Your account</h2></div><button class="account-close" aria-label="Close account">×</button></div><p class="account-email">${escapeHTML(account.email)}</p><p class="account-description">Your journals and uploaded images are private. Changes save on this device first, then sync to your account.</p><p class="account-feedback" role="status"></p><div class="account-actions"><button data-account="sync">Sync now</button><button data-account="import">Import device-only journal</button><button data-account="copy">Keep this as a separate journal</button><button data-account="local">Download this device’s copy</button><button data-account="export">Export account with images</button><button data-account="reload">Reload latest cloud copy</button><button data-account="chibi">Customize your chibi</button></div><h3>Your journals</h3><div class="account-books">Loading journals…</div><div class="auth-divider"></div><button class="auth-guest" data-account="signout">Sign out</button><details class="account-danger"><summary>Delete account</summary><p>This permanently removes your cloud journals and uploads. Export a copy first. Device-only journals remain on this browser.</p><label>Confirm your password<input type="password" autocomplete="current-password" name="delete-password"></label><button data-account="delete">Permanently delete my account</button></details>`;
  document.body.appendChild(dialog);
  dialog.querySelector('.account-close')!.addEventListener('click', () => { dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
  const feedback = dialog.querySelector<HTMLElement>('.account-feedback')!;
  const books = dialog.querySelector<HTMLElement>('.account-books')!;
  void cloudBooks().then((list) => {
    books.replaceChildren();
    if (!list.length) books.textContent = 'Your first journal will appear after it syncs.';
    for (const book of list) {
      const choose = document.createElement('button'); choose.textContent = book.title;
      choose.addEventListener('click', () => void act(async () => {
        await commitEditor(); await requireSyncedJournal(); await setMeta('activeBookId', book.id); location.reload();
      }));
      books.appendChild(choose);
    }
  }).catch(() => { books.textContent = 'Connect to the internet to see your cloud journals.'; });
  async function act(action: () => Promise<void>) {
    const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
    controls.forEach((control) => { control.disabled = true; }); feedback.textContent = 'One moment…';
    try { await action(); }
    catch (error) { feedback.textContent = error instanceof Error ? error.message : 'Please try again.'; }
    finally { controls.forEach((control) => { control.disabled = false; }); }
  }
  dialog.querySelectorAll<HTMLButtonElement>('[data-account]').forEach((control) => control.addEventListener('click', () => void act(async () => {
    const action = control.dataset.account;
    if (action === 'chibi') { feedback.textContent = ''; openChibiEditor(true); return; }
    if (action === 'sync') { await commitEditor(); await syncNow(); feedback.textContent = 'Sync checked. See the journal’s save status for the result.'; }
    if (action === 'import') {
      if (!confirm('Import the device-only journal into this account? The original device copy will be kept.')) { feedback.textContent = ''; return; }
      await requireSyncedJournal();
      if (!await importDeviceJournal()) throw new Error('There is no device-only journal in this browser to import.');
      location.reload();
    }
    if (action === 'copy') { await commitEditor(); stopSync(); await keepAsSeparateJournal(getDoc()); location.reload(); }
    if (action === 'local') {
      await commitEditor();
      download(new Blob([JSON.stringify({ format: 'dear-days-device-copy', doc: getDoc(), bookmark: await getMeta(`bookmark:${getDoc().book.id}`) }, null, 2)], { type:'application/json' }), 'dear-days-device-copy.json');
      feedback.textContent = 'Device copy downloaded. Use Export account for uploaded image files.';
    }
    if (action === 'export') {
      await syncNow();
      const data = await api<{ assets: Asset[]; books: { doc: BookDoc }[] }>('/account/export');
      const files: Record<string, Uint8Array> = { 'journals.json': strToU8(JSON.stringify(data, null, 2)) };
      files['active-device-journal.json'] = strToU8(JSON.stringify(getDoc(), null, 2));
      files['device-recovery.json'] = strToU8(JSON.stringify({ pendingDrafts: getPendingDrafts(), olderDrafts: getDraftConflicts(), importedDeviceRecovery: await getMeta('importedGuestRecovery') }, null, 2));
      for (const meta of data.assets) files[`images/${meta.id}.${meta.mime.split('/')[1]}`] = new Uint8Array(await (await mediaBlob(meta.id)).arrayBuffer());
      const bytes = zipSync(files, { level: 0 });
      download(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), 'dear-days-backup.zip');
      feedback.textContent = 'Account backup downloaded.';
    }
    if (action === 'reload') {
      if (!confirm('Reload the cloud copy? Download this device’s copy first if it contains changes you want to keep.')) { feedback.textContent = ''; return; }
      stopSync();
      const id = getDoc().book.id;
      // Explicit replacement is a user choice, not automatic conflict resolution.
      const remote = await api<{ doc: BookDoc; bookmark: Bookmark | null; version: number }>(`/books/${id}`);
      await replaceSnapshot(remote.doc, remote.bookmark, { version: remote.version, hash: await snapshotHash(remote.doc, remote.bookmark) });
      // Retain pending drafts in a separate recovery copy instead of replaying them over the chosen cloud version.
      const recoveryKey = storageKey('mlw:text-drafts');
      const recovery = localStorage.getItem(recoveryKey);
      if (recovery) { localStorage.setItem(`${recoveryKey}:before-cloud-reload:${Date.now()}`, recovery); localStorage.removeItem(recoveryKey); }
      await setMeta('drafts', null);
      location.reload();
    }
    if (action === 'signout') {
      await commitEditor(); await syncNow();
      await post('/auth/sign-out', {}); stopSync(); rememberAccount(null); accountChanged(); sessionStorage.removeItem('dd:guest'); location.assign('/');
    }
    if (action === 'delete') {
      const password = dialog.querySelector<HTMLInputElement>('[name="delete-password"]')!.value;
      if (!password) throw new Error('Enter your password to confirm deletion.');
      if (!confirm('Permanently delete your account and all cloud journals and images?')) { feedback.textContent = ''; return; }
      await post('/auth/delete-user', { password }); stopSync(); rememberAccount(null); accountChanged(); location.assign('/');
    }
  })));
}
