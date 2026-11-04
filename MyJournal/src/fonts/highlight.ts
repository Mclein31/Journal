/* A stable marker stroke behind each wrapped text fragment, never a mask on the letters. */
export function markerBackground(color: string, id: string): string {
  const ink = /^#[0-9a-f]{6}$/i.test(color) ? color : '#fff0a8';
  let seed = [...id].reduce((n, ch) => (Math.imul(n, 31) + ch.charCodeAt(0)) >>> 0, 2166136261);
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const top = Array.from({ length: 13 }, (_, i) => `${i * 10},${(2.2 + random() * 2.4).toFixed(2)}`);
  const bottom = Array.from({ length: 13 }, (_, i) => `${120 - i * 10},${(20 + random() * 2.5).toFixed(2)}`);
  const streaks = Array.from({ length: 5 }, () => {
    const y = 5 + random() * 14;
    return `<path d="M0 ${y.toFixed(2)}Q60 ${(y + random() * 2 - 1).toFixed(2)} 120 ${(y + random() * 2 - 1).toFixed(2)}" stroke="white" stroke-opacity="${(.08 + random() * .12).toFixed(2)}" stroke-width="${(.2 + random() * .4).toFixed(2)}" fill="none"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 25" preserveAspectRatio="none"><path d="M${top.join(' L')} L${bottom.join(' L')}Z" fill="${ink}" fill-opacity=".78"/><path d="M1 8Q35 6 62 8T119 7L118 18Q70 20 2 18Z" fill="${ink}" fill-opacity=".23"/>${streaks}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
