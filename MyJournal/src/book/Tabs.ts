/* Pull tabs on the fore-edge. Sections behind you sit on the left edge, ahead on the right,
   like a real tabbed notebook. Vertical slot = section position, so tabs never jump around. */
import type { Section } from '../state/schema';
import { tabSide, type Layout, type Mode } from './layout';

export interface TabsState {
  layout: Layout;
  spread: number;
  mode: Mode;
  current?: Section;
  onPick: (section: Section) => void;
}

export function renderTabs(left: HTMLElement, right: HTMLElement, st: TabsState): void {
  left.replaceChildren();
  right.replaceChildren();
  const count = st.layout.sections.length;
  st.layout.sections.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab';
    btn.style.setProperty('--tab-color', s.color);
    btn.style.setProperty('--slot', String(i));
    btn.style.setProperty('--slots', String(count));
    btn.innerHTML = `<span class="tab-icon" aria-hidden="true"></span><span class="tab-label"></span>`;
    btn.querySelector('.tab-icon')!.textContent = s.icon;
    btn.querySelector('.tab-label')!.textContent = s.name;
    btn.setAttribute('aria-label', `Go to ${s.name}`);
    btn.title = s.name;
    if (st.current?.id === s.id) {
      btn.classList.add('is-current');
      btn.setAttribute('aria-current', 'true');
    }
    btn.addEventListener('click', () => st.onPick(s));
    (tabSide(st.layout, s.id, st.spread, st.mode) === 'left' ? left : right).appendChild(btn);
  });
}
