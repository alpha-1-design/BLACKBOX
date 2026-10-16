#!/usr/bin/env node
/**
 * Lock-screen character test.
 *
 * buddy.js is the first piece of the UI whose correctness is *timing*, not
 * wiring: which face is showing, how long it stays, and whether a stale timer
 * can flip the expression out from under a newer state. Static analysis cannot
 * see any of that — a wrong PEEK_AFTER_MS or a missing _clear() still greps
 * clean and still boots — so this drives the real module against a virtual
 * clock and asserts the states it lands in.
 *
 * Also checks the two things that silently rot around a character like this:
 * a state class the JS applies but the stylesheet never draws (the face just
 * stops reacting, no error), and the SVG/CSS leaving the markup.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WWW = path.join(__dirname, '..', 'www');
let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? '\u2713' : '\u2717'} ${msg}`); if (!cond) failures++; };

const buddySrc = fs.readFileSync(path.join(WWW, 'buddy.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(WWW, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(WWW, 'styles.css'), 'utf8');

// ── virtual clock ────────────────────────────────────────────────────────────
// Deterministic timers: the module's revert-after-ms behaviour is the whole point,
// and real timers would make this test slow and flaky instead of exact.
function makeClock() {
  let now = 0, seq = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: now + (Number(ms) || 0), fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const target = now + ms;
      for (let guard = 0; guard < 1000; guard++) {
        let next = null;
        for (const [id, t] of timers) {
          if (t.at > target) continue;
          if (!next || t.at < next[1].at || (t.at === next[1].at && id < next[0])) next = [id, t];
        }
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = target;
    },
    get pending() { return timers.size; },
  };
}

// ── module loader ────────────────────────────────────────────────────────────
// One fresh instance per scenario, so no test can inherit another's state.
function load({ element = true, noVibrate = false } = {}) {
  const classes = new Set(['pin-buddy']);
  const el = element === false ? null : {
    classList: {
      toggle: (c, on) => { on ? classes.add(c) : classes.delete(c); },
      contains: c => classes.has(c),
    },
  };
  const vibration = [];
  const clock = makeClock();
  const sandbox = {
    document: { getElementById: id => (id === 'pinBuddy' ? el : null) },
    navigator: noVibrate ? {} : { vibrate: p => { vibration.push(p); return true; } },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    console,
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(buddySrc, ctx, { filename: 'buddy.js' });

  const run = expr => vm.runInContext(expr, ctx);
  return {
    classes, vibration, clock,
    state: () => run('PinBuddy.stateName()'),
    activeStates: () => [...classes].filter(c => c.startsWith('is-')).sort(),
    run,
    PEEK: run('PinBuddy.PEEK_AFTER_MS'),
    HAPPY: run('PinBuddy.HAPPY_MS'),
    WORRIED: run('PinBuddy.WORRIED_MS'),
    attach: () => run('PinBuddy.attach()'),
  };
}

// ── 1. module shape ──────────────────────────────────────────────────────────
console.log('\n== character module: API ==');
const api = load();
const isFn = n => api.run(`typeof PinBuddy.${n} === 'function'`);
check(['attach', 'input', 'idle', 'unlock', 'reject'].every(isFn), 'input/idle/unlock/reject/attach are all callable');
const states = api.run('JSON.stringify(PinBuddy.STATES)');
check(states === '["idle","shielding","happy","worried"]', `the four states are declared (${states})`);
check(api.PEEK > 0 && api.HAPPY > 0 && api.WORRIED > 0,
  `timings are real durations (peek ${api.PEEK}ms, happy ${api.HAPPY}ms, worried ${api.WORRIED}ms)`);

// ── 2. the state machine ─────────────────────────────────────────────────────
console.log('\n== state machine: shield while typing, peek when done ==');
{
  const b = load();
  b.run('PinBuddy.attach(); PinBuddy.input()');
  check(b.state() === 'shielding', 'a digit shuts the eyes (shielding)');
  check(b.classes.has('is-shielding'), 'the .is-shielding class is applied for the stylesheet');

  // Typing again must *extend* the grace, not stack a second timer — the classic
  // bug where the reveal fires mid-PIN on the 4th digit.
  b.clock.advance(b.PEEK - 200);
  b.run('PinBuddy.input()');
  b.clock.advance(300); // past the first deadline, short of the second
  check(b.state() === 'shielding', 'a second digit restarts the grace — it does not uncover mid-PIN');

  b.clock.advance(b.PEEK);
  check(b.state() === 'idle', `it peeks again once typing actually stops (${b.PEEK}ms after the last digit)`);
  check(b.classes.has('is-idle') && !b.classes.has('is-shielding'), 'exactly one face is active at rest');
  check(b.clock.pending === 0, 'no orphan timers are left behind');
}
{
  // A stale reveal timer must never override a newer state. Order matters here:
  // the shield is the *shorter* timer, so if _clear() were dropped, the peek
  // would fire during the happy animation and wipe the smile.
  const b = load();
  b.run('PinBuddy.input(); PinBuddy.unlock()');
  b.clock.advance(b.PEEK + 1);
  check(b.state() === 'happy', 'a successful unlock is not cancelled by the pending peek timer');
  b.clock.advance(b.HAPPY);
  check(b.state() === 'idle', 'the smile settles back to idle');
}
{
  const b = load();
  b.run('PinBuddy.reject()');
  check(b.state() === 'worried', 'a wrong PIN gets the worried face');
  b.clock.advance(b.WORRIED);
  check(b.state() === 'idle', 'the worried face settles back to idle');
}
{
  const b = load();
  b.run('PinBuddy.input(); PinBuddy.idle()');
  check(b.state() === 'idle' && !b.classes.has('is-shielding'),
    'clearing the digits uncovers the eyes immediately (delete-key and lock paths)');
}

// ── 3. missing SVG must not break the lock screen ────────────────────────────
console.log('\n== degrades safely ==');
{
  const b = load({ element: false });
  let threw = null;
  try { b.run('PinBuddy.input(); PinBuddy.idle(); PinBuddy.unlock(); PinBuddy.reject()'); }
  catch (e) { threw = e; }
  check(!threw, threw ? `throwing without the SVG would break unlock: ${threw.message}`
    : 'every state call is a no-op (not a crash) if the character markup is missing');
  check(b.run('PinBuddy.attach()') === false, 'attach() reports honestly that it found no node');
  check(b.state() === 'idle', 'state stays sane with no node attached');
}

// ── 4. haptics ───────────────────────────────────────────────────────────────
console.log('\n== haptics (guarded, so desktop/web are unaffected) ==');
{
  const b = load();
  const BUZZ = JSON.parse(b.run('JSON.stringify(PinBuddy.BUZZ)'));
  b.run('PinBuddy.input()');
  b.run('PinBuddy.unlock()');
  b.run('PinBuddy.reject()');
  check(b.vibration.length === 3, `every interaction fires exactly one vibration (${b.vibration.length}/3)`);
  check(b.vibration[0] === BUZZ.input, `digit tick (${BUZZ.input}ms)`);
  check(b.vibration[1] === BUZZ.unlock, `unlock pulse (${BUZZ.unlock}ms)`);
  check(Array.isArray(b.vibration[2]) && b.vibration[2].length === 3,
    `wrong PIN is a pattern, not a single buzz (${JSON.stringify(BUZZ.reject)})`);
}
{
  const b = load({ noVibrate: true });
  let threw = null;
  try { b.run('PinBuddy.input(); PinBuddy.unlock(); PinBuddy.reject()'); } catch (e) { threw = e; }
  check(!threw, threw ? `vibrate-less environments throw: ${threw.message}`
    : 'no navigator.vibrate (desktop browser, web build) is a silent no-op');
}
{
  const b = load({ element: false });
  b.run('PinBuddy.input()');
  check(b.vibration.length === 1, 'the keypad still ticks even if the character markup is gone');
}

// ── 5. the visual the module drives must exist ───────────────────────────────
console.log('\n== markup + stylesheet contract ==');
check(/id="pinBuddy"/.test(html), 'index.html declares the #pinBuddy node the module attaches to');
const svg = (html.match(/<svg[^>]*id="pinBuddy"[\s\S]*?<\/svg>/) || [''])[0];
check(svg.length > 0, 'the character is inline SVG (no image asset to ship or fail to load)');
for (const part of ['buddy-body', 'buddy-face', 'buddy-paw', 'buddy-eye', 'buddy-led', 'buddy-pupil']) {
  check(svg.includes(`class="${part}`) || svg.includes(`${part}`), `the SVG has the ${part} part the CSS paints`);
}
for (const mouth of ['m-neutral', 'm-happy', 'm-worried']) {
  check(svg.includes(mouth), `the SVG carries the ${mouth} expression the module selects`);
}
// A state class the JS applies but the CSS never styles is invisible: no error,
// the face just stops reacting. This is the prong that catches that.
const RENDERED = ["is-idle", "is-shielding", "is-happy", "is-worried",
  "m-neutral", "m-happy", "m-worried", "buddy-body", "buddy-paw", "buddy-eye", "buddy-cheek", "buddy-seam",
  "buddy-face", "buddy-bolt", "buddy-stem", "buddy-led", "buddy-led-halo", "buddy-pupil", "buddy-glint",
  "verifying"];
const unstyled = RENDERED.filter(c => !css.includes(`.${c}`));
check(unstyled.length === 0, unstyled.length === 0
  ? `all ${RENDERED.length} classes the character relies on are drawn in styles.css`
  : `classes applied but never styled (the face silently stops reacting): ${unstyled.join(', ')}`);
check(/@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?pin-buddy/.test(css),
  'the character honours prefers-reduced-motion (breathing + blinking stop)');

// ── 5b. do the paws actually COVER the eyes? ─────────────────────────────────
// The whole point of the character is "eyes covered while typing". That is
// geometry spread across two files — eye positions in index.html, the paw
// offset in styles.css — and it fails silently: change the viewBox, nudge a
// paw, and the paws rise to somewhere near the eyes and nobody notices, because
// a transform that lands 4px short still runs without error. So the numbers are
// read out of both files and checked, rather than trusted.
console.log('\n== geometry: the shield position really covers the eyes ==');
{
  // The eye is a <g> holding the pupil and its glint (so both blink together),
  // so the coverable extent is the pupil — that is what the paw must hide.
  const eyes = [...svg.matchAll(/<g class="buddy-eye">[\s\S]*?<circle class="buddy-pupil" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)]
    .map(m => ({ cx: +m[1], cy: +m[2], r: +m[3] }));
  const paws = [...svg.matchAll(/<rect class="buddy-paw"[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/g)]
    .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
  const shift = css.match(/\.pin-buddy\.is-shielding \.buddy-paw\{transform:translateY\((-?[\d.]+)px\)\}/);

  check(eyes.length >= 2, `${eyes.length} eye(s) found in the markup`);
  check(paws.length >= 2, `${paws.length} paw(s) found in the markup`);
  check(!!shift, 'the shield offset is a real transform the test can measure (not assert blindly)');

  if (eyes.length && paws.length && shift) {
    const dy = +shift[1];
    const uncovered = [], resting = [];
    for (const eye of eyes) {
      const shieldPaws = paws.filter(p => p.y + dy <= eye.cy - eye.r && p.y + dy + p.h >= eye.cy + eye.r
        && p.x <= eye.cx - eye.r && p.x + p.w >= eye.cx + eye.r);
      if (!shieldPaws.length) uncovered.push(`(${eye.cx},${eye.cy})`);
      // At rest the paws must sit clear of the face, or the character always
      // looks like it is covering its eyes and the reveal is meaningless.
      const stillCovering = paws.some(p => p.y <= eye.cy + eye.r && p.y + p.h >= eye.cy - eye.r);
      if (stillCovering) resting.push(`(${eye.cx},${eye.cy})`);
    }
    check(uncovered.length === 0, uncovered.length === 0
      ? `both eyes fall fully inside a paw once shifted by ${dy}px — the eyes are really covered`
      : `paws do NOT cover the eyes at ${dy}px (uncovered: ${uncovered.join(', ')})`);
    check(resting.length === 0, resting.length === 0
      ? 'at rest the paws sit clear of the eyes (so the reveal is visible)'
      : `paws cover the eyes even at rest — the character would never peek (${resting.join(', ')})`);

    // SVG paints in document order: a paw drawn BEFORE the eyes would be
    // painted underneath them, so the "cover" would be invisible even though
    // the maths above is perfect.
    const firstPaw = svg.indexOf('buddy-paw'), lastEye = svg.lastIndexOf('buddy-eye');
    check(firstPaw > lastEye, 'paws are painted after the eyes, so the cover is actually visible');
  }
}

// ── 6. the app must actually drive it ────────────────────────────────────────
console.log('\n== app wiring (a character nobody calls is dead weight) ==');
const WIRING = [
  ['_initLock attaches the character', /function _initLock\(\)\s*\{[\s\S]{0,240}?PinBuddy\.attach\(\)/],
  ['adding a digit shields the eyes', /function _addDigit\([\s\S]*?PinBuddy\.input\(\)/],
  ['deleting a digit keeps it shielding', /function _delDigit\(\)[\s\S]*?PinBuddy\.input\(\)/],
  ['a correct PIN makes it celebrate', /PinBuddy\.unlock\(\)/],
  ['a wrong PIN makes it react', /PinBuddy\.reject\(\)/],
  ['clearing the pad resets the face', /PinBuddy\.idle\(\)/],
  // Deriving the key (PBKDF2) is a visible gap in the lock flow; the pad has to
  // say so, and the state has to be cleared on every exit path — including the
  // decoy-panic and self-destruct returns.
  ['the pad shows progress while the key is derived', /function _checkPin\(\)\s*\{[\s\S]{0,900}?await _verifyPin\(\)[\s\S]{0,200}?finally/],
];
const unwired = WIRING.filter(([, re]) => !re.test(appSrc)).map(([name]) => name);
check(unwired.length === 0, unwired.length === 0
  ? `all ${WIRING.length} lock-screen interactions drive the character`
  : `character states nothing triggers (written but never shown): ${unwired.join(', ')}`);
check((appSrc.match(/PinBuddy\.\w+\(/g) || []).length >= 6,
  'the character is wired at every point the lock flow changes state');

console.log('');
if (failures > 0) { console.error(`FAILED: ${failures} character check(s).`); process.exit(1); }
console.log('Lock-screen character test passed.');
