/* Body, legs, six outfits and resting arms. Torso spans y 146–210 below the head. */
import type { ChibiConfig } from '../../state/schema';
import { shade } from '../chibiOptions';

const MIRROR = 'transform="translate(200 0) scale(-1 1)"';
const TORSO = 'M74 152Q100 146 126 152L132 188L68 188Z';
const PANTS = 'M68 186L132 186L131 227L106 227L100 202L94 227L69 227Z';
const SKIRT = 'M68 186L132 186L142 210Q100 218 58 210Z';
const fillLine = (fill: string) => `fill="${fill}" stroke="${shade(fill, -0.3)}" stroke-width="1.5" stroke-linejoin="round"`;
interface Look { sleeve: string; parts: string }

function look(outfit: number): Look {
  switch (outfit) {
    case 1: return { sleeve: '#9fb6c9', parts: `
      <path d="${PANTS}" ${fillLine('#5b6473')}/>
      <ellipse cx="100" cy="153" rx="28" ry="8" ${fillLine('#87a0b5')}/>
      <path d="M74 152Q100 146 126 152L134 200Q100 206 66 200Z" ${fillLine('#9fb6c9')}/>
      <path d="M82 180h36l-4 13H86Z" ${fillLine('#8ea7bc')}/>
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
    case 6: return { sleeve: '#e9eef2', parts: `
      <path d="${PANTS}" ${fillLine('#4d6f9c')}/><path d="M100 196v28" stroke="#3d5a80" stroke-width="1.2"/>
      <path d="${TORSO}" ${fillLine('#e9eef2')}/>
      <path d="M92 150q8 6 16 0" fill="none" stroke="#b7c2cc" stroke-width="1.6"/>
      <path d="M100 164l2.4 5 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8Z" fill="#f5c842" stroke="#c99a1f" stroke-width="1"/>` };
    case 7: return { sleeve: '#dfe9f5', parts: `
      <path d="${PANTS}" ${fillLine('#b49a74')}/>
      <path d="${TORSO}" ${fillLine('#dfe9f5')}/>
      <path d="M88 149L100 160L112 149L114 156L100 164L86 156Z" ${fillLine('#f6f9fc')}/>
      <path d="M100 164v24" stroke="#a9bccf" stroke-width="1.2"/>
      <g fill="#8aa1b8"><circle cx="100" cy="170" r="1.5"/><circle cx="100" cy="178" r="1.5"/><circle cx="100" cy="185" r="1.5"/></g>
      <path d="M110 166h8v7h-8Z" fill="none" stroke="#a9bccf" stroke-width="1.1"/>` };
    case 8: return { sleeve: '#3f5a4a', parts: `
      <path d="${PANTS}" ${fillLine('#3a3f4b')}/>
      <path d="${TORSO}" ${fillLine('#f1ece2')}/>
      <path d="M74 152L94 154L92 190L66 188Z" ${fillLine('#3f5a4a')}/>
      <path d="M126 152L106 154L108 190L134 188Z" ${fillLine('#3f5a4a')}/>
      <path d="M66 184h26v6H66ZM108 184h26v6h-26Z" fill="#e8dcc4"/>
      <path d="M78 151q8 5 16 3M122 151q-8 5-16 3" fill="none" stroke="#e8dcc4" stroke-width="3" stroke-linecap="round"/>` };
    case 9: return { sleeve: '#c94f3d', parts: `
      <path d="M68 186h64l3 20h-31l-4-7-4 7H65Z" ${fillLine('#2f3f55')}/>
      <path d="${TORSO}" ${fillLine('#c94f3d')}/>
      <path d="M89 150l11 11 11-11" fill="none" stroke="#fffaf3" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M71 160l-2 26M129 160l2 26" stroke="#fffaf3" stroke-width="2.4"/>
      <text x="100" y="184" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="17" fill="#fffaf3">7</text>` };
    case 10: return { sleeve: '#a8483e', parts: `
      <path d="${PANTS}" ${fillLine('#4d6f9c')}/>
      <path d="${TORSO}" ${fillLine('#a8483e')}/>
      <g stroke="#5e2420" stroke-width="2.2" opacity=".45"><path d="M70 166h60M69 178h62M84 151v37M116 151v37"/></g>
      <g stroke="#e9c9a8" stroke-width="1" opacity=".55"><path d="M70 171h60M76 152v36M108 152v36"/></g>
      <path d="M88 149L100 160L112 149L114 156L100 164L86 156Z" ${fillLine('#a8483e')}/>
      <g fill="#f1e4d0"><circle cx="100" cy="170" r="1.5"/><circle cx="100" cy="179" r="1.5"/></g>` };
    case 11: return { sleeve: '#2c3a4f', parts: `
      <path d="${PANTS}" ${fillLine('#2c3a4f')}/>
      <path d="${TORSO}" ${fillLine('#f6f8fb')}/>
      <path d="M100 158l-4 5 4 22 4-22Z" fill="#b8423a" stroke="#8c2f29" stroke-width="1"/>
      <path d="M74 152L92 152L98 176L94 190L66 188Z" ${fillLine('#2c3a4f')}/>
      <path d="M126 152L108 152L102 176L106 190L134 188Z" ${fillLine('#2c3a4f')}/>
      <path d="M90 152l6 14M110 152l-6 14" stroke="#465670" stroke-width="1.4"/><circle cx="99" cy="182" r="1.5" fill="#8a96a8"/>` };
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
