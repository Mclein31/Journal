---
type: handoff
title: Handoff — v2 3D Journal (Claude → Codex)
project: Jangie's Website
last_updated: 2026-11-05
---

# Handoff: continue the v2 3D Journal build

## Read first (in this order)
1. `/Users/mclein/Documents/Developer/Personal_Projects/AGENTS.md` — workspace rules (stay in this project, keep `.brain/` updated).
2. `.brain/PROJECT_CONTEXT.md` — what we're building and why.
3. `.brain/PLAN.md` — 12 phases, each with a "Done when" check. **This is your task list.**
4. `.brain/ARCHITECTURE.md` — folder layout, 3D book approach, data model, API.
5. `.brain/DECISIONS.md` — settled decisions. Don't reopen them without asking the user.

## Settled decisions (short version)
- Vite 8 + TypeScript 7, no UI framework. 3D = CSS 3D transforms, not WebGL.
- Local-first IndexedDB now; backend later (Phase 10): Hono on one Cloudflare Worker (static assets + `/api`), Neon Postgres, private R2 bucket, Better Auth email+password, Resend for verify/reset emails.
- **Public app**: open sign-up, every user's journal is private, 10 MB/upload, 500 MB/user.
- Default sections: Journal · Schedule · Memories · Notes (user can add/rename/recolor).
- Art must be original. Stickers now use ChatGPT-generated transparent PNGs, per the user's explicit request (supersedes the earlier SVG-only rule). Name frames generically ("Instant film", not camera brands).

## What is done
- Brain rewritten (all files in `.brain/`).
- `MyJournal/.env` (keys only, empty) + `.env.example`; `.gitignore` covers `.env*`, `.dev.vars`, `node_modules/`, `dist/`.
- v1 app moved to `MyJournal/legacy/` (reference + source for the Phase 11 importer). **Do not delete.** v1 IndexedDB `mlw_db` is untouched; v2 uses `mlw_v2`.
- Phase 0 (partial), in `MyJournal/`:
  - `package.json`, `tsconfig.json`, `vite.config.ts`; deps installed (vite, typescript, idb).
  - `src/state/schema.ts`: all types. Positions are **page units (0..1)**.
  - `src/state/store.ts`: `initStore / getDoc / subscribe / update / undo / redo / flush`, 400 ms autosave, flush on pagehide.
    `update()` clones the doc for undo, so **during drags move the DOM directly and call `update()` once on pointerup.**
  - `src/sync/local.ts`: IndexedDB (`loadBook, saveDoc, deleteRecords, putAsset, getAssetBlob, getMeta, setMeta`).
  - `src/state/seed.ts`: default book, 4 sections × 2 pages, a welcome text element.
  - `src/styles/tokens.css`: palette and fonts from v1.
  - `index.html`, `src/main.ts`: boot loads or creates the book, then calls `mountBook(app, doc)`.

## Current state (updated end of session 1)
Build is green (`npm run build`). Phase 0 done; Phase 1 mostly done. See TODO.md for the 3 open Phase 1 items.
Phase 1 files: `src/book/{Book,layout,flip,Tabs,PageView,SectionManager}.ts`, `src/styles/book.css`.
- Spread k shows pages[2k] | pages[2k+1]. Sections always get pages in pairs so spreads stay aligned.
- Flip = static pages swapped under temporary `.leaf` nodes (flip.ts). Each leaf has its own perspective(),
  stacking is z-index based, and a leaf is raised exactly at its 90° midpoint.
- Book starts **closed** (`.desk[data-closed]`). `openBook()` / `closeBook()` in Book.ts; `OPEN_MS` must match `--open-ms` in book.css.
- Rule: never use setTimeout to switch things mid-animation — put the switch on the animation timeline (WAAPI keyframes), as flip.ts and openBook do.
- Sounds: `src/audio/paper.ts` plays CC0 recordings from `public/sounds/` (Kenney RPG Audio). Decoding starts on the first pointerdown/keydown.
- PWA: `vite.config.ts` (manifest), `src/sw.ts` (service worker, injectManifest — see DECISIONS for why),
  `src/pwa/install.ts` (Install button + iOS steps). Icons in `public/icons/` (source `icon.svg`).
- Responsive rules are at the end of `book.css`; the single/spread switch is the `narrow` media query in Book.ts.
- Phase 11 note: the old `vercel.json`/`netlify.toml` mark every `*.js` immutable, which would also catch `sw.js`. Fix or drop them when deploying (plan is Cloudflare).
- Mutations go through `update()` in store.ts; Book re-renders on every store change (deferred while a flip runs).

## Your next steps
1. **Finish Phase 1**: corner-drag flip, real-device test (iOS Safari is the biggest risk), and keep an
   eye out for the "view jumps to spread 0" glitch (see TODO.md).
2. Phases 0–8 are done (see TODO.md). Next: **Phase 9** login screen + eye-tracking customizable chibi, then **Phase 10** backend (needs `.env` values).
   Canvas architecture: `src/canvas/Canvas.ts` (gestures/selection overlay), `elements.ts` (store ops); carried-over copies are `[data-ghost]`.
3. Continue Phase 2 → 11 in order. Phases 2, 3 and 9 can be done in parallel with 4–7.

## Gotchas
- `fsevents` install script is blocked by npm allow-scripts. That's intentional and harmless (optional macOS watcher).
- TypeScript 7 is the native compiler. If an option errors, use the modern equivalent instead of downgrading.
- Tear tool (Phase 6): use the `polygon-clipping` npm package for the polygon split. Don't hand-roll it.
- Only `VITE_*` env vars reach the browser. Never prefix a secret with `VITE_`. `.env` values are empty until Phase 10.
- User explicitly authorized Git initialization as needed, committing and pushing on 2026-11-05. Use no co-author trailers. The user supplied `https://github.com/Mclein31/Journal.git`; `origin` now uses that URL and `main` tracks `origin/main`.

## Keep the brain current
After each phase: tick it in `.brain/TODO.md`, add a line to `.brain/CHANGELOG.md`, and log any new
decision in `.brain/DECISIONS.md`. Update this HANDOFF.md if you stop mid-phase.

## 2026-11-05 — Polish pass handoff
- Current frontend remains the local-first app in `MyJournal/`; phases 9–11/backend are still pending.
- Main UI finishing rules live in `src/styles/polish.css`; SVG controls in `src/ui/icons.ts`; frame/font popover lifecycle in `src/ui/picker.ts`.
- Customization now has Cover / Paper / Desk categories and a per-page paper override for the active page. Frame inspector previews the actual selected asset; captions/colors remain editable without closing it.
- Store exposes `canUndo`/`canRedo` plus `mlw:saving`, `mlw:saved` (committed BookDoc detail), `mlw:save-error` events. Saves are serialized; `saveDoc(doc, removed)` applies deletions/upserts in one transaction. Draft cleanup must only acknowledge committed text; keep `bookmark.ts` recovery behavior.
- Canvas exposes `commitEditing()`; Book calls it before page DOM replacement. Pointer capture belongs to the stable stage, and single-page moves explicitly disable cross-spine ownership transfer.
- Last-view metadata now stores `{ pageId }`, with a legacy numeric read fallback and protection against late restores overriding a user's navigation.
- Validation: `npm test` runs 11 isolated tests against actual TypeScript modules using Node's VM modules/type stripping; Node 26 was used. `npm run build` includes TypeScript and PWA build.
- Remaining QA: final browser walkthrough, real iOS/Android portrait/landscape, touch pinch/drag and keyboard picker walkthrough. Chrome access was rejected by the computer-use tool during this pass; do not claim final visual/device verification. npm audit was blocked by registry DNS/network access.

## 2026-11-05 — Functional audit follow-up
- User reported font switching and uploaded sticker deletion failures, then requested a full functionality pass and more sticker variety.
- Fixed empty-text deletion on font-open, made font categories apply their default/last chosen font, added 48 original stickers (75 total), and added search plus uploaded-sticker Remove/Restore.
- Asset archival is local metadata (`Asset.archived`); `listAssets(kind, includeArchived?)` excludes it by default, `setAssetArchived` updates it transactionally. Never physically delete assets needed by page/undo references.
- Tear geometry fixes are protected by real polygon-clipping area-conservation tests. Tear Done requires a piece choice; Cancel does not change the prior frame.
- `npm test`: 37 passing tests. `tests/helpers/app.mjs` uses linkedom and fake-indexeddb to exercise actual Book/Canvas/inspectors/store modules; it mocks geometry, audio, image decoding, and animation. Do not mistake these for browser/device QA.
- `npm run build` passes (including PWA). High-threshold audit passes; 2 low/8 moderate transitive build-tool findings remain. A breaking downgrade proposed by audit was not applied.
- Final real-browser and physical-device checks still outstanding: computer-use tool rejected Chrome access again. No Git repo or deployment created.

## 2026-11-05 — Text style follow-up
- `FontMenu.ts` now exposes text color, highlight, underline, and strikethrough above the font list. Styles apply to a whole text box, not selected character ranges.
- New optional text fields: `highlight?: string`, `underline?: boolean`, `strikethrough?: boolean`. PageView renders highlight/decoration on `.el-text-body`; ink/font stay on the element wrapper. Inline CSS plus box-decoration-break keeps highlights aligned with wrapped text.
- Latest verification: 39 tests pass; TypeScript and production/PWA build pass. Native visual/device verification remains pending.

## 2026-11-05 — Continuous spread and aesthetic stickers
- Book defaults to `spread`; per-book localStorage `mlw:layout:<bookId>` remembers explicit one-page choice. Media changes trigger relayout without changing the user's mode.
- `PageView.renderSpreadCanvas` renders one instance per visible element, with `data-owner-page`, `data-canvas-scale=.5`, and `data-canvas-offset=0|1`. Canvas resolves the owner page sheet for page-unit gestures and maps live x/width back to spread percentages. `setBusy` hides the shared canvas and supplies page-face elements during turns, then restores unified editing.
- `.spread-crease` shades everything crossing the middle. Keep it pointer-transparent and below stage selection controls. Paper section stripe now uses a pseudo-element so page/overlay origins agree.
- `fonts/highlight.ts` creates stable per-element SVG marker backgrounds (not text masks); highlight color remains the only stored style field.
- `studioPacks.ts`: 27 refined art assets, including requested White roses/White lilies/White orchids. Registry has 102 total stickers; Studio defaults to the refined union of studio/flowers, Flowers filters botanical blooms. `a-` asset IDs default to `effect:none`.
- Latest validation: 46 tests and production/PWA build pass. New artwork contact sheet rendered/visually inspected at `MyJournal/validation/studio-contact-sheet.png`; real-browser/device QA remains pending.

## 2026-11-05 — Final generated sticker handoff (current)
- Exactly 30 visible generated PNG stickers: `src/stickers/generatedPacks.ts` and `public/stickers/generated/`. Studio includes all 30; Flowers/Nature/Everyday/Adventure/Details provide curated views. `packs.ts` resolves old SVG IDs for saved pages only. StickerDef supports raster `src` or legacy `svg`.
- PNG originals are transparent 1254×1254; the full collection totals 43,644,990 bytes. The original images remain unmodified. Preview: `validation/generated-sticker-preview.png`; generation records: `validation/sticker-generation.json`.
- `vite.config.ts` raises the Workbox per-file limit to 3 MiB so three larger images do not break production builds. All 30 URLs are confirmed in `dist/sw.js`; do not lower this limit without checking asset sizes. Full first-install precache is about 42 MiB.
- Current verification: 81 tests pass, TypeScript passes, production/PWA build passes. Each raster has editing/persistence workflow coverage and real decoded-alpha checks. Tests simulate DOM/geometry/native APIs; actual browser/touch/install/offline execution remains pending under the Chrome access restriction.
- Git is initialized at the project root. The user supplied `https://github.com/Mclein31/Journal.git`; `origin` is configured and the five focused implementation/test/documentation commits were pushed to `main`. Use multiple focused commits and no co-author attribution. Root ignore rules exclude env, source photos, Obsidian vault, dependencies, generated builds and tool screenshots.

## 2026-11-05 — QA continuation (current)
- Read `QA_REPORT.md` for the 128-test coverage matrix, reproduced defects, current checks and honest verification limits. All tests, TypeScript, production/PWA build and local HTTP asset checks pass. Actual browser/device/full accessibility sign-off is still pending; Chrome computer use was denied.
- Store/local conflict handling: optional `Book.revision`, atomic expected-revision check in `saveDoc`, single-transaction `loadBook`, private `savedRevision`, and no-op clean-save skipping. `initStore(doc, {dirty: restored})` is required after applying boot recovery. Do not remove this flag when changing boot.
- `bookmark.ts` now includes captions under `caption:<elementId>`, `__draftBases` and `__draftConflicts` in the existing recovery payload. Keep compatibility with old string-only text drafts. Quarantine conflicting words, preserve newer saved content, and keep recovery aligned with Undo/Redo after failures. Conflict dialog/export implementation is in `ui/saveConflict.ts`.
- Caption input writes synchronous recovery; lifecycle events commit edits; committed captions immediately enter the ordered save loop before subsequent Undo. Re-entering or switching caption editors must use connected DOM nodes.
- Page ordering changes preserve active page identity; the single-page toggle and Bookmark use the active side. File drops choose the page under physical coordinates, prevent unsupported-file navigation and report skips. Background uploads return `{added, failed, lastId?}` and continue after individual failures.
- Shared spread canvas clips only its outer rectangle. `fonts/highlight.ts` includes deterministic pressure-varying pen marks and marker fibers; page/frame/sticker grain is CSS. The sticker renderer wraps the image in `.sticker-paper` and applies a mask after source resolution/load. Original PNGs are unchanged.
- New validation artifacts: `MyJournal/validation/production-http-check.json` and `tactile-preview.png` (static art sample, not browser screenshot). Roughly 42 MiB first-install cache still needs real-device QA. Dependency audit currently has 2 low/4 moderate, no high/critical.

- Final user follow-ups: every text box stays one page wide regardless of corner/pinch scale (including legacy normalization), with one existing handle; Delete/Backspace and Undo/Redo work for placed stickers with the tray open while search fields and other dialogs retain keyboard ownership. Dedicated regression coverage added.
