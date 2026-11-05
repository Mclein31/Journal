/* The chibi is saved on this device (so the login screen shows yours before sign-in) and to the account. */
import type { ChibiConfig } from '../state/schema';
import { api } from '../account/api';
import { normalizeChibi } from './chibiOptions';

const KEY = 'dd:chibi';
export const CHIBI_EVENT = 'dd:chibi-change';

export function loadChibi(): ChibiConfig {
  try { return normalizeChibi(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return normalizeChibi(null); }
}
function store(config: ChibiConfig): void {
  try { localStorage.setItem(KEY, JSON.stringify(config)); } catch { /* Private mode: the look still applies for this visit. */ }
  dispatchEvent(new CustomEvent<ChibiConfig>(CHIBI_EVENT, { detail: config }));
}

/** Saves locally; when signed in also saves to the account. Resolves to whether the account copy is current. */
export async function saveChibi(config: ChibiConfig, signedIn: boolean): Promise<boolean> {
  const saved = normalizeChibi({ ...config, updatedAt: Date.now() });
  store(saved);
  if (!signedIn) return false; // the newer device look is pushed by syncChibi after sign-in
  return push(saved);
}
async function push(config: ChibiConfig): Promise<boolean> {
  try {
    const { chibi } = await api<{ chibi: unknown }>('/account/chibi', { method: 'PUT', body: JSON.stringify(config) });
    const current = normalizeChibi(chibi);
    if (current.updatedAt > config.updatedAt) store(current);
    return true;
  } catch { return false; } // retried by syncChibi at the next signed-in start
}

/** After sign-in: the newer of the device and account looks wins on both sides. */
export async function syncChibi(): Promise<void> {
  const local = loadChibi();
  let remote: ChibiConfig | null = null;
  try {
    const { chibi } = await api<{ chibi: unknown }>('/account/chibi');
    remote = chibi ? normalizeChibi(chibi) : null;
  } catch { return; } // offline: keep the device look and retry next time
  if (remote && remote.updatedAt >= local.updatedAt) { if (remote.updatedAt > local.updatedAt) store(remote); return; }
  if (local.updatedAt > 0) await push(local);
}
