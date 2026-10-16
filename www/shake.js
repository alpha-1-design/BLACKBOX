/* Shake to lock.
   The README has advertised this since 2.0.0, but nothing ever called
   ShakeLock.enable(), there was no settings row, and `S.shake` was declared
   and never read — the feature was a stub. It is now driven by
   Settings → Security → Shake to Lock.

   enable() resolves true only when the motion listener is actually attached:
   the permission prompt can be declined, and some devices report no motion at
   all. The old version set `enabled = true` before knowing any of that and
   reported success regardless. */
const ShakeLock = (() => {
  let enabled = false, bound = false;
  let lastX = null, lastY = null, lastZ = null, lastShake = 0;
  const THRESH = 20, COOLDOWN = 2000;

  function _bind() {
    if (bound) return;
    window.addEventListener('devicemotion', _onMotion, { passive: true });
    bound = true;
  }

  /** Resolves true only when shake detection is really live. */
  async function enable() {
    if (typeof DeviceMotionEvent === 'undefined') return false;
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') return false;
      }
    } catch { return false; }
    _bind();
    enabled = true;
    return true;
  }

  function disable() {
    window.removeEventListener('devicemotion', _onMotion);
    bound = false;
    enabled = false;
    lastX = lastY = lastZ = null;
    return true;
  }

  async function toggle() {
    if (enabled) { disable(); return false; }
    return enable();
  }

  function isEnabled() { return enabled; }

  function _onMotion(e) {
    if (!enabled) return;
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const { x, y, z } = a;
    if (lastX !== null && x != null && y != null && z != null) {
      const delta = Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ);
      if (delta > THRESH && Date.now() - lastShake > COOLDOWN) {
        lastShake = Date.now();
        if (typeof App !== 'undefined' && App.lock) App.lock();
      }
    }
    lastX = x; lastY = y; lastZ = z;
  }

  return { enable, disable, toggle, isEnabled };
})();
