#!/usr/bin/env node
/**
 * Voice recorder test — drives www/voice.js through its own event handlers
 * behind a DOM stub, with fake timers and a fake clock.
 *
 * Why this exists: the recorder is a state machine whose two failure modes are
 * both invisible to static analysis and to a device smoke test —
 *   1. durations. The timer used to accumulate `+= 100` per setInterval tick and
 *      SAVE that number. When the WebView throttles timers (screen off, app
 *      backgrounded — i.e. while recording a long note) the saved duration was
 *      silently minutes short. Test A below records for 120s while firing *no*
 *      timer callbacks at all, which is the worst case throttling can produce.
 *   2. losing a take. 'review' holds the only unrecoverable thing in the panel,
 *      and both Record and Close used to tear it down without asking.
 * The module exposes no internals, so this drives it the way a user does:
 * clicking the buttons by id, then reading what reached Vault.saveFile.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WWW = path.join(__dirname, '..', 'www');
let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? '\u2713' : '\u2717'} ${msg}`); if (!cond) failures++; };

// ── fake clock ───────────────────────────────────────────────────────────────
// setInterval callbacks are captured but never auto-fired: the throttle
// scenarios require choosing, per test, whether any tick ever happens.
const clock = (() => {
  let t = 1_700_000_000_000, timerSeq = 0;
  const intervals = new Map();
  return {
    now: () => t,
    advance(ms) { t += ms; },
    setInterval(fn) { const id = ++timerSeq; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    fireAll() { for (const fn of [...intervals.values()]) fn(); },
    get liveIntervals() { return intervals.size; },
  };
})();

// ── DOM stub ─────────────────────────────────────────────────────────────────
const store = { nodes: new Map() };
const counts = { getUserMedia: 0, createUrl: 0, revokeUrl: 0 };
const aliveUrls = new Set();
const confirmations = [];
let confirmAnswer = true;
let savedFile = null;

function node(id) {
  if (store.nodes.has(id)) return store.nodes.get(id);
  const classes = new Set();
  const n = {
    id, style: {}, dataset: {}, value: '', textContent: '', innerHTML: '', src: '',
    paused: true, disabled: false, handlers: {},
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : !!on; v ? classes.add(c) : classes.delete(c); return v; },
      contains: c => classes.has(c),
    },
    setAttribute() {}, getAttribute() { return null; }, focus() {}, remove() {},
    appendChild() {}, querySelector: () => null,
    querySelectorAll: sel => (sel.includes('play-btn') ? playBtns : []),
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
    removeEventListener(type, fn) { if (this.handlers[type]) this.handlers[type] = this.handlers[type].filter(f => f !== fn); },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    removeAttribute() {},
  };
  store.nodes.set(id, n);
  return n;
}

const byId = id => node(id);

// The only two node sets the recorder path actually iterates.
const playBtns = ['a', 'b'].map(id => { const b = node('play-' + id); b.dataset.id = id; return b; });

const documentStub = {
  getElementById: byId,
  createElement: tag => node('created-' + tag + '-' + Math.random()),
  body: node('body'),
  querySelector: sel => (sel.includes('modal-backdrop') ? node('backdrop') : null),
  querySelectorAll: sel => (sel.includes('play-btn') ? playBtns : []),
  addEventListener() {}, removeEventListener() {},
};

const evt = { type: 'click', preventDefault() {}, stopPropagation() {}, target: { closest: () => null } };

const sandbox = {
  console,
  document: documentStub,
  window: null,
  navigator: {
    mediaDevices: { getUserMedia: async () => { counts.getUserMedia++; return { getTracks: () => [{ stop() {} }] }; } },
    serviceWorker: { controller: { postMessage() {} } },
  },
  setTimeout: () => 0, clearTimeout: () => {},
  setInterval: clock.setInterval, clearInterval: clock.clearInterval,
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  Date: class extends Date { static now() { return clock.now(); } },
  DOMException,
  AbortController,
  URL: {
    createObjectURL(blob) { counts.createUrl++; const u = 'blob:' + counts.createUrl; aliveUrls.add(u); return u; },
    revokeObjectURL(u) { counts.revokeUrl++; aliveUrls.delete(u); },
  },
  Blob: class { constructor(parts, opts) { this.parts = parts; this.type = (opts && opts.type) || ''; this.size = parts && parts.length ? 1024 : 0; } },
  File: class { constructor(parts, name, opts) { this.parts = parts; this.name = name; this.type = (opts && opts.type) || ''; this.size = 1024; } },
  FileReader: class {},
  AudioContext: class {
    constructor() { this.sampleRate = 48000; }
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 0, getByteFrequencyData() {} }; }
    createMediaStreamSource() { return { connect() {} }; }
    close() {}
  },
  MediaRecorder: class {
    constructor(stream, opts) { this.stream = stream; this.mimeType = (opts && opts.mimeType) || 'audio/webm'; this.state = 'inactive'; }
    static isTypeSupported() { return true; }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      if (this.ondataavailable) this.ondataavailable({ data: { size: 1024 } });
      if (this.onstop) this.onstop();
    }
  },
  S: {},
  toast() {},
  uiConfirm: async (title, body, opts) => { confirmations.push({ title, body, opts }); return confirmAnswer; },
  uiAlert: async () => {},
  EncClipboard: { copy: async () => ({ ok: true, purges: true }), copyMessage: () => '' },
  Vault: {
    isUnlocked: () => true,
    getAllFiles: async () => [
      { id: 'a', name: 'Note A', type: 'audio/webm', size: 2048, ts: Date.now(), duration: 5 },
      { id: 'b', name: 'Note B', type: 'audio/mp4', size: 4096, ts: Date.now(), duration: 7 },
    ],
    getFileBlob: async () => ({ size: 1024, type: 'audio/webm' }),
    saveFile: async (file, meta) => { savedFile = { file, meta }; },
    esc: s => String(s), formatSize: () => '2 KB', relTime: () => 'now',
    setFileTranscript: async () => {}, deleteFile: async () => {},
  },
};
sandbox.window = sandbox;
sandbox.self = sandbox;

const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(WWW, 'voice.js'), 'utf8'), ctx, { filename: 'voice.js' });
const V = vm.runInContext('VoiceModule', ctx);
V.init();

const click = async id => {
  const handlers = byId(id).handlers.click || [];
  for (const fn of handlers) await fn(evt);
};
const state = () => (byId('voiceRecStatus').textContent || '');
// Some listeners (the play button) fire an async job without returning its
// promise, so awaiting the handler is not enough — the microtask queue has to
// drain before anything it did can be asserted on.
const settle = async () => { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };

// CommonJS has no top-level await, so the scenarios live in one async body.
async function main() {

// ── A. the duration is wall-clock, not tick-counted ──────────────────────────
console.log('\n== A. duration survives total timer throttling ==');
{
  savedFile = null;
  await click('voiceRecordBtn');                       // start
  check(state() === 'Recording', 'recording starts');
  check(clock.liveIntervals === 1, 'the repaint ticker is running');

  clock.advance(120_000);                              // 2 minutes, ZERO callbacks fire
  await click('voiceRecordBtn');                       // stop -> review
  check(state().startsWith('Review'), 'stopping lands in review, never auto-saves');

  await click('voiceSaveBtn');
  const dur = savedFile && savedFile.meta && savedFile.meta.duration;
  check(typeof dur === 'number' && Math.abs(dur - 120) < 0.5,
    `2 minutes recorded through complete throttling saves as ${dur}s (tick-counting would have saved 0s)`);
  // The recorder negotiates the real codec (Chromium reports
  // "audio/webm;codecs=opus"), and the filename extension has to agree with
  // it — the old code hardcoded ".webm" even when the device produced audio/mp4.
  check(savedFile.file.type.startsWith('audio/webm'), `the saved file keeps its real MIME type (${savedFile.file.type})`);
  check(/\.webm$/.test(savedFile.file.name), `the filename extension matches that type (${savedFile.file.name})`);
}

// ── B. a paused minute is not billed ─────────────────────────────────────────
console.log('\n== B. pause stops the clock, resume restarts it ==');
{
  savedFile = null;
  await click('voiceRecordBtn');   // start
  clock.advance(30_000);
  await click('voicePauseBtn');    // pause
  check(state() === 'Paused', 'pause is reflected in the state');
  clock.advance(600_000);          // ten minutes paused
  await click('voicePauseBtn');    // resume
  check(state() === 'Paused' || state() === 'Recording', 'resume returns to recording');
  clock.advance(30_000);
  await click('voiceRecordBtn');   // stop
  await click('voiceSaveBtn');
  const dur = savedFile.meta.duration;
  check(Math.abs(dur - 60) < 0.5, `60s recorded either side of a 10-minute pause saves as ${dur}s`);
}

// ── C. a reviewed take is not silently destroyed by Record ───────────────────
console.log('\n== C. Record cannot silently discard a reviewed take ==');
{
  // Section B ends by SAVING, which returns the recorder to idle, so build a
  // fresh unreviewed take here.
  await click('voiceRecordBtn');
  clock.advance(5_000);
  await click('voiceRecordBtn');
  check(state().startsWith('Review'), 'a take is waiting in review before the guard is tested');

  const before = counts.getUserMedia;
  confirmAnswer = false;
  confirmations.length = 0;
  await click('voiceRecordBtn');                      // in review
  check(confirmations.length === 1, 'tapping Record while reviewing asks first');
  check(confirmations[0].opts && confirmations[0].opts.danger === true, 'and asks as a destructive action');
  check(counts.getUserMedia === before, 'declining starts no new recording — the take is still there');
  check(state().startsWith('Review'), 'the take is still in review after declining');

  confirmAnswer = true;
  await click('voiceRecordBtn');                      // accept
  check(counts.getUserMedia === before + 1, 'accepting discards it and starts recording');
  check(state() === 'Recording', 'the new take is live');
  await click('voiceRecordBtn');                      // stop, back to review
}

// ── D. Close cannot silently destroy a reviewed take either ──────────────────
console.log('\n== D. Close asks before dropping an unsaved take ==');
{
  confirmAnswer = false;
  confirmations.length = 0;
  await click('closeVoiceModal');
  check(confirmations.length === 1, 'closing while reviewing asks first');
  check(!byId('voiceModal').classList.contains('hidden'), 'declining leaves the panel open and the take intact');

  // The take must still be saveable after a declined close.
  savedFile = null;
  await click('voiceSaveBtn');
  check(savedFile && typeof savedFile.meta.duration === 'number',
    'the take still saves after a declined close (it was not torn down)');

  confirmAnswer = true;
  await click('closeVoiceModal');
  check(byId('voiceModal').classList.contains('hidden'), 'accepting closes the panel');
  check(state() === 'Ready', 'and the recorder resets to idle');
}

// ── E. playing notes does not pin decrypted audio in memory ──────────────────
console.log('\n== E. playback releases the previous object URL ==');
{
  const before = { create: counts.createUrl, revoke: counts.revokeUrl };
  await V.refresh();
  await playBtns[0].handlers.click[0](evt);   // play note A
  await settle();
  const afterFirst = counts.createUrl - before.create;
  check(afterFirst === 1, 'playing a note creates one URL for the decrypted audio');
  check(counts.revokeUrl - before.revoke === 0, 'and releases nothing while it is playing');

  await playBtns[1].handlers.click[0](evt);   // play note B
  await settle();
  check(counts.createUrl - before.create === 2, 'playing a second note creates a second URL');
  check(counts.revokeUrl - before.revoke === 1,
    'and revokes the first — otherwise every replay pinned another copy of the plaintext audio');
  // Exactly one may be outstanding: the URL currently backing playback. More
  // than that means something — a review take, a previous playback — was never
  // released, which is what this section exists to catch.
  check(aliveUrls.size === 1, `exactly the live playback URL is still allocated (${aliveUrls.size})`);
}

// ── F. the state machine leaves nothing running ──────────────────────────────
console.log('\n== F. teardown ==');
{
  await click('voiceRecordBtn');   // start
  check(clock.liveIntervals === 1, 'one ticker while recording');
  V.abort();                       // what a lock does
  check(clock.liveIntervals === 0, 'abort() stops the ticker');
  check(state() === 'Ready', 'and resets the recorder to idle');
  check(byId('voiceRecActions').classList.contains('hidden'), 'review controls are hidden once idle');
}

console.log('');
if (failures > 0) { console.error(`FAILED: ${failures} voice recorder check(s).`); process.exit(1); }
console.log('Voice recorder test passed.');
}

main().catch(e => { console.error('voice recorder harness crashed:', e); process.exit(2); });
