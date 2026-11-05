/* Live chibi: eyes follow the pointer/tap/caret, idle blinks and glances, and small reactions. */
import './chibi.css';
import type { ChibiConfig } from '../state/schema';
import { chibiSVG } from './art/index';
import { EYES, LOOK_RANGE } from './art/face';
import { caretPoint } from './caret';

export type Mood = 'idle' | 'happy' | 'confused' | 'shy';
export type Hands = 'rest' | 'cover' | 'peek';
export interface ChibiHandle {
  el: HTMLElement;
  update(config: ChibiConfig): void;
  setMood(mood: Mood, ms?: number): void;
  setHands(hands: Hands): void;
  lookAt(x: number, y: number): void;
  destroy(): void;
}

let counter = 0;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const between = (min: number, max: number) => min + Math.random() * (max - min);

export function mountChibi(host: HTMLElement, config: ChibiConfig, label = 'Your Dear Days character'): ChibiHandle {
  const uid = `chibi${++counter}`;
  const el = document.createElement('div');
  el.className = 'chibi-live';
  host.appendChild(el);
  let svg: SVGSVGElement;
  let irises: SVGGElement[] = [];
  let tilts: SVGGElement[] = [];
  let mood: Mood = 'idle'; let hands: Hands = 'rest';
  let moodTimer = 0; let idleTimer = 0; let glanceTimer = 0; let frame = 0; let last = 0;
  let target: { x: number; y: number } | null = null;
  const cur = [{ x: 0, y: 0 }, { x: 0, y: 0 }]; let tilt = 0;
  const goal = [{ x: 0, y: 0 }, { x: 0, y: 0 }]; let tiltGoal = 0;

  function draw(c: ChibiConfig) {
    el.innerHTML = chibiSVG(c, { uid, label });
    svg = el.querySelector('svg')!;
    svg.dataset.live = '';
    svg.dataset.mood = mood; svg.dataset.hands = hands;
    irises = [...svg.querySelectorAll<SVGGElement>('.ch-iris')];
    tilts = [...svg.querySelectorAll<SVGGElement>('.ch-tilt')];
    paint();
  }
  function paint() {
    irises.forEach((iris, i) => iris.setAttribute('transform', `translate(${cur[i].x.toFixed(2)} ${cur[i].y.toFixed(2)})`));
    tilts.forEach((g) => g.setAttribute('transform', `rotate(${tilt.toFixed(2)} 100 146)`));
  }
  function aim() {
    const ctm = svg?.getScreenCTM?.();
    if (!target || !ctm) { goal.forEach((g) => { g.x = 0; g.y = 0; }); tiltGoal = 0; }
    else {
      EYES.forEach((eye, i) => {
        const ex = ctm.a * eye.x + ctm.c * eye.y + ctm.e; const ey = ctm.b * eye.x + ctm.d * eye.y + ctm.f;
        const dx = target!.x - ex; const dy = target!.y - ey; const dist = Math.hypot(dx, dy) || 1;
        const reach = LOOK_RANGE * Math.min(1, dist / 180);
        goal[i].x = (dx / dist) * reach; goal[i].y = (dy / dist) * reach * 0.85;
      });
      const center = ctm.a * 100 + ctm.e;
      tiltGoal = reducedMotion() ? 0 : Math.max(-5, Math.min(5, (target.x - center) / 60));
    }
    if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); }
  }
  function step(now: number) {
    const dt = Math.min(64, now - last); last = now;
    const k = reducedMotion() ? 1 : 1 - Math.exp(-dt / 70);
    let moving = false;
    cur.forEach((c, i) => {
      c.x += (goal[i].x - c.x) * k; c.y += (goal[i].y - c.y) * k;
      if (Math.abs(goal[i].x - c.x) + Math.abs(goal[i].y - c.y) > 0.02) moving = true;
    });
    tilt += (tiltGoal - tilt) * (1 - Math.exp(-dt / 160));
    if (Math.abs(tiltGoal - tilt) > 0.02) moving = true;
    paint();
    frame = moving ? requestAnimationFrame(step) : 0; // sleeps when settled: no constant repaint
  }
  function lookAt(x: number, y: number) { target = { x, y }; aim(); wake(); }
  function wake() {
    clearTimeout(idleTimer); clearTimeout(glanceTimer);
    idleTimer = window.setTimeout(lookAround, 5000);
  }
  function lookAround(count = 0) {
    if (!svg?.isConnected) return;
    const box = svg.getBoundingClientRect();
    if (count >= 3) { target = null; aim(); return; }
    target = { x: box.left + box.width / 2 + between(-1, 1) * 260, y: box.top + box.height * 0.42 + between(-1, 1) * 160 };
    aim();
    glanceTimer = window.setTimeout(() => lookAround(count + 1), between(1100, 2200));
  }
  function blink() {
    if (!svg?.isConnected || hands === 'cover' || mood === 'happy') return;
    svg.classList.add('ch-blinking');
    setTimeout(() => svg.classList.remove('ch-blinking'), 130);
    if (Math.random() < 0.2) setTimeout(() => { svg.classList.add('ch-blinking'); setTimeout(() => svg.classList.remove('ch-blinking'), 120); }, 260);
  }

  const onMove = (e: PointerEvent) => { if (e.pointerType !== 'touch') lookAt(e.clientX, e.clientY); };
  const onDown = (e: PointerEvent) => lookAt(e.clientX, e.clientY);
  const onCaret = (e: Event) => {
    const input = e.target;
    if (input instanceof HTMLInputElement && input.isConnected && /^(text|email|password|search)$/.test(input.type)) {
      const p = caretPoint(input); lookAt(p.x, p.y);
    }
  };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onDown, { passive: true });
  for (const type of ['input', 'focusin', 'keyup', 'click']) document.addEventListener(type, onCaret, true);

  draw(config);
  // One light ticker instead of a self-rescheduling timeout chain; blinks land every 3–6 s.
  let nextBlink = performance.now() + between(1500, 3500);
  const ticker = window.setInterval(() => {
    if (performance.now() < nextBlink) return;
    blink(); nextBlink = performance.now() + between(3000, 6000);
  }, 250);
  wake();

  return {
    el,
    update(c) { draw(c); },
    setMood(next, ms) {
      clearTimeout(moodTimer);
      mood = next; if (svg) svg.dataset.mood = next;
      if (ms) moodTimer = window.setTimeout(() => { mood = 'idle'; if (svg) svg.dataset.mood = 'idle'; }, ms);
    },
    setHands(next) { hands = next; if (svg) svg.dataset.hands = next; },
    lookAt,
    destroy() {
      removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onDown);
      for (const type of ['input', 'focusin', 'keyup', 'click']) document.removeEventListener(type, onCaret, true);
      [moodTimer, idleTimer, glanceTimer].forEach(clearTimeout); window.clearInterval(ticker);
      if (frame) cancelAnimationFrame(frame);
      el.remove();
    },
  };
}
