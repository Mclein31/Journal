/* Dear Days mark: a closed journal (navy cover, paper edge) with a ribbon bookmark and a star.
   Same drawing as public/icons/icon.svg, so the app icon and in-app brand match. */
export function logoMark(size = 32, title = ''): string {
  const a11y = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="dd-logo" width="${size}" height="${size}" viewBox="0 0 32 32" ${a11y} xmlns="http://www.w3.org/2000/svg">
    <rect x="23.5" y="4.5" width="4" height="23" rx="1.6" fill="#efe6d6" stroke="#cdbfa8" stroke-width=".8"/>
    <rect x="4" y="2.5" width="21" height="27" rx="3.6" fill="#3e5568"/>
    <rect x="4" y="2.5" width="5" height="27" rx="2.4" fill="#2f4354"/>
    <path d="M19 2.5h4v27.5l-2-2.2-2 2.2Z" fill="#e8a87c"/>
    <path d="M14.5 10.5c.5 3.3 1.3 4.2 4.4 4.7-3.1.5-3.9 1.4-4.4 4.7-.5-3.3-1.3-4.2-4.4-4.7 3.1-.5 3.9-1.4 4.4-4.7Z" fill="#f6efe3"/>
  </svg>`;
}
