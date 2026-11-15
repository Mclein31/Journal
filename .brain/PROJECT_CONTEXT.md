---
type: project-brain
title: Jangie's Website — Project Context
project: Jangie's Website
status: live
tags: [project, journal, 3d-book, pwa, neon, r2]
last_updated: 2026-11-15
---

# Jangie's Website (Dear Days) — Project Context

> The v1 brain (Aug 2026) described a tabbed journal/schedule/gallery PWA. It was replaced on
> 2026-11-04 by the v2 redesign below. v1 code is preserved in `MyJournal/legacy/`.

## Vision
**Dear Days** (name chosen by the user on 2026-11-05) is a customizable 3D journal. The whole app
is one physical-feeling book on a desk: pull the **tabs** sticking out of the pages to change
section, pages **flip**, and every page is a free canvas for writing, photos and stickers.
Open to the public: anyone can sign up, and every user's journal is private.

## Core features
1. **3D book** (cover, spine, page stack) with **pull tabs** per section; next/prev, swipe and
   drag-to-turn also flip pages. Default view is a two-page spread; one-page view is a toolbar toggle.
2. **Book customization**: cover color/texture/title, paper type and tint (per book or per page).
3. **Desk backgrounds**: presets plus user uploads.
4. **Page canvas**: photos, text and stickers you can drag, rotate, resize and pinch; undo/redo.
5. **Photo frames** (12 styles) with captions and colors, plus a non-destructive **freehand tear tool**.
6. **Stickers**: 30 image-generated transparent PNGs plus user uploads.
7. **Bookmark** ribbon and autosave with text/caption recovery.
8. **Login screen** with a gender-neutral, customizable chibi whose eyes follow the cursor/caret,
   and a login journal that mirrors the user's own book look.
9. **Accounts and cloud sync**: verified email/password accounts (six-digit email codes),
   private R2 media, revision-protected sync, backups, account deletion. Guest (device-only) mode remains.

Default sections: Journal · Schedule · Memories · Notes (users can rename, recolor, add, reorder).

## Status (verified 2026-11-15)
- **Live** at **https://dear-days.pages.dev** (Cloudflare Pages project `dear-days`); the old
  workers.dev address only redirects. Current deployment: Pages `b1197300` (2026-11-06, email codes).
- Phases 0–10 of the original plan are done and deployed. Remaining: v1 data import, physical
  device/native browser QA, and full accessibility sign-off. See [TODO.md](TODO.md).
- 180 frontend/storage/font/service-worker tests pass (`npm test`, re-run 2026-11-15).
- Repo: `https://github.com/Mclein31/Journal.git` (`main`); last code commit 2026-11-06,
  last brain commit 2026-11-11 (FLOW.json project map).

## Stack
- **Frontend**: Vite 8 + TypeScript 7, no UI framework; 3D via CSS 3D transforms (not WebGL).
  PWA via `vite-plugin-pwa` (injectManifest, hand-written `src/sw.ts`).
- **API**: Hono 4 + Better Auth 1.7 (email/password + emailOTP plugin) in a Cloudflare Pages
  Function (`functions/api/[[path]].ts`) serving `/api/*`.
- **Database**: Neon Postgres (`production` branch), via `@neondatabase/serverless`.
- **Media**: private Cloudflare R2 bucket `journal-assets-prod` through the native `JOURNAL_FILES` binding.
- **Email**: Gmail SMTP (port 465, TLS, Google App Password) via Nodemailer.
- **Offline**: owner-scoped IndexedDB cache + service worker; all 33 font choices and the Korean
  fallback are self-hosted WOFF2.

Details: [ARCHITECTURE.md](ARCHITECTURE.md), [DEPLOYMENT.md](DEPLOYMENT.md), [NOTES.md](NOTES.md),
[DECISIONS.md](DECISIONS.md), [QA_REPORT.md](QA_REPORT.md).

## Constraints
- Must feel good on a phone (touch drag, pinch, no hover-only controls).
- Respect `prefers-reduced-motion` (page turns become flat fades/crossfades).
- Art must be original; no copied characters or brand logos. Frames use generic names.
- Neutral visual identity: no pink UI defaults (see DECISIONS).
- Server secrets never enter frontend assets (only `VITE_*` vars reach the browser).

## Repository layout
`MyJournal/` is the app (frontend, `api/`, `functions/`, `redirect/`, tests). `MyLittleWorld/` is
the project's Obsidian vault (git-ignored). `MyJournal/assets/` holds private source photos (git-ignored).
