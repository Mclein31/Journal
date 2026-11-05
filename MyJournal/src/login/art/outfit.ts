/* Body, legs, six outfits and resting arms. Torso spans y 146–210 below the head. */
import type { ChibiConfig } from '../../state/schema';
import { shade } from '../chibiOptions';

const MIRROR = 'transform="translate(200 0) scale(-1 1)"';
const TORSO = 'M74 152Q100 146 126 152L132 188L68 188Z';
const SKIRT = 'M68 186L132 186L142 210Q100 218 58 210Z';
const fillLine = (fill: string) => `fill="${fill}" stroke="${shade(fill, -0.3)}" stroke-width="1.5" stroke-linejoin="round"`;
interface Look { sleeve: string; parts: string }

function look(outfit: number): Look {
  switch (outfit) {
    case 1: return { sleeve: '#c3a7e0', parts: `
      <path d="M70 196h60l3 12H67Z" ${fillLine('#6c6a8e')}/>
      <ellipse cx="100" cy="153" rx="28" ry="8" ${fillLine('#a98bc9')}/>
      <path d="M74 152Q100 146 126 152L134 200Q100 206 66 200Z" ${fillLine('#c3a7e0')}/>
      <path d="M82 180h36l-4 13H86Z" ${fillLine('#b394d6')}/>
      <path d="M94 157l-1 15M106 157l1 15" stroke="#fffaf3" stroke-width="1.8" stroke-linecap="round"/>` };
    case 2: return { sleeve: '#fff4dc', parts: `
      <path d="${TORSO}" ${fillLine('#fff4dc')}/>
      <path d="M68 184h64l4 24h-32l-4-8-4 8H64Z" ${fillLine('#6f97c8')}/>
      <path d="M82 164h36v24H82Z" ${fillLine('#6f97c8')}/>
      <path d="M84 165L77 152M116 165l7-13" stroke="#5a7fae" stroke-width="4" stroke-linecap="round"/>
      <circle cx="86" cy="168" r="2" fill="#f5c842"/><circle cx="114" cy="168" r="2" fill="#f5c842"/>
      <path d="M92 174h16v8H92Z" fill="none" stroke="#4d6f9c" stroke-width="1.2"/>` };
    case 3: return { sleeve: '#9fd3bd', parts: `
      <path d="${SKIRT}" ${fillLine('#d98a6f')}/>
      <path d="M78 188l-6 22M100 188v26M122 188l6 22M64 200h72" stroke="#b9664f" stroke-width="1.3" opacity=".7"/>
      <path d="M72 152Q100 144 128 152L136 192H64Z" ${fillLine('#9fd3bd')}/>
      <path d="M64 186h72v7H64Z" ${fillLine('#8cc4ad')}/>
      <path d="M88 156q-3 8 0 15t0 15M112 156q3 8 0 15t0 15" fill="none" stroke="#79b39b" stroke-width="1.6"/>` };
    case 4: return { sleeve: '#f5a9bd', parts: `
      <path d="M74 152Q100 146 126 152L146 210Q100 220 54 210Z" ${fillLine('#f5a9bd')}/>
      <path d="M84 166h32l7 42H77Z" ${fillLine('#fffaf3')}/>
      <path d="M100 194c-4-5-9-1-5 3l5 4 5-4c4-4-1-8-5-3Z" fill="#f2879e"/>
      <path d="M86 150q6 10 14 4q8 6 14-4q-14-5-28 0Z" ${fillLine('#fffaf3')}/>` };
    case 5: return { sleeve: '#f5d06f', parts: `
      <path d="${SKIRT}" ${fillLine('#9a6b52')}/>
      <path d="${TORSO}" ${fillLine('#fffaf3')}/>
      <path d="M74 152L95 156L93 190L66 188Z" ${fillLine('#f5d06f')}/>
      <path d="M126 152L105 156L107 190L134 188Z" ${fillLine('#f5d06f')}/>
      <g fill="#c9993a"><circle cx="90" cy="166" r="1.8"/><circle cx="90" cy="178" r="1.8"/><circle cx="110" cy="166" r="1.8"/><circle cx="110" cy="178" r="1.8"/></g>` };
    default: return { sleeve: '#fffaf3', parts: `
      <path d="${SKIRT}" ${fillLine('#36507a')}/>
      <path d="M80 188l-8 22M100 188v26M120 188l8 22" stroke="#26395a" stroke-width="1.3"/>
      <path d="${TORSO}" ${fillLine('#fffaf3')}/>
      <path d="M80 151L100 176L120 151L129 158L100 188L71 158Z" ${fillLine('#36507a')}/>
      <path d="M76 157L100 183L124 157" fill="none" stroke="#fffaf3" stroke-width="1.4"/>
      <path d="M100 180l-10-5v12ZM100 180l10-5v12Z" ${fillLine('#e0566f')}/><circle cx="100" cy="180" r="3.4" fill="#e0566f"/>` };
  }
}

export function body(c: ChibiConfig): string {
  const skin = c.skinTone; const edge = shade(skin, -0.18);
  const { sleeve, parts } = look(c.outfit);
  const leg = `<rect x="86" y="204" width="10" height="24" rx="3" fill="${skin}" stroke="${edge}" stroke-width="1.2"/><rect x="86" y="216" width="10" height="12" fill="#fffaf3"/><ellipse cx="90" cy="230" rx="9" ry="5" fill="#7a4b5a"/>`;
  const arm = `<path d="M77 154Q62 160 58 190L70 193Q72 172 82 163Z" ${fillLine(sleeve)}/><circle cx="64" cy="197" r="7" fill="${skin}" stroke="${edge}" stroke-width="1.3"/>`;
  return `<g class="ch-body">
    <ellipse cx="100" cy="234" rx="44" ry="5" fill="#5a364420"/>
    ${leg}<g ${MIRROR}>${leg}</g>
    <rect x="93" y="138" width="14" height="18" rx="4" fill="${shade(skin, -0.08)}"/>
    ${parts}
    <g class="ch-arms-rest">${arm}<g ${MIRROR}>${arm}</g></g>
  </g>`;
}

/** Hands raised over the eyes (password) or holding cheeks while peeking. */
export function coverHands(c: ChibiConfig): string {
  const skin = c.skinTone; const edge = shade(skin, -0.2);
  const { sleeve } = look(c.outfit);
  const hand = `<path d="M80 160Q62 150 64 122L80 118Q80 140 88 150Z" ${fillLine(sleeve)}/>
    <g class="ch-hand"><ellipse cx="76" cy="105" rx="18" ry="14.5" fill="${skin}" stroke="${edge}" stroke-width="1.4"/>
    <path d="M66 95v9M73 93v10M80 93v10M87 95v9" stroke="${edge}" stroke-width="1.2" stroke-linecap="round"/></g>`;
  return `<g class="ch-arms-cover">${hand}<g ${MIRROR}>${hand}</g></g>`;
}
