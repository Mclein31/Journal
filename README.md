# ✿ My Little World ✿

A cozy, customizable 3D journal built with Vite and TypeScript. Open the cover, pull a section tab, and decorate pages with writing, framed photos, and original stickers.

The current app is in `MyJournal/`. Its predecessor is preserved in `MyJournal/legacy/`; `MyLittleWorld/` is the project's Obsidian vault and is excluded from Git along with private source photos.

```sh
cd MyJournal
npm install
npm run dev
```

- Work across both pages by default; the **Two-page spread** toolbar button switches to a larger one-page view of the active page. Photos, stickers, and text cross the spine continuously, with a subtle crease; the outer book edges clip overflow.
- Customize the cover, paper, and desk from **Style**. Set a different paper pattern for the active page under **Paper → This page only**.
- The sticker box has **30 ChatGPT image-generated stickers** with transparent backgrounds, categories, and search. **Studio** shows the complete collection, including gender-neutral everyday objects, food, music, nature, and travel. **Flowers** includes white roses, white lilies, and white orchids. Remove uploads with the trash button; restore them from **Your stickers → Removed stickers**. Placed copies remain intact. Older saved sticker IDs still resolve. Delete/Backspace removes the selected placed sticker while the tray is open; Undo/Redo works there too. Typing in search keeps normal keyboard editing.
- Select text and open **Font and ink**. Choosing a category applies its default font; pick a specific font beneath it for another style. Use **Text style** for custom ink, textured highlights, and slightly imperfect pen-style underline/strikethrough. Changes apply to the whole selected text box. Text boxes stay one page wide at every font size; the existing corner handle or pinch changes the lettering size. Paper, frame borders and stickers have subtle grain.
- Select a photo and open **Frame** for visual frame previews, custom border colors, and captions. Tears preserve the original photo.
- Drag empty paper to turn a page: the bend follows the grab point and the release settles with momentum. Catch a settling single turn to reverse it; fast page-button presses queue correctly. Reduced motion uses a flat fade.
- Drag items to move them; use the corner handle or pinch to resize/rotate. Undo and redo work from the toolbar or keyboard.
- Changes save on this device using IndexedDB, with text/caption recovery. Conflicting saves from another window are blocked, with a download option for unsaved changes. Older recovered words are kept separately if they conflict with the latest saved text. Cloud accounts and sync are planned and are not implemented yet.

Validation (tests use Node 26's built-in TypeScript stripping and VM modules):

```sh
npm run typecheck
npm test
npm run build
```

Project context and outstanding work are in [.brain/PROJECT_CONTEXT.md](.brain/PROJECT_CONTEXT.md) and [.brain/TODO.md](.brain/TODO.md).

All 152 automated checks pass, exercising real application modules using a simulated DOM and IndexedDB, including each sticker's editing workflow, interrupted captions and conflicting saves. The production service-worker manifest includes all 30 PNGs. Local HTTP checks pass for the built shell, manifest, worker and PNGs. Native rendering, touch, offline operation, installation and full accessibility still require browser/device QA. See the [QA report](.brain/QA_REPORT.md).

See the [complete sticker preview](MyJournal/validation/generated-sticker-preview.png) and [generation records](MyJournal/validation/sticker-generation.json).
