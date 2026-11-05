/* Old dear-days Worker address: forwards visits to the new public URL, keeping path and query
   (so verification/reset links already emailed still work). Installed copies of the app get a
   replacement service worker that removes the old offline shell and opens the new address. */
const TARGET = 'https://dear-days.pages.dev';

const RETIRE_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) await caches.delete(key); // app-shell caches only; journals in IndexedDB are untouched
  await self.registration.unregister();
  for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate('${TARGET}' + new URL(client.url).pathname);
})()));`;

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname === '/sw.js') return new Response(RETIRE_SW, { headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' } });
    return new Response(null, { status: 302, headers: { Location: TARGET + url.pathname + url.search, 'Cache-Control': 'no-store' } });
  },
};
