const PrivacyOverlay = (() => {
  let enabled=false, active=false, timer=null;
  const el = document.getElementById('privacyOverlay');
  const DELAY = 4000;
  function enable() { enabled=true; el.classList.remove('hidden'); _reset(); _bind(); _sync(); }
  function disable() { enabled=false; _clear(); _unbind(); active=false; el.classList.remove('active'); el.classList.add('hidden'); _sync(); }
  function toggle() { enabled ? disable() : enable(); return enabled; }
  function isEnabled() { return enabled; }
  function _activate() { if(active) return; active=true; el.classList.add('active'); }
  function _deactivate() { active=false; el.classList.remove('active'); }
  function _reset() { _clear(); if(enabled) timer=setTimeout(_activate, DELAY); }
  function _clear() { if(timer){clearTimeout(timer);timer=null;} }
  function _onAct() { if(!enabled) return; _deactivate(); _reset(); }
  const EVS=['touchstart','click','keydown','mousemove'];
  function _bind() { EVS.forEach(e=>document.addEventListener(e,_onAct,{passive:true})); document.addEventListener('visibilitychange',_onVis); }
  function _unbind() { EVS.forEach(e=>document.removeEventListener(e,_onAct)); document.removeEventListener('visibilitychange',_onVis); }
  function _onVis() { document.hidden&&enabled ? _activate() : _onAct(); }
  function _sync() {
    const dot=document.getElementById('blurDot'), txt=document.getElementById('blurTxt');
    if(dot) dot.className='status-dot '+(enabled?'on':'off');
    if(txt) txt.textContent=enabled?'on':'off';
  }
  return {enable,disable,toggle,isEnabled};
})();
