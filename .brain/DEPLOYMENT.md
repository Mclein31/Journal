# Dear Days — production deployment

- URL: **https://dear-days.pages.dev** (Cloudflare Pages project `dear-days`, production branch `main`).
- Moved 2026-11-05 so the public URL has no account name. First Pages deployment: `b620274f`.
- Old address https://dear-days.mcleinonza0531.workers.dev is the Worker `dear-days`, now only a 302 redirect
  to the same path/query on the new origin plus a retiring `/sw.js` (`MyJournal/redirect/`, version `f4fa916c`).
  It holds no secrets or bindings (old secrets deleted 2026-11-05; Pages has its own copies).
- Production R2 bucket: `journal-assets-prod`.
- First frontend deployment: 2026-11-05 (`60619339-b109-4d90-91b8-89c059a81ae8`).
- Verified backend deployment before font update: `5efaaf48-ce9e-4326-b486-c35fcd4b47e9`.
- Current deployment with parallel offline font caching: `41c983f4-bc2d-45e7-80af-4821657efb99`.
- Configuration: `MyJournal/wrangler.jsonc` (Pages: `pages_build_output_dir`, R2 binding, vars);
  `functions/api/[[path]].ts` mounts the Hono/Better Auth app for `/api/*`; static assets use `_headers`.
- Pre-Pages Worker deployments (history): `60619339…`, `5efaaf48…`, `41c983f4…`.

## Live capabilities

Email/password signup, required email verification, login/logout, password reset
with old-session revocation, owner-scoped cloud journals, private R2 media,
revision-safe synchronization, explicit guest-journal import, conflict copies,
account backup ZIPs, and password-confirmed account deletion are deployed.

Journals save locally first. Guest storage remains `mlw_v2`; account caches and
text/caption recovery keys include immutable account IDs. Localhost and the live
origin have separate browser storage. Guest data is imported only by explicit
choice; the guest original remains intact. Cloud conflicts preserve local data
and require review rather than silently overwriting another device's version.

All 33 journal font choices and Noto Sans KR are vendored with licenses and package
versions under `public/fonts/`. Core and picker stylesheets use the app origin;
all WOFF2 subsets are cached through a versioned, bounded parallel installer. The app shell uses Workbox precaching; obsolete font/Google caches are cleaned up. There are no Google Fonts runtime requests.
The full first-install precache is approximately 63 MiB including stickers/fonts.

## Database and private media

The existing Neon production database contains Better Auth tables and additive
`journal_books`, `journal_assets`, and `journal_account_state` tables. Schema SQL
is committed under `api/migrations/`; migrations use the direct URL and preserve
existing user data. Cloud snapshots use server CAS versions and durable mutation
IDs independently of local IndexedDB revision counters.

`JOURNAL_FILES` is a native private R2 binding. Upload reservation, quota checks
(10 MB per file, 500 MB per account), original content commits, and account deletion
share an owner lock. A durable deleting gate rejects writes after deletion begins.
Failed media cleanup leaves account deletion retryable. Media download routes
require a session and expected-account header; responses are private/no-store.
S3 keys stay local for explicit test cleanup; browsers never receive credentials.

## Commands

From `MyJournal/`:

```sh
npm ci
npm run typecheck
npm test
npm run db:plan
npm run db:migrate
npm run test:api
npm run deploy:check
npm run deploy            # Cloudflare Pages
npm run deploy:redirect   # old workers.dev address → new URL
```

Migrations are explicit and are not a build/deploy side effect. `test:api` uses the
configured database, synthetic isolated users, and an in-memory email/storage
capture; it removes only its own user rows. `deploy` builds before publishing.

`npm run test:live` explicitly sends verification/reset mail to a unique
plus-address of the configured Gmail sender and reads only those test emails via
IMAP. It checks real production auth/sync/R2 and deletes its test account/media.
Set `PLAYWRIGHT_MODULE` to an installed Playwright ESM module to additionally test
real browser sign-in, editable text synchronization, second-browser hydration,
and sign-out. It is never run automatically at startup or deployment.

`npm run fonts:vendor` refreshes local Fontsource assets using npm archive integrity
checks; deployed pages do not fetch fonts from npm or a font CDN.

## Runtime settings

These five values are configured as Pages project secrets (production), read from the ignored local
`.env` without printing them: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SMTP_USER`,
`SMTP_PASS`, `EMAIL_FROM`. The direct DB URL remains local for migrations.

Public Worker vars: `BETTER_AUTH_URL` and `APP_ORIGIN` both use the live HTTPS
origin; Gmail host/port/TLS are in `wrangler.jsonc`. Frontend API base is `/api`.
Use `wrangler pages secret put|bulk --project-name dear-days` to change server secrets; never put them in `VITE_*`
variables or upload `.env` as an asset.

Gmail uses TLS on port 465 with a Google App Password. The Worker supplies a direct
hostname TLS socket to Nodemailer: its default pre-resolved IP connection was
rejected by the outbound proxy. Live verification/reset delivery passes after
this fix. Mail tasks run through `waitUntil` with bounded timeouts and sanitized
errors. DB pools are request-scoped and closed after handler work.

## Verification and limits

- 2026-11-05 on https://dear-days.pages.dev: full `npm run test:live` (with browser) passes —
  real Gmail verification/reset delivery through Pages Functions, two sessions, CAS conflicts, private R2,
  chibi account save/read/newest-wins/validation, browser sign-in/sync/hydration, reset revocation, deletion.
  Old address redirect and retiring service worker verified. Migration `002-chibi.sql` applied.

- 164 frontend/storage/font/service-worker checks pass; TypeScript, production/PWA build and
  Wrangler dry run pass.
- Seven real-Postgres integration checks pass: verification/login, session and
  owner isolation, idempotence/CAS conflict, document/media validation, private
  immutable uploads/archive changes, reset/token reuse/session revocation, and
  failed deletion gate/retry/cascade cleanup.
- Live Gmail email delivery and links, two sessions, browser input/second-browser
  hydration, stale-write rejection, real R2 upload/download and account/file
  deletion pass. Temporary QA accounts remaining: zero.
- Isolated headless Chromium verified desktop/mobile login rendering, password
  visibility, guest boot, closed-book Account access and signup navigation.
- Phone/Safari touch/install checks, complete accessibility, v1 import and the
  customizable chibi remain separate unfinished work.
- Dependency audit: no high/critical findings; six existing low/moderate findings
  remain in build tooling.

Final self-hosted-font browser check passes: all 34 families loaded online, zero Google Fonts requests, and Korean text loads after an offline journal reload. The full first-install cache completed in 187 seconds on the test connection; subsequent loads reuse it. Evidence: `MyJournal/validation/self-hosted-fonts-check.json`.
