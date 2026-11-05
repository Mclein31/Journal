# Journal functional QA — 2026-11-05

## Result and limits

**128 automated checks pass; TypeScript and the production/PWA build pass.** This pass added 47 regressions to the original 81 checks. The implemented app is the local-first frontend in `MyJournal/`; accounts, cloud sync, migration and deployment are still pending.

This is **not browser/device sign-off**. Computer-use inventory reported the browser host unavailable, and access to Google Chrome was denied. DOM integration uses the actual app modules with simulated geometry, focus, image decoding, animation, audio and native install APIs. The user's Safari screenshot is direct evidence of the original outer-edge overflow. Its CSS fix and the new textures have not been inspected in a running browser.

## Coverage matrix

| Area | Evidence | Result |
|---|---|---|
| Open/close, next/previous, tabs, page drag/cancel, new pages | `ui.test.mjs` | Automated pass |
| Section rename/add/reorder/delete; retain current page and keyboard focus | `ui.test.mjs`, `navigation-qa.test.mjs` | Automated pass |
| Active left/right page, spread/single round trips, bookmark placement/navigation | `ui.test.mjs`, `navigation-qa.test.mjs` | Automated pass |
| Text entry, Korean fonts, ink, highlight, underline/strike, fixed one-page width through scaling, duplication/deletion | `ui.test.mjs`, `tactile-qa.test.mjs`, `text-width-qa.test.mjs` | Automated pass |
| Photo button/drop/paste handlers, mixed/invalid files, target removed during import | `ui.test.mjs`, `navigation-qa.test.mjs`, `editing-qa.test.mjs` | Automated pass; native clipboard/drop unverified |
| Move, pinch, rotation, resize, cross-spine ownership and layers | `elements.test.mjs`, `ui.test.mjs`, `generated-stickers.test.mjs` | Automated pass; native gestures unverified |
| All 12 frames, frame color, caption edits/lifecycle/Undo/recovery | `ui.test.mjs`, `editing-qa.test.mjs` | Automated pass; native painting unverified |
| Tear geometry, retained piece, repeat tear, cancel/reset/Undo | `tear.test.mjs`, `ui.test.mjs` | Automated pass; touch and keyboard completeness pending |
| All 30 generated stickers: placement → spine drag → transform → duplicate → effects → delete/Undo → reload | `generated-stickers.test.mjs` | Automated pass for every PNG |
| Sticker search/categories, old saved IDs, upload alpha, remove/restore, Delete/Backspace and Undo/Redo with tray open | `generated-stickers.test.mjs`, `image.test.mjs`, `ui.test.mjs`, `sticker-delete-qa.test.mjs` | Automated pass; real codec support unverified |
| Cover/paper/page override/desk, successful/failed upload batches and removal/Undo | `ui.test.mjs`, `upload-backgrounds-qa.test.mjs` | Automated pass |
| Atomic autosave, failed-save retry, final-keystroke recovery, history after save failure | `persistence.test.mjs`, `editing-qa.test.mjs` | Automated pass with controlled failures |
| Two windows: stale/simultaneous writers, read-only no-op saves, legacy records | `storage-conflicts-qa.test.mjs` | Automated pass using independent stores sharing IndexedDB |
| Stale recovery quarantine, real boot restoration, conflict dialog/download construction | `storage-conflicts-qa.test.mjs`, `conflict-ui-qa.test.mjs` | Automated pass; native download unverified |
| Native install prompt lifecycle | `ui.test.mjs` | Event simulation passes; actual installation pending |
| Production shell, manifest, SW file, all 30 PNG responses and precache URLs | `validation/production-http-check.json` | Local production HTTP pass; actual offline execution pending |
| Outer book clipping, textured marks/paper/sticker masks | Source review, cross-spine regressions, `tactile-qa.test.mjs`, static `validation/tactile-preview.png` | Implemented; rendered-browser verification pending |

## Reproduced defects fixed

P1 = potential data loss. P2 = broken or misleading interaction. Every functional fix has an actual-module regression; the outer clipping fix is supported by the user's screenshot and existing continuous-spread regressions rather than a simulated paint assertion.

| ID | Severity | Reproduction and previous result | Fixed behavior |
|---|---|---|---|
| QA-01 | P2 | Open Memories, move its section up → another section replaces the open pages | Preserve page identity when section order changes |
| QA-02 | P2 | Activate the right page, choose one page → left page opens | Follow the active page through layout changes |
| QA-03 | P2 | Bookmark left, activate right, Bookmark → bookmark disappears | Move to the active page; remove only when toggling that same page |
| QA-04 | P2 | Keyboard-activate a reorder arrow → focus points to detached row | Restore focus in the moved section |
| QA-05 | P2 | Activate Undo while text still has focus → wrong edit undone and Redo disappears | Commit the active edit before changing history |
| QA-06 | P2 | Drop a text file → browser default remains enabled; mixed drops silently skip files | Prevent file navigation and report unsupported files while importing valid images |
| QA-07 | P2 | Drop on the right half of left-owned spanning art → image belongs to left page | Assign ownership using the physical drop location |
| QA-08 | P1 | Delete an import's target page while compression/storage is pending → orphaned photo disappears after reload | Reject missing targets and clean up the unfinished import's blob |
| QA-09 | P1 | Type either kind of photo caption and background/leave without blur → last words disappear | Synchronous caption recovery plus lifecycle commit and ordered saves |
| QA-10 | P2 | Double-click an active caption or switch captions → detached editor receives focus | Preserve native word selection and re-query the connected target |
| QA-11 | P1 | Commit caption, Undo, save/reload → undone words return through recovery (also after save failure) | Ordered caption acknowledgement and history-aware recovery |
| QA-12 | P2 | Upload good/bad/good backgrounds → processing stops at the bad file; partial result stays invisible | Continue the batch, refresh successes and report a failure count |
| QA-13 | P1 | Two windows edit the same book → later stale snapshot erases the first save | Atomic revision check rejects the stale writer and provides an export/reload dialog |
| QA-14 | P2 | Switch between clean reading windows → unchanged flush claims a revision and causes conflict | Skip clean writes; preserve initial/legacy saves |
| QA-15 | P1 | Reload after a rejected write → stale draft overwrites newer text; naive clean-write guard skips valid boot recovery | Compare each draft with its original field content, quarantine conflicting words, explicitly save valid boot recovery |
| QA-16 | P2 | Rotate/resize an image near an outer page boundary → artwork paints outside the book (user Safari screenshot) | Clip the shared canvas at its outer boundary while retaining continuous spine crossing |
| QA-17 | P2 | With sticker tray open, Delete/Backspace cannot remove the selected placed sticker | Allow sticker deletion and history shortcuts while preserving native search editing and other modal ownership |
| QA-18 | P2 | Scaling changes both typing width and font size; user clarified the final desired width is always exactly one page | Normalize legacy/new text widths to one page, enforce on updates/rendering, scale only the lettering through the existing corner handle or pinch |

## Requested visual refinements

- Text boxes always use one page of width at every scale, with the existing single resize/rotate handle. There is no extra width handle or percentage field. Older boxes normalize on load and the normalized width is saved.
- Underline and strikethrough have deterministic, slightly uneven pen paths with varying pressure. Ink color follows the selected text color. Native decoration semantics remain; forced-colors mode restores visible native rules.
- Highlights retain their irregular outline and now include fine ink/fiber gaps. Text remains real editable text above the background layers.
- Paper and frame borders receive subtle grain. Sticker grain uses the original artwork as an alpha mask, including uploaded images after loading. Original generated PNG files remain unchanged.
- `validation/tactile-preview.png` is a static artwork sample, not a screenshot of the app or browser verification.

## Remaining release checks

- Actual Chrome/Safari/Firefox painting, especially Safari clipping, masks, wrapped backgrounds and CSS 3D.
- Real iOS Safari and Android Chrome: portrait/landscape, pinch/drag/cancel, virtual keyboard, page turns and installation.
- First-install/offline/update operation and storage quotas on devices. The roughly 42 MiB initial precache needs a real device check.
- Complete keyboard-only selection/move/resize of canvas items and keyboard alternatives for drawing/selecting tears. Section-manager focus and inspector keyboard ownership are covered, but this is not full accessibility sign-off.
- Screen-reader walkthrough, zoom/reflow, forced-colors rendering and reduced-motion rendering.
- Real codec/EXIF/large-file handling and actual downloaded recovery-file behavior.
- Login/chibi (Phase 9), backend/auth/sync (Phase 10), v1 import and deployment (Phase 11) are not implemented and cannot be marked tested.

Dependency audit passes the high threshold: **0 high/critical**, 2 low and 4 moderate transitive build-tool findings. The suggested forced fix downgrades the PWA plugin across a major version and was not applied. The PWA build still emits its existing nonblocking `inlineDynamicImports` deprecation warning.
