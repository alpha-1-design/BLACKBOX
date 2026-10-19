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

// ASCII "12345678901234567890" in base32 (RFC 6238 SHA-1 seed)
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
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

  if (failures) { console.log(`\nTOTP test FAILED (${failures})`); process.exit(1); }
  console.log('\nTOTP test passed.');
})();
