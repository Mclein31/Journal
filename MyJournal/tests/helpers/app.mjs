import { parseHTML } from 'linkedom';
import 'fake-indexeddb/auto';
import * as idb from 'idb';
import polygonClipping from 'polygon-clipping';
import { zipSync, strToU8 } from 'fflate';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// DOM integration harness, not a rendering engine. Layout, native image decoding,
// animations, audio, and install prompts require separate browser/device QA.
export async function appHarness({ single = false, stored = {}, manualFrames = false, fetchImpl, initializeStore = true } = {}) {
  const { document, window } = parseHTML('<html><head></head><body><main id="app"></main></body></html>');
  const storage = new Map(Object.entries(stored));
  const events = new window.EventTarget();
  const frames = new Map();
  let frameTime = 0, frameId = 0;
  const advanceFrames = (ms = 16) => {
    frameTime += ms;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(frameTime);
  };
  let active = document.body;
  Object.defineProperty(document, 'activeElement', { get: () => active });
  window.HTMLElement.prototype.focus = function () { if (active !== this) { active?.dispatchEvent(new window.Event('blur')); active = this; } };
  window.HTMLElement.prototype.blur = function () { if (active === this) active = document.body; this.dispatchEvent(new window.Event('blur')); };
  window.HTMLElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  const rect = { left: 100, top: 100, width: 400, height: 600, right: 500, bottom: 700, x: 100, y: 100, toJSON() {} };
  window.HTMLElement.prototype.getBoundingClientRect = function () { return rect; };
  window.HTMLElement.prototype.getClientRects = function () { return [rect]; };
  for (const key of ['offsetWidth', 'clientWidth']) Object.defineProperty(window.HTMLElement.prototype, key, { configurable: true, get: () => 400 });
  for (const key of ['offsetHeight', 'clientHeight', 'scrollHeight']) Object.defineProperty(window.HTMLElement.prototype, key, { configurable: true, get: () => 600 });
  window.HTMLElement.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
  window.HTMLElement.prototype.getAnimations = () => [];
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return this.querySelector('option[selected]')?.getAttribute('value') ?? this.querySelector('option')?.getAttribute('value') ?? ''; }, set(value) { for (const option of this.querySelectorAll('option')) { if (option.getAttribute('value') === value) option.setAttribute('selected',''); else option.removeAttribute('selected'); } } });
  const captured = new Set();
  const navigation = [];
  const location = { origin: 'https://dear-days.test', search: '', reload() { navigation.push('reload'); }, assign(url) { navigation.push(url); } };
  window.HTMLElement.prototype.setPointerCapture = (id) => captured.add(id);
  window.HTMLElement.prototype.hasPointerCapture = (id) => captured.has(id);
  const selection = { removeAllRanges() {}, addRange() {}, selectAllChildren() {}, collapseToEnd() {} };
  document.createRange = () => ({ selectNodeContents() {}, collapse() {} });
  const media = new Map();
  const matchMedia = (query) => {
    if (!media.has(query)) media.set(query, Object.assign(new window.EventTarget(), { matches: query.includes('max-aspect-ratio') ? single : query.includes('prefers-reduced-motion') }));
    return media.get(query);
  };
  const context = vm.createContext({
    document, window: { document, setTimeout, clearTimeout, setInterval(fn, ms) { const timer = setInterval(fn, ms); timer.unref(); return timer; }, dispatchEvent: events.dispatchEvent.bind(events) },
    location, history: { replaceState(_state, _unused, path) { location.search = new URL(path, location.origin).search; } },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    CustomEvent: window.CustomEvent, HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement,
    Blob, File, URL, URLSearchParams, Headers, Response, Request, TextEncoder, TextDecoder, crypto, structuredClone, AbortController, AbortSignal, setTimeout, clearTimeout,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    innerWidth: 1200, innerHeight: 900, performance: manualFrames ? { now: () => frameTime } : performance, matchMedia,
    getComputedStyle: () => ({ width: '400px' }), getSelection: () => selection,
    requestAnimationFrame: (fn) => {
      if (manualFrames) { const id = ++frameId; frames.set(id, fn); return id; }
      queueMicrotask(() => fn(performance.now() + 1000)); return 1;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { observe() {} disconnect() {} },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    sessionStorage: { getItem: (k) => storage.get(`session:${k}`) ?? null, setItem: (k,v) => storage.set(`session:${k}`,v), removeItem: (k) => storage.delete(`session:${k}`) },
    navigator: { userAgent: 'unit-test', platform: 'test', maxTouchPoints: 0 }, confirm: () => true,
  });
  function stub(exports) { return new vm.SyntheticModule(Object.keys(exports), function () { for (const [k,v] of Object.entries(exports)) this.setExport(k,v); }, { context }); }
  const modules = new Map([
    ['idb', stub({ openDB: idb.openDB })],
    ['virtual:pwa-register', stub({ registerSW() {} })],
    ['polygon-clipping', stub({ default: polygonClipping })],
    ['fflate', stub({ zipSync, strToU8 })],
    ['audio/paper', stub({ playFlip() {}, playCover() {}, playTab() {}, isMuted: () => false, setMuted() {} })],
    ['util/image', stub({ compressImage: async (file) => { if (file.name?.includes('bad')) throw new Error('invalid image'); return { blob: file, w: 800, h: 600 }; } })],
  ]);
  async function load(name) {
    if (modules.has(name)) return modules.get(name);
    if (name.endsWith('.css')) { const module = stub({}); modules.set(name,module); return module; }
    const pending = readFile(new URL(`../../src/${name}.ts`, import.meta.url), 'utf8').then((source) =>
      new vm.SourceTextModule(stripTypeScriptTypes(source), { context, identifier: name }));
    modules.set(name,pending);
    return pending;
  }
  async function get(name) {
    const module = await load(name);
    if (module.status === 'unlinked') await module.link((specifier, parent) => load(specifier.startsWith('.') ? new URL(specifier, `https://modules/${parent.identifier}`).pathname.slice(1) : specifier));
    if (module.status !== 'evaluated') await module.evaluate();
    return module.namespace;
  }
  const store = await get('state/store');
  const { createSeedBook } = await get('state/seed');
  if (initializeStore) store.initStore(createSeedBook());
  await get('book/bookmark');
  const root = document.getElementById('app');
  const fire = (target, name, props = {}) => {
    const e = new window.Event(name, { bubbles: true, cancelable: true });
    Object.assign(e, props);
    // Preserve the originating control for global-key simulations; the event bus otherwise retargets it.
    if (target === events && props.target) Object.defineProperty(e, 'target', { get: () => props.target, set() {}, configurable: true });
    target.dispatchEvent(e);
    return e;
  };
  const settle = async () => { for (let i=0;i<12;i++) await new Promise((resolve) => setImmediate(resolve)); };
  return { get, root, store, document, window, storage, fire, settle, media, captured, events, frames, advanceFrames, navigation };
}
