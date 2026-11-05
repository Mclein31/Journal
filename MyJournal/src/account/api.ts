export interface Account { id: string; email: string; name: string; emailVerified: boolean }
export interface Session { user: Account }
let owner: string | undefined;
export const useAccount = (id?: string): void => { owner = id; };
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; this.name = 'ApiError'; }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (owner) headers.set('X-Dear-Days-Account', owner);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin', cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
    throw new ApiError(response.status, data.message ?? data.error ?? 'Could not connect to your account');
  }
  return response.json() as Promise<T>;
}
export const post = <T>(path: string, body: unknown): Promise<T> => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export async function mediaBlob(id: string): Promise<Blob> {
  const response = await fetch(`/api/assets/${encodeURIComponent(id)}/content`, { credentials: 'same-origin', cache: 'no-store', headers: owner ? { 'X-Dear-Days-Account': owner } : {}, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new ApiError(response.status, 'Could not download this image');
  return response.blob();
}
