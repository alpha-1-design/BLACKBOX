/* Appearance engine — theme, UI style, live wallpapers, living colours.
   Responsibility split: the user's CHOICE lives on <html> (data-theme,
   data-ui) so the palette can theme the root element itself, while the
   decorative layer classes stay on #mainApp. The old code put the theme class
   on <body>, which could never theme <html> — --bg resolved on body only, so
   the root kept painting the light palette. */
const Appearance = (() => {
  let _layersReady = false;
  let _schemeWired = false;

  const WALLPAPER_COUNT = 12;
  // Must match the --bg values in styles.css.
  const THEME_COLOR = { dark: '#0a0a0f', light: '#fafafa' };

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

  const _settings = () => (typeof S !== 'undefined' && S) || {};
  const _uiStyle = () => _settings().uiStyle || 'solid';

  /** The theme actually in force, after resolving 'auto' against the OS. */
  function resolvedTheme() {
    const t = _settings().theme || 'dark';
    if (t === 'auto') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return t === 'light' ? 'light' : 'dark';
  }

  function _applyTheme() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    // Browser chrome / status bar follows the REAL theme. The static
    // <meta media="(prefers-color-scheme:…)"> pair could only ever track the
    // OS, never the user's choice, so picking Light on a dark phone left a
    // black status bar.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
    // 'auto' must keep following the OS after load, not just at apply() time.
    if (!_schemeWired && window.matchMedia) {
      _schemeWired = true;
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onSchemeChange = () => { if ((_settings().theme || '') === 'auto') _applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onSchemeChange);
      else if (mq.addListener) mq.addListener(onSchemeChange);
    }
  }

  function _applyUiStyle() {
    const style = _uiStyle();
    // data-ui on <html> lets the root background follow the mode; the body
    // class drives the token swap the component rules key off.
    document.documentElement.dataset.ui = style;
    document.body.classList.remove('ui-glass', 'ui-neumo');
    if (style === 'glass') document.body.classList.add('ui-glass');
    if (style === 'neumo') document.body.classList.add('ui-neumo');
  }

  function _applyWallpaper() {
    const app = document.getElementById('mainApp');
    if (!app) return;
    // Remove EVERY previous wall class. The old code removed only wall-1..4,
    // so going from "Aurora" (5) back to "Midnight" (1) left both classes
    // applied and the later rule in the stylesheet won — the wrong wallpaper
    // stuck on screen no matter what you picked.
    for (let i = 1; i <= WALLPAPER_COUNT; i++) app.classList.remove('wall-' + i);
    const n = parseInt(_settings().wallpaper, 10);
    const hasWallpaper = n >= 1 && n <= WALLPAPER_COUNT;
    if (hasWallpaper) app.classList.add('wall-' + n);
    // Glass needs a colour field to refract. Supply one when no wallpaper is
    // chosen, so "Glass" is visibly glass even for a user who never picks a
    // backdrop (against a flat opaque background a blur is a no-op).
    app.classList.toggle('ambient-mesh', _uiStyle() === 'glass' && !hasWallpaper);
  }

  function apply() {
    _ensureLayers();
    _applyTheme();
    _applyUiStyle();
    _applyWallpaper();
    document.body.classList.toggle('alive', !!_settings().alive);
  }

  return { apply, resolvedTheme };
})();
