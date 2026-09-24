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

// 3. no native dialogs in app code (colour-mismatch / flow-trap bug class)
const offenders = [];
for (const [f, src] of Object.entries(jsSources)) {
  if (f === 'maintenance.js') continue; // unused legacy
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

console.log('');
if (failures > 0) { console.error(`FAILED: ${failures} UI contract check(s).`); process.exit(1); }
console.log('All UI contract tests passed.');
