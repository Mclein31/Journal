/* Small, consistent line icons for journal controls. */
const paths: Record<string, string> = {
  spread: '<path d="M12 5v15M3 4c4-1 6-1 9 1 3-2 5-2 9-1v15c-4-1-6-1-9 1-3-2-5-2-9-1Z"/>',
  style: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7.9.9 0 0 1 .5-1.7H17a4 4 0 0 0 4-4c0-4.8-4-8.6-9-8.6Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="11" cy="7" r=".8"/><circle cx="16" cy="8.5" r=".8"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4Z"/>',
  close: '<path d="M5 3h13a1 1 0 0 1 1 1v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-1 14h15M8 3v14"/>',
  sections: '<path d="M4 5h12M4 12h12M4 19h12M20 5h.01M20 12h.01M20 19h.01"/>',
  photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/>',
  sticker: '<path d="M21 13V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h7Zm-8 8v-5a3 3 0 0 1 3-3h5"/><path d="M8 8h.01M14 8h.01M8 12c2 2 4 2 6 0"/>',
  frame: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="12" height="10" rx="1"/><path d="M9 19h6"/>',
  undo: '<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12"/>',
  redo: '<path d="m16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/>',
  front: '<path d="m7 8 5-5 5 5m-5-5v12M5 21h14"/>',
  back: '<path d="m7 10 5 5 5-5m-5 5V3M5 21h14"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  del: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  tear: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 13 13M8 16 21 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5Zm5 5 5 6m-5 0 5-6"/>',
};
export const icon = (name: string): string => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.plus}</svg>`;
