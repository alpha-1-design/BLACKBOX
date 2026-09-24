#!/usr/bin/env node
/**
 * BLACKBOX static checks (no dependencies).
 *
 * Guards against regressions like the v2.0.2 startup crash, where
 * @capacitor/share@5 registered a BroadcastReceiver without the
 * RECEIVER_EXPORTED/RECEIVER_NOT_EXPORTED flag required on Android 14+
 * (targetSdk 34), crashing the app the moment Capacitor loaded the plugin.
 *
 * Usage: node ci/checks.js   (or: npm test)
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;

function ok(msg) { console.log(`  \u2713 ${msg}`); }
function fail(msg) { failures++; console.error(`  \u2717 ${msg}`); }
function check(cond, msg) { (cond ? ok : fail)(msg); return cond; }

function section(name) { console.log(`\n== ${name} ==`); }

// ---------------------------------------------------------------------------
section('Plugin safety: no unflagged registerReceiver (Android 14+ crash)');

// Scans every Capacitor plugin + app Java source for registerReceiver calls.
// A bare two-arg registerReceiver is fatal at plugin load time when
// targetSdk >= 34 (this is exactly how v2.0.2 crashed on startup).
const javaRoots = [
  path.join(ROOT, 'node_modules', '@capacitor'),
  path.join(ROOT, 'android', 'app', 'src', 'main', 'java'),
];
function walkJava(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJava(p));
    else if (e.name.endsWith('.java')) out.push(p);
  }
  return out;
}
const flagged = [];
for (const root of javaRoots) {
  for (const f of walkJava(root)) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /registerReceiver\s*\(/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const tail = src.slice(m.index, m.index + 400);
      if (!/RECEIVER_EXPORTED|RECEIVER_NOT_EXPORTED/.test(tail)) {
        flagged.push(`${path.relative(ROOT, f)}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
  }
}
check(flagged.length === 0,
  flagged.length === 0
    ? 'no unflagged registerReceiver calls in any plugin/app source'
    : `UNSAFE registerReceiver (crashes on Android 14+, targetSdk 34):\n      - ${flagged.join('\n      - ')}`);

// The v2.0.2 crash source must stay out of the dependency tree.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check(!pkg.dependencies['@capacitor/share'],
  '@capacitor/share is not a dependency (v5 registers a receiver unflagged in load())');

// After `npx cap sync android`, the generated plugin manifest must not list Share.
const genPlugins = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'capacitor.plugins.json');
if (fs.existsSync(genPlugins)) {
  const list = JSON.parse(fs.readFileSync(genPlugins, 'utf8'));
  check(!list.some(p => p.pkg === '@capacitor/share'),
    'generated capacitor.plugins.json does not register the Share plugin');
} else {
  console.log('  (capacitor.plugins.json not generated yet - run `npx cap sync android`)');
}

// ---------------------------------------------------------------------------
section('Vault crypto smoke test (node vm + webcrypto)');
try {
  execFileSync(process.execPath, [path.join(__dirname, 'vault-smoke.js')], { stdio: 'inherit' });
  ok('vault changePin/unlock/verify contract holds');
} catch (e) {
  fail('vault smoke test failed (see output above)');
}

// ---------------------------------------------------------------------------
section('Integration tests (decoy isolation, backup round-trip)');
try {
  execFileSync(process.execPath, [path.join(__dirname, 'integration.test.js')], { stdio: 'inherit' });
  ok('decoy isolation + encrypted backup contract holds');
} catch (e) {
  fail('integration tests failed (see output above)');
}

// ---------------------------------------------------------------------------
section('UI contract tests (id references, cache, native dialogs)');
try {
  execFileSync(process.execPath, [path.join(__dirname, 'ui-contract.js')], { stdio: 'inherit' });
  ok('JS↔HTML contract holds');
} catch (e) {
  fail('UI contract tests failed (see output above)');
}

// ---------------------------------------------------------------------------
section('Web app: syntax + Share references');

const www = path.join(ROOT, 'www');
for (const f of fs.readdirSync(www).filter(f => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', path.join(www, f)], { stdio: 'pipe' });
    ok(`${f} parses`);
  } catch (e) {
    fail(`${f} has a syntax error: ${String(e.stderr).trim()}`);
  }
}
const vaultSrc = fs.readFileSync(path.join(www, 'vault.js'), 'utf8');
check(!/_capPlugin\(\s*['"]Share['"]\s*\)/.test(vaultSrc),
  'vault.js no longer calls the Share plugin');
check(/_capPlugin\(\s*['"]Filesystem['"]\s*\)/.test(vaultSrc),
  'vault.js still uses the Filesystem plugin for native saves');
check(/['"]BLACKBOX\/'\s*\+\s*name/.test(vaultSrc),
  'exports go to Documents/BLACKBOX/<name> (matches the user-facing toast)');

// ---------------------------------------------------------------------------
section('Version consistency');

const version = pkg.version;
const gradle = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
const versionName = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1];
const versionCode = (gradle.match(/versionCode\s+(\d+)/) || [])[1];
check(versionName === version, `package.json (${version}) == android versionName (${versionName})`);
check(!!versionCode, `versionCode present (${versionCode})`);

const updater = fs.readFileSync(path.join(www, 'updater.js'), 'utf8');
const updaterVer = (updater.match(/currentVersion:\s*'([^']+)'/) || [])[1];
check(updaterVer === version, `updater.js currentVersion (${updaterVer}) == package.json (${version})`);

const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
check(changelog.includes(`## [${version}]`), `CHANGELOG.md has a [${version}] entry`);

// ---------------------------------------------------------------------------
section('F-Droid metadata');

const fastlane = path.join(ROOT, 'fastlane', 'metadata', 'android', 'en-US');
check(fs.existsSync(path.join(fastlane, 'images', 'icon.png')),
  'fastlane icon is at images/icon.png (not images/icon/)');
const shortDesc = path.join(fastlane, 'short_description.txt');
if (fs.existsSync(shortDesc)) {
  const txt = fs.readFileSync(shortDesc, 'utf8').trim();
  check(txt.length > 0 && txt.length <= 80, `short_description.txt is 1..80 chars (${txt.length})`);
} else {
  fail('fastlane/metadata/android/en-US/short_description.txt missing');
}

// ---------------------------------------------------------------------------
console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed.');
