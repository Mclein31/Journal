/* Renders one page face: paper + its elements. Elements use page units (0..1) → percentages. */
import type { BookDoc, PageElement } from '../state/schema';
import type { Layout } from './layout';
import { bindAssetImage } from '../sync/assetUrls';
import { frameDef } from '../frames/frames';
import { stickerDef, stickerUri } from '../stickers/packs';
import { fontDef, fontStack } from '../fonts/fonts';
import { markerBackground, penMarksBackground } from '../fonts/highlight';

export function renderPage(doc: BookDoc, layout: Layout, index: number | undefined, side: 'left' | 'right', withElements = true): HTMLElement {
  const el = document.createElement('div');
  el.className = `page page-${side}`;
  if (index === undefined) {
    el.classList.add('page-empty');
    return el;
  }
  const page = layout.pages[index];
  const section = layout.sectionOf(index);
  el.dataset.paper = page.paperOverride ?? doc.book.paperType;
  el.dataset.pageId = page.id;
  if (section) el.style.setProperty('--section', section.color);

  const sheet = document.createElement('div');
  sheet.className = 'page-sheet';
  // facing pages share the spine: pages 2k (left) and 2k+1 (right). Items that run past the spine
  // are drawn again on the partner page, shifted one page width, so they carry over seamlessly.
  const pair = index % 2 === 0 ? 'left' : 'right';
  el.dataset.pair = pair;
  const partner = layout.pages[pair === 'left' ? index + 1 : index - 1];
  const own = doc.elements.filter((e) => e.pageId === page.id).map((e) => ({ e, offset: 0 }));
  const carried = partner
    ? doc.elements
        .filter((e) => e.pageId === partner.id)
        .map((e) => ({ e, offset: pair === 'right' ? -1 : 1 }))
    : [];
  if (withElements) for (const { e, offset } of [...own, ...carried].sort((a, b) => a.e.z - b.e.z)) sheet.appendChild(renderElement(e, offset));
  el.appendChild(sheet);

  const foot = document.createElement('div');
  foot.className = 'page-foot';
  foot.textContent = `${section?.name ?? ''} · ${index + 1}`;
  el.appendChild(foot);
  return el;
}

function renderElement(e: PageElement, offset = 0): HTMLElement {
  const node = document.createElement('div');
  node.className = `el el-${e.type}`;
  node.dataset.elId = e.id;
  node.dataset.ownerPage = e.pageId;
  if (offset) node.dataset.ghost = String(offset); // the carried-over half on the facing page
  node.style.left = `${(e.x + offset) * 100}%`;
  node.style.top = `${e.y * 100}%`;
  node.style.width = `${(e.type === 'text' ? 1 : e.w) * 100}%`;
  if (e.h !== undefined) node.style.height = `${e.h * 100}%`;
  node.style.transform = `rotate(${e.rot}deg)`;
  node.style.zIndex = String(e.z);
  if (e.type === 'text' && e.data.text) {
    const t = e.data.text;
    const body = document.createElement('div');
    body.className = 'el-text-body';
    body.textContent = t.content;
    if (t.highlight) body.dataset.highlight = 'true';
    if (t.underline || t.strikethrough) body.dataset.penMarks = 'true';
    if (t.highlight || t.underline || t.strikethrough) body.style.backgroundImage = `${penMarksBackground(t, e.id)}, ${t.highlight ? markerBackground(t.highlight, e.id) : 'none'}`;
    body.style.textDecorationLine = [t.underline ? 'underline' : '', t.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
    node.style.setProperty('--size', String(t.size ?? 1));
    node.style.fontFamily = fontStack(t.font);
    node.style.setProperty('--fs', String(fontDef(t.font).scale ?? 1));
    node.dataset.font = fontDef(t.font).id;
    if (t.color) node.style.color = t.color;
    node.appendChild(body);
  }
  if (e.type === 'photo' && e.data.photo) node.appendChild(renderPhoto(e.data.photo));
  if (e.type === 'sticker' && e.data.sticker) node.appendChild(renderSticker(e.data.sticker));
  return node;
}

/** The resting spread has one editable instance of each element over both paper pages. */
export function renderSpreadCanvas(doc: BookDoc, layout: Layout, left: number | undefined, right: number | undefined): HTMLElement {
  const surface = document.createElement('div');
  surface.className = 'spread-canvas';
  const origins = new Map<string, number>();
  if (left !== undefined && layout.pages[left]) origins.set(layout.pages[left].id, 0);
  if (right !== undefined && layout.pages[right]) origins.set(layout.pages[right].id, 1);
  for (const e of doc.elements.filter((item) => origins.has(item.pageId)).sort((a, b) => a.z - b.z)) {
    const offset = origins.get(e.pageId)!;
    const node = renderElement(e);
    node.dataset.canvasOffset = String(offset);
    node.dataset.canvasScale = '0.5';
    node.style.left = `${(e.x + offset) * 50}%`;
    node.style.width = `${(e.type === 'text' ? 1 : e.w) * 50}%`;
    surface.appendChild(node);
  }
  const crease = document.createElement('div');
  crease.className = 'spread-crease';
  crease.setAttribute('aria-hidden', 'true');
  surface.appendChild(crease);
  return surface;
}

/** Photo inside a frame wrapper; frames.css (Phase 5) styles [data-frame]. */
function renderPhoto(p: NonNullable<PageElement['data']['photo']>): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'frame';
  frame.dataset.frame = p.frame || 'none';
  if (p.frameColor) frame.style.setProperty('--frame-color', p.frameColor);
  const img = document.createElement('img');
  img.className = 'photo-img';
  img.alt = p.caption || 'Photo';
  img.draggable = false;
  img.dataset.assetId = p.assetId;
  img.style.aspectRatio = String(p.aspect || 1);
  bindAssetImage(img, p.assetId);
  if (p.frame === 'torn' && p.clip) {
    img.style.clipPath = `polygon(${p.clip.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(',')})`;
  }
  frame.appendChild(img);
  if (frameDef(p.frame).caption) {
    const cap = document.createElement('div');
    cap.className = 'frame-caption';
    cap.textContent = p.caption ?? '';
    frame.appendChild(cap);
  }
  return frame;
}

function renderSticker(st: NonNullable<PageElement['data']['sticker']>): HTMLElement {
  const paper = document.createElement('div');
  paper.className = 'sticker-paper';
  const img = document.createElement('img');
  img.className = 'sticker-img';
  img.alt = '';
  img.draggable = false;
  img.style.aspectRatio = String(st.aspect ?? 1);
  img.dataset.effect = st.effect ?? 'outline';
  const texture = () => {
    if (!img.src) return;
    paper.style.setProperty('--sticker-mask', `url("${img.src}")`);
    paper.classList.add('has-texture');
  };
  img.addEventListener('load', texture);
  if (st.stickerId.startsWith('asset:')) {
    img.dataset.assetId = st.stickerId.slice(6);
    bindAssetImage(img, img.dataset.assetId);
  } else {
    const def = stickerDef(st.stickerId);
    if (def) { img.src = stickerUri(def); texture(); }
  }
  paper.appendChild(img);
  return paper;
}

/** Blank paper for the in-between leaves of a riffle. */
export function blankPage(doc: BookDoc, side: 'left' | 'right'): HTMLElement {
  const el = document.createElement('div');
  el.className = `page page-${side}`;
  el.dataset.paper = doc.book.paperType;
  return el;
}
