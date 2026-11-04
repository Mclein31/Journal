/* PWA: register the service worker + an Install button.
   Chrome/Edge/Android fire `beforeinstallprompt` → we show the native prompt.
   iOS/iPadOS Safari has no prompt → we show "Share → Add to Home Screen" steps. */
import { registerSW } from 'virtual:pwa-register';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initPWA(button: HTMLButtonElement | null): void {
  registerSW({ immediate: true });
  if (!button || standalone()) return;

  let deferred: InstallPromptEvent | null = null;

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    button.hidden = false;
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    button.hidden = true;
  });

  if (isIOS()) button.hidden = false;

  button.addEventListener('click', async () => {
    if (deferred) {
      const prompt = deferred;
      deferred = null;
      button.hidden = true; // A captured native prompt can only be used once.
      try { await prompt.prompt(); await prompt.userChoice; } catch { /* A later beforeinstallprompt event can offer installation again. */ }
      return;
    }
    if (isIOS()) showIOSSteps();
  });
}

function showIOSSteps() {
  const dlg = document.createElement('dialog');
  dlg.className = 'panel';
  dlg.innerHTML = `
    <form method="dialog" class="panel-inner">
      <header class="panel-head"><h2>Install on iPhone / iPad</h2><button class="icon-btn" value="close" aria-label="Close">✕</button></header>
      <ol class="ios-steps">
        <li>Tap the <strong>Share</strong> button <span aria-hidden="true">(square with an arrow ↑)</span> in Safari.</li>
        <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
        <li>Tap <strong>Add</strong>. My Little World opens like an app — even offline.</li>
      </ol>
      <button class="btn-soft" value="close">Got it</button>
    </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}
