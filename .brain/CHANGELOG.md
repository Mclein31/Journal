---
type: changelog
title: Jangie's Website — Changelog
project: Jangie's Website
tags: [changelog]
last_updated: 2026-11-15
---

# Changelog

Newest first. Entries before 2026-11-05 "Production setup and Gmail SMTP configuration" (the v2 frontend build, phases 0–8 and QA passes, plus v1.2.0) are archived verbatim in [archive/CHANGELOG_ARCHIVE.md](archive/CHANGELOG_ARCHIVE.md).

## 2026-11-15 — Brain cleanup
- Verified the brain against the code, git log and a fresh `npm test` run (180 pass).
- PROJECT_CONTEXT rewritten as a concise overview with the actual stack/versions and live status; ARCHITECTURE now
  shows the real repo layout (was a pre-build "target" layout), the 24-strip page-turn mesh and the `chibi` column.
- TODO restructured into Open / Backlog / Done; duplicate native-QA items merged; v1-era `netlify.toml`/`vercel.json`
  leftovers and a stale `.env.example` comment recorded as housekeeping.
- NOTES absorbed the gotchas from the old session handoff; fixed "planned" SMTP wording.
- DECISIONS reordered newest-first; superseded entries marked (hosting, last-write-wins, signed URLs, link resets,
  portrait layout, mesh density). CHANGELOG reordered; entries before the production setup moved to
  `archive/CHANGELOG_ARCHIVE.md`. Added the missing 2026-11-06 entry.
- Archived `HANDOFF.md` and `PLAN.md` (phases 0–10 done) to `archive/`. QA_REPORT and DEPLOYMENT stale lines updated.

## 2026-11-06 — Email verification and password reset by one-time code
- Better Auth emailOTP plugin replaces verification/reset links with six-digit codes (hashed, 10-minute expiry,
  five guesses, rotated resends, one-time use); verification signs in automatically and reset revokes old sessions.
  Password login unchanged; passwordless OTP sign-in and new reset links disabled (commit `b8dfa80`).
- Deployed as Pages `b1197300`; live Gmail delivery and both code flows verified in headless Chromium (commit `a59ecd4`).
  Details in [DEPLOYMENT.md](DEPLOYMENT.md). (Entry reconstructed from git log during the 2026-11-15 cleanup.)

## 2026-11-05 — Smoother, more realistic page turns; phone/tablet login scroll fix
- Cause of dropped frames (measured with long-animation-frame entries at 4× CPU throttle): every
  turning face was a clip-path triangle, i.e. a GPU mask per face. Stalls had no script time.
- Paper model is now developable (cylindrical): curvature varies only across the page, so each
  full-height strip is flat and renders as one plain rectangle — no clip-path, no masks. Grab height
  and vertical pull shear the free edge instead of twisting it (`src/book/pageCurl.ts`).
- 24 strips per turn (10 per riffle leaf); half-Lambert lighting averaged across neighbouring strips
  (no visible bands); cast shadow follows the leaf's projected edge onto the page beneath; riffled
  blank pages now show the paper's lines/dots/grid.
- Before → after at 4× throttle: single turns 6/6 with a 50–77 ms stall → 0; 8 tab jumps 8 stalls
  (622 ms, worst 101 ms) → 0. Headless Chromium measurement; real-device check still recommended.
- Login on phones/tablets scrolls itself (body never scrolls), so Continue on this device is reachable.
- Deployed with user approval (Pages `01d5619a`); live: 0 long frames on 6 single turns + 8 tab jumps at 4×
  throttle (default journal content), and the guest option is reachable at 390×844 and 768×1024.

## 2026-11-05 — Login audit and polish (Impeccable + tasteskill)
- Audited with tasteskill inspector/lint (1440/768/390, production build) and the Impeccable detector.
  Before: 4 FAIL / 8 WARN. After: 1 FAIL / 3 WARN, all defended (user's own desk/paper drawings; the
  illustration read as "chart colours"; app-wide --bg).
- Journal and character ~2× (journal 236→~467px, character 220→~403px at 1440×900), sized from the
  viewport height so they never overlap the headline; character stands on the journal's floor; the
  Customize pill sits just above the character (own row on tablet/phone).
- Removed: eyebrow label, ✦/✎ glyphs (drawn star instead), striped overlay, hairline divider,
  outlined guest button and warning box (tone-step fills), button/panel shadows, blur, bounce easing.
- One h1 (form title); headline is a statement paragraph. Text ≥13px, inputs 16px, 44px targets,
  visible focus rings, themed selection/caret. Book page edges drawn as shapes, not offset shadows.

## 2026-11-05 — Login journal mirrors the user's book
- `src/login/bookLook.ts` keeps a device copy (`localStorage['dd:book-look']`) of the last opened journal's
  title, cover color/texture, paper type/tint, section tab colors and desk; written at boot and 600 ms after
  edits (`main.ts`). Uploaded desks get a ≤1280px JPEG copy (`dd:book-look-desk`) with a dark/light flag.
- Login scene uses the same desk presets/textures/paper tints; dark desks flip the headline to light text;
  photo desks get a readable panel. Titles are HTML-escaped. Not account-scoped (like the chibi).
- 177 tests pass; browser flow verified (guest edits title/cover/photo desk → login shows them). Deployed with
  user approval (Pages `3e2a380c`); live look saving and login mirroring verified.

## 2026-11-05 — More masculine options, new login layout and logo
- Character: hair Buzz cut/Messy/Curtains/Man bun; outfits Jersey/Flannel/Suit; accessories Bandana,
  Beanie, Backwards cap, Sunglasses; new Facial hair field (None/Stubble/Mustache); "Sporty" preset.
  33,696 combinations render in tests. API accepts the new values (facialHair optional for old looks).
- Login redesigned: full-height split — desk scene (logo, Lora headline/pitch, navy journal + character,
  Customize button) beside a paper form panel; compact header + form on phones.
- New logo `src/ui/logo.ts` (navy journal, paper edge, terracotta ribbon, star); same art in
  `public/icons/icon.svg` and regenerated PNGs; used in the login and desk header. Lora loaded on boot.
- Guest disclaimer (user request): login note under "Continue on this device" plus a dismissible in-app
  banner for device-only journals — not backed up; may be deleted when Dear Days is updated or browser data
  is cleared (`GUEST_WARNING` in `src/account/ui.ts`). Dismissal: `localStorage['dd:guest-warning-dismissed']`.
- 173 tests pass; screenshots reviewed. Deployed with user approval (Pages `40a0b80e`); live login, app,
  disclaimer, icon, API health and old-URL redirect verified.

## 2026-11-05 — Gender-neutral character
- Neutral default look and wording ("Customize character", "Make it yours"); presets Neutral/Masculine/Feminine.
- New: 3 hair styles, 3 trouser outfits, cap and headphones (9 hair × 3 eyes × 9 outfits × 8 accessories × blush = 3,888 looks, all rendered in tests). API schema widened.
- Whole app neutralized (user request "neutralize all"): pink/mauve UI colors → warm paper + slate navy
  (light tones → warm paper, accents → slate, plum text → warm charcoal); default cover `#3e5568`,
  Journal tab `#e8a87c`; ✿ marks → ✦; title "Dear Days"; icon heart → star (PNGs regenerated);
  no ♡ in welcome text/toast. User-chosen options (pink paper, cover/desk/frame palettes) kept.
- 170 tests pass; live login/book/icon checked after deploy.

## 2026-11-05 — Customizable chibi + public URL https://dear-days.pages.dev
- Login chibi (original layered SVG): eyes follow mouse, taps and the text caret; blinks,
  breathing, idle glances; covers her eyes while a hidden password is typed, peeks when shown,
  smiles on sign-in/sign-up, "?" on a wrong password. Reduced motion keeps tracking only.
- Editor ("Customize her" on login, "Customize your chibi" in Account): 6 hair styles, hair color
  (8 + custom), 3 eye shapes, eye color (8 + custom), 6 skin tones, 6 outfits, 6 accessories,
  blush, Surprise me/Reset, live preview with thumbnails. Device + account storage, newest wins.
- API: `GET/PUT /api/account/chibi`, export includes the chibi; migration `002-chibi.sql`.
- Hosting moved to Cloudflare Pages config for https://dear-days.pages.dev; old Worker becomes
  a redirect (`redirect/`). With user approval: migration applied, deployed, full live test
  (emails, sync, R2, chibi, browser, reset, deletion) passes on the new URL; redirect verified.
- Tests: 169 pass (5 new chibi tests: all 1,296 combinations, schema repair, login reactions,
  editor save, newest-wins sync). Headless Chromium screenshots desktop/mobile/editor reviewed.

## 2026-11-05 — Final offline font verification
- Deployed version `41c983f4-bc2d-45e7-80af-4821657efb99`: all 34 font families load locally, no Google Fonts requests, Korean fonts work after offline reload. First full cache installation completed in 187 seconds on the test connection. All 164 frontend/service-worker checks, seven database integration checks, and the live account/email/sync/R2/browser workflows pass.

## 2026-11-05 — Live accounts, private cloud sync, and self-hosted fonts
- Implemented Hono/Better Auth on the existing Worker, additive Neon schemas,
  real Gmail verification/reset delivery, sessions, and password-confirmed deletion.
- Added account-scoped local caches and draft keys, explicit guest imports,
  canonical snapshot CAS/idempotent retries, offline recovery, safe journal
  switching, separately remapped conflict copies, and cloud status/account controls.
- Added native private R2 uploads/downloads, quota reservations, immutable original
  commits, archive sync, lazy image caching, and durable retryable deletion gates.
- Live tests pass for actual email links, two sessions, browser editing and
  second-browser hydration, stale edits, private R2, reset/session revocation, and
  account/media cleanup. All temporary QA users were removed.
- User requested local fonts: bundled all 33 choices + Korean fallback with original
  licenses/version manifest, replaced external font loading, and precached WOFF2.
- 164 frontend/storage/font/service-worker tests and seven Postgres integration checks pass;
  type checks/build/dry run pass. Headless desktop/mobile UI checks pass.

## 2026-11-05 — First Cloudflare production deployment
- Published Dear Days to https://dear-days.mcleinonza0531.workers.dev as Worker static assets, version `60619339-b109-4d90-91b8-89c059a81ae8`.
- Added Wrangler configuration/dependency, build-first deployment and dry-run scripts, service-worker/manifest revalidation headers, immutable bundle caching, and basic security headers.
- Saved the real HTTPS origin in ignored `.env` and the production template. User credentials remain private; the R2 account matches the authenticated Cloudflare account. Only built frontend files were uploaded, without server secrets or bindings.
- All 152 frontend tests, TypeScript/PWA build, dry run, credential-leak scan, and whitespace checks pass. Login, SMTP delivery, cloud sync, and database/R2 endpoints remain pending. Native Safari control was denied; live checks use HTTPS requests.
- Live HTTPS verification passes for the root and all 50 deployed files (byte-for-byte against the build), all 30 stickers, cache/security headers, and 404 responses for private paths and unimplemented APIs.

## 2026-11-05 — Dear Days app name
- User chose **Dear Days**. Updated visible branding, browser/accessibility and installation metadata, new-book/default titles, recovery download filename, package metadata, and setup examples.
- Existing storage identifiers, journal content/custom titles, repository/folder names, and cloud resources stay compatible.
- Validation: all 152 tests and production build pass; built browser/Apple/PWA names and package metadata verified. Dependency audit reports no high/critical findings; six existing low/moderate findings remain in build tooling.

## 2026-11-05 — Production setup and Gmail SMTP configuration
- Replaced Resend configuration with Gmail SMTP defaults (implicit TLS on port 465), Google App Password instructions, and a production setup guide in `MyJournal/SMTP_SETUP.md`.
- Set the bucket to the user-created `journal-assets-prod` and the browser API base to `/api`; removed local-only origins from private production settings, consolidated duplicate auth URL entries, and preserved database/R2 credentials.
- Updated the backend plan and project knowledge. SMTP/auth/backend implementation and deployed delivery checks remain pending. Environment/template validation, TypeScript check, and whitespace checks pass.
