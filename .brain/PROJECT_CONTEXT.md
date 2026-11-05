---
type: project-brain
title: Jangie's Website — Project Context
project: Jangie's Website
status: backend-live
tags: [project, journal, 3d-book, pwa, neon, r2]
last_updated: 2026-11-05
---

# Jangie's Website (✿ Dear Days ✿) — Project Context

> The v1 brain (Aug 2026) described a tabbed journal/schedule/gallery PWA.
> It was replaced on 2026-11-04 by this redesign brief. v1 code still lives in `MyJournal/`.

## Vision
Aesthetic journal app name: **Dear Days**, chosen by the user on 2026-11-05.
A **customizable 3D journal**. The whole app is one physical-feeling book on a desk.
You change sections by pulling the **tabs** that stick out of the pages, the pages
**flip**, and every page is a free canvas for writing, photos and stickers.

## Core features (the brief)
1. **3D book** with cover, spine, page stack, and **pull tabs** per section. Tabs are the
   only section navigation. Next/Prev page also flips.
2. **Book customization**: cover color, cover texture, paper type (dotted, lined, plain).
3. **Backgrounds** (the desk behind the book): preset choices + user uploads.
4. **Draggable photos**: drop a photo on a page, drag it anywhere, rotate, resize.
5. **Photo frames**: polaroid, instant-film card, photocard, torn paper, tape, film strip, stamp, and more.
6. **Freehand tear tool**: user drags across a photo to draw exactly where it tears.
7. **Stickers** to decorate pages (built-in packs + user uploads).
8. **Page-flip animation** for tab jumps and next/prev.
9. **Bookmark**: ribbon bookmark + autosave so users continue where they stopped.
10. **Login screen** with a **chibi girl** whose eyes follow the cursor; the chibi is customizable.

## Sections (tabs) — default set
Journal · Schedule · Memories (photos) · Notes. Users can rename, recolor, add, and reorder tabs.
Existing v1 features (tasks, journal entries, Korean title translation, gallery) move *into* the book.

## Status
Dear Days is live at **https://dear-days.mcleinonza0531.workers.dev** with email/password accounts, Gmail verification/reset emails, private R2 uploads, account-scoped offline caches, and revision-protected cloud sync. Live tests verified real email delivery, two sessions, browser editing/second-browser hydration, password reset/session revocation, and account/media deletion. Login screens render on desktop/mobile. Physical-device, full accessibility, v1 import, and customizable chibi work remain pending. See [DEPLOYMENT.md](DEPLOYMENT.md), [TODO.md](TODO.md), and [HANDOFF.md](HANDOFF.md).

## Stack (target)
- **Frontend**: Vite + TypeScript, no UI framework. 3D is CSS 3D transforms (not WebGL).
- **API**: Hono on Cloudflare Workers.
- **Database**: Neon Postgres (`DATABASE_URL`).
- **File storage**: private Cloudflare R2 through authenticated Worker upload/download routes; native R2 binding enforces owner scope and upload size.
- **Auth**: Better Auth, email + password, open public sign-up, email verification + reset via Gmail SMTP (TLS on port 465, Google App Password). Each user's journal is private. SMTP delivery is verified in the deployed Worker.
- **Hosting**: one Cloudflare Worker serving static assets + `/api`.
- **Offline**: owner-scoped IndexedDB cache + service worker; whole-book JSONB snapshots synchronize using server revisions and idempotent mutations. Conflicts preserve both copies.
- Production setup: Neon `production` branch and the user-created private R2 bucket `journal-assets-prod`; no development bucket is required. Preserve user-supplied credentials in ignored `MyJournal/.env`. All configured keys are populated; database, SMTP, R2, and auth are live-tested. Template: `MyJournal/.env.example`; Gmail instructions: `MyJournal/SMTP_SETUP.md`. Runtime secrets are configured on the Worker; server credentials never enter frontend assets. All 33 font choices and Korean fallback are bundled locally as WOFF2 with licenses and offline caching; no Google Fonts runtime requests.

## Constraints
- Must feel good on a phone (touch drag, pinch, no hover-only controls).
- Respect `prefers-reduced-motion` (flips become crossfades).
- All art (chibi, stickers, textures) is original — no copied characters or brand logos.
