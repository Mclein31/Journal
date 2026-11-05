---
type: notes
title: Jangie's Website — Notes
project: Jangie's Website
tags: [notes]
last_updated: 2026-11-04
---

# Notes

## Env vars (`MyJournal/.env`, template `.env.example`)
- `DATABASE_URL` (pooled, runtime) / `DATABASE_URL_UNPOOLED` (migrations) — Neon
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_S3_ENDPOINT` — Cloudflare R2
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` — login sessions
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` — planned Gmail verification + password reset emails. `SMTP_PASS` is a Google App Password, not the account login password. See `MyJournal/SMTP_SETUP.md`.
- R2 bucket must stay private (no public URL)
- `APP_ORIGIN` (CORS), `VITE_API_BASE_URL` (only var exposed to the browser)
- Only `VITE_*` vars reach the browser. Never prefix a secret with `VITE_`.
- Production uses Neon's `production` branch, `R2_BUCKET_NAME=journal-assets-prod`, and `VITE_API_BASE_URL=/api`. Both origin fields use `https://dear-days.pages.dev` (Cloudflare Pages since 2026-11-05; the old workers.dev URL redirects). Email/auth/backend services are deployed and verified; see DEPLOYMENT.md. Native R2 bindings handle media; S3 keys remain local for explicit maintenance/test cleanup.

## v1 facts still relevant
- v1 localStorage keys: `mlw_t` tasks, `mlw_j` journal entries, `mlw_p` prefs, `mlw_g` gallery meta; IndexedDB `mlw_db` store `photos` holds blobs.
- v1 backup JSON: `{version:1, tasks, journals, prefs, gallery, photos{id: dataURL}}` — Phase 11 importer reads this.
- Palette: accent `#f2879e`, cream `#fdf0ee`, dark surface `#231c20`. Fonts: Gaegu, Caveat, Nunito, Lora, Playfair Display, Noto Sans KR.
- Korean title translation: Google gtx endpoint first, MyMemory fallback (`korean-convert.js`).
