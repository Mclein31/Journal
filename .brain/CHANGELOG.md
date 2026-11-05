---
type: changelog
title: Jangie's Website — Changelog
project: Jangie's Website
tags: [changelog]
last_updated: 2026-11-04
---

# Changelog

## 2026-11-04 — v2 planning
- Project brain rewritten for the 3D customizable journal redesign (old brain was outdated).
- Added `PLAN.md` (12-phase execution plan).
- Added `MyJournal/.env` (empty keys for Neon, R2, auth) and `.env.example`; `.gitignore` updated.

## 2026-11-04 — Phase 8: bookmark + continue later, carry-over across the spine
- `src/book/bookmark.ts` (bookmark in meta `bookmark:<bookId>`, text drafts in meta `drafts`), `src/ui/toast.ts`, ribbon in Book.ts/book.css.
- Carry-over: PageView renders partner-page items with `data-ghost=±1`; Canvas moves/transforms all copies; `moveElement` reassigns the page when the center crosses the spine.
- FIX: ribbon stayed hidden after page turns; hidden during cover open/close.

## 2026-11-04 — Phase 7: stickers
- `src/stickers/packs.ts` (28 original SVGs), `src/stickers/StickerTray.ts`, `src/styles/stickers.css`.
- Sticker element: `data.sticker {stickerId | "asset:<id>", aspect, effect}`. Note: SVG-as-image can't use web fonts → word stickers use system cursive.

## 2026-11-04 — Phase 6: tear tool
- `src/frames/tear.ts` (simplify, seeded roughen, split via `polygon-clipping`), `src/frames/TearTool.ts` (overlay UI).
- Photo `data.photo.clip` = kept polygon; rendered as clip-path; white fiber rim via stacked drop-shadows.
- New photos/text cascade instead of stacking on the same spot.

## 2026-11-04 — Phase 5: photo frames + layering fixes
- `src/frames/frames.ts` (registry), `src/frames/FrameMenu.ts` (picker), `src/styles/frames.css`. Captions: double-tap to write.
- FIX (user-reported): Send to back made items vanish (z went negative → behind the paper). Now layers renumber 1..n and `.page-sheet` isolates stacking.
- FIX: selection knob/toolbar moved to a stage overlay (positioned to the rotated element) — overlapping items no longer cover them, page edges no longer clip them.

## 2026-11-04 — Phase 4: page canvas (+ empanada desk)
- `src/canvas/Canvas.ts` (gestures, selection UI, text editing, keyboard, drop/paste), `src/canvas/elements.ts` (store ops),
  `src/sync/assetUrls.ts` (shared object-URL cache), `src/styles/canvas.css`. Photos keep shape via `data.photo.aspect`.
- Page tools in the nav row: 📷 Photo, Aa Text, ↶, ↷. New text's first edit merges into its add (one undo removes it).
- Scattered Filipino empanada desk preset (original SVG pattern) — user request.

## 2026-11-04 — Phase 3: desk backgrounds
- `src/styles/desks.css` (9 presets: wood, walnut, pastel, picnic, linen, starry, cozy lights, blush, sage — generic `[data-bg]` so swatches reuse them).
- `src/customize/backgrounds.ts`: upload (compress via `src/util/image.ts`, store as `assets` kind `background`), list, delete, apply (race-safe).
- Desk section in the Style sheet; nav label got a frosted pill so it reads on any background.

## 2026-11-04 — Phase 2: book customization + drag-to-turn
- Drag a page to turn it by hand (`dragLeaf` in flip.ts): follows the pointer, completes past 50% or on a flick, falls back otherwise.
- 🎨 Style sheet (`src/customize/CustomizePanel.ts`): cover color (12 + picker, live while dragging), 7 CSS/SVG textures
  (`src/styles/textures.css`: matte, linen, leather, kraft, velvet, corduroy, holographic), cover title, paper type, paper tint.
  Book slides/scales out from under the sheet so the preview stays fully visible (desktop + phone).

## 2026-11-04 — Phone: decorative left-page strip
- Single-page mode shows a thin non-interactive strip of the previous page's gutter edge (inside cover on page 1),
  page-edge stack and cover board, so a phone page reads as an open book (`--peek` in book.css; slot-left reused).
- Turned pages fade as they swing past the book edge on phones. Fix: fade the leaf FACES, never the preserve-3d leaf
  (opacity on the leaf flattens 3D and the hidden side shows through).

## 2026-11-04 — Smooth open/close
- Cover leaf's back face is now the real left page (no swap/pop on landing); book slide + board unfold (clip-path)
  share the cover's 1000 ms timing; toolbar/nav/tabs fade.
- All mid-animation switches (left page reveal, edge strip, 90° restacking in flip.ts) run on the Web Animations
  timeline instead of setTimeout, so they can't drift from the rotation. Measured: 60 fps, 0 dropped frames, desktop + phone.

## 2026-11-04 — Installable PWA + responsive layout
- PWA: manifest, original app icon (`public/icons/`), service worker `src/sw.ts` (Workbox, injectManifest),
  offline app shell + sounds + Google Fonts. ⬇ Install button (native prompt on Chrome/Edge/Android, steps dialog on iOS).
  Verified: SW active, works fully offline.
- Responsive: one page on portrait screens (phones, tablets upright), spread on landscape (incl. short phones sideways).
  Sideways phones: corner nav, stacked icon toolbar. Icon-only toolbar under 600px. Tabs auto-switch to icon-only when labels don't fit.
  Checked at 320×568, 568×320, 390×844, 844×390, 820×1180, 1180×820, 1920×1080.

## 2026-11-04 — Phase 0 done, Phase 1 mostly done
- 3D book (CSS 3D): static pages + turning leaves with per-leaf perspective; riffle for tab jumps (max 5 leaves).
- Book starts **closed** on its cover (user request); tap cover to open, 📕 Close to shut. Tabs peek out of the closed book; tapping one opens straight to that section.
- Pull tabs, section manager (rename/recolor/icon/reorder/add/delete), ＋ Pages, phone single-page layout.
- Paper sound effects (`src/audio/paper.ts`, real CC0 recordings in `public/sounds/` — replaced the synthesized first try): page-turn swoosh + snap, riffle per leaf, tab rustle, cover thump. 🔊/🔇 toggle, persisted.
- Bundle: ~11 KB gzipped.

## 2026-11-04 — Phase 0 started
- Public sign-up decided (Resend for emails, private R2). v1 moved to `MyJournal/legacy/`.
- Vite 8 + TS 7 scaffold, schema, store, IndexedDB layer, seed book. Handoff in `.brain/HANDOFF.md`.

## v1.2.0 — (pre-redesign)
- IndexedDB photo storage, clothesline gallery, Korean title translation, PWA service worker.

## 2026-11-05 — Journal polish and reliability pass
- Added consistent SVG controls, stationery surfaces, grouped editing tools, readable cover ink, explicit device-save status, and usable closed-book controls.
- Organized customization into keyboard-accessible Cover / Paper / Desk tabs; added per-page paper override, an explicit Done action, and keyboard-accessible background uploads.
- Replaced the text-only frame picker with previews of all 12 frames using the selected photo, custom frame colors, a caption field, and tear editing. Inspector captions commit on dismissal; canceling tear keeps the prior frame.
- Fixed overlapping autosaves with one serialized loop and atomic IndexedDB delete/upsert transactions. Text drafts get synchronous recovery plus ordered IndexedDB writes and are acknowledged after matching content is durably saved.
- Committed active text before replacing page DOM; corrected single-page spine transfer, pinch pointer capture, duplicate selection, offscreen action bars, dialog keyboard ownership, and mode-independent last-page storage.
- Added per-file photo upload errors and storage-load recovery UI. Scoped live announcements to status/nav instead of the entire editor.
- Validation: `npm run typecheck`, `npm test` (11 regressions), and production/PWA build pass. Browser inspected before changes; final interactive verification unavailable because computer-use access to Chrome was rejected. Dependency audit could not reach npm registry (DNS/network restriction). No deployment or Git initialization performed.

## 2026-11-05 — Functional audit, font repair, and sticker expansion
- Font categories now apply a default or previously selected font to the active text box; specific font choices still apply directly. Opening font controls preserves an empty text box instead of deleting it. Scope is the whole selected text box, not rich-text ranges.
- Expanded built-in stickers from 27 to 75 with 48 original SVGs in `extraPacks.ts`: animals, cozy objects, moods, Filipino snacks, nature, travel, journal labels, and washi tape. Added search across the library.
- Added uploaded-sticker removal and a persistent Removed stickers → Restore flow. Asset metadata `archived` hides an upload without deleting images needed by placed copies or undo history. Background removal also retains its source so Undo works.
- Transparent WebP/other sticker uploads now use PNG output. Corrupt/unavailable recents and sound preferences no longer block the app. Asset URL failures no longer remain stuck in the pending map.
- Fixed tear geometry's mismatched bounding coordinates and duplicate corner closure: horizontal, diagonal, rough, and repeated tears now preserve total image area. Done is disabled until the user chooses a piece. Tear cancel preserves the previous frame.
- Deferred pointer capture until actual dragging/pinching so taps/double-clicks retain their target. Kept capture on the stable stage during gestures.
- Restored mobile Install visibility; dismissing a one-use native install prompt no longer leaves a dead visible button. Disabled deletion of the final section.
- Added dev-only `linkedom` and `fake-indexeddb` for real-module DOM/storage integration checks, plus image pipeline and tear geometry tests. `npm test`: 37 passing checks covering navigation, page drag/cancel, bookmarks, fonts/text editing, frames/captions/colors, uploads, deletion/undo, customization, section management, stickers/search/archive/restore, pinch/resize, storage recovery, and install-prompt events.
- Validation: production/PWA build and TypeScript pass. `npm audit --audit-level=high` passes: zero high/critical; 2 low and 8 moderate transitive build-tool findings remain (audit proposes a breaking PWA plugin downgrade; not applied).
- Limits: DOM tests simulate geometry/animation/native install APIs; no real browser or device rendering verification. Chrome access was again rejected by the computer-use tool. Live font stylesheet fetch returned HTTP 200. No deployment or Git initialization.

## 2026-11-05 — Text formatting controls
- Expanded the Font and ink inspector into Text style with custom/preset text colors, six highlight colors plus custom color and Remove highlight, and independent underline/strikethrough toggles.
- Formatting applies to the whole selected text box. Underline and strikethrough can be combined; inline highlights follow wrapped text rather than filling the whole element rectangle.
- Optional `ElementData.text.highlight`, `.underline`, and `.strikethrough` fields preserve compatibility with older books. Text edits, font changes, duplication, autosave/reload, and undo/redo preserve these styles.
- Validation: TypeScript and production/PWA build pass; all 39 tests pass, including two new real-module DOM/IndexedDB formatting regressions. Browser/device rendering QA remains pending under the previously recorded computer-use access limit.

## 2026-11-05 — Continuous spread, tactile crease/highlights, and refined florals
- Two-page spread is now the default even on portrait screens. An explicit Two-page spread toolbar toggle offers a larger one-page view, remembers the preference per book, and preserves the current location across rotation.
- Resting spreads render each visible text/photo/sticker once on a shared canvas across both pages. Per-page coordinates remain unchanged in storage; the renderer maps x/width to half-spread units. Drags, resizes, editing, and ownership transfers stay continuous across the spine. Clipped per-page copies are used only for page-turn faces.
- Added a decorative center crease above the shared artwork, so anything crossing the spine receives the same fold shading without splitting or masking its content. Section stripes are decorative rather than layout borders, avoiding a coordinate jump when turns begin.
- Layer commands and new-element z values now use the paired-page union, so bring-to-front/back work across both halves of the spread.
- Replaced rectangular highlight fills with deterministic SVG marker strokes: subtly ragged edges, layered ink, fine streaks. They remain backgrounds beneath readable glyphs, preserve wrapped-line behavior, and never change randomly during re-renders.
- Added 27 refined native SVG designs (102 total) with muted botanical/archival art, fine strokes, gradients, and restrained watercolor texture. Studio is the default collection; Flowers includes White roses, White lilies, White orchids plus other botanical flowers. Existing 75 designs/uploads remain available. Refined art defaults to no heavy die-cut outline.
- Visually inspected a rendered contact sheet of all 27 new designs: `MyJournal/validation/studio-contact-sheet.png`. This is an SVG artifact preview, not a browser screenshot.
- Validation: production/PWA build and TypeScript pass; all 46 tests pass, including shared-spread editing, cross-spine live coordinates/ownership, pair-wide layering, portrait mode choice, both-page writing, marker stability, and the requested white florals. Browser/device visual and native interaction QA remains outstanding under the previously recorded computer-use access restriction.

## 2026-11-05 — 30 generated stickers and final functional validation
- Replaced the visible coded-art library with exactly 30 ChatGPT image-generated transparent PNGs. Includes white roses/lilies/orchids and neutral everyday, music, food, nature, and adventure subjects. Studio shows all 30; five curated category filters plus search remain available.
- Preserved legacy SVG lookup for older saved pages and recents. Generated stickers default to no heavy outline; all four optional effects remain supported.
- Kept original high-resolution PNG assets under `public/stickers/generated/`; generation records and a visually inspected 30-image contact sheet are in `MyJournal/validation/`.
- Fixed the production PWA build's 2 MiB per-file limit for three larger images; the limit is now 3 MiB. Confirmed all 30 PNGs appear in the built service-worker precache manifest (57 entries, about 42 MiB total). Actual offline execution still needs browser QA.
- Validation: TypeScript and production/PWA build pass; all 81 automated checks pass, including every sticker's placement, cross-spine drag, resize/rotation, duplicate, effects, delete/undo and IndexedDB reload. Independent review found no additional integration blocker. Real browser/device rendering and native behavior remain unverified because computer-use access was denied.
- User requested commit/push without co-author attribution. Initialize Git at project root, excluding env files, private source media, the Obsidian vault, dependencies and build outputs. No remote destination exists; repository URL requested from user before pushing.

## 2026-11-05 — GitHub repository connected
- Replaced the initial combined local commit with five focused commits: legacy/setup, journal editor, generated stickers/offline caching, tests, and documentation. Final application files are identical; the intermediate editor commit also passes its production/PWA build. No co-author trailers.
- Configured `origin` as `https://github.com/Mclein31/Journal.git`, confirmed it had no existing branches, and pushed `main` with upstream tracking.

## 2026-11-05 — Functional QA, conflict-safe saves and tactile stationery
- Completed a second actual-module QA pass, expanding automated coverage from 81 to 128 checks. Reproductions, fixes, coverage and explicit browser/device limits are in `QA_REPORT.md`.
- Fixed page identity after section reorder, active-page layout changes and bookmarks, reorder focus, active-edit Undo ordering, unsupported/mixed file drops and physical-page ownership across spanning artwork.
- Fixed deleted-page import races, partial background batches and caption loss on lifecycle events. Caption editor focus and Undo/recovery now survive ordinary saves and a simulated failed save.
- Added atomic per-book revision checks, snapshot-consistent reads, clean-save skipping, conflict export/reload UI and base-content-aware text/caption recovery. Conflicting recovered words are quarantined for download. Valid recovery is saved through the real boot path. No IndexedDB schema-version change is needed.
- User's Safari screenshot identified outer-edge overflow: the shared canvas now clips at the book rectangle while retaining continuous spine crossing. Added imperfect underline/strike strokes, highlight fibers and subtle page/frame/sticker grain. Original sticker PNGs remain unchanged; uploaded sticker grain follows loaded alpha masks.
- Validation: all 128 tests, TypeScript, production/PWA build and local production HTTP asset checks pass. All 30 PNGs remain in precache. Audit: 0 high/critical, 2 low/4 moderate transitive build-tool findings. Static artwork preview inspected at `MyJournal/validation/tactile-preview.png`; not a browser screenshot.
- Browser host remained unavailable and Chrome computer use was denied. Native rendering, device gestures/install/offline and full accessibility remain open; login/backend/migration/deployment phases remain pending.

- Final user follow-ups: every text box stays one page wide regardless of corner/pinch scale (including legacy normalization), with one existing handle; Delete/Backspace and Undo/Redo work for placed stickers with the tray open while search fields and other dialogs retain keyboard ownership. Dedicated regression coverage added.

## 2026-11-05 — Flexible page turns and switching fixes
- Replaced rigid paper turns with a shared-projection CSS3D mesh, preserving full-page HTML/font units and mirrored back-side crops. Tension depends on grab location and vertical pull; shadows follow the bend. Covers retain their original rigid WAAPI timing.
- Added a critically damped, velocity-aware release and catch/reversal of manual or automatic single turns. Stationary holds expire old flick velocity; cancel returns to the original pages. Reduced-motion dragging now uses a flat fade.
- User reported buggy switching. Independently reproduced and fixed projected grab-point drift (~106.5px before projection in the reviewed half-turn case), stale mesh sizing on resize, dropped rapid Next requests, and blocked Previous input during a forward turn. Native verification of the reported visual bug remains pending.
- Added subpixel terminal-face overlap to suppress tile cracks without changing full-page source dimensions. Rebind pending uploaded images/masks in cloned faces and disconnect per-leaf observation on cleanup.
- Validation: all 152 tests (24 new motion/geometry cases) and production/PWA build pass. Static geometry preview inspected; native browser painting/performance remains unverified under the existing access limit. See `QA_REPORT.md`.
