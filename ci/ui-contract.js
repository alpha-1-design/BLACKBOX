#!/usr/bin/env node
/**
 * UI contract tests — catch integration bugs unit tests can't:
 * - every id used by JS exists in index.html (broken-toggle class of bug)
 * - every app JS file is cached by the service worker (offline launch)
 * - no native alert/confirm/prompt in app code (colour-mismatch class of bug)
 * - in-app version renders from Updater (no hardcoding)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WWW = path.join(__dirname, '..', 'www');
let failures = 0;
const check = (cond, msg) => { console.log(`  ${cond ? '\u2713' : '\u2717'} ${msg}`); if (!cond) failures++; };

const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const appScripts = fs.readdirSync(WWW).filter(f => f.endsWith('.js') && f !== 'service-worker.js');
const jsSources = Object.fromEntries(appScripts.map(f => [f, fs.readFileSync(path.join(WWW, f), 'utf8')]));

// ── 1. id contract ──
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const dynamicOk = new Set([ // ids created at runtime by JS
  'wallpaperLayer', 'auroraLayer', 'code-', 'prog-', 'voice-transcript', 'toast',
  'coolStart', 'coolPrev', 'coolNext', // cool.js renders the tour body via innerHTML
  'blurDot', 'blurTxt', 'shakeDot', 'shakeTxt', // legacy status dots (guarded, may not exist)
]);
const referenced = new Set();
for (const [f, src] of Object.entries(jsSources)) {
  if (f === 'updater.js' || f === 'maintenance.js') continue;
  for (const m of src.matchAll(/getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g)) referenced.add(m[1]);
  for (const m of src.matchAll(/getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\+/g)) referenced.add(m[1]); // id-prefix + variable
}
for (const id of referenced) {
  if (dynamicOk.has(id)) continue;
  if ([...ids].some(i => i.startsWith(id))) continue; // id-prefix match (code-, prog-)
  check(false, `JS references missing id: ${id}`);
}
check(true, `all ${referenced.size} JS-referenced ids exist in index.html`);

// ── 2. service worker caches every app file ──
const sw = fs.readFileSync(path.join(WWW, 'service-worker.js'), 'utf8');
for (const f of appScripts) {
  check(sw.includes(`'./${f}'`), `service worker caches ${f}`);
}

// ── 2c. every app script is actually LOADED by index.html ──
// overlay.js existed, was cached by the service worker, and the check above
// asserted that caching — but there was no <script src="overlay.js"> tag, so
// `PrivacyOverlay` was undefined at runtime: the "Overlay Dim" toggle threw on
// change and _lockApp() threw on its last line. A file that is cached but
// never loaded is invisible to every other check, including the id contract
// (which reads JS text, not the live page).
{
  const loaded = new Set([...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1].split('/').pop()));
  const missing = appScripts.filter(f => !loaded.has(f));
  check(missing.length === 0, missing.length === 0
    ? `all ${appScripts.length} app scripts are loaded by index.html`
    : `app scripts never loaded by index.html: ${missing.join(', ')}`);
}

// ── 2b. release-independent caches: speech library + Whisper model must
// survive an app update (they used to be swept with the shell, forcing a
// ~40 MB re-download and an online-first transcription after every release).
check(sw.includes("'blackbox-cdn'"), 'service worker has a persistent CDN cache (blackbox-cdn)');
check(sw.includes("'transformers-cache'"), 'service worker spares the transformers model cache on activate');
check(!/ks\.filter\(k => k !== CACHE\)/.test(sw),
  'activate() no longer deletes every non-shell cache');
// Cancel in the voice modal must reach the service worker (transformers.js
// v2 exposes no AbortSignal of its own).
check(/bb-cancel-external/.test(sw) && /bb-cancel-external/.test(jsSources['voice.js']),
  'voice Cancel message is wired to the service worker');
// The "zero servers" claim must disclose the one-time model download.
check(/40 MB/.test(jsSources['app.js']), 'FAQ/privacy discloses the one-time ~40 MB model download');

// 3. no native dialogs in app code (colour-mismatch / flow-trap bug class)
const offenders = [];
for (const [f, src] of Object.entries(jsSources)) {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // comments don't count
  for (const m of noComments.matchAll(/(^|[^.\w])(alert|confirm|prompt)\s*\(/g)) offenders.push(`${f}: ${m[2]}()`);
}
check(offenders.length === 0, offenders.length === 0
  ? 'no native alert/confirm/prompt in app code'
  : `native dialogs found: ${offenders.join(', ')}`);

// 4. every Vault method called from UI modules is exported by vault.js
{
  const vaultSrc = jsSources['vault.js'];
  const exportBlock = (vaultSrc.match(/return \{[\s\S]*?\n  \};/) || [''])[0];
  const exported = new Set([...exportBlock.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)].map(m => m[1]));
  for (const [f, src] of Object.entries(jsSources)) {
    if (f === 'vault.js') continue;
    for (const m of src.matchAll(/Vault\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)) {
      check(exported.has(m[1]), `Vault.${m[1]} used in ${f} is exported by vault.js`);
    }
  }
}

// 5. version renders from Updater, not hardcoded
check(/aboutVersion/.test(html) && /Updater\.currentVersion/.test(jsSources['app.js']),
  'About version renders from Updater (single source of truth)');
check(!/BLACKBOX v2\.\d/.test(html), 'index.html has no hardcoded version string');

// ── 6. no orphaned CSS: every class styled in styles.css must be reachable ──
// The voice recorder shipped with its ENTIRE visual design orphaned: ~20 rules
// keyed off .record-btn / .status-text / .mic-dot / .exit-rec, none of which
// existed in the markup (the button was .modal-save, the status .file-meta).
// So the Record button never turned red, no halo ever pulsed and the timer was
// unstyled — the recorder read as a stub. Nothing caught it, because a dead
// selector is invisible to every other check. This asserts markup/JS and CSS
// actually agree, which is the general form of that whole bug class.
{
  const css = fs.readFileSync(path.join(WWW, 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' '); // a comment can never apply a style
  const selectorText = css.replace(/\{[^{}]*\}/g, ' '); // drop declarations
  const styled = new Set([...selectorText.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(m => m[1]));
  const jsAll = Object.values(jsSources).join('\n');
  // Classes assembled by concatenation in JS can never appear as a literal, so
  // they are matched as patterns instead.
  const dynamic = [
    /^wall-\d+$/, // appearance.js: 'wall-' + n
    /^m[1-5]$/,   // journal.js:    `m${avg}` — calendar mood tint
    // buddy.js: 'is-' + state — the lock-screen character's face. The four
    // states are real and driven by the lock flow; the class name only exists
    // at runtime, so it can never appear as a literal in JS or markup.
    /^is-(idle|shielding|happy|worried)$/,
  ];
  const orphaned = [...styled].filter(cls => {
    if (dynamic.some(re => re.test(cls))) return false;
    const re = new RegExp(`(?<![\\w-])${cls}(?![\\w-])`);
    return !re.test(html) && !re.test(jsAll);
  });
  check(orphaned.length === 0, orphaned.length === 0
    ? `all ${styled.size} CSS classes are reachable from markup or JS`
    : `orphaned CSS (styled but never applied): ${orphaned.join(', ')}`);
}

// ── 7. theme + UI-style contract ──
// Guards the two stubs that made the appearance system look unfinished:
// there was no .theme-light rule at all (so choosing "Light" on a dark-OS
// device silently did nothing), and the glass/neumo variants restyled only a
// handful of selectors while using color-mix(), which older Android WebViews
// drop. These assertions pin the properties that make each one real.
{
  const css = fs.readFileSync(path.join(WWW, 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  check(/html\[data-theme="light"\]/.test(css) && /html\[data-theme="dark"\]/.test(css),
    'both explicit themes are declared (html[data-theme="light"|"dark"])');
  check(/data-theme/.test(jsSources['appearance.js']),
    'appearance.js applies the theme to <html data-theme>');
  check(/@media \(prefers-color-scheme: dark\)[\s\S]{0,120}html:not\(\[data-theme\]\)/.test(css),
    'the OS dark default is scoped to html:not([data-theme]) so it cannot override a choice');
  check(/--on-accent/.test(css) && !/\.modal-save\{[^}]*color:#fff/.test(css),
    'accent-filled controls use --on-accent, not a hardcoded #fff (invisible in dark mode)');
  check(/body\.ui-glass\{/.test(css) && /--surface:var\(--glass-bg\)/.test(css),
    'glass mode swaps the surface tokens (covers every surface, not a fixed selector list)');
  check(/body\.ui-neumo\{/.test(css) && /--neu-shadow/.test(css) && /--neu-inset/.test(css),
    'neumo mode defines a real shadow pair and an inset press state');
  check(/ambient-mesh/.test(css) && /ambient-mesh/.test(jsSources['appearance.js']),
    'glass mode keeps an ambient field for backdrop-filter to refract');
  check(/WALLPAPER_COUNT/.test(jsSources['appearance.js']) && /for \(let i = 1; i <= WALLPAPER_COUNT/.test(jsSources['appearance.js']),
    'appearance.js clears every wall-* class before applying one (stale-wallpaper bug)');
}

console.log('');
if (failures > 0) { console.error(`FAILED: ${failures} UI contract check(s).`); process.exit(1); }
console.log('All UI contract tests passed.');
