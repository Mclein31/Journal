import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// legacy/ is the v1 app, kept only for reference and the Phase 11 importer (never built).
export default defineConfig({
  server: { port: 5173 },
  build: { target: 'es2022', sourcemap: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', // new versions install in the background, apply on next open
      injectRegister: false, // registered in src/pwa/install.ts
      includeAssets: ['icons/*.png', 'icons/icon.svg', 'sounds/*.mp3', 'sounds/CREDITS.txt'],
      manifest: {
        id: '/',
        name: 'Dear Days',
        short_name: 'Dear Days',
        description: 'A customizable 3D journal — write, paste photos, tear, and decorate.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        background_color: '#ecd5bc',
        theme_color: '#3e5568',
        categories: ['lifestyle', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // hand-written SW (src/sw.ts): Workbox's generateSW breaks on the apostrophe in this folder's path
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,txt,woff2}'],
        // Keep the complete high-resolution sticker collection available offline.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
});
