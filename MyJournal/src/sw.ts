/// <reference lib="webworker" />
/* Service worker (bundled by vite-plugin-pwa, injectManifest strategy).
   Hand-written instead of generateSW because Workbox's generator breaks on the apostrophe
   in the project path ("Jangie's Website"). Excluded from the main tsconfig (DOM vs WebWorker libs). */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

// autoUpdate: a new version takes over as soon as it's installed
self.skipWaiting();
clientsClaim();

const manifest = self.__WB_MANIFEST;
const fonts = manifest.filter((entry) => new URL(typeof entry === 'string' ? entry : entry.url, self.location.href).pathname.startsWith('/fonts/'));
// Workbox intentionally precaches sequentially. Korean subsets would make a
// first install take minutes, so fonts use their own bounded parallel installer.
const fontCache = crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(fonts))).then((hash) =>
  'dear-days-fonts-' + [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join(''));
precacheAndRoute(manifest.filter((entry) => !fonts.includes(entry)));
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api(?:\/|$)/] }));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(await fontCache);
    let next = 0;
    const save = async () => {
      while (next < fonts.length) {
        const entry = fonts[next++];
        const url = new URL(typeof entry === 'string' ? entry : entry.url, self.location.href).href;
        if (await cache.match(url)) continue;
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error('Could not cache a local font');
        await cache.put(url, response);
      }
    };
    await Promise.all(Array.from({ length: 6 }, save));
  })());
});

registerRoute(({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/fonts/'), async ({ request }) => {
  const cache = await caches.open(await fontCache);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
});

// Drop obsolete third-party font caches after upgrading to self-hosted assets.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const current = await fontCache;
    await Promise.all((await caches.keys()).filter((name) => name === 'google-fonts-css' || name === 'google-fonts-files' || (name.startsWith('dear-days-fonts-') && name !== current)).map((name) => caches.delete(name)));
  })());
});
