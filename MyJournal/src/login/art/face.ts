/* Head, eyes, mouths and blush. viewBox is 0 0 200 240; eyes sit at y=104. */
import type { ChibiConfig } from '../../state/schema';
import { shade } from '../chibiOptions';

export const EYES = [{ x: 76, y: 104 }, { x: 124, y: 104 }] as const;
/** Pupil travel limit in SVG units (~35% of the eye radius). */
export const LOOK_RANGE = 4.2;

export function head(c: ChibiConfig): string {
  const skin = c.skinTone; const edge = shade(skin, -0.18);
  return `<g class="ch-head">
    <ellipse cx="43" cy="104" rx="8" ry="11" fill="${skin}" stroke="${edge}" stroke-width="1.5"/>
    <ellipse cx="157" cy="104" rx="8" ry="11" fill="${skin}" stroke="${edge}" stroke-width="1.5"/>
    <path d="M42 92C42 54 70 36 100 36S158 54 158 92C158 126 132 148 100 148S42 126 42 92Z" fill="${skin}" stroke="${edge}" stroke-width="1.6"/>
  </g>`;
}

function eyeShape(shape: number): { rx: number; ry: number; iris: number; irisY: number; lid: string } {
  if (shape === 1) return { rx: 12, ry: 15, iris: 10, irisY: 12.5, lid: 'M-14 -4C-11 -16 11 -16 14 -4' };
  if (shape === 2) return { rx: 11.5, ry: 10, iris: 9, irisY: 10, lid: 'M-14 -1C-10 -9 10 -9 14 -1' };
  return { rx: 11, ry: 13, iris: 8.6, irisY: 10.6, lid: 'M-13 -3C-10 -14 10 -14 13 -3' };
}

function eye(c: ChibiConfig, side: 0 | 1, uid: string): string {
  const { x, y } = EYES[side];
  const s = eyeShape(c.eyeShape);
  const id = `${uid}-eye-${side}`; // unique per rendered chibi: several can share a page
  const iris = c.eyeColor; const deep = shade(iris, -0.45); const light = shade(iris, 0.35);
  const sparkle = c.eyeShape === 1
    ? `<path d="M3 3l1.2 2.6L7 7l-2.8 1.3L3 11l-1.3-2.7L-1 7l2.7-1.4Z" fill="#fff" opacity=".9"/>`
    : `<circle cx="3.4" cy="4" r="1.6" fill="#fff" opacity=".85"/>`;
  return `<g class="ch-eye" transform="translate(${x} ${y})"><g class="ch-eye-blink">
    <clipPath id="${id}"><ellipse rx="${s.rx}" ry="${s.ry}"/></clipPath>
    <ellipse rx="${s.rx}" ry="${s.ry}" fill="#fffdfb"/>
    <g clip-path="url(#${id})"><g class="ch-iris" data-eye="${side}">
      <ellipse rx="${s.iris}" ry="${s.irisY}" fill="${iris}"/>
      <ellipse cy="${s.irisY * 0.45}" rx="${s.iris * 0.7}" ry="${s.irisY * 0.4}" fill="${light}" opacity=".55"/>
      <ellipse rx="${s.iris * 0.46}" ry="${s.irisY * 0.5}" fill="${deep}"/>
      <circle cx="-3.4" cy="-4.4" r="${c.eyeShape === 1 ? 3.6 : 3}" fill="#fff"/>${sparkle}
    </g></g>
    <path d="${s.lid}" fill="none" stroke="#3a2730" stroke-width="3" stroke-linecap="round"/>
    ${c.eyeShape === 1 ? `<path d="M${s.rx - 1} -9l4 -3M${s.rx} -5l4 -1" stroke="#3a2730" stroke-width="1.6" stroke-linecap="round"/>` : ''}
    ${c.eyeShape === 2 ? `<path d="M-9 ${s.ry + 2}q9 3 18 0" fill="none" stroke="#3a273055" stroke-width="1.3" stroke-linecap="round"/>` : ''}
  </g></g>`;
}

export function face(c: ChibiConfig, uid: string): string {
  const blush = c.blush ? `<g class="ch-blush" fill="#f4889e" opacity=".42">
      <ellipse cx="62" cy="124" rx="10" ry="6"/><ellipse cx="138" cy="124" rx="10" ry="6"/></g>
    <g stroke="#e8708a" stroke-width="1.2" stroke-linecap="round" opacity=".55"><path d="M57 125l3-4M62 126l3-4M133 125l3-4M138 126l3-4"/></g>` : '';
  return `<g class="ch-face">
    ${blush}
    <g class="ch-eyes">${eye(c, 0, uid)}${eye(c, 1, uid)}</g>
    <g class="ch-happy-eyes" fill="none" stroke="#3a2730" stroke-width="3.2" stroke-linecap="round">
      <path d="M65 108q11-14 22 0"/><path d="M113 108q11-14 22 0"/></g>
    <g class="ch-mouth ch-mouth-idle"><path d="M93 129q7 6 14 0" fill="none" stroke="#7a3946" stroke-width="2.4" stroke-linecap="round"/></g>
    <g class="ch-mouth ch-mouth-happy"><path d="M90 127q10 0 20 0q-2 12 -10 12t-10 -12Z" fill="#a8445a"/><path d="M95 135q5-4 10 0q-2 4-5 4t-5-4Z" fill="#f28b9c"/></g>
    <g class="ch-mouth ch-mouth-confused"><path d="M91 131q3-3 6 0t6 0t6 0" fill="none" stroke="#7a3946" stroke-width="2.2" stroke-linecap="round"/></g>
    <g class="ch-mouth ch-mouth-shy"><ellipse cx="100" cy="131" rx="3.6" ry="3" fill="#a8445a"/></g>
  </g>`;
}
