---
type: todo-list
title: Jangie's Website — TODO
project: Jangie's Website
tags: [todo]
last_updated: 2026-11-05
---

# TODO (details per phase in [PLAN.md](PLAN.md))

## Production service setup
- [x] Populate production values in ignored `MyJournal/.env` (Neon `production` + private R2 `journal-assets-prod` + auth + Gmail SMTP + deployed HTTPS origin). Values and deployed runtime secrets are configured; live integration and delivery verified. See `MyJournal/SMTP_SETUP.md`.
- [x] Deploy to https://dear-days.pages.dev (Cloudflare Pages; old workers.dev address redirects); see [DEPLOYMENT.md](DEPLOYMENT.md).
- [x] Implement and verify backend wiring, additive migrations, real Gmail email delivery, verified login/reset, private R2 uploads, and CAS cloud sync (Phase 10).

## Now
- [ ] Deploy masculine options + new login layout + new logo (`npm run deploy`) — awaiting user approval
- [x] Gender-neutral character + neutral app palette deployed to https://dear-days.pages.dev (2026-11-05, user approved)
- [x] Apply `002-chibi.sql` to Neon production (2026-11-05, user approved)
- [x] Pages project `dear-days` + 5 secrets + deploy; full `npm run test:live` with browser passes on https://dear-days.pages.dev
- [x] Old workers.dev address redirects to the new URL
- [x] Removed the 5 unused secrets from the old redirect Worker (2026-11-05). Worker commands need `--config redirect/wrangler.jsonc` because `MyJournal/wrangler.jsonc` is the Pages config.
- [ ] Real-device check of chibi eye tracking (touch/caret) on iOS Safari + Android Chrome
- [x] Phase 0 — scaffold, schema, store, IndexedDB, seed (verified: reload keeps state)
- [~] Phase 1 — DONE: closed book + open/close cover, spread/single layouts, pull tabs (left/right + on closed cover), flip, riffle, swipe, arrows, section manager, add pages.
  - [x] Drag a page to flip by hand (follows pointer, completes past 50% or on flick, falls back otherwise)
  - [ ] Test on real iOS Safari + Android Chrome
  - [ ] Watch: view jumped to spread 0 twice during scripted tests; not reproducible on demand

## Done this session (outside the phase plan)
- [x] Installable PWA (offline) + responsive layout for all screen sizes
- [ ] Test install on a real iPhone (Add to Home Screen) and Android (Install prompt)

## Next
- [x] Phase 2 — 🎨 Style sheet: 12 cover colors + custom picker, 7 textures, cover title, 4 paper types, 6 paper tints; live preview, saved
  - [x] Per-page paper override → Customize → Paper → This page only (2026-11-05)
- [x] Phase 3 — Desk backgrounds: 9 CSS presets + upload your own set (compressed, IndexedDB), fill/tile, delete; in the 🎨 Style sheet
- [x] Phase 4 — Page canvas: add photo (button/drop/paste), add text (button/double-tap), drag, corner knob scale+rotate (Shift=15°), pinch, front/back/duplicate/delete, undo/redo (buttons + ⌘Z/⇧⌘Z), saved
- [x] Phase 5 — 12 frames (plain, polaroid, instant mini/wide, photocard w/ sheen, washi tape, film, stamp, scalloped, heart, circle, torn) + 6 frame colors + editable captions; 🖼 picker on selected photo
- [x] Phase 6 — Freehand tear tool: drag across photo → ragged tear (RDP + seeded midpoint displacement) → tap piece to keep; repeat; roughness slider; undo/reset; saved as clip polygon (non-destructive); white fiber edge on page
- [x] Phase 7 — 30 ChatGPT-generated transparent PNG stickers in 6 views, searchable tray with recents, upload/remove/restore, effects (die-cut outline, glossy, glitter, none); legacy SVG IDs resolve on saved pages
- [x] Phase 8 — 🔖 ribbon bookmark (on page / tail peeking toward it / under closed cover, tap to jump), opens straight to bookmark with "Welcome back" toast, typing drafts survive closing the tab mid-sentence
- [x] Carry-over across the spine (user request): items past the spine are drawn on the facing page too (aligned, under the gutter crease); drag across to move an item to the other page

## Later
- [x] Phase 9 — Login/signup/verify/reset screens + eye-tracking customizable chibi (editor, device + account sync); headless-browser verified 2026-11-05
- [x] Phase 10 — Neon + private R2 + Better Auth + Gmail verification/reset + conflict-safe sync, backups and account deletion; live-tested
- [ ] Phase 11 — v1 data import, QA matrix, deploy

## Backlog
- Up to 3 extra colored bookmark flags (Phase 8 optional)
- Per-section paper override UI (per-page controls already implemented)
- "Shuffle desk from my uploads" each visit (Phase 3 optional)
- Voice memos on pages · page templates · export a page as image/PDF · shared books

## Polish verification (2026-11-05)
- [x] Production/PWA build, TypeScript, 11 persistence and element regressions
- [x] Visual frame previews, custom colors, caption inspector, categorized customization
- [x] Serialized atomic autosave, durable drafts, responsive editing and selection fixes
- [ ] Final browser/device walkthrough (computer-use Chrome access rejected this session)
- [x] Repeat dependency audit (2026-11-05): no high/critical; 2 low + 8 moderate transitive build-tool findings remain

## Functional follow-up (2026-11-05)
- [x] Font switching, empty-box font controls, uploaded-sticker removal/restore
- [x] 48 additional original stickers and cross-category search (75 total)
- [x] Tear area conservation, gesture targeting, transparent uploads, mobile install control
- [x] 37 automated unit/integration checks, TypeScript and production/PWA build
- [ ] Actual browser font/rendering, native gestures, offline/service-worker and physical install verification

- [x] Text style controls: preset/custom ink and highlights, underline, strikethrough; persistence and undo/redo verified (39 tests total).

## Continuous spread and refined art (2026-11-05)
- [x] Two-page default, remembered one-page toggle, continuous single-instance spread editing
- [x] Center crease shading across text/photos/stickers and imperfect marker backgrounds
- [x] 27 refined Studio/Flowers designs including white roses, white lilies, white orchids
- [x] 46 automated checks, TypeScript, production/PWA build; contact-sheet artwork preview inspected
- [ ] Native browser/device visual and touch confirmation (previous access restriction still applies)

## Final 30-sticker collection (2026-11-05)
- [x] Exactly 30 image-generated transparent stickers, including neutral everyday/nature/adventure subjects and all three requested white florals
- [x] Curated categories/search, legacy saved-art compatibility, upload removal/restore
- [x] All 81 automated checks, TypeScript, production/PWA build, all 30 assets present in precache manifest
- [x] Visually review all 30 generated assets in the contact sheet
- [ ] Real browser/device rendering, touch, native install and offline runtime QA (Chrome access denied)
- [x] Push focused commits to `https://github.com/Mclein31/Journal.git` (`main` tracks `origin/main`)

## QA continuation and tactile refinements (2026-11-05)
- [x] Reproduced and fixed navigation/bookmark/section focus, drop handling/ownership, async upload and background-batch bugs
- [x] Caption lifecycle recovery, connected editors and Undo after successful/failed saves
- [x] Reject stale/simultaneous writers atomically; preserve conflicting recovered words for download; validate actual boot recovery
- [x] Clip artwork at the outer book boundary while preserving spine crossing (user screenshot)
- [x] Natural underline/strikethrough pressure variation, textured marker ink, page/frame/sticker grain
- [x] 128 automated checks, TypeScript, production/PWA build, HTTP checks of shell/manifest/worker/all 30 PNGs
- [x] Professional QA matrix and findings recorded in `QA_REPORT.md`
- [ ] Native browser/device/installation/offline and full accessibility sign-off — see report; denied Chrome access prevents completion here
- [ ] Complete keyboard-only canvas manipulation and tear-tool alternatives before accessibility sign-off

- [x] Final user follow-ups: every text box stays one page wide regardless of corner/pinch scale (including legacy normalization), with one existing handle; Delete/Backspace and Undo/Redo work for placed stickers with the tray open while search fields and other dialogs retain keyboard ownership. Dedicated regression coverage added.

## Natural paper motion (2026-11-05)
- [x] Grab-dependent CSS3D paper bend, projected contact constraint and fold lighting; rigid cover preserved
- [x] Velocity-aware spring release, stale flick expiry, drag cancellation and catch/reversal of single turns
- [x] Correct rapid relative navigation and Previous availability, including queued multi-leaf riffles
- [x] Resize-safe facets/crops and lifecycle cleanup; delayed uploaded art preserved
- [x] Reduced-motion dragging uses flat fade; all 152 tests and production/PWA build pass
- [ ] Native Safari/Chrome motion/compositing/seams, decorated-page performance and real touch/device QA

## Accounts, sync and self-hosted fonts (2026-11-05)
- [x] Account-scoped storage and draft keys; explicit guest import; remapped conflict copies
- [x] Revision CAS, idempotent retries, offline reload recovery, independent bookmark/asset sync
- [x] Owner-scoped media, upload quota/format checks, serialized originals, retryable deletion gate
- [x] Real Gmail delivery, verification and reset links, session revocation, two-session and two-browser journal sync
- [x] Desktop/mobile login rendering and closed-book Account access in isolated headless Chromium
- [x] Bundle all 33 font choices + Korean fallback with licenses; same-origin loader and offline font precache
