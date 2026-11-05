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
  const fibers = Array.from({ length: 42 }, () => {
    const x = random() * 120, y = 5 + random() * 14;
    return `<path d="M${x.toFixed(2)} ${y.toFixed(2)}l${(.2 + random() * 1.8).toFixed(2)} -.12" stroke="white" stroke-opacity=".17" stroke-width=".28"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 25" preserveAspectRatio="none"><path d="M${top.join(' L')} L${bottom.join(' L')}Z" fill="${ink}" fill-opacity=".78"/><path d="M1 8Q35 6 62 8T119 7L118 18Q70 20 2 18Z" fill="${ink}" fill-opacity=".23"/>${streaks}${fibers}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Slight pressure and baseline variation, stable across re-renders and wrapped fragments. */
export function penMarksBackground(style: { underline?: boolean; strikethrough?: boolean; color?: string }, id: string): string {
  if (!style.underline && !style.strikethrough) return 'none';
  const ink = /^#[0-9a-f]{6}$/i.test(style.color ?? '') ? style.color! : '#3d2d3a';
  let seed = [...id].reduce((n, ch) => (Math.imul(n, 33) + ch.charCodeAt(0)) >>> 0, 5381);
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const stroke = (baseline: number) => {
    let y = baseline + random() * .7 - .35;
    return Array.from({ length: 8 }, (_, i) => {
      const x = i * 20, next = baseline + random() * .9 - .45;
      const path = `<path d="M${x} ${y.toFixed(2)}Q${x + 9} ${(baseline + random() * 1.2 - .6).toFixed(2)} ${x + 20.15} ${next.toFixed(2)}" stroke-width="${(.75 + random() * .38).toFixed(2)}" stroke-opacity="${(.73 + random() * .18).toFixed(2)}"/>`;
      y = next;
      return path;
    }).join('');
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 32" preserveAspectRatio="none"><g fill="none" stroke="${ink}" stroke-linecap="round">${style.underline ? stroke(28) : ''}${style.strikethrough ? stroke(16) : ''}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
