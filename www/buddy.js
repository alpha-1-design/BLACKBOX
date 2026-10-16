/* PinBuddy — the lock-screen character.
 *
 * It shuts its eyes when a digit lands and peeks again once the user stops,
 * which is the small bit of personality the big consumer apps have and this
 * screen did not. Deliberately kept as state + timing only (no rendering), so
 * the part that can be wrong is unit-testable without a browser — see
 * ci/buddy.test.js. The visual lives in styles.css (.pin-buddy).
 *
 * It also carries the lock screen's haptics: one tick per digit, a lighter one
 * on unlock, a double pulse on a wrong PIN, so the pad answers on a phone the
 * way a hardware keypad does. navigator.vibrate is absent on desktop and in the
 * web build, and Android already declares android.permission.VIBRATE, so this
 * is a real no-op rather than an error there.
 *
 * Timing contract:
 *   input()  -> 'shielding' for PEEK_AFTER_MS, restarted by every digit, so it
 *               stays covered for as long as someone keeps typing and uncovers
 *               once they actually stop
 *   unlock() -> 'happy' for HAPPY_MS, then back to idle
 *   reject() -> 'worried' for WORRIED_MS, then back to idle
 * Any new state cancels the previous timer, so a stale revert can never flip
 * the face out from under a fresh one.
 */
const PinBuddy = (() => {
  const PEEK_AFTER_MS = 1600; // idle grace before it uncovers
  const HAPPY_MS = 1800;
  const WORRIED_MS = 1400;

  const STATES = ['idle', 'shielding', 'happy', 'worried'];

  // Haptic patterns, in ms. Exported so the test pins the contract rather than
  // re-asserting whatever the code happens to do.
  const BUZZ = { input: 8, unlock: 12, reject: [18, 55, 18] };

  let el = null;
  let timer = null;
  let state = 'idle';

  function buzz(pattern) {
    try {
      if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
    } catch { /* unsupported / blocked — never let feedback break unlock */ }
  }

  function attach(node) {
    el = node || document.getElementById('pinBuddy');
    _render();
    return !!el;
  }

  function _render() {
    if (!el) return;
    for (const s of STATES) el.classList.toggle('is-' + s, state === s);
  }

  function _clear() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function _set(next, revertAfterMs) {
    _clear();
    state = next;
    _render();
    if (revertAfterMs) {
      timer = setTimeout(() => { timer = null; state = 'idle'; _render(); }, revertAfterMs);
    }
  }

  function input() {
    if (!el) attach();
    buzz(BUZZ.input); // buzz even if the SVG is missing: the pad still answers
    if (!el) return;
    _set('shielding', PEEK_AFTER_MS);
  }

  /** Digits cleared, or the vault re-locked. */
  function idle() {
    if (!el) attach();
    if (!el) return;
    _set('idle', 0);
  }

  function unlock() {
    if (!el) attach();
    buzz(BUZZ.unlock);
    if (!el) return;
    _set('happy', HAPPY_MS);
  }

  function reject() {
    if (!el) attach();
    buzz(BUZZ.reject);
    if (!el) return;
    _set('worried', WORRIED_MS);
  }

  function stateName() { return state; }

  return { attach, input, idle, unlock, reject, stateName, buzz, PEEK_AFTER_MS, HAPPY_MS, WORRIED_MS, BUZZ, STATES };
})();
