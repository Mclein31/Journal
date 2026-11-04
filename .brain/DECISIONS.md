---
type: decisions-log
title: Jangie's Website — Decisions
project: Jangie's Website
tags: [decisions]
last_updated: 2026-11-04
---

# Decisions

## 2026-11-04 — Rebuild as a 3D book app (v2)
**Decision**: Replace the tabbed v1 UI with a single 3D book; sections become pull tabs.
**Why**: The product goal is now a customizable journal that feels like a real object.
**Consequence**: v1 features (tasks, entries, gallery, Korean titles) are re-homed as book sections. v1 data is migrated, not dropped.

## 2026-11-04 — CSS 3D transforms instead of WebGL / Three.js
**Why**: Pages must contain real, editable HTML (text, draggable photos, stickers). CSS 3D keeps
that DOM interactive, accessible, and light. WebGL would mean re-implementing text editing and hit-testing.
**Trade-off**: No true page bending/curl. We fake curl with a shading gradient + slight skew.

## 2026-11-04 — Vite + TypeScript, no framework
**Why**: The app is mostly custom pointer/animation code where a framework adds little. Vite gives
modules, env vars, and fast builds. TypeScript keeps the element data model honest.

## 2026-11-04 — Neon Postgres + Cloudflare R2 + Hono on Workers
**Why**: Users must log in and continue on any device, so data needs a server. Neon for relational
data (books/pages/elements), R2 for images (no egress fees). Workers sit next to R2 and match the
ecosystem pattern already used by MedRec v2 / AdvanCare.
**Consequence**: Hosting moves from Vercel/Netlify static to Cloudflare (Pages + Workers). *Needs user confirmation.*

## 2026-11-04 — Local-first with background sync
**Why**: Journaling must never lose a word. IndexedDB write first, sync second, last-write-wins.

## 2026-11-04 — Tear is non-destructive (polygon clip, not pixel edit)
**Why**: Lets the user redo or reset a tear at any time; one stored photo can appear torn differently on different pages.

## 2026-11-04 — Original art only
Chibi character, stickers, and textures are drawn for this project (SVG). Frame styles are named
generically ("Instant film", "Photocard") rather than after camera brands.

## Carried over from v1
- English → Korean title translation on save (`korean-convert.js`) stays as an option in the Journal section.
- Client-side image compression before upload (`utils.js` `compressImage`).

## 2026-11-04 — User answers to open questions
- **Hosting** (user delegated): one **Cloudflare Worker with static assets** serves both the
  built frontend and `/api/*`. Same origin → no CORS, simple session cookies, one deploy,
  native R2 binding. Replaces Vercel/Netlify configs at Phase 11.
- **Login**: email + password only. No Google, no magic links.
- **Users**: ~~Jangie only~~ → **superseded same day: open to the public.** See next entry.
- **Sections**: defaults Journal · Schedule · Memories · Notes; Jangie can add/rename/recolor more.

## 2026-11-04 — Open to the public (supersedes "Jangie only")
**Decision**: Anyone can sign up with email + password. Every user gets their own private book(s).
**Consequences**:
- **Email service required** for verification + "forgot password": **Resend** (HTTP API works on
  Workers, free tier 3k emails/month). Env: `RESEND_API_KEY`, `EMAIL_FROM`.
- Email verification required before first sync; password reset by emailed link.
- **Private by default**: R2 bucket stays private; images served only via short-lived signed URLs
  scoped to the owner. No public R2 URL (removed `R2_PUBLIC_BASE_URL`).
- **Limits per user**: 10 MB per upload, 500 MB total storage, rate-limited login/sign-up (Better Auth built-in).
- Users can **export** their data and **delete their account** (removes Neon rows + R2 objects).
- Needs a short privacy note on the sign-up screen.

## 2026-11-04 — Book opens from a closed cover
**Decision** (user request): the app always starts with the book **closed** on its cover. Tapping the
cover opens it (cover swings open, book slides from centered to open spread); 📕 Close shuts it.
Opening resumes the last viewed spread (Phase 8 bookmark will take over this).

## 2026-11-04 — ~~Paper sounds are synthesized~~ (superseded same day — sounded fake)
**Decision**: page/tab/cover sounds are generated with the Web Audio API from filtered noise (`src/audio/paper.ts`).
**Why**: zero download size, no licensing questions, and per-play randomness so repeated flips don't sound identical.
**Swap later**: if real recordings are wanted, replace the bodies of `playFlip/playTab/playCover`; callers stay the same.

## 2026-11-04 — Real recorded paper sounds (supersedes synthesized)
**Decision**: user said the synthesized sounds felt fake. Now using real recordings from Kenney's
"RPG Audio" pack (**CC0**, credit optional): 3 page flips, book open, book close →
`MyJournal/public/sounds/*.mp3` (mono 96 kbps, ~26 KB total, MP3 for Safari). Credits in `public/sounds/CREDITS.txt`.
Played via Web Audio with small random pitch/volume per play; riffles mix long/short flips.

## 2026-11-04 — PWA with a hand-written service worker
**Decision**: `vite-plugin-pwa` with `strategies: 'injectManifest'` and our own `src/sw.ts`.
**Why**: Workbox's `generateSW` writes absolute import paths in single quotes and breaks on the apostrophe in
"Jangie's Website". Bundling our own SW through Vite avoids it. (Renaming the folder would also fix it.)
`src/sw.ts` is excluded from the main tsconfig (WebWorker vs DOM libs) — Vite strips its types without checking.

## 2026-11-04 — Layout rule: portrait = one page, landscape = spread
Media query in Book.ts: single when `(max-aspect-ratio: 1/1)` or `(max-width: 719px) and (min-height: 521px)`;
otherwise spread (so phones held sideways get two pages). Page sizes use `dvh` and safe-area insets.

## 2026-11-05 — Reversible removal of uploaded sticker assets
Removed uploads are hidden with optional `Asset.archived` metadata, not physically purged. The tray exposes Removed stickers with Restore. Placed copies, saved pages, and undo history continue resolving the same original asset IDs. Background removal likewise retains its source for book undo. Existing asset records remain compatible without an IndexedDB version migration. This does not reclaim blob storage.

## 2026-11-05 — Explicit layout and continuous spread (supersedes automatic portrait single-page rule)
The default view is a two-page spread on every viewport, per the user's request. One-page view is an explicit remembered toolbar choice; rotating the device no longer silently changes it. At rest, visible elements share one continuous DOM canvas over both paper pages; original per-page model coordinates are preserved. Page-turn faces still use clipped per-page renders. A decorative crease shades the shared canvas without slicing its elements or text cursor.

## 2026-11-05 — Image-generated sticker collection (supersedes SVG-only stickers)
The user explicitly rejected coded sticker art and requested ChatGPT generation, then exactly 30 total stickers. The visible catalog is now 30 original transparent PNGs generated with the built-in image generation tool, covering florals plus neutral everyday/nature/adventure subjects. Old SVG definitions remain lookup-only to preserve saved pages. New generated assets use stable IDs and default to no outline. Artwork generation records are in `MyJournal/validation/sticker-generation.json`; its first nine prompt entries describe the art specification, while later entries record the generation prompts. Original PNGs are preserved; the PWA caches all 30 with a 3 MiB per-file limit.

## 2026-11-05 — Git scope and author attribution
User explicitly requested commit and push with no co-author trailer. The project had no Git metadata or remote. Initialize at the project root, track application source, generated public art, tests and `.brain`, and exclude `MyJournal/assets/` (private source media) plus `MyLittleWorld/` (Obsidian vault). A repository URL is required to select the push destination; do not invent one or publish to a new public repository.
