/* Real paper sounds (recorded, CC0 — see public/sounds/CREDITS.txt), played through Web Audio
   so riffles can overlap and each play gets a slightly different pitch/volume.
   Files are fetched at load; decoding waits for the first user gesture (autoplay rules). */

const MUTE_KEY = 'mlw:muted';
const FILES = {
  flipLong: 'page-flip-1',
  flipMid: 'page-flip-2',
  flipShort: 'page-flip-3',
  open: 'book-open',
  close: 'book-close',
} as const;
type Name = keyof typeof FILES;

let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* Sound settings are optional. */ }
let ctx: AudioContext | null = null;
const buffers = new Map<Name, AudioBuffer>();
const raw = new Map<Name, Promise<ArrayBuffer>>();

// fetch early (tiny files), decode later
for (const [name, file] of Object.entries(FILES) as [Name, string][]) {
  raw.set(name, fetch(`${import.meta.env.BASE_URL}sounds/${file}.mp3`).then((r) => { if (!r.ok) throw new Error('Sound unavailable'); return r.arrayBuffer(); }).catch(() => new ArrayBuffer(0)));
}

function unlock() {
  if (ctx) return;
  try { ctx = new AudioContext(); } catch { return; }
  for (const [name, p] of raw) {
    p.then((data) => ctx!.decodeAudioData(data.slice(0)))
      .then((buf) => buffers.set(name, buf))
      .catch(() => { /* missing sound = silent, never break the book */ });
  }
}
// pointerdown fires before click, so sounds are decoded by the time the first click plays one
addEventListener('pointerdown', unlock, { once: true, capture: true });
addEventListener('keydown', unlock, { once: true, capture: true });

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function play(name: Name, delayMs = 0, volume = 1, rate = rand(0.94, 1.06)) {
  if (muted) return;
  unlock();
  const buf = buffers.get(name);
  if (!ctx || !buf) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = volume * rand(0.88, 1);
  src.connect(gain).connect(ctx.destination);
  src.start(ctx.currentTime + delayMs / 1000);
}

/** Page turn. Full turns use the long recording; quick riffle leaves use the shorter ones. */
export function playFlip(delayMs = 0, durationMs = 650, volume = 1): void {
  const name: Name = durationMs >= 600 ? pick<Name>(['flipLong', 'flipMid']) : pick<Name>(['flipMid', 'flipShort']);
  play(name, delayMs, volume);
}

/** Tab pull: the short flick, quieter and a touch higher. */
export function playTab(): void {
  play('flipShort', 0, 0.55, rand(1.08, 1.18));
}

/** Cover: open = thump then the page swish; close = swish then thump when the cover lands. */
export function playCover(durationMs = 1200, closing = false): void {
  if (closing) {
    play('flipLong', 0, 0.7, 0.85);
    play('close', durationMs * 0.85, 1, 1);
  } else {
    play('open', 0, 1, 1);
    play('flipLong', 120, 0.7, 0.85);
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* Keep the session toggle usable. */ }
}
