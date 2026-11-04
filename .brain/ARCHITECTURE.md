---
type: architecture
title: Jangie's Website — Architecture (v2 3D Journal)
project: Jangie's Website
tags: [architecture, 3d-book, neon, r2, workers]
last_updated: 2026-11-05
---

# Architecture — v2 Customizable 3D Journal

## Layout of the repo (target)
```
MyJournal/
  index.html            app shell
  src/
    main.ts             boot, router (login ↔ book)
    state/              store.ts (single store + subscribe), schema.ts (types)
    book/               Book.ts, Leaf.ts, Tabs.ts, flip.ts, Bookmark.ts
    canvas/             PageCanvas.ts, Element.ts, transform.ts (drag/rotate/scale)
    frames/             frames.ts (frame registry), tear.ts (tear tool)
    stickers/           generatedPacks.ts, legacy SVG definitions, StickerTray.ts
    customize/          CoverPanel.ts, PaperPanel.ts, BackgroundPanel.ts
    login/              Login.ts, Chibi.ts, chibi-parts/*.svg, ChibiEditor.ts
    sync/               local.ts (IndexedDB), api.ts, sync.ts (queue)
    styles/             tokens.css, book.css, paper.css, frames.css, login.css
  api/                  Cloudflare Worker (Hono)
    src/index.ts        routes
    src/db/schema.sql   Neon schema + migrations
  public/stickers/generated/  30 original transparent PNG assets
  .env / .env.example
```

## The 3D book (CSS 3D, not WebGL)
- `.desk` (background) → `.book` (`perspective: 2000px`, `transform-style: preserve-3d`).
- Book = front cover + back cover + spine + a stack of **leaves**. Each leaf is one DOM node
  with two faces (`.face-front`, `.face-back`, `backface-visibility: hidden`), hinged on the
  spine with `transform-origin: left center`. Flipping = `rotateY(0 → -180deg)`.
- Only the **visible spread ± 2 leaves** are mounted. Pages further away are drawn as a
  CSS "page edge" stack (repeating gradient) so 200 pages cost nothing.
- **Tabs** are children of the first leaf of each section, positioned on the fore-edge,
  staggered vertically, colored per section. Clicking one flips forward/back to that leaf.
- **Multi-page jump**: animate at most 5 leaves with 60 ms stagger (a "riffle"), then swap
  the real target spread in. Long jumps look like a riffle, not 80 sequential flips.
- Flip shading: a gradient overlay on the turning face whose opacity follows the angle.

## Page canvas
- Each page face holds a `PageCanvas`: paper background + absolutely positioned elements.
- Positions stored in **page units** (0–1 of page width/height) so pages scale to any screen.
- Elements: `text`, `photo`, `sticker`, `tape`, `drawing`. Each has `x, y, w, rot, z`.
- One transform controller (pointer events) for drag / rotate handle / resize handle / pinch.

## Frames and the tear tool
- A frame is a pure render function `(photoEl, options) → DOM/CSS`. Registry in `frames.ts`.
- **Tear** is non-destructive: the user drags a path across the photo; we smooth it,
  add jagged noise, and store it as a normalized polygon. Rendered with an SVG `clipPath`
  plus a white fibrous edge (offset copy of the edge) and a soft shadow. Original image
  is never modified, so “reset tear” always works.

## Data model (Neon, mirrored in IndexedDB)
```
users(id, email, name, created_at)            -- managed by Better Auth tables
books(id, user_id, title, cover_color, cover_texture, paper_type, background, updated_at)
sections(id, book_id, name, color, icon, position)
pages(id, section_id, position, paper_override, updated_at)
elements(id, page_id, type, x, y, w, h, rot, z, data jsonb, updated_at)
assets(id, user_id, kind[photo|sticker|background], r2_key, mime, bytes, w, h, created_at)
bookmarks(user_id, book_id, page_id, updated_at)
chibi_profiles(user_id, config jsonb, updated_at)
```
`elements.data` holds type-specific fields (text content/font, photo asset id + frame + tear polygon, sticker id).

## Storage + sync
- **Local-first**: every edit writes to IndexedDB immediately (works offline).
- A sync queue pushes changes to the API (debounced 1.5 s); last-write-wins by `updated_at`.
- **Images**: client compresses (existing `compressImage`) → asks API for a presigned R2
  PUT URL → uploads directly to R2 → saves an `assets` row. The browser never sees R2 keys.

## API (Hono on Workers)
```
/api/auth/*                     Better Auth handlers
GET  /api/books/:id             full book (sections, pages, elements)
PATCH /api/books/:id            cover/paper/background
POST /api/sync                  batched element/page upserts + deletes
POST /api/assets/upload-url     → presigned R2 PUT
GET  /api/assets/:id            → short-lived signed GET (owner only)
GET  /api/account/export        all user data
DELETE /api/account             delete user + R2 objects
PUT  /api/bookmark              save last page
GET/PUT /api/chibi              chibi config
```
