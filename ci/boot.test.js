#!/usr/bin/env node
/**
 * Boot test — loads www/ in the order index.html declares, in a sandbox behind a
 * DOM stub, then runs the DOMContentLoaded initialisation path.
 *
 * Why this exists: every other check in ci/ is static text analysis. overlay.js
 * was present, cached by the service worker, and explicitly asserted as cached —
 * but was never included by a <script src> tag, so `PrivacyOverlay` was undefined
 * at runtime: the "Overlay Dim" toggle threw on change and _lockApp() threw on
 * its last line. No static check could see that. This boots the app for real
 * (minus rendering) and fails when a global the app depends on is missing, when
 * a script throws while loading, or when initialisation throws.
 *
 * The stub is deliberately explicit: unknown DOM surfaces are recorded and
 * reported as warnings rather than silently faked, so a gap is visible instead
 * of masking a real failure.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const webcrypto = require('crypto').webcrypto;

const WWW = path.join(__dirname, '..', 'www');
let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? '\u2713' : '\u2717'} ${msg}`); if (!cond) failures++; };

const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const noop = () => {};

// ── 1. the script order the browser will actually use ──
const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
check(scripts.length > 0, `index.html declares ${scripts.length} scripts`);
const missingFiles = scripts.filter(s => !fs.existsSync(path.join(WWW, s)));
check(missingFiles.length === 0, missingFiles.length
  ? `scripts declared but missing on disk: ${missingFiles.join(', ')}`
  : 'every declared script file exists');

// ── 2. DOM stub ──
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const unimplemented = new Set();
const listeners = new Map(); // target -> Map(type -> [fn])
const nodeCache = new Map();

function record(target, type, fn) {
  if (!listeners.has(target)) listeners.set(target, new Map());
  const byType = listeners.get(target);
  if (!byType.has(type)) byType.set(type, []);
  byType.get(type).push(fn);
}

function makeNode(tag) {
  const classes = new Set();
  const attrs = new Map();
  const base = {
    tagName: String(tag || 'div').toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    childNodes: [],
    parentNode: null,
    isConnected: true,
    hidden: false,
    disabled: false,
    checked: false,
    value: '',
    src: '',
    textContent: '',
    innerHTML: '',
    className: '',
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
      contains: c => classes.has(c),
      get length() { return classes.size; },
    },
    addEventListener: (t, fn) => record(base, t, fn),
    removeEventListener: noop,
    dispatchEvent: () => false,
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: k => (attrs.has(k) ? attrs.get(k) : null),
    hasAttribute: k => attrs.has(k),
    removeAttribute: k => attrs.delete(k),
    querySelector: () => makeNode('div'),
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    appendChild: n => n,
    insertBefore: n => n,
    removeChild: n => n,
    replaceChild: n => n,
    remove: noop,
    insertAdjacentHTML: noop,
    append: noop,
    prepend: noop,
    cloneNode: () => makeNode(tag),
    closest: () => null,
    contains: () => false,
    focus: noop,
    blur: noop,
    click: noop,
    reset: noop,
    submit: noop,
    play: async () => {},
    pause: noop,
    load: noop,
    scrollIntoView: noop,
    getClientRects: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    getContext: () => null,
    animate: () => ({ cancel: noop, finished: Promise.resolve() }),
    setPointerCapture: noop,
    releasePointerCapture: noop,
  };
  // Unknown surfaces return a no-op AND are recorded, so the stub never causes a
  // spurious throw while any gap in it stays visible in the warning line below.
  return new Proxy(base, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      unimplemented.add(`node.${String(prop)}`);
      return noop;
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

/** One stable node per id, so code that caches a reference keeps working. */
function nodeForId(id) {
  if (!nodeCache.has(id)) nodeCache.set(id, makeNode('div'));
  return nodeCache.get(id);
}

const documentStub = {
  documentElement: makeNode('html'),
  body: makeNode('body'),
  head: makeNode('head'),
  hidden: false,
  activeElement: null,
  getElementById: id => (ids.has(id) ? nodeForId(id) : null),
  querySelector: () => makeNode('div'),
  querySelectorAll: () => [],
  createElement: tag => makeNode(tag),
  createElementNS: (_ns, tag) => makeNode(tag),
  createTextNode: () => makeNode('text'),
  createDocumentFragment: () => makeNode('fragment'),
  addEventListener: (t, fn) => record(documentStub, t, fn),
  removeEventListener: noop,
  dispatchEvent: () => false,
  execCommand: () => true,
  getSelection: () => ({ toString: () => '' }),
};

const store = {}, sessionStore = {};
const sandbox = {
  console,
  crypto: webcrypto,
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  // Timers never fire: nothing should run during a boot test, and a real
  // setInterval (AuthModule.startTimers) would keep the process alive forever.
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  },
  sessionStorage: {
    getItem: k => (k in sessionStore ? sessionStore[k] : null),
    setItem: (k, v) => { sessionStore[k] = String(v); },
    removeItem: k => { delete sessionStore[k]; },
  },
  navigator: {
    clipboard: { writeText: async () => {} },
    userAgent: 'boot-test', language: 'en', platform: 'linux',
    cookieEnabled: false, doNotTrack: null, maxTouchPoints: 0, onLine: true,
    hardwareConcurrency: 4,
    permissions: { query: async () => ({ state: 'prompt' }) },
    mediaDevices: {},
  },
  location: { href: 'http://localhost/', reload: noop, assign: noop },
  matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop, removeEventListener: noop }),
  getComputedStyle: () => ({}),
  MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
  AbortController: class { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } },
  URL: class { constructor(u) { this.href = String(u); } static createObjectURL() { return 'blob:stub'; } static revokeObjectURL() {} toString() { return this.href; } },
  Blob: class { constructor(parts, opts) { this.parts = parts; this.type = (opts && opts.type) || ''; this.size = 0; } },
  File: class { constructor(parts, name, opts) { this.parts = parts; this.name = name; this.type = (opts && opts.type) || ''; this.size = 0; } },
  FileReader: class { readAsDataURL() {} readAsArrayBuffer() {} },
  Audio: class { constructor() { this.paused = true; this.duration = 0; this.currentTime = 0; } play() { return Promise.resolve(); } pause() {} removeAttribute() {} addEventListener() {} },
  MediaRecorder: class { constructor() { this.state = 'inactive'; } static isTypeSupported() { return false; } start() {} stop() {} pause() {} resume() {} },
  AudioContext: class { createAnalyser() { return { fftSize: 0, frequencyBinCount: 0, getByteFrequencyData() {} }; } createMediaStreamSource() { return { connect() {} }; } close() {} },
  Notification: { permission: 'default', requestPermission: async () => 'default' },
  screen: { width: 360, height: 800, colorDepth: 24 },
  performance: { now: () => 0 },
  document: documentStub,
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = (t, fn) => record(sandbox, t, fn);
sandbox.removeEventListener = noop;
sandbox.dispatchEvent = () => false;

// ── 3. load every script, in order ──
const ctx = vm.createContext(sandbox);
let loadFailed = false;
for (const file of scripts) {
  const code = fs.readFileSync(path.join(WWW, file), 'utf8');
  try {
    vm.runInContext(code, ctx, { filename: file });
  } catch (e) {
    check(false, `${file} threw while loading: ${e.message}`);
    loadFailed = true;
    break;
  }
}
if (!loadFailed) check(true, `all ${scripts.length} scripts loaded in declared order without throwing`);

// ── 4. run the real initialisation path ──
const readyHandlers = (listeners.get(sandbox) && listeners.get(sandbox).get('DOMContentLoaded')) || [];
if (!readyHandlers.length) {
  check(false, 'app registered no DOMContentLoaded handler (boot path not exercised)');
} else {
  let initError = null;
  for (const fn of readyHandlers) {
    try { fn({ type: 'DOMContentLoaded' }); }
    catch (e) { initError = e; break; }
  }
  check(!initError, initError
    ? `initialisation threw: ${initError.message}`
    : `initialisation ran clean (${readyHandlers.length} handler(s))`);
}

// ── 5. every global the app depends on must exist after boot ──
// This is the prong that catches a script that exists on disk but is never
// loaded: `typeof PrivacyOverlay` is 'undefined' and the dim overlay is dead.
const EXPECTED_GLOBALS = [
  'Vault', 'Updater', 'Appearance', 'PrivacyOverlay', 'ShakeLock', 'EncClipboard', 'PinBuddy',
  'SecretsModule', 'FilesManager', 'JournalModule', 'AuthModule', 'PrivacyModule',
  'VoiceModule', 'PasswordGen', 'VaultHealth', 'CoolTour', 'Dialog', 'App', 'S',
];
const missingGlobals = EXPECTED_GLOBALS.filter(g => {
  try { return vm.runInContext(`typeof ${g} === 'undefined'`, ctx); } catch { return true; }
});
check(missingGlobals.length === 0, missingGlobals.length === 0
  ? `all ${EXPECTED_GLOBALS.length} app globals are defined after boot`
  : `globals missing after boot (script on disk but not loaded?): ${missingGlobals.join(', ')}`);

// ── 6. cross-module wiring the app relies on at runtime ──
const wiring = [
  ['PrivacyOverlay.enable/disable', 'typeof PrivacyOverlay.enable === "function" && typeof PrivacyOverlay.disable === "function"'],
  ['ShakeLock.enable/disable', 'typeof ShakeLock.enable === "function" && typeof ShakeLock.disable === "function"'],
  ['EncClipboard.copy (sensitive copies purge)', 'typeof EncClipboard.copy === "function"'],
  ['EncClipboard.setAutoClear', 'typeof EncClipboard.setAutoClear === "function"'],
  ['VoiceModule.abort (lock stops the recorder)', 'typeof VoiceModule.abort === "function"'],
  ['FilesManager.closeViewer (lock releases object URLs)', 'typeof FilesManager.closeViewer === "function"'],
  ['App.lock (shake-to-lock target)', 'typeof App.lock === "function"'],
  ['Updater.currentVersion', 'typeof Updater.currentVersion === "string"'],
  ['PinBuddy.input/unlock (lock-screen character reacts)', 'typeof PinBuddy.input === "function" && typeof PinBuddy.unlock === "function"'],
];
const brokenWiring = wiring.filter(([, expr]) => {
  try { return !vm.runInContext(expr, ctx); } catch { return true; }
}).map(([name]) => name);
check(brokenWiring.length === 0, brokenWiring.length === 0
  ? `all ${wiring.length} cross-module contracts hold`
  : `cross-module contracts broken: ${brokenWiring.join(', ')}`);

if (unimplemented.size) {
  console.log(`  (note: ${unimplemented.size} DOM surface(s) not modelled by the stub: ${[...unimplemented].slice(0, 8).join(', ')}${unimplemented.size > 8 ? ', …' : ''})`);
}

console.log('');
if (failures > 0) { console.error(`FAILED: ${failures} boot check(s).`); process.exit(1); }
console.log('Boot test passed.');
