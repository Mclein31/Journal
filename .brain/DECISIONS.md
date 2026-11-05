---
type: decisions-log
title: Jangie's Website — Decisions
project: Jangie's Website
tags: [decisions]
last_updated: 2026-11-04
---

# Decisions

## 2026-11-05 — Verified accounts, snapshot CAS, native private media, and local fonts
**Decision**: finish account login/verification/reset and cloud sync on the existing
production Worker. Better Auth uses the supplied Neon database and Gmail SMTP.
Account caches/recovery keys are isolated; guest import is explicit and preserves
its original. Whole BookDoc JSONB snapshots use independent server revisions and
idempotent mutation IDs instead of the initially proposed per-record timestamp
last-write-wins. This preserves deletions and prevents silent offline overwrites.
**Media**: authenticated Worker upload/download routes use the native R2 binding
instead of initial presigned URLs. They enforce size/owner/quota checks; serialized
original commits and a durable account-deleting gate avoid overwrite/orphan races.
**Email**: direct hostname TLS socket supplied to Nodemailer fixes a verified
Cloudflare proxy rejection of its default resolved-IP socket. Default Better Auth
password hashing is retained; real deployed verification/reset delivery passes.
**Fonts**: user explicitly requires self-hosting. Bundle all 33 catalog families
plus Noto Sans KR WOFF2 subsets, stylesheets, original licenses and version manifest
under `public/fonts/`. Remove Google runtime stylesheets/preconnects and retire
its old caches; preserve existing font IDs and precache every local subset.


## 2026-11-05 — Dear Days branding
**Decision**: user chose **Dear Days** as the app name. Apply it to user-facing text,
browser/PWA names, default new-book titles, recovery downloads, and setup examples.
Keep saved journals and custom book titles intact. Internal `mlw:*` event/storage
keys and `mlw_v2` IndexedDB name remain stable to avoid losing access to existing
data. Folder/repository names and provisioned cloud resource names are unchanged.

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
- **Email service required** for verification + "forgot password": originally **Resend**;
  superseded by the 2026-11-05 Gmail SMTP decision below.
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

## 2026-11-05 — Repository destination and focused commits
The user supplied `https://github.com/Mclein31/Journal.git` and explicitly requested multiple focused commits with no co-author attribution. `origin` uses that URL; `main` tracks `origin/main`. The empty destination accepted the five local commits without rewriting remote history. Keep future implementation, assets, tests and documentation in appropriate focused commits.

## 2026-11-05 — Reject stale writers and preserve conflicting recovery
Books have optional local `revision` metadata (legacy absence = 0). `saveDoc` checks the expected revision and writes the next revision in the same read/write transaction; the store owns the latest expected revision and does not claim revisions for unchanged documents. Reads use one transaction. This rejects conflicting edits rather than attempting collaborative document merging.
Text and caption recovery share the existing `drafts` metadata and `mlw:text-drafts` localStorage key. Reserved `__draftBases` tracks original field content; `__draftConflicts` preserves older words separately when another writer changed that field. Unrelated changes do not block valid recovery. Undo/Redo updates active recovery intent, including after save failure. Recovered boot data explicitly initializes the store dirty. Conflict UI offers JSON export; it is a recovery copy with local asset references, not a full media export/import feature.

## 2026-11-05 — Clip outer edges, keep the spine continuous
The user requested outer-book clipping after a Safari screenshot showed rotated art outside the paper. Apply `overflow:hidden` to the shared spread canvas, not separately to its page halves. Selection controls remain stage siblings. Deterministic SVG pen marks/highlighter fibers and subtle CSS paper grain provide the requested texture; original generated PNG artwork stays intact. Sticker overlays mask to the loaded artwork alpha, and forced-colors mode falls back to native text decoration.

## 2026-11-05 — Text width and sticker-tray shortcuts
The user's final clarification supersedes the earlier free-width proposal: every text box must be exactly one page wide at any font scale. Use one existing corner handle and pinch to change lettering size/rotation; do not add a second width handle or width field. New text uses `w=1`, legacy text is normalized on initialization and saved, updates enforce the invariant, and rendering uses 100% of a page or 50% of a spread. Moving a box across the spine remains supported.
The sticker tray permits Delete/Backspace only for the selected placed sticker, plus global Undo/Redo shortcuts. Search/content-editable inputs retain native editing and other open modals retain keyboard ownership. The test harness preserves the originating focused control for global-key events rather than allowing the event bus to retarget them.

## 2026-11-05 — Grab-constrained CSS3D paper
Paper uses a shared vertex grid (6 columns × 3 rows; lower resolution for multi-leaf riffles), two affine triangles per cell and full-sized clipped front/back DOM copies. Covers remain rigid and keep their original WAAPI midpoint for board-opening synchronization. No WebGL, DOM screenshots or new dependencies.
`pageCurl.ts` owns the geometry, projection constraint, drag mapping and analytic critically damped spring. Raw bending alone does not preserve pointer contact: `paperGrid` corrects XY so the actual barycentric grab in the rendered facets projects onto the pointer reference while the spine remains fixed. Keep the 2400px projection synchronized with flip.ts. Fade/clip only terminal faces; preserve3D ancestors must not acquire grouping properties ([CSS Transforms2](https://www.w3.org/TR/css-transforms-2/#grouping-property-values)). Small face overlap suppresses antialias cracks; source pages remain actual full-leaf pixel dimensions so cqh/fonts/wrapping do not change.
Single paper turns expose an interruptible controller: catching settles returns false to the prior completion, preventing double navigation. Riffles retain queued input. `View.target` plus queued intent determines relative Next/Previous/arrow input and disabled states. Resize refreshes geometry/crops and rebases active drags; destruction cancels frames/observers/shadows. Native rendering/performance still requires device QA.

## 2026-11-05 — Page-turn smoothness over mesh density
**Decision**: 8 full-height strips (not 6×3 tiles), normal-based brightness instead of per-face shade layers,
and rAF-coalesced eased pointer following (`DragLeaf.follow`, τ 45 ms).
**Why**: every mesh face holds a full page copy, so face count drives paint/composite cost; per-frame opacity on
non-promoted overlays forced repaints; high-rate pointers caused several paints per frame. User priority: smoothness.
**Trade-off**: the bump around the grab point is no longer sampled vertically (bend is per column, twist from pull remains).

## 2026-11-05 — Production resources and Gmail SMTP (supersedes Resend)
**Decision**: user explicitly chose Gmail SMTP instead of Resend, Neon’s `production`
branch, and confirmed creating the private R2 bucket `journal-assets-prod` (not a
development bucket). Use Gmail `smtp.gmail.com:465` with implicit TLS and a Google
App Password. Sender address matches the authenticated Gmail account.
**Configuration**: replace `RESEND_API_KEY` with `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS`; retain `EMAIL_FROM`. Production uses
the same-origin frontend API base `/api`. Do not invent a live origin or change
user-supplied database/R2 credentials; the actual production HTTPS URL must be
provided for `BETTER_AUTH_URL` and `APP_ORIGIN`.
**Status**: configuration/template and `MyJournal/SMTP_SETUP.md` updated; SMTP sender,
auth handlers, Worker deployment and migrations are still pending. A deployed
transport/delivery check is required before claiming email works. Create SMTP
connections within Worker requests/background tasks using a compatible TLS
transport; port 25 is blocked by default. Keep SMTP secrets out of frontend builds.

## 2026-11-05 — Public URL without the account name: move to Cloudflare Pages
**Why**: the user asked for a public URL that is only `dear-days`, without their name.
`*.workers.dev` URLs always include the account subdomain (`mcleinonza0531`), so the app moves
to the Cloudflare Pages project `dear-days` → **https://dear-days.pages.dev** (no custom domain).
**How**: `MyJournal/wrangler.jsonc` is now the Pages config (dist/ static assets + `_headers`);
`functions/api/[[path]].ts` serves `/api/*` through the same Hono app (`hono/cloudflare-pages`).
Same Neon database, R2 bucket and secrets; `BETTER_AUTH_URL`/`APP_ORIGIN` = the Pages origin.
The old Worker `dear-days` is replaced by `MyJournal/redirect/` (302 to the same path/query on
the new origin, plus a retiring `sw.js` for installed copies). Browser storage is per-origin:
device-only (guest) journals made at the old address stay in that browser's old-origin storage.

## 2026-11-05 — Chibi customization storage
Look = `ChibiConfig` (`src/login/chibiOptions.ts`, mirrored by `chibiSchema` in
`api/src/validation.ts`). Saved in device `localStorage['dd:chibi']` (not account-scoped, so the
login screen shows it before sign-in) and in `journal_account_state.chibi` (additive migration
`002-chibi.sql`). `updatedAt` decides: the newer of device/account wins on sign-in; the server
upsert never replaces a newer look with an older retry. Every write uses the account deletion lock.

## 2026-11-05 — The chibi is gender-neutral, with masculine options
**Why**: the user asked that the app not be girly and that men and women can both use it.
Default look is neutral (Short hair, Hoodie, Headphones, no blush). Added hair Short/Spiky/Side part,
outfits Tee & jeans/Button shirt/Jacket (trousers), accessories Cap/Headphones, and "Start from"
presets Neutral/Masculine/Feminine. Copy refers to "your character", never "her". Option indexes are
append-only because saved looks store them. Spiky hair is drawn flattened under a cap/beret.

## 2026-11-05 — Neutral visual identity
User: "neutralize all". App chrome uses warm paper backgrounds with slate-navy accents and warm
charcoal text (`src/styles/tokens.css`). Default cover is navy `#3e5568`; brand mark is ✦, not ✿.
Pink remains only as an optional user choice (paper tint, cover/desk/frame/hair colors) and in the
classic red notebook margin rule and crimson bookmark ribbon. Do not reintroduce pink UI defaults.

## 2026-11-05 — Brand: journal-and-ribbon logo, Lora wordmark
Logo is the journal mark in `MyJournal/src/ui/logo.ts`; keep `public/icons/icon.svg` identical in
drawing (regenerate PNGs when it changes). Wordmark/headlines use bundled Lora 400 (no bold weight is
bundled: do not request 600/700). Login layout lives in `src/account/login.css`.

## 2026-11-05 — Login screen design rules
Follow the tasteskill house rules on the login (`MyJournal/src/account/login.css`): no eyebrows, no
glyphs as icons, no shadows/blur/outlined boxes on UI, tone steps between surfaces, one h1. The desk,
cover and paper are illustrations of the user's own journal and may use gradients/patterns. Book and
character sizes come from `--bw`/`--cw` on `.auth-stage` (viewport-height aware); keep them in sync
with the pill offset formula. Re-run `inspect.mjs --app` on the production build after changes.

## 2026-11-05 — Page-turn mesh: flat strips, never clip-path
Turning paper is a developable surface: keep `paperPoint` curvature a function of x only so every
full-height strip stays a parallelogram (tested). Do not reintroduce per-face clip-path triangles or
y-dependent bending; each clipped face became a GPU mask and caused 50–100 ms stalls per turn.
