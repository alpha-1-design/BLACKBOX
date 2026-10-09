/* Appearance engine — wallpapers, alive colours, privacy dim.
   All opt-in via Settings or the "Take the tour" experience.
   Reads/writes S (app.js settings) but applies DOM state itself. */
const Appearance = (() => {
  let _layersReady = false;

  function _ensureLayers() {
    if (_layersReady) return;
    const app = document.getElementById('mainApp');
    if (!app) return;
    if (!document.getElementById('wallpaperLayer')) {
      const w = document.createElement('div');
      w.id = 'wallpaperLayer';
      app.insertBefore(w, app.firstChild);
    }
    if (!document.getElementById('auroraLayer')) {
      const a = document.createElement('div');
      a.id = 'auroraLayer';
      // Six orbs on coprime loops — the field never visibly repeats.
      a.innerHTML = '<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>' +
                    '<div class="blob b4"></div><div class="blob b5"></div><div class="blob b6"></div>';
      // Insert AFTER the wallpaper so the aurora paints on top of it.
      // (It used to be inserted first, so the opaque wallpaper gradient
      //  covered the whole field — the tour enables both at once, which
      //  is why "Alive colours" looked like nothing was happening.)
      const w = document.getElementById('wallpaperLayer');
      if (w && w.nextSibling) app.insertBefore(a, w.nextSibling);
      else app.appendChild(a);
    }
    _layersReady = true;
  }

  function apply() {
    _ensureLayers();
    const app = document.getElementById('mainApp');
    if (!app) return;
    app.classList.remove('wall-1', 'wall-2', 'wall-3', 'wall-4');
    const w = typeof S !== 'undefined' && S.wallpaper;
    if (w && w !== 'none' && w >= 1 && w <= 4) app.classList.add('wall-' + w);
    const alive = typeof S !== 'undefined' && !!S.alive;
    document.body.classList.toggle('alive', alive);
  }

  return { apply };
})();

/* Fix for the broken dim overlay: .privacy-overlay had no CSS at all,
   so the toggle did nothing visible. Styled here (z-order: under lock
   screen and modals, over app content). */
