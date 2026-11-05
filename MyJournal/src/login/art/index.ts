/* Assembles the layered chibi SVG: back hair → body → head/face/bangs → accessory → hands → mood marks. */
import type { ChibiConfig } from '../../state/schema';
import { shade } from '../chibiOptions';
import { face, head } from './face';
import { backHair, frontHair } from './hair';
import { body, coverHands } from './outfit';

const MIRROR = 'transform="translate(200 0) scale(-1 1)"';

function catEars(c: ChibiConfig): string {
  const edge = shade(c.hairColor, -0.28);
  const ear = `<path d="M54 60L50 14L86 38Z" fill="${c.hairColor}" stroke="${edge}" stroke-width="1.6" stroke-linejoin="round"/><path d="M59 51L56 26L76 39Z" fill="#f6b3c3"/>`;
  // Space buns sit where ears normally go; nudge the ears toward the crown.
  const shift = c.hairStyle === 3 ? 'transform="translate(9 -3)"' : '';
  return `<g class="ch-acc-ears" ${shift}>${ear}</g><g ${MIRROR}><g ${shift}>${ear}</g></g>`;
}

function topAccessory(c: ChibiConfig): string {
  switch (c.accessory) {
    case 'bow': return `<g class="ch-acc" transform="translate(140 40) rotate(18)" fill="#f2879e" stroke="#c45f78" stroke-width="1.5" stroke-linejoin="round">
      <path d="M-3 4l-7 15 5-1 3 4ZM3 4l7 15-5-1-3 4Z"/><path d="M0 0C-8-15-27-12-22 3S-8 8 0 0Z"/><path d="M0 0C8-15 27-12 22 3S8 8 0 0Z"/><circle r="5"/></g>`;
    case 'clips': return `<g class="ch-acc" stroke-width="1.3" stroke-linejoin="round">
      <rect x="-9" y="-3" width="18" height="6" rx="3" transform="translate(58 66) rotate(-40)" fill="#82c8a0" stroke="#5c9e7a"/>
      <path d="M74 46l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8Z" fill="#f5c842" stroke="#c99a1f"/></g>`;
    case 'glasses': return `<g class="ch-acc" fill="#ffffff26" stroke="#5b3b48" stroke-width="2.4">
      <circle cx="76" cy="104" r="16"/><circle cx="124" cy="104" r="16"/><path d="M92 103q8-6 16 0M60 100L45 96M140 100l15-4" fill="none"/></g>`;
    case 'beret': return `<g class="ch-acc"><ellipse cx="86" cy="34" rx="46" ry="15" transform="rotate(-12 86 34)" fill="#c0475f" stroke="#91304a" stroke-width="1.6"/>
      <path d="M84 20l2-9" stroke="#91304a" stroke-width="3" stroke-linecap="round"/><path d="M48 46q38-14 76-18" fill="none" stroke="#91304a" stroke-width="1.4" opacity=".6"/></g>`;
    case 'cap': return `<g class="ch-acc" stroke="#33485f" stroke-width="1.6" stroke-linejoin="round">
      <path d="M38 78C38 38 66 20 100 20S162 38 162 78Z" fill="#4f6d8f"/>
      <path d="M100 21v56M70 28q-8 22-8 50M130 28q8 22 8 50" fill="none" opacity=".45"/>
      <path d="M34 76Q100 60 166 76Q168 88 160 88Q100 74 40 88Q32 88 34 76Z" fill="#3f5a78"/><circle cx="100" cy="20" r="3.5" fill="#3f5a78"/></g>`;
    case 'headphones': return `<g class="ch-acc"><path d="M36 98C30 42 66 18 100 18S170 42 164 98" fill="none" stroke="#3d4b5c" stroke-width="7" stroke-linecap="round"/>
      <rect x="26" y="86" width="18" height="30" rx="8" fill="#5a6b7f" stroke="#3d4b5c" stroke-width="1.6"/>
      <rect x="156" y="86" width="18" height="30" rx="8" fill="#5a6b7f" stroke="#3d4b5c" stroke-width="1.6"/></g>`;
    default: return '';
  }
}

export interface ChibiArtOptions { uid: string; label?: string }

export function chibiSVG(c: ChibiConfig, { uid, label }: ChibiArtOptions): string {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="chibi" viewBox="0 0 200 240" data-mood="idle" ${a11y} xmlns="http://www.w3.org/2000/svg">
  <g class="ch-root">
    <g class="ch-tilt">${backHair(c)}${c.accessory === 'cat-ears' ? catEars(c) : ''}</g>
    ${body(c)}
    <g class="ch-tilt">${head(c)}${face(c, uid)}${frontHair(c)}${topAccessory(c)}</g>
    ${coverHands(c)}
    <g class="ch-mark ch-mark-confused" fill="#87465f"><text x="160" y="46" font-size="30" font-weight="800" font-family="Nunito, sans-serif">?</text>
      <path d="M154 70q-5 8 0 11q5-3 0-11Z" fill="#8cc6e8"/></g>
    <g class="ch-mark ch-mark-happy" fill="#f5c842"><path d="M26 54l2 5 5 2-5 2-2 5-2-5-5-2 5-2ZM172 32l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z"/><path d="M168 76c-3-4-8-1-5 3l5 4 5-4c3-4-2-7-5-3Z" fill="#f2879e"/></g>
  </g></svg>`;
}
