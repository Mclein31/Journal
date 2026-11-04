# ✿ My Little World ✿

A cozy, customizable 3D journal built with Vite and TypeScript. Open the cover, pull a section tab, and decorate pages with writing, framed photos, and original stickers.

The current app is in `MyJournal/`. Its predecessor is preserved in `MyJournal/legacy/`; `MyLittleWorld/` is the project's Obsidian vault and is excluded from Git along with private source photos.

```sh
cd MyJournal
npm install
npm run dev
```

- Work across both pages by default; the **Two-page spread** toolbar button switches to a larger one-page view. Photos, stickers, and text can cross the spine continuously, with a subtle crease over the artwork.
- Customize the cover, paper, and desk from **Style**. Set a different paper pattern for the active page under **Paper → This page only**.
- The sticker box has **30 ChatGPT image-generated stickers** with transparent backgrounds, categories, and search. **Studio** shows the complete collection, including gender-neutral everyday objects, food, music, nature, and travel. **Flowers** includes white roses, white lilies, and white orchids. Remove uploads with the trash button; restore them from **Your stickers → Removed stickers**. Placed copies remain intact. Older saved sticker IDs still resolve.
- Select text and open **Font and ink**. Choosing a category applies its default font; pick a specific font beneath it for another style. Use **Text style** for custom text colors, imperfect marker-style highlights, underline, and strikethrough. Changes apply to the whole selected text box.
- Select a photo and open **Frame** for visual frame previews, custom border colors, and captions. Tears preserve the original photo.
- Drag items to move them; use the corner handle or pinch to resize/rotate. Undo and redo work from the toolbar or keyboard.
- Changes save on this device using IndexedDB, with text-draft recovery. Cloud accounts and sync are planned and are not implemented yet.

Validation (tests use Node 26's built-in TypeScript stripping and VM modules):

```sh
npm run typecheck
npm test
npm run build
```

Project context and outstanding work are in [.brain/PROJECT_CONTEXT.md](.brain/PROJECT_CONTEXT.md) and [.brain/TODO.md](.brain/TODO.md).

All 81 automated checks pass, exercising real application modules using a simulated DOM and IndexedDB, including each sticker's editing and persistence workflow. The production service-worker manifest includes all 30 PNGs. Native rendering, touch behavior, offline service-worker operation, and installation still require browser/device QA.

See the [complete sticker preview](MyJournal/validation/generated-sticker-preview.png) and [generation records](MyJournal/validation/sticker-generation.json).
