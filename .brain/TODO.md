---
type: todo-list
title: Jangie's Website — TODO
project: Jangie's Website
tags: [todo]
last_updated: 2026-11-16
---

# TODO

The original 12-phase plan is archived in [archive/PLAN_ARCHIVE.md](archive/PLAN_ARCHIVE.md).
Phases 0–10 are done and deployed; Phase 11 is partly done (deploy done; v1 import and QA open).
Release-check details are in [QA_REPORT.md](QA_REPORT.md).

## Open

### Phase 11 — v1 import
- [ ] Import v1 data: journal entries → Journal pages (text), tasks → Schedule pages, gallery photos →
  Memories pages as polaroids. Reads the v1 backup JSON (format in [NOTES.md](NOTES.md)); v1 source in `MyJournal/legacy/`.
- [ ] Decide whether v1's English → Korean title translation returns as a Journal-section option (see DECISIONS "Carried over from v1").

### Native browser and device QA (consolidated; automated tests simulate DOM/geometry only)
- [ ] Real iOS Safari + Android Chrome: portrait/landscape, page turns and drag-to-turn, pinch/drag/cancel,
  virtual keyboard, chibi eye tracking (touch/caret).
- [ ] Desktop Chrome/Safari/Firefox painting: CSS 3D seams/backfaces, Safari clipping, masks, wrapped highlights,
  font rendering; decorated-page frame rate and memory.
- [ ] Install on a real iPhone (Add to Home Screen) and Android (install prompt); first-install/offline/update
  behavior and storage quota with the ~63 MiB precache.
- [ ] Real codec/EXIF/large-file uploads; actual recovery-file download; native clipboard/drop.
- [ ] Performance budget from the plan: flip and drag at 60 fps on a mid-range phone; first load < 300 KB JS+CSS
  gzipped excluding images (not yet measured).

### Accessibility sign-off
- [x] Keyboard-only canvas manipulation (select/move/resize) and keyboard alternatives for the tear tool. *(Done 2026-11-16: implemented focusable elements with `:focus-visible` ring, non-trapping `Tab`/arrow selection, `Arrow`/`Shift+Arrow` move, `Alt+Arrow` resize preserving `w=1` text invariant, `[`/`]` rotate, `F10`/toolbar navigation, `Delete`/`Escape`, `.canvas-live` polite announcements, `T` shortcut + `TearTool` `Tear edge`/`Keep piece 1`/`2` keyboard controls; pointer behavior and `prefers-reduced-motion` preserved; verified with `npm run typecheck`, `npm test` (188/188), and `npm run build`.)*
- [ ] Screen-reader walkthrough (tabs as named buttons, page turns announced), zoom/reflow, forced-colors and
  reduced-motion rendering.

### Known issue to watch
- [ ] View jumped to spread 0 twice during early scripted tests (Phase 1); never reproduced on demand.

### Housekeeping
- [x] Remove the unused v1-era `MyJournal/netlify.toml` and `MyJournal/vercel.json` (hosting is Cloudflare
  Pages; both mark every `*.js` immutable, which would also catch `sw.js`). *(Done 2026-11-16: confirmed Cloudflare Pages hosting in `MyJournal/wrangler.jsonc`, `MyJournal/public/_headers` and `.brain/`; verified no script, workflow or active doc references them; deleted both files and removed the layout entry in `ARCHITECTURE.md`.)*
- [x] `MyJournal/.env.example` comment still says images are served via signed URLs; media actually go through
  authenticated Worker routes with the native R2 binding. *(Done 2026-11-16: verified `PUT`/`GET /api/assets/:id/content` in `MyJournal/api/src/index.ts` and `mediaBlob` in `MyJournal/src/account/api.ts`; updated `MyJournal/.env.example` comment to describe authenticated `/api/assets/:id/content` routes over the native `JOURNAL_FILES` R2 binding.)*
- [ ] Optional: `/impeccable init` to capture PRODUCT.md for future design work.

## Backlog
- Up to 3 extra colored bookmark flags.
- Per-section paper override UI (per-page override exists).
- "Shuffle desk from my uploads" each visit.
- Voice memos on pages · page templates · export a page as image/PDF · shared books.

## Done

### Production and backend (2026-11-05 to 2026-11-06)
- [x] Production values in ignored `MyJournal/.env` (Neon `production`, R2 `journal-assets-prod`, auth, Gmail SMTP, HTTPS origin); runtime secrets configured.
- [x] Phase 10: Better Auth accounts, additive migrations, real Gmail delivery, private R2 uploads, CAS cloud sync, backups, account deletion; live-tested.
- [x] Deployed to https://dear-days.pages.dev (Cloudflare Pages project `dear-days` + 5 secrets); full `npm run test:live` with browser passes; old workers.dev address redirects; old Worker secrets removed (2026-11-05).
- [x] Applied `002-chibi.sql` to Neon production (2026-11-05, user approved).
- [x] Six-digit email codes for verification and password reset, deployed and live-verified (Pages `b1197300`, 2026-11-06).
- [x] Self-hosted all 33 font choices + Korean fallback with licenses; offline font precache verified live.
- [x] Account-scoped storage/draft keys, explicit guest import, remapped conflict copies; owner-scoped media and quotas; two-session and two-browser sync verified.

### Login and character (2026-11-05)
- [x] Phase 9: login/signup/verify/reset screens + eye-tracking customizable chibi (editor, device + account sync).
- [x] Gender-neutral character and neutral app palette; masculine options, bandana, facial hair; new login layout, logo and guest disclaimer (Pages `40a0b80e`).
- [x] Login journal mirroring (Pages `3e2a380c`); login audit/polish (Pages `8e27192c`); phone/tablet login scroll + smoother page turns (Pages `01d5619a`).

### Journal frontend (2026-11-04 to 2026-11-05)
- [x] Phase 0: scaffold, schema, store, IndexedDB, seed.
- [x] Phase 1: closed book + cover, spread/single layouts, pull tabs, flip, riffle, swipe, arrows, section manager, add pages, drag-to-turn.
- [x] Phase 2: cover colors/textures/title, 4 paper types, 6 tints; per-page paper override.
- [x] Phase 3: 9 desk presets + uploads (fill/tile, delete).
- [x] Phase 4: page canvas (photo/text add, drag, scale/rotate, pinch, layers, duplicate, undo/redo).
- [x] Phase 5: 12 frames, frame colors, editable captions.
- [x] Phase 6: freehand tear tool (non-destructive clip polygon, roughness, undo/reset).
- [x] Phase 7: 30 image-generated transparent PNG stickers, search/categories, upload/remove/restore, effects; legacy SVG IDs still resolve.
- [x] Phase 8: ribbon bookmark, "Welcome back" resume, typing drafts survive closing the tab; carry-over across the spine.
- [x] Installable PWA + responsive layout; two-page default with remembered one-page toggle; continuous spread editing.
- [x] Fonts/ink/highlight/underline/strikethrough text styles; text boxes always one page wide.
- [x] Conflict-safe local saves (revision CAS, recovery quarantine) and QA-01..QA-18 fixes (see QA_REPORT).
- [x] Grab-dependent paper bend, spring release, interruptible turns; flat-strip mesh with 0 long frames in headless measurement.
- [x] Dependency audit: no high/critical findings (six low/moderate in build tooling remain).
- [x] Focused commits pushed to `https://github.com/Mclein31/Journal.git` (`main` tracks `origin/main`).
