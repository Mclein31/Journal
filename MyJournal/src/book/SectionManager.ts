/* Section manager: rename, recolor, change icon, reorder, add, delete. Native <dialog> (Esc closes). */
import { uid, type BookDoc, type Section } from '../state/schema';
import { getDoc, update } from '../state/store';

const PAGES_PER_NEW_SECTION = 2;

export function openSectionManager(): void {
  const dlg = document.createElement('dialog');
  dlg.className = 'panel';
  dlg.setAttribute('aria-label', 'Edit sections');
  dlg.innerHTML = `
    <form method="dialog" class="panel-inner">
      <header class="panel-head"><h2>Sections</h2><button class="icon-btn" value="close" aria-label="Close">✕</button></header>
      <ol class="sec-list"></ol>
      <button type="button" class="btn-soft" data-act="add">＋ Add section</button>
    </form>`;
  document.body.appendChild(dlg);
  const list = dlg.querySelector<HTMLOListElement>('.sec-list')!;

  const draw = (focusId?: string, action?: string) => {
    list.replaceChildren(...sorted(getDoc()).map((s, i, all) => row(s, i, all.length)));
    if (focusId) {
      const target = list.querySelector<HTMLElement>(`[data-section-id="${focusId}"]`);
      const button = target?.querySelector<HTMLButtonElement>(`[data-act="${action}"]`);
      (button && !button.disabled ? button : target?.querySelector<HTMLInputElement>('.sec-name'))?.focus();
    }
  };

  function row(s: Section, i: number, count: number): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'sec-row';
    li.dataset.sectionId = s.id;
    li.innerHTML = `
      <input class="sec-icon" maxlength="2" aria-label="Icon" />
      <input class="sec-name" maxlength="24" aria-label="Section name" />
      <input class="sec-color" type="color" aria-label="Tab color" />
      <button type="button" class="icon-btn" data-act="up" aria-label="Move up">↑</button>
      <button type="button" class="icon-btn" data-act="down" aria-label="Move down">↓</button>
      <button type="button" class="icon-btn danger" data-act="del" aria-label="Delete section">🗑</button>`;
    const icon = li.querySelector<HTMLInputElement>('.sec-icon')!;
    const name = li.querySelector<HTMLInputElement>('.sec-name')!;
    const color = li.querySelector<HTMLInputElement>('.sec-color')!;
    icon.value = s.icon;
    name.value = s.name;
    color.value = s.color;
    const edit = (patch: Partial<Section>) =>
      update('section:edit', (d) => Object.assign(d.sections.find((x) => x.id === s.id)!, patch));
    icon.addEventListener('change', () => edit({ icon: icon.value.trim() || '•' }));
    name.addEventListener('change', () => edit({ name: name.value.trim() || 'Untitled' }));
    color.addEventListener('change', () => edit({ color: color.value }));
    li.querySelector<HTMLButtonElement>('[data-act="del"]')!.disabled = count <= 1;
    li.querySelector<HTMLButtonElement>('[data-act="up"]')!.disabled = i === 0;
    li.querySelector<HTMLButtonElement>('[data-act="down"]')!.disabled = i === count - 1;
    li.querySelector('[data-act="up"]')!.addEventListener('click', () => { move(s.id, -1); draw(s.id, 'up'); });
    li.querySelector('[data-act="down"]')!.addEventListener('click', () => { move(s.id, 1); draw(s.id, 'down'); });
    li.querySelector('[data-act="del"]')!.addEventListener('click', () => {
      if (count <= 1) return;
      if (!confirm(`Delete “${s.name}” and all of its pages?`)) return;
      removeSection(s.id);
      draw();
    });
    return li;
  }

  dlg.querySelector('[data-act="add"]')!.addEventListener('click', () => { addSection(); draw(); });
  dlg.addEventListener('close', () => dlg.remove());
  draw();
  dlg.showModal();
}

const sorted = (d: BookDoc) => [...d.sections].sort((a, b) => a.position - b.position);

function move(id: string, dir: -1 | 1) {
  update('section:move', (d) => {
    const all = sorted(d);
    const i = all.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    all.forEach((s, k) => (s.position = k));
  });
}

function addSection() {
  const palette = ['#c9a7eb', '#f7a6c1', '#ffd59e', '#a7d8f0', '#b8e0c2', '#f4b393'];
  update('section:add', (d) => {
    const now = Date.now();
    const id = uid();
    d.sections.push({ id, bookId: d.book.id, name: 'New section', icon: '✦', color: palette[d.sections.length % palette.length], position: d.sections.length });
    for (let i = 0; i < PAGES_PER_NEW_SECTION; i++) d.pages.push({ id: uid(), sectionId: id, position: i, updatedAt: now });
  });
}

function removeSection(id: string) {
  update('section:delete', (d) => {
    const pageIds = new Set(d.pages.filter((p) => p.sectionId === id).map((p) => p.id));
    d.elements = d.elements.filter((e) => !pageIds.has(e.pageId));
    d.pages = d.pages.filter((p) => p.sectionId !== id);
    d.sections = sorted(d).filter((s) => s.id !== id);
    d.sections.forEach((s, k) => (s.position = k));
  });
}

/** Adds two pages (one sheet) to the end of a section, so spreads stay aligned. */
export function addPages(sectionId: string): void {
  update('pages:add', (d) => {
    const now = Date.now();
    const last = Math.max(-1, ...d.pages.filter((p) => p.sectionId === sectionId).map((p) => p.position));
    for (let i = 1; i <= 2; i++) d.pages.push({ id: uid(), sectionId, position: last + i, updatedAt: now });
  });
}
