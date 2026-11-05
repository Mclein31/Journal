import { discardDraftConflicts, getDraftConflicts, getPendingDrafts } from '../book/bookmark';
import { getDoc } from '../state/store';

/** Conflicting words remain downloadable; they never silently replace the newer journal. */
export function showSaveConflict(recovered = false): void {
  if (document.querySelector('.save-conflict')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'panel save-conflict';
  dialog.setAttribute('aria-labelledby', 'save-conflict-title');
  dialog.setAttribute('aria-describedby', 'save-conflict-description');
  dialog.innerHTML = `<div class="panel-inner">
    <h2 id="save-conflict-title">${recovered ? 'An older draft needs your attention' : 'This journal changed in another window'}</h2>
    <p id="save-conflict-description">${recovered ? 'The latest saved text is kept. You can download the older recovered draft before continuing.' : 'Your changes are still in this window. Download a copy before reloading the latest saved journal.'}</p>
    <button type="button" class="btn-soft" data-conflict="download">${recovered ? 'Download older draft' : 'Download my changes'}</button>
    <button type="button" class="btn-soft" data-conflict="continue">${recovered ? 'Keep latest saved version' : 'Reload latest journal'}</button>
    <p class="field-help" role="status"></p>
  </div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  dialog.querySelector('[data-conflict="download"]')!.addEventListener('click', () => {
    const data = { journal: getDoc(), pendingDrafts: getPendingDrafts(), olderDrafts: getDraftConflicts() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dear-days-unsaved-changes.json';
    document.body.appendChild(link);
    link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  dialog.querySelector('[data-conflict="continue"]')!.addEventListener('click', async () => {
    if (!recovered) { location.reload(); return; }
    try { await discardDraftConflicts(); dialog.close(); dialog.remove(); }
    catch { dialog.querySelector('[role="status"]')!.textContent = 'Could not update recovery storage. Please download your draft and try again.'; }
  });
  dialog.showModal();
}
