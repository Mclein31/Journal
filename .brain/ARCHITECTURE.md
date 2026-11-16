---
type: architecture
title: Jangie's Website — Architecture (v2 3D Journal)
project: Jangie's Website
tags: [architecture, 3d-book, neon, r2, cloudflare-pages]
last_updated: 2026-11-16
---

# Architecture — v2 Customizable 3D Journal (Dear Days)

## Hosting
Dear Days runs at https://dear-days.pages.dev on Cloudflare Pages: Vite static assets (`dist/`,
with `public/_headers`) plus a Pages Function (`functions/api/[[path]].ts`) mounting the Hono API
for `/api/*`. `MyJournal/wrangler.jsonc` is the Pages config; it binds private R2
`journal-assets-prod` as `JOURNAL_FILES` and holds public vars. Runtime secrets are Pages secrets.
`/api/*` is excluded from the service-worker navigation fallback. The old workers.dev Worker is
`MyJournal/redirect/` (302 redirect + retiring `sw.js`). See [DEPLOYMENT.md](DEPLOYMENT.md).

## Repository layout (actual, 2026-11-16)
```
MyJournal/
  index.html              app shell
  vite.config.ts          Vite + vite-plugin-pwa (injectManifest, 3 MiB per-file precache limit)
  wrangler.jsonc          Cloudflare Pages config (R2 binding, public vars)
  src/
    main.ts               boot: account/guest, store init, book mount, sync start
    sw.ts                 hand-written service worker (Workbox modules)
    state/                schema.ts (types), store.ts (store, undo/redo, autosave), seed.ts
    book/                 Book.ts, PageView.ts, layout.ts, flip.ts, pageCurl.ts, Tabs.ts,
                          SectionManager.ts, bookmark.ts
    canvas/               Canvas.ts (gestures/selection/editing), elements.ts (store ops)
    frames/               frames.ts (registry), FrameMenu.ts, tear.ts (geometry), TearTool.ts
    stickers/             generatedPacks.ts (30 PNGs), packs.ts/extraPacks.ts/studioPacks.ts
                          (legacy SVG lookup for saved pages), StickerTray.ts
    customize/            CustomizePanel.ts, backgrounds.ts
    fonts/                fonts.ts (catalog/loader), FontMenu.ts, highlight.ts (marker/pen SVG)
    login/                Chibi.ts, ChibiEditor.ts, chibiStore.ts, chibiOptions.ts, bookLook.ts,
                          caret.ts, chibi.css, art/ (layered SVG)
    account/              ui.ts (login/signup/codes/account panel), api.ts, login.css, account.css
    sync/                 local.ts (IndexedDB), cloud.ts (cloud sync client), assetUrls.ts
    ui/                   icons.ts, logo.ts, picker.ts, toast.ts, saveConflict.ts
    audio/paper.ts        CC0 paper sounds
    pwa/install.ts        install button / iOS steps
    util/image.ts         client-side image compression
    styles/               tokens, book, canvas, desks, frames, polish, stickers, textures CSS
  api/                    Hono + Better Auth app (used by the Pages Function)
    src/index.ts          routes, owner guards, quota/CAS writes
    src/auth.ts           Better Auth config (email/password + emailOTP)
    src/email.ts          bounded Gmail SMTP transport
    src/db.ts             request-scoped pools, account write lock
    src/env.ts, src/validation.ts   env typing, zod schemas (incl. chibiSchema)
    migrations/           000-auth.sql, 001-journal.sql, 002-chibi.sql
  functions/api/[[path]].ts   Pages Function entry (`hono/cloudflare-pages`)
  redirect/               old workers.dev redirect Worker (own wrangler.jsonc)
  scripts/                migrate.ts, live-smoke.ts, vendor-fonts.ts
  tests/                  *.test.mjs (Node test runner, linkedom + fake-indexeddb), backend/
  public/                 fonts/, icons/, sounds/, stickers/generated/ (30 PNGs), _headers
  validation/             evidence: previews, HTTP/font checks, sticker generation records
  legacy/                 v1 app (source for the pending v1 importer). Do not delete.
```

## The 3D book (CSS 3D, not WebGL)
- Spread k shows `pages[2k] | pages[2k+1]`; sections always get pages in pairs.
- At rest, visible elements render once on a shared spread canvas (`PageView.renderSpreadCanvas`)
  over both pages; storage keeps per-page coordinates. A pointer-transparent `.spread-crease`
  shades items crossing the spine. The shared canvas clips only its outer rectangle.
- Turns: static pages swap under temporary leaf nodes (`flip.ts`). Paper is a developable surface:
  24 flat full-height strips per turn (10 per riffle leaf), curvature a function of x only
  (`pageCurl.ts`), half-Lambert lighting, projected cast shadow, 2400px perspective. Covers stay rigid
  and keep WAAPI timeline synchronization. Drag follows the pointer via rAF-eased `DragLeaf.follow`.
- Multi-page jumps animate a riffle (max 5 leaves). Book starts closed; `OPEN_MS` must match `--open-ms`.
- Tabs sit on the fore-edge (behind = left, ahead = right) and on the closed cover.

## Page canvas
- Positions are stored in **page units** (0–1 of page width/height); text boxes are always one page wide (`w=1`).
- Elements: `text`, `photo`, `sticker` (and tape/drawing in the schema). Each has `x, y, w, rot, z`.
- One transform controller (pointer events) for drag / corner scale+rotate / pinch; selection
  controls live on a stage overlay. Items crossing the spine change owner page by center position.
- Keyboard canvas accessibility (`Canvas.ts`, `PageView.ts`, `canvas.css`):
  - Visible non-ghost elements have `tabindex="0"`, `role="group"`, `aria-label` (`elementLabel`), and
    `aria-selected`, with a `.el:focus-visible` ring (`2.5px solid var(--accent-deep)`). Decorative
    `.slot-left` peek items in single-page mode and `[data-ghost]` copies are `tabindex="-1"` / `aria-hidden="true"`.
  - **Select**: `Tab` / `Shift+Tab` (or `Arrow` keys when deselected on stage; `ArrowUp`/`ArrowDown`
    from idle) cycles visible elements without trapping focus (`Tab` moves past the last element into
    `.el-bar` and out to book navigation; `Shift+Tab` on the first element exits back out). `Enter` or
    `Space` selects a focused deselected element.
  - **Move**: `Arrow` keys move by 2% of page size (`Shift+Arrow` by 8%), clamping at page boundaries
    and transferring spine ownership in spread mode.
  - **Resize & rotate**: `Alt+Arrow` (or `Cmd/Ctrl+Arrow`, plus `Shift` for bigger steps) resizes
    photo/sticker width (`4%`/`12%`) or scales `data.text.size` (`10%`/`25%`) while preserving `w=1`.
    `[` / `]` rotates by 5° (`Shift` 15°).
  - **Actions, delete, deselect, history**: `Enter` edits text/caption (or opens `.el-bar` for
    stickers/plain photos), `F10` focuses `.el-bar` (`ArrowLeft`/`ArrowRight` between buttons, `Escape`
    returns to element), `Delete`/`Backspace` deletes, `Escape` deselects while keeping element focus,
    `Cmd/Ctrl+D` duplicates, `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` undoes/redoes, and `T` on
    a photo opens the tear tool.
  - Every action updates a polite live region (`.canvas-live`, `role="status"`, `aria-live="polite"`).

## Frames and the tear tool
- A frame is a registry entry in `frames.ts`; 12 styles.
- Tear is non-destructive: drag path → RDP simplify → seeded midpoint roughening → split via
  `polygon-clipping` → kept polygon stored as `data.photo.clip`; rendered with clip-path and a fiber rim.
- Keyboard tear alternative (`TearTool.ts`, `tear.ts`): `T` on a selected photo (or `Frame` → `Torn ✂`,
  or `.el-bar [data-cmd="tear"]` on a torn photo) opens `TearTool`. Inside the modal, `✂ Tear edge`
  (`T`) generates deterministic `presetCut` angles across the remaining shape's bounding box with
  numbered SVG piece labels (`1` / `2`), `Keep piece 1` / `Keep piece 2` (`1` / `2` keys) choose a
  piece, `Roughness` adjusts jaggedness, `Escape` cancels preview then closes, and `Done` commits one
  undoable `photo:tear` update and restores element focus.

## Data model (Neon)
Better Auth manages `user`, `session`, `account`, `verification`, `rateLimit`
(`api/migrations/000-auth.sql`). Application SQL (`001-journal.sql`, `002-chibi.sql`):

```
journal_books(user_id, id, doc jsonb, bookmark jsonb, version, mutation_id, updated_at)
journal_assets(user_id, id, meta jsonb, bytes, r2_key, state[pending|ready], created_at)
journal_account_state(user_id, deleting, chibi jsonb)
```
Keys are composite `(user_id, id)`; user deletion cascades. Whole `BookDoc` snapshots use server CAS
versions; `book.revision` is a separate local IndexedDB CAS counter.

## Storage + sync
- Guest journals use IndexedDB `mlw_v2`; accounts use `mlw_v2_user_<immutable-user-id>`. Draft
  recovery keys are owner-scoped. Login/logout reloads reset module caches.
- Each edit commits locally first. Cloud metadata stores the acknowledged snapshot hash, server
  version and a durable mutation ID; lost responses retry idempotently; the server compares the
  submitted base version transactionally. Conflicts (409) keep local content; account controls offer
  download, a separately remapped journal copy, or explicit cloud reload.
- Clean remote caches refresh before the editor mounts; background changes prompt a reload instead
  of replacing an active editor. Bookmark and asset metadata sync independently; remote image bytes
  download lazily into IndexedDB.
- Guest-journal import is explicit and preserves the guest original.
- Uploads: owner lock, 10 MB/file and 500 MB/account, size/type validation, immutable R2 originals via
  the native binding; downloads verify ownership and are private/no-store. No browser-held R2 keys.
- Account deletion marks the owner as deleting under the write lock, removes media, then deletes the
  account; failed media deletion leaves it retryable while rejecting new writes.
- Device-only (not account-scoped) localStorage: `dd:chibi`, `dd:book-look`, `dd:book-look-desk`,
  `dd:guest-warning-dismissed`.

## Authentication and email
Better Auth handles verified email/password signup, sessions, reset and deletion. The emailOTP
plugin sends six-digit codes for verification and reset: hashed storage, 600-second expiry, five
guesses, rotated resends, one-time consumption. Password sign-in remains the login method;
passwordless OTP sign-in and new reset links are disabled; outstanding legacy reset tokens remain
usable. Gmail SMTP uses TLS on port 465 with a Google App Password; Nodemailer gets a request-scoped
TLS socket connected by hostname (the default IP-resolved path was rejected by the Worker proxy).
Email tasks use `waitUntil`, bounded timeouts and sanitized errors. DB pools close after each
request. Server-side session identity plus an expected-account header stop stale tabs syncing one
user's data under another user's cookies.

## API
```
/api/auth/*                        Better Auth handlers
GET  /api/health                   public liveness
GET  /api/books                    owner-scoped journal list
GET  /api/books/:id                snapshot, bookmark, version, mutation ID
POST /api/sync                     validated snapshot CAS + idempotent mutation
GET  /api/assets                   owner-scoped media metadata
POST /api/assets                   reserve quota / update archive metadata
PUT  /api/assets/:id/content       validated immutable original upload
GET  /api/assets/:id/content       authenticated private media download
GET  /api/account/export           journals + media metadata (frontend adds ZIP files)
GET|PUT /api/account/chibi         the account's chibi look (newest updatedAt wins)
POST /api/auth/delete-user         password-confirmed account and media deletion
```
v1 import is not implemented yet.

## Fonts
All 33 selectable families plus Noto Sans KR are self-hosted under `public/fonts/` (CSS, WOFF2,
licenses, version manifest). `scripts/vendor-fonts.ts` (`npm run fonts:vendor`) refreshes them from
Fontsource npm archives with integrity checks. No font CDN at runtime; the PWA caches every subset.
