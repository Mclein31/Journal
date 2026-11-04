/* Tiny toast: one at a time, top center, auto-dismiss. */
let current: HTMLElement | null = null;

export function toast(message: string, ms = 3600): void {
  current?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  current = el;
  window.setTimeout(() => {
    el.classList.add('toast-out');
    window.setTimeout(() => el.remove(), 300);
  }, ms);
}
