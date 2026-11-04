/* Shared lifecycle for floating inspectors: keyboard access, bounded placement, no leaked listeners. */
let dismiss: (() => void) | undefined;
export function mountPicker(menu: HTMLElement, anchor: HTMLElement, onClose: () => void): () => void {
  dismiss?.();
  const controller = new AbortController();
  const { signal } = controller;
  const rect = anchor.getBoundingClientRect();
  const command = anchor.dataset.cmd;
  document.body.appendChild(menu);
  const position = () => {
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2))}px`;
    menu.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, rect.bottom + 8 + h > innerHeight ? rect.top - h - 8 : rect.bottom + 8))}px`;
  };
  const close = (restore = false) => {
    controller.abort();
    menu.remove();
    if (dismiss === close) dismiss = undefined;
    onClose();
    if (restore) (anchor.isConnected ? anchor : document.querySelector<HTMLElement>(`.el-bar [data-cmd="${command}"]`))?.focus({ preventScroll: true });
  };
  dismiss = close;
  addEventListener('pointerdown', (e) => { if (!menu.contains(e.target as Node)) close(); }, { capture: true, signal });
  addEventListener('resize', position, { signal });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    if (e.key === 'Tab') {
      const controls = [...menu.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea')].filter((el) => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }, { signal });
  menu.querySelector('[data-picker-close]')?.addEventListener('click', () => close(true), { signal });
  position();
  menu.querySelector<HTMLElement>('button[aria-pressed="true"], button[aria-selected="true"], button')?.focus({ preventScroll: true });
  return () => close();
}
