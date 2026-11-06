---
type: architecture
title: Jangie's Website — Architecture (v2 3D Journal)
project: Jangie's Website
tags: [architecture, 3d-book, neon, r2, workers]
last_updated: 2026-11-05
---

# Architecture — v2 Customizable 3D Journal

## Current hosting (2026-11-05)
Dear Days runs at https://dear-days.pages.dev on Cloudflare Pages: Vite static assets plus a
Pages Function (`functions/api/[[path]].ts`) running the Hono API. `MyJournal/wrangler.jsonc` binds private
R2 `journal-assets-prod` as `JOURNAL_FILES`; runtime secrets are separate from the
public build. `/api/*` runs through the Worker and is excluded from the service
worker navigation fallback. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Fonts
All 33 selectable families and the Noto Sans KR fallback are self-hosted under
`public/fonts/`. Local CSS/WOFF2 files, package versions and original licenses are
committed. `scripts/vendor-fonts.ts` performs explicit build-time refreshes from
Fontsource npm archives with integrity verification. Runtime uses no font CDN.
The PWA precaches every font subset, including Korean, for offline selection.

## Layout of the repo (target)
```
MyJournal/
  index.html            app shell
  src/
    main.ts             boot, router (login ↔ book)
    state/              store.ts (single store + subscribe), schema.ts (types)
    book/               Book.ts, Leaf.ts, Tabs.ts, flip.ts, Bookmark.ts
    canvas/             PageCanvas.ts, Element.ts, transform.ts (drag/rotate/scale)
    frames/             frames.ts (frame registry), tear.ts (tear tool)
    stickers/           generatedPacks.ts, legacy SVG definitions, StickerTray.ts
    customize/          CoverPanel.ts, PaperPanel.ts, BackgroundPanel.ts
    login/              Chibi.ts, ChibiEditor.ts, chibiStore.ts, chibiOptions.ts, art/ (layered SVG)
    sync/               local.ts (IndexedDB), api.ts, sync.ts (queue)
    styles/             tokens.css, book.css, paper.css, frames.css, login.css
  api/                  Cloudflare Worker (Hono + Better Auth)
    src/index.ts        routes, owner guards, quota/CAS writes
    src/auth.ts         verified email/password sessions and deletion hooks
    src/email.ts        bounded Gmail SMTP transport
    migrations/*.sql    generated auth + application schema
  scripts/              explicit migrations, live checks, font vendoring
  public/fonts/         local WOFF2/CSS + licenses/version manifest
  public/stickers/generated/  30 original transparent PNG assets
  .env / .env.example
```

## The 3D book (CSS 3D, not WebGL)
- `.desk` (background) → `.book` (`perspective: 2000px`, `transform-style: preserve-3d`).
- Book = front cover + back cover + spine + a stack of **leaves**. Each leaf is one DOM node
  with two faces (`.face-front`, `.face-back`, `backface-visibility: hidden`), hinged on the
  spine with `transform-origin: left center`. Flipping = `rotateY(0 → -180deg)`.
- Only the **visible spread ± 2 leaves** are mounted. Pages further away are drawn as a
  CSS "page edge" stack (repeating gradient) so 200 pages cost nothing.
- **Tabs** are children of the first leaf of each section, positioned on the fore-edge,
  staggered vertically, colored per section. Clicking one flips forward/back to that leaf.
- **Multi-page jump**: animate at most 5 leaves with 60 ms stagger (a "riffle"), then swap
  the real target spread in. Long jumps look like a riffle, not 80 sequential flips.
- Flip shading: a gradient overlay on the turning face whose opacity follows the angle.

## Page canvas
- Each page face holds a `PageCanvas`: paper background + absolutely positioned elements.
- Positions stored in **page units** (0–1 of page width/height) so pages scale to any screen.
- Elements: `text`, `photo`, `sticker`, `tape`, `drawing`. Each has `x, y, w, rot, z`.
- One transform controller (pointer events) for drag / rotate handle / resize handle / pinch.

## Frames and the tear tool
- A frame is a pure render function `(photoEl, options) → DOM/CSS`. Registry in `frames.ts`.
- **Tear** is non-destructive: the user drags a path across the photo; we smooth it,
  add jagged noise, and store it as a normalized polygon. Rendered with an SVG `clipPath`
  plus a white fibrous edge (offset copy of the edge) and a soft shadow. Original image
  is never modified, so “reset tear” always works.

## Data model (Neon)
Better Auth manages `user`, `session`, `account`, `verification`, and `rateLimit`.
Generated auth SQL is recorded in `api/migrations/000-auth.sql`. Application SQL
is in `api/migrations/001-journal.sql`:

```
journal_books(user_id, id, doc jsonb, bookmark jsonb, version, mutation_id, updated_at)
journal_assets(user_id, id, meta jsonb, bytes, r2_key, state[pending|ready], created_at)
journal_account_state(user_id, deleting)
```
Book and asset keys are composite `(user_id, id)`. User deletion cascades rows.
Whole `BookDoc` snapshots preserve the existing client model while server CAS
revisions protect against lost edits and carry deletions without tombstones.
`book.revision` remains a separate local IndexedDB CAS counter.

## Storage + sync
- Guest journals retain `mlw_v2`; accounts use `mlw_v2_user_<immutable-user-id>`.
  Draft recovery keys are owner-scoped. Login/logout reloads reset module caches.
- Each edit commits locally first. Cloud metadata stores acknowledged canonical
  snapshot hash, server version, and a durable mutation ID. Lost responses retry
  idempotently; server updates compare the submitted base version transactionally.
- Concurrent device edits return 409; local content is retained. Account controls
  offer local download, a separately remapped journal, and explicit cloud reload.
- Clean remote caches refresh before the editor mounts. Background changes prompt
  reload instead of replacing an active editor. Metadata-only asset and bookmark
  edits trigger independent sync. Remote image bytes download lazily into IDB.
- Explicit device-journal import preserves the guest original and includes pending
  text/caption recovery. Conflicting recovery is retained for export.
- Uploads are reserved under an owner lock with 10 MB/file and 500 MB/account
  limits. The authenticated Worker validates size/type and writes immutable R2
  originals through its native binding. Download routes verify ownership and use
  private/no-store responses. No public bucket access or browser-held R2 keys.
- Account deletion durably marks the owner as deleting under the same write lock,
  removes recorded media, then deletes the account. Failed media deletion leaves
  the account retryable while rejecting new writes.

## Authentication and email
Better Auth handles verified email/password signup, sessions, reset and deletion.
The emailOTP plugin replaces new verification/reset links with six-digit codes: hashed
storage, 600-second expiry, five guesses, rotated resends, and one-time consumption.
Password sign-in remains the login method; passwordless OTP login is disabled.
The existing verification table stores challenges; no schema migration is needed.
New link reset requests are disabled; outstanding legacy reset tokens remain usable.
Gmail SMTP uses TLS on port 465 and a Google App Password. Nodemailer receives a
request-scoped TLS socket connected directly by hostname; its default IP-resolved
path was rejected by the Worker proxy. Email tasks use `waitUntil`, bounded socket
timeouts, and sanitized errors. Database pools close after each API request;
server-side session identity and an expected-account header prevent stale tabs
from syncing one user's data under another user's cookies.

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
POST /api/auth/delete-user         password-confirmed account and media deletion
```
GET|PUT /api/account/chibi         the account's chibi look (newest updatedAt wins)
```
v1 import remains a separate unfinished phase.
```
