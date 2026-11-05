/* Six hair styles, split into a back layer (behind head/body) and a front layer (bangs, side locks). */
import type { ChibiConfig } from '../../state/schema';
import { shade } from '../chibiOptions';

const MIRROR = 'transform="translate(200 0) scale(-1 1)"';
const CAP = 'M34 100C26 40 70 20 100 20S174 40 166 100';
const BACK: string[] = [
  `${CAP}C168 128 164 146 154 154L46 154C36 146 32 128 34 100Z`,
  `${CAP}L172 214Q150 222 132 212L68 212Q50 222 28 214Z`,
  `${CAP}C168 122 162 136 152 142L48 142C38 136 32 122 34 100Z`,
  `${CAP}C168 122 162 136 152 142L48 142C38 136 32 122 34 100Z`,
  `${CAP}C168 120 162 132 152 138L48 138C38 132 32 120 34 100Z`,
  `${CAP}C176 120 164 136 174 156C182 176 168 192 176 210Q150 222 132 212L68 212Q50 222 24 210C32 192 18 176 26 156C36 136 24 120 34 100Z`,
];
const LOCK: string[] = [
  'M39 90Q32 128 46 152Q54 140 53 112Z',
  'M39 90Q28 150 44 188Q55 168 53 114Z',
  'M39 90Q35 116 44 132Q51 122 51 104Z',
  'M39 90Q35 116 44 132Q51 122 51 104Z',
  'M39 90Q35 116 44 132Q51 122 51 104Z',
  'M39 90Q30 116 40 136Q30 158 44 182Q50 168 46 150Q56 130 53 110Z',
];

function extras(style: number, fill: string, edge: string): string {
  const line = `fill="${fill}" stroke="${edge}" stroke-width="1.6" stroke-linejoin="round"`;
  if (style === 2) {
    const tail = `<path d="M44 68C12 88 14 150 26 198Q34 212 42 198C36 160 40 118 58 84Z" ${line}/><circle cx="46" cy="74" r="6" fill="#f2879e" stroke="#c45f78" stroke-width="1.4"/>`;
    return `${tail}<g ${MIRROR}>${tail}</g>`;
  }
  if (style === 3) {
    const bun = `<circle cx="46" cy="48" r="21" ${line}/><path d="M36 42q10-10 20 0q-6 10-14 4" fill="none" stroke="${edge}" stroke-width="1.4" stroke-linecap="round"/>`;
    return `${bun}<g ${MIRROR}>${bun}</g>`;
  }
  if (style === 4) return `<path d="M138 36C192 36 198 120 178 188Q170 200 164 186C176 130 170 80 140 58Z" ${line}/><ellipse cx="150" cy="42" rx="9" ry="7" transform="rotate(30 150 42)" fill="#b87fc4" stroke="#8d5a9c" stroke-width="1.4"/>`;
  return '';
}

export function backHair(c: ChibiConfig): string {
  const edge = shade(c.hairColor, -0.28);
  return `<g class="ch-hair-back">${extras(c.hairStyle, c.hairColor, edge)}
    <path d="${BACK[c.hairStyle]}" fill="${shade(c.hairColor, -0.08)}" stroke="${edge}" stroke-width="1.6" stroke-linejoin="round"/></g>`;
}

export function frontHair(c: ChibiConfig): string {
  const edge = shade(c.hairColor, -0.28);
  const line = `fill="${c.hairColor}" stroke="${edge}" stroke-width="1.6" stroke-linejoin="round"`;
  const bangs = 'M36 104C30 52 62 26 100 26S170 52 164 104Q156 92 153 78Q144 88 135 79Q125 90 115 76Q106 88 98 74Q88 88 80 76Q70 88 62 78Q54 90 47 80Q43 92 36 104Z';
  return `<g class="ch-hair-front">
    <path d="${LOCK[c.hairStyle]}" ${line}/><g ${MIRROR}><path d="${LOCK[c.hairStyle]}" ${line}/></g>
    <path d="${bangs}" ${line}/>
    <path d="M58 50Q100 30 142 50" fill="none" stroke="${shade(c.hairColor, 0.35)}" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="22 7 9 7" opacity=".6"/>
    <path d="M98 30Q94 40 98 50M118 32Q114 42 116 52" fill="none" stroke="${edge}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
  </g>`;
}
