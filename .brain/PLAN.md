---
type: plan
title: Jangie's Website — v2 Execution Plan
project: Jangie's Website
tags: [plan, roadmap]
last_updated: 2026-11-04
---

# v2 Execution Plan — Customizable 3D Journal

## How the work is ordered
The book is the foundation everything sits on, so it ships first and without a backend.
Each phase ends with something you can open and use. The backend (Neon + R2 + login)
comes after the book works fully offline, so design work is never blocked on credentials.

| # | Phase | Ships | Est. |
|---|-------|-------|------|
| 0 | Foundation | Vite/TS app, data model, local storage | 2 d |
| 1 | 3D book + pull tabs + flip | Book you can open and flip through | 4 d |
| 2 | Book customization | Cover color/texture, paper type | 2 d |
| 3 | Backgrounds | Desk presets + uploads | 1 d |
| 4 | Page canvas + draggable photos | Drop, drag, rotate, resize | 4 d |
| 5 | Photo frames | 8+ frame styles | 2 d |
| 6 | Freehand tear tool | Drag to tear | 3 d |
| 7 | Stickers | Packs, tray, uploads | 2 d |
| 8 | Bookmark + autosave | Continue where you left off | 1 d |
| 9 | Login + chibi | Eye-tracking, customizable chibi | 4 d |
| 10 | Backend (Neon + R2 + auth + sync) | Accounts, cross-device | 4 d |
| 11 | Migration, QA, deploy | v1 data imported, live site | 3 d |

Total ≈ 32 working days. Phases 2, 3 and 9 can run in parallel with 4–7 if two agents work on it.

---

## Phase 0 — Foundation
**Goal**: a clean modular codebase the rest can build on.
- Set up Vite + TypeScript in `MyJournal/`; move v1 files to `MyJournal/legacy/` for reference.
- `state/schema.ts`: types for Book, Section, Page, Element, Asset, Bookmark, ChibiConfig.
- `state/store.ts`: one store with `get / update / subscribe`, undo stack (last 50 edits).
- `sync/local.ts`: IndexedDB stores `books, pages, elements, assets(blobs), meta`.
- `styles/tokens.css`: carry over the pastel palette and fonts from v1.
- Seed data: one book with 4 sections × 2 pages.
**Done when**: `npm run dev` boots, seed book loads from IndexedDB, reload keeps edits.

## Phase 1 — 3D book, pull tabs, flip animation
**Goal**: the signature interaction.
- Book DOM: front cover, back cover, spine, leaves (two faces each), page-edge stack.
- Open animation: cover swings open on first load (once per session).
- Spread view on desktop (two pages); single page on phones (< 720 px) with the same flip.
- **Pull tabs**: one per section on the fore-edge, staggered, colored, labeled.
  Hover/press → tab slides out 6 px ("pull" affordance). Click → flip to that section.
  Tabs of sections *behind* you sit on the left edge, ahead of you on the right — like a real book.
- **Flip**: `rotateY` on the leaf, 650 ms, ease `cubic-bezier(.3,.7,.2,1)`, angle-driven shading.
  Next/Prev buttons + arrow keys + swipe on touch; drag a page corner to flip by hand.
- **Riffle** for long jumps: max 5 animated leaves, 60 ms stagger.
- Input during a flip queues the next flip instead of breaking it.
- `prefers-reduced-motion`: 200 ms crossfade, no rotation.
- Section manager: rename, recolor, add, reorder, delete (with confirm).
**Done when**: you can flip page by page and jump via tabs at 60 fps on a mid-range phone.

## Phase 2 — Book customization
- **Cover color**: 12 presets + color picker. Stored per book.
- **Cover texture** (CSS/SVG noise, no big images): leather, linen, kraft, velvet,
  corduroy, holographic, plain matte. Texture overlays the color so every combo works.
- Optional cover title + small cover sticker.
- **Paper type**: lined, dotted, grid, plain. Per book, overridable per section/page.
  Paper tint (white, cream, kraft, pastel). All drawn with CSS gradients.
- Customize panel opens from a ⚙ on the desk, with a live preview on the real book.
**Done when**: every combination renders correctly in light and dark desk backgrounds.

## Phase 3 — Backgrounds (the desk)
- Presets: wood desk, pastel gradient, checker picnic, starry night, cozy bedroom blur, plain colors.
- **Upload your own**: one or many images → user's background set; pick, delete, set fit (cover / tile).
- Uploads compressed client-side, stored in IndexedDB now, R2 after Phase 10.
- Optional "shuffle from my set" each visit.
**Done when**: preset or uploaded background persists across reloads.

## Phase 4 — Page canvas + draggable photos
**Goal**: every page is a free scrapbook surface.
- Add a photo three ways: drag a file onto the page, the + Photo button, or paste.
- Photo appears where it was dropped; drag anywhere on the page with mouse or finger.
- Selected element shows: rotate handle, corner resize, delete, bring forward/back, duplicate.
- Pinch to scale and two-finger rotate on touch.
- Snap-free by default; hold Shift for 15° rotation steps.
- Elements can't be dragged fully off the page (at least 20% stays on).
- Text blocks: click empty paper to type; text sits on the paper lines for lined paper.
- Undo/redo (Ctrl/Cmd+Z, Shift+Z) for every move.
- Dragging an element never flips the page; flipping only via tabs, buttons, corner, or swipe on empty paper.
**Done when**: place 20 photos on a page, drag them around at 60 fps, reload — positions are exact.

## Phase 5 — Photo frames
Frame picker opens from the selected photo. Each frame is a registry entry, so adding more later is one file.
| Frame | Look |
|-------|------|
| None | bare photo with soft shadow |
| Polaroid | square-ish photo, thick bottom border, handwritten caption |
| Instant film (mini / wide) | tall narrow or wide card, thin even borders, caption strip |
| Photocard | rounded corners, glossy sheen sweep on hover, optional name strip |
| Torn paper | opens the tear tool (Phase 6) |
| Washi tape | photo held by 1–2 tape strips (pick tape pattern) |
| Film strip | sprocket holes, 1–3 frames |
| Postage stamp | perforated edge, optional postmark |
| Scalloped / deckle | wavy or rough-cut edge |
| Heart / circle cutout | shaped mask |
- Caption text editable on frames that have one.
- Frame border color pickable (white, cream, black, pastel).
**Done when**: every frame works with portrait, landscape, and square photos.

## Phase 6 — Freehand tear tool
**Goal**: the user decides exactly where the photo tears.
1. Choose "Torn paper" → photo enters tear mode (dimmed, crosshair cursor, hint: "Drag across the photo to tear").
2. User drags a line from one edge to another (or a closed loop). We draw a live dotted tear line.
3. On release: path is simplified (Ramer–Douglas–Peucker), then roughened with midpoint
   displacement so it looks like paper fibers, not a vector line. A "roughness" slider controls jaggedness.
4. The photo splits into two pieces along the line. User taps the piece to **keep**; the other
   drops away with a short fall animation (or keep both as separate draggable pieces).
5. Repeat for more tears (e.g. tear all four sides). Each tear intersects the current polygon.
6. Rendering: SVG `clipPath` from the polygon; a 3–4 px white "fiber" edge on torn sides
   (offset polygon + noise) and a soft drop shadow. Untorn edges keep the normal border.
7. Controls: Undo last tear, Reset to original, roughness slider, edge color (white / cream / none).
- Data: `tears: [{points: [[x,y]...], kept: 'a'|'b'}]` in page units of the photo. Original image untouched.
- Touch: works with one finger; two fingers cancel tear mode.
**Done when**: a user can drag to tear any shape, undo, reset, and the tear survives reload and resizing.

## Phase 7 — Stickers
- Sticker tray (bottom sheet on phone, side drawer on desktop) with categories:
  cute (hearts, stars, bows), food, nature, words ("today", "♡ love"), washi tapes, labels, doodles.
  All original SVG art, ~60 to start.
- Drag a sticker from the tray onto the page; then it behaves like any element (drag, rotate, scale).
- Sticker effects: glossy, glitter (animated shimmer, off under reduced motion), outline (die-cut white border).
- **Upload your own**: PNG with transparency → "My stickers". Optional auto die-cut border.
- Recently used row at the top of the tray.
**Done when**: stickers can be added, styled, uploaded, and persist.

## Phase 8 — Bookmark + continue later
- A **ribbon bookmark** hangs from the top of the spine. Drag it onto any page, or tap
  "Bookmark this page". The ribbon is visible sticking out of the book when closed.
- **Autosave**: every edit is saved within 1 s (IndexedDB) — nothing is ever lost mid-entry.
- On next visit/login: the book opens straight to the bookmarked page with a small
  "Welcome back — continuing from *Journal, p.12*" toast. If no bookmark, open to the last edited page.
- Optional: up to 3 extra colored bookmarks (sticky flags) for favorite pages.
**Done when**: write half an entry, close the tab, reopen → same page, same text, cursor in place.

## Phase 9 — Login screen + chibi
**Login screen**: the closed book on the desk, with the chibi beside it. Sign in / Sign up (email + password), "Forgot password?" link, short privacy note.
**Chibi character** (gender-neutral by default; original SVG, layered so each part swaps):
- Layers: back hair, body/outfit, head, face (eyes, brows, mouth, blush), front hair, accessory.
- **Eye tracking**: on `pointermove`, compute the angle from each eye center to the cursor;
  move the pupil along that angle, clamped inside the eye (max ~35% of eye radius), eased with
  lerp for smoothness. On phones (no cursor) eyes follow the last tap and the text caret.
- Idle life: blinks every 3–6 s at random, small breathing bob, looks around when idle 5 s.
- Cute reactions: covers her eyes with her hands while you type the password; smiles on
  successful login; small "?" face on wrong password.
- **Customization** (chibi editor, opened from the login screen and from settings):
  hair style (6), hair color, eye color, eye shape (3), skin tone (6), outfit (6),
  accessory (bow, clips, cat ears, glasses, beret, none), blush on/off.
- Config is saved locally (so the login screen shows *your* chibi before signing in) and to the account.
- Reduced motion: no bobbing; eyes still track (it's small, direct-mapped movement).
**Done when**: eyes track smoothly at 60 fps; every option combination renders without overlap glitches.

## Phase 10 — Backend: Neon + R2 + auth + sync
- `api/` Worker with Hono; Better Auth (email + password) with session cookies, open sign-up.
- Email verification + password reset emails via Gmail SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`). Use implicit TLS on port 465, a Google App Password, and a Worker-compatible transport; verify actual delivery in the deployed runtime before public signup. See `MyJournal/SMTP_SETUP.md`.
- Per-user limits: 10 MB/upload, 500 MB total; rate limits on auth routes.
- Account page: export all data (JSON + images zip), delete account (Neon rows + R2 objects).
- Neon schema + migrations from ARCHITECTURE.md. Every query scoped by `user_id`.
- R2 (private bucket): presigned PUT for uploads, short-lived signed GET for display; 10 MB per file limit; images only.
- Sync: `POST /api/sync` with validated whole-book JSONB snapshots, independent server CAS revisions and durable mutation IDs; local changes survive offline/reload and conflicting copies require review. This supersedes the initial timestamp/upsert proposal.
- First login on a device with local v2 data → offer "upload this book to my account".
- Fill in `MyJournal/.env` (keys already listed there).
**Done when**: log in on two browsers, edit in one, the other shows the change after refresh.

## Phase 11 — Migration, QA, deploy
- Import v1 data: journal entries → Journal pages (text element), tasks → Schedule pages,
  gallery photos → Memories pages as polaroids. Uses the v1 JSON backup format.
- Test matrix: Chrome, Safari, Firefox desktop; iOS Safari; Android Chrome. Touch + mouse.
- Performance budget: flip and drag at 60 fps on a mid-range phone; first load < 300 KB JS+CSS (gzipped) excluding images.
- Accessibility: tabs and pages keyboard-reachable; tabs are real buttons with names; flip announced to screen readers; all controls have labels.
- Deploy: Cloudflare Pages (frontend) + Workers (API). Update PWA service worker.

---

## Risks
| Risk | Mitigation |
|------|-----------|
| CSS 3D bugs in iOS Safari (z-fighting, flicker) | Prototype the flip on iOS in Phase 1 day 1; fallback to 2D flip if needed |
| Many photos make pages slow | Thumbnails for off-screen pages; only mount visible spread ± 2 |
| Tear polygon math edge cases | Use a tested polygon-clipping library (`polygon-clipping`) instead of hand-rolled |
| Storage quota on phones | Compress on upload; show usage; R2 offloads after login |
| Scope creep | Each phase has a "done when"; extras go to the backlog |

## Decisions (resolved 2026-11-04)
1. ~~Hosting~~ → Cloudflare Worker + static assets (decided 2026-11-04)
2. ~~Login~~ → email + password only
3. ~~Users~~ → open to the public (sign-up, verification, reset, per-user limits)
4. ~~Sections~~ → Journal · Schedule · Memories · Notes (+ custom)
