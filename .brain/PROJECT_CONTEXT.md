---
type: project-brain
title: Jangie's Website — Project Context
project: Jangie's Website
status: frontend-implemented
tags: [project, journal, 3d-book, pwa, neon, r2]
last_updated: 2026-11-05
---

# Jangie's Website (✿ My Little World ✿) — Project Context

> The v1 brain (Aug 2026) described a tabbed journal/schedule/gallery PWA.
> It was replaced on 2026-11-04 by this redesign brief. v1 code still lives in `MyJournal/`.

## Vision
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
Frontend phases 0–8 are implemented in `MyJournal/`, with UI/reliability polish and a 128-check functional QA pass on 2026-11-05. Browser/device and full accessibility sign-off remain pending; see [QA_REPORT.md](QA_REPORT.md). Login/backend/deployment phases remain pending. See [TODO.md](TODO.md) for the live checklist and [HANDOFF.md](HANDOFF.md) for verification limits.

## Stack (target)
- **Frontend**: Vite + TypeScript, no UI framework. 3D is CSS 3D transforms (not WebGL).
- **API**: Hono on Cloudflare Workers.
- **Database**: Neon Postgres (`DATABASE_URL`).
- **File storage**: Cloudflare R2 (photos, stickers, backgrounds) via presigned uploads.
- **Auth**: Better Auth, email + password, open public sign-up, email verification + reset via Resend. Each user's journal is private.
- **Hosting**: one Cloudflare Worker serving static assets + `/api`.
- **Offline**: local-first IndexedDB cache + service worker, syncs to the API when online.
- Env keys: `MyJournal/.env` (values empty; template in `MyJournal/.env.example`).

## Constraints
- Must feel good on a phone (touch drag, pinch, no hover-only controls).
- Respect `prefers-reduced-motion` (flips become crossfades).
- All art (chibi, stickers, textures) is original — no copied characters or brand logos.
