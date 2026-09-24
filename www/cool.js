/* "Wanna see something cool?" — onboarding tour for the appearance suite. */
const CoolTour = (() => {
  const FEATURES = [
    {
      id: 'alive',
      title: 'Alive colours',
      body: 'Liquid colour drifts slowly behind your vault. Never static again.',
      icon: '<circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>',
    },
    {
      id: 'wallpaper',
      title: 'Wallpapers',
      body: 'Four hand-built gradients for your notes pad. Swipe through them live.',
      icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    },
    {
      id: 'voice',
      title: 'Voice notes',
      body: 'Record, replay, and transcribe your voice — encrypted like everything else.',
      icon: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v1a7 7 0 0014 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/>',
    },
    {
      id: 'send',
      title: 'Encrypted packages',
      body: 'Wrap a photo + message with a shared PIN. They open it in BLACKBOX — it decrypts.',
      icon: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    },
  ];

  let _step = 0;

  function open() {
    _step = 0;
    _renderWelcome();
    document.getElementById('coolModal').classList.remove('hidden');
  }

  function _close() {
    document.getElementById('coolModal').classList.add('hidden');
  }

  function _renderWelcome() {
    const box = document.getElementById('coolBody');
    box.innerHTML = `
      <div class="cool-hero">
        <div class="cool-orb"></div>
        <h1 class="cool-title">Wanna see<br/>something cool?</h1>
        <p class="cool-sub">A 30-second tour of what your vault just became.</p>
        <button class="cool-cta" id="coolStart">Show me</button>
      </div>`;
    document.getElementById('coolStart')?.addEventListener('click', () => { _step = 0; _renderStep(); });
  }

  function _renderStep() {
    const f = FEATURES[_step];
    const box = document.getElementById('coolBody');
    const last = _step === FEATURES.length - 1;

    // Live demo: first two steps toggle the real thing
    if (f.id === 'alive') { S.alive = true; _saveSett(); Appearance.apply(); }
    if (f.id === 'wallpaper') { S.wallpaper = '3'; _saveSett(); Appearance.apply(); }

    box.innerHTML = `
      <div class="cool-hero">
        <div class="cool-orb ${f.id}-orb"></div>
        <h1 class="cool-title">${f.title}</h1>
        <p class="cool-sub">${f.body}</p>
        ${f.id === 'wallpaper' ? `
        <div class="cool-walls">
          <button class="cool-wall w1" data-w="1"></button>
          <button class="cool-wall w2" data-w="2"></button>
          <button class="cool-wall w3" data-w="3"></button>
          <button class="cool-wall w4" data-w="4"></button>
          <button class="cool-wall w0" data-w="none">✕</button>
        </div>` : ''}
        <div class="cool-nav">
          ${_step > 0 ? '<button class="cool-back" id="coolPrev">Back</button>' : '<span></span>'}
          <button class="cool-cta" id="coolNext">${last ? 'Turn it all on' : 'Next'}</button>
        </div>
        <div class="cool-dots">${FEATURES.map((_, i) => `<span class="${i === _step ? 'on' : ''}"></span>`).join('')}</div>
      </div>`;

    document.getElementById('coolPrev')?.addEventListener('click', () => { _step--; _renderStep(); });
    document.getElementById('coolNext')?.addEventListener('click', async () => {
      if (last) {
        S.alive = true; S.wallpaper = S.wallpaper || '3'; _saveSett(); Appearance.apply();
        await uiAlert('Welcome to a new world', 'Your vault is alive. Everything you just saw can be tuned in Settings → Appearance.');
        _close();
        return;
      }
      _step++; _renderStep();
    });
    box.querySelectorAll('.cool-wall').forEach(b => b.addEventListener('click', () => {
      S.wallpaper = b.dataset.w; _saveSett(); Appearance.apply();
    }));
  }

  return { open };
})();
