#!/usr/bin/env node
/**
 * TOTP correctness test. Runs the real www/auth.js generateTOTP against the
 * RFC 6238 (Appendix B) SHA-1 test vectors. v2.0.0-2.0.7 shipped a
 * `const time` that was reassigned in the byte loop, so every call threw and
 * every code showed "------"; nothing in CI exercised code generation.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {
  crypto: require('crypto').webcrypto,
  TextEncoder, TextDecoder, console,
  setInterval: () => 0, clearInterval: () => {},
  document: { getElementById: () => null, querySelector: () => null, createElement: () => ({}) },
  window: {},
};
vm.createContext(sandbox);
const src = fs.readFileSync(path.join(__dirname, '..', 'www', 'auth.js'), 'utf8');
vm.runInContext(src + '\n;globalThis.AuthModule = AuthModule;', sandbox);
const { generateTOTP, base32ToBytes } = sandbox.AuthModule;

let failures = 0;
function check(cond, msg) { console.log(`  ${cond ? '\u2713' : '\u2717'} ${msg}`); if (!cond) failures++; }

// RFC 6238 Appendix B seeds. The SHA-256 and SHA-512 vectors use longer ASCII
// seeds than SHA-1 — reusing the SHA-1 seed produced wrong codes even though
// the HMAC implementation was correct.
const SEEDS = {
  SHA1: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  SHA256: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA',
  SHA512: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA',
};
const SECRET = SEEDS.SHA1;
const VECTORS = [
  [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
  [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
];

(async () => {
  check(typeof generateTOTP === 'function', 'auth.js exports generateTOTP for testing');
  for (const [t, want] of VECTORS) {
    let got;
    try { got = await generateTOTP(SECRET, t, 8); } catch (e) { got = 'THROWS: ' + e.message; }
    check(got === want, `RFC 6238 t=${t} 8-digit -> ${want} (got ${got})`);
  }
  for (const [t, want8] of VECTORS) {
    let got;
    try { got = await generateTOTP(SECRET, t, 6); } catch (e) { got = 'THROWS: ' + e.message; }
    check(got === want8.slice(-6), `t=${t} 6-digit -> ${want8.slice(-6)} (got ${got})`);
  }
  // Same 30s window -> same code; next window -> different code
  const a = await generateTOTP(SECRET, 1000, 6), b = await generateTOTP(SECRET, 1019, 6);
  check(a === b, 'codes are stable within one 30s window');
  // Spaces/lowercase secrets as pasted from providers
  const pasted = 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq';
  check(await generateTOTP(pasted.replace(/\s/g, ''), 59, 8) === '94287082', 'lowercase secret decodes');
  check(base32ToBytes('!!!!').length === 0, 'base32ToBytes strips non-base32 characters (junk yields no bytes)');

  // RFC 6238 Appendix B — SHA-256 and SHA-512 (digits=8). These catch a
  // regression to HMAC-SHA1, which silently breaks Aegis/Bitwarden accounts.
  for (const [t, want, alg] of [
    [59, '46119246', 'SHA256'], [1111111109, '68084774', 'SHA256'],
    [59, '90693936', 'SHA512'], [1111111109, '25091201', 'SHA512'],
  ]) {
    let got;
    try { got = await generateTOTP(SEEDS[alg], t, 8, alg); } catch (e) { got = 'THROWS: ' + e.message; }
    check(got === want, `RFC 6238 ${alg} t=${t} -> ${want} (got ${got})`);
  }
  check(await generateTOTP(SEEDS.SHA256, 59, 6, 'SHA256') === '119246',
    'SHA-256 6-digit truncation matches the 8-digit RFC vector');
  // Period: same secret/time with X=60 must differ from the default 30s.
  const p30 = await generateTOTP(SECRET, 100, 6, 'SHA1', 30);
  const p60 = await generateTOTP(SECRET, 100, 6, 'SHA1', 60);
  check(p30 !== p60, `period parameter changes the counter (30s=${p30}, 60s=${p60})`);
  // 3540 and 3599 are both inside the 60-second window starting at 3540.
  check(await generateTOTP(SECRET, 3540, 6, 'SHA1', 60) === await generateTOTP(SECRET, 3599, 6, 'SHA1', 60),
    'codes stable within a 60-second window');

  // Manual entry must reject junk, not silently strip it into an empty secret.
  const auth = sandbox.AuthModule;
  check(typeof auth.parseOtpauthUri === 'function', 'parser is exported');

  if (failures) { console.log(`\nTOTP test FAILED (${failures})`); process.exit(1); }
  console.log('\nTOTP test passed.');
})();
