---
type: notes
title: Jangie's Website — Notes
project: Jangie's Website
tags: [notes]
last_updated: 2026-11-15
---

# Notes

## Env vars (`MyJournal/.env`, template `.env.example`)
- `DATABASE_URL` (pooled, runtime) / `DATABASE_URL_UNPOOLED` (migrations only) — Neon `production` branch.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME=journal-assets-prod`, `R2_S3_ENDPOINT` —
  S3 keys stay local for explicit maintenance/test cleanup; the deployed app uses the native `JOURNAL_FILES` binding.
  The bucket must stay private (no public URL).
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` — sessions.
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` — Gmail
  verification/reset codes (live). `SMTP_PASS` is a Google App Password, not the login password. See `MyJournal/SMTP_SETUP.md`.
- `APP_ORIGIN`, `VITE_API_BASE_URL=/api`. Both origins are `https://dear-days.pages.dev`.
- Only `VITE_*` vars reach the browser. Never prefix a secret with `VITE_`. Preserve user-supplied `.env`
  values; check readiness without printing secrets.

## Deploy and tooling gotchas
- Deploy with `npm run deploy` (Pages), not `wrangler deploy`. Commands for the old redirect Worker need
  `--config redirect/wrangler.jsonc` because `MyJournal/wrangler.jsonc` is the Pages config.
- Migrations are explicit (`npm run db:plan` / `db:migrate`), never a build/deploy side effect.
- Workbox `generateSW` breaks on the apostrophe in "Jangie's Website"; that is why the SW is hand-written
  (`injectManifest`). `src/sw.ts` is excluded from the main tsconfig (own `tsconfig.sw.json`).
- `vite.config.ts` raises the Workbox per-file limit to 3 MiB for three large sticker PNGs; do not lower it
  without checking asset sizes.
- `fsevents` install script is blocked by npm allow-scripts; intentional and harmless.
- TypeScript 7 is the native compiler. If an option errors, use the modern equivalent instead of downgrading.
- Tests need Node 26 (built-in TS stripping + VM modules). The linkedom/fake-indexeddb harness mocks geometry,
  audio, image decoding and animation; `{manualFrames:true}` + `advanceFrames(ms)` simulate frames. Passing tests
  are not browser/device evidence.
- The PWA build emits a nonblocking `inlineDynamicImports` deprecation warning. `npm audit` suggests a breaking
  PWA plugin downgrade; do not apply it.
- Git: user authorized commits/pushes to `https://github.com/Mclein31/Journal.git`; use multiple focused commits
  and **no co-author trailers**.

## Code gotchas
- `update()` in `store.ts` clones the doc for undo: during drags move the DOM directly and call `update()` once
  on pointerup. Book re-renders on every store change (deferred while a flip runs).
- Never use `setTimeout` to switch things mid-animation; put the switch on the WAAPI timeline (as `flip.ts` and
  `openBook` do). `OPEN_MS` in Book.ts must match `--open-ms` in book.css.
- Fade the leaf **faces**, never a preserve-3d leaf or ancestor (opacity/clip flattens 3D and shows the back side).
- Page-turn mesh: keep `paperPoint` curvature a function of x only; no per-face clip-path (each became a GPU mask
  with 50–100 ms stalls). Keep the 2400px projection in sync between `pageCurl.ts` and `flip.ts`.
- `initStore(doc, {dirty: restored})` is required after applying boot recovery; do not drop the flag.
- Draft recovery (`bookmark.ts`): captions under `caption:<elementId>`, `__draftBases`, `__draftConflicts`;
  keep compatibility with old string-only drafts. Draft cleanup acknowledges only committed text.
- Do not revert cloud sync to last-write-wins or remove mutation IDs, draft lifecycle guards, the deletion gate
  or the expected-account header.
- Asset removal is `Asset.archived` metadata; never physically delete assets referenced by pages/undo.
- Chibi option indexes are append-only (saved looks store indexes).
- Lora is bundled at weight 400 only; do not request 600/700.
- SVG-as-image cannot use web fonts (legacy word stickers use system cursive).
- Browser storage is per-origin: guest journals created at the old workers.dev address stay there.

## Risks carried over from the plan
- CSS 3D bugs in iOS Safari (z-fighting, flicker) remain unverified on a real device; fallback idea was a 2D flip.
- Storage quota on phones: compress on upload; R2 offloads after login.

## v1 facts still relevant
- v1 localStorage keys: `mlw_t` tasks, `mlw_j` journal entries, `mlw_p` prefs, `mlw_g` gallery meta; IndexedDB
  `mlw_db` store `photos` holds blobs. v2 uses `mlw_v2` and never touches `mlw_db`.
- v1 backup JSON: `{version:1, tasks, journals, prefs, gallery, photos{id: dataURL}}` — the v1 importer reads this.
- v1 palette: accent `#f2879e`, cream `#fdf0ee`, dark surface `#231c20` (v2 is neutralized; do not reuse as defaults).
  v1 fonts: Gaegu, Caveat, Nunito, Lora, Playfair Display, Noto Sans KR.
- Korean title translation: Google gtx endpoint first, MyMemory fallback (`legacy/korean-convert.js`).
