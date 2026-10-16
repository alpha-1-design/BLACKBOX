/* Voice notes — record, replay, transcribe. Recordings are stored through
   the encrypted file vault like everything else. Transcription uses an
   on-device Whisper model (transformers.js), downloaded on first use and
   cached by the browser; audio never leaves the device for processing.
   The first run downloads ~40 MB of model weights from a public CDN — that
   transfer (and the library bundle) is the app's only network egress, and
   Cancel tears it down through the service worker (transformers.js v2 has
   no AbortSignal of its own). */
const VoiceModule = (() => {
  let _mediaStream = null;
  let _recorder = null;
  let _chunks = [];
  let _asr = null; // cached whisper pipeline
  let _asrLoading = null; // promise guard
  let _loadedModel = null;
  let _playingId = null;
  let _audioUrl = null; // object URL currently backing the playback element

  /* Recorder state machine: idle -> recording <-> paused -> review -> saved.
     'review' is the step that was missing: the old recorder could only start
     and stop, so there was no way to hear a take, note what it was about, or
     abandon it — the only options were keep it, or save it and delete it. */
  let _recState = 'idle';
  let _elapsedMs = 0;   // committed time, from segments that have already ended
  let _segStartAt = 0;  // wall-clock start of the live segment; 0 = not billing
  let _tickTimer = null;
  let _analyser = null;
  let _levelRaf = 0;
  let _reviewBlob = null;
  let _reviewUrl = null;
  let _aborting = false;

  function init() {
    document.getElementById('voiceCard')?.addEventListener('click', open);
    document.getElementById('closeVoiceModal')?.addEventListener('click', close);
    document.getElementById('cancelVoiceBtn')?.addEventListener('click', close);
    document.querySelector('#voiceModal .modal-backdrop')?.addEventListener('click', close);
    document.getElementById('voiceRecordBtn')?.addEventListener('click', toggleRecord);
    document.getElementById('voicePauseBtn')?.addEventListener('click', togglePause);
    document.getElementById('voicePreviewBtn')?.addEventListener('click', togglePreview);
    document.getElementById('voiceSaveBtn')?.addEventListener('click', saveTake);
    document.getElementById('voiceDiscardBtn')?.addEventListener('click', discardTake);
    const audio = document.getElementById('voiceAudio');
    if (audio) {
      audio.addEventListener('ended', () => { _playingId = null; _updatePlayingUI(null); _resetPlayProgress(); _releaseAudioUrl(); });
      audio.addEventListener('timeupdate', () => {
        if (!_playingId) return;
        const item = document.querySelector(`#voiceList .voice-item[data-id="${_playingId}"]`);
        const fill = item?.querySelector('.voice-playbar-fill');
        const audioEl = document.getElementById('voiceAudio');
        if (fill && audioEl && audioEl.duration) {
          fill.style.width = (audioEl.currentTime / audioEl.duration * 100) + '%';
        }
        const status = document.getElementById('voiceRecStatus');
        if (status && audioEl && audioEl.duration) {
          const fmt = (n) => `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
          status.textContent = `Playing ${fmt(audioEl.currentTime)} / ${fmt(audioEl.duration)}`;
          status.classList.remove('recording');
        }
      });
      audio.addEventListener('pause', () => {
        // keep the paused (not ended) item marked only while it is active;
        // a natural 'ended' already cleared above.
      });
    }
  }

  function open() {
    document.getElementById('voiceModal').classList.remove('hidden');
    document.getElementById('voiceProgressPanel').classList.add('hidden');
    setTimeout(() => document.getElementById('voiceRecordBtn')?.focus(), 50);
    _resetRecorderUI();
    refresh();
    const search = document.getElementById('voiceSearch');
    if (search && !search._wired) {
      search._wired = true;
      search.addEventListener('input', () => refresh());
    }
  }

  async function close() {
    /* 'review' holds a finished take — the one thing here that cannot be
       recovered. Close and the backdrop used to tear it down through abort()
       with no warning, so a stray tap on the backdrop silently destroyed a
       recording you had just made. Locking does NOT come through here
       (app.js calls VoiceModule.abort() directly), so the unconditional
       teardown on lock is untouched. */
    if (_recState === 'review') {
      const ok = await uiConfirm('Discard recording?',
        'This recording has not been saved yet. Close without saving it?',
        { danger: true, okLabel: 'Discard' });
      if (!ok) return;
    }
    abort();
    const audio = document.getElementById('voiceAudio');
    if (audio) { audio.pause(); audio.removeAttribute('src'); }
    _releaseAudioUrl();
    _playingId = null;
    _updatePlayingUI(null);
    document.getElementById('voiceModal').classList.add('hidden');
    document.getElementById('voiceCard')?.focus();
  }

  async function playToggle(id) {
    const audio = document.getElementById('voiceAudio');
    if (!audio) return;
    if (_playingId === id && !audio.paused) {
      audio.pause();
      _playingId = null;
      _updatePlayingUI(null);
      const status = document.getElementById('voiceRecStatus');
      if (status) status.textContent = 'Paused';
      return;
    }
    if (_playingId && _playingId !== id) audio.pause();
    const blob = await Vault.getFileBlob(id);
    if (!blob) return;
    // Each play used to mint a fresh object URL for the decrypted audio and
    // never release the previous one, so replaying notes pinned another full
    // copy of the plaintext audio in memory for the life of the page.
    _releaseAudioUrl();
    _audioUrl = URL.createObjectURL(blob);
    audio.src = _audioUrl;
    _playingId = id;
    _updatePlayingUI(id);
    try { await audio.play(); } catch (_) { _playingId = null; _updatePlayingUI(null); _resetPlayProgress();
    const status = document.getElementById('voiceRecStatus'); if (status) status.textContent = 'Ready'; }
  }

  function _releaseAudioUrl() {
    if (_audioUrl) { URL.revokeObjectURL(_audioUrl); _audioUrl = null; }
  }

  function _resetPlayProgress() {
    document.querySelectorAll('#voiceList .voice-playbar-fill').forEach(el => { el.style.width = '0%'; });
  }

  function _updatePlayingUI(id) {
    _resetPlayProgress();
    if (!id) {
      const status = document.getElementById('voiceRecStatus');
      if (status && status.textContent.startsWith('Playing')) status.textContent = 'Ready';
    }
    document.querySelectorAll('#voiceList .voice-item').forEach(el => {
      const playing = el.dataset.id === id;
      el.classList.toggle('is-playing', playing);
      const btn = el.querySelector('.play-btn');
      if (btn) {
        btn.classList.toggle('is-playing', playing);
        btn.title = playing ? 'Pause' : 'Play';
        btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
        btn.innerHTML = (playing
          ? '<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>Pause</span>'
          : '<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><polygon points="6 4 20 12 6 20"/></svg><span>Play</span>');
      }
    });
  }

  async function refresh() {
    if (!Vault.isUnlocked()) return;
    const all = await Vault.getAllFiles();
    const list = document.getElementById('voiceList');
    if (!list) return;
    const query = (document.getElementById('voiceSearch')?.value || '').trim().toLowerCase();
    let voices = all.filter(f => (f.type || '').startsWith('audio/'));
    if (query) voices = voices.filter(f => f.name.toLowerCase().includes(query) || (f.transcript || '').toLowerCase().includes(query));
    if (voices.length === 0) {
      const emptyMsg = query
        ? '<p>No voice notes match your search.</p>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="34" height="34"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="19" x2="12" y2="22"/></svg><p>No voice notes yet.<br/>Tap <strong>Record</strong> to capture your first note.</p>';
      list.innerHTML = '<div class="empty-state">' + emptyMsg + '</div>';
      return;
    }
    list.innerHTML = voices.map(f => `
      <div class="voice-item" data-id="${f.id}">
        <div class="voice-playbar" aria-hidden="true"><div class="voice-playbar-fill"></div></div>
        <div class="file-info">
          <span class="file-name">${Vault.esc(f.name)}</span>
          <span class="file-meta">${typeof f.duration === 'number' ? `<span class="voice-dur">${_fmt(f.duration)}</span> · ` : ''}${Vault.formatSize(f.size)} · ${Vault.relTime(f.ts)}</span>
          ${f.note ? `<div class="voice-note">${Vault.esc(f.note)}</div>` : ''}
          ${f.transcript ? `<button type="button" class="voice-transcript-toggle" data-transcript="${f.id}">Show transcript</button><div class="voice-transcript hidden" data-transcript-body="${f.id}">${Vault.esc(f.transcript)}</div>` : ''}
        </div>
        <div class="secret-item-actions">
          <button class="secret-action-btn play-btn" data-id="${f.id}" title="Play">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><polygon points="6 4 20 12 6 20"/></svg>
            <span>Play</span>
          </button>
          <button class="secret-action-btn st-btn" data-id="${f.id}" title="${f.transcript ? 'Show transcript' : 'Transcribe'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="17" x2="12" y2="17"/></svg>
            <span>${f.transcript ? 'Transcript' : 'Transcribe'}</span>
          </button>
          ${f.transcript ? `<button class="secret-action-btn copy-voice" data-id="${f.id}" title="Copy transcript">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            <span>Copy</span>
          </button>` : ''}
          <button class="secret-action-btn delete del-voice" data-id="${f.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            <span>Delete</span>
          </button>
        </div>
      </div>`).join('');

    // Tapping the row or play button toggles playback of that note.
    list.querySelectorAll('.voice-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.secret-action-btn')) return;
        playToggle(el.dataset.id);
      });
    });
    list.querySelectorAll('.play-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      playToggle(b.dataset.id);
    }));
    list.querySelectorAll('.st-btn').forEach(b => b.addEventListener('click', () => transcribe(b.dataset.id)));
    // Transcripts start collapsed — a long transcript used to dominate the row.
    list.querySelectorAll('.voice-transcript-toggle').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const body = list.querySelector(`[data-transcript-body="${b.dataset.transcript}"]`);
      if (!body) return;
      const open = body.classList.toggle('hidden');
      b.textContent = open ? 'Show transcript' : 'Hide transcript';
    }));
    list.querySelectorAll('.copy-voice').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = b.closest('.voice-item');
      const text = item?.querySelector('.voice-transcript')?.textContent || '';
      // A transcript is the content of a private note, so it purges on the same
      // schedule as every other sensitive copy (this was a direct write that
      // left the words on the clipboard indefinitely).
      const res = await EncClipboard.copy(text);
      toast(EncClipboard.copyMessage(res), res.ok ? '' : 'red');
      // The clipboard API can be unavailable (insecure context) — fall back to
      // showing the text so it can still be copied by hand.
      if (!res.ok) await uiAlert('Clipboard', text || 'No transcript available.');
    }));
    list.querySelectorAll('.del-voice').forEach(b => b.addEventListener('click', async () => {
      if (await uiConfirm('Delete Voice Note', 'Delete this recording permanently?', { danger: true, okLabel: 'Delete' })) {
        if (_playingId === b.dataset.id) { _playingId = null; }
        const audio = document.getElementById('voiceAudio');
        if (audio) audio.pause();
        await Vault.deleteFile(b.dataset.id);
        await refresh();
      }
    }));
    _updatePlayingUI(_playingId);
  }

  /* ── Recorder ──────────────────────────────────────────────────────────
     Four states: idle -> recording <-> paused -> review. Pause/resume uses
     MediaRecorder's own pause(), the timer only accrues while recording (so a
     paused minute is not billed), and Stop always lands in review rather than
     saving straight away. */

  function _el(id) { return document.getElementById(id); }

  function _fmt(secs) {
    const s = Math.max(0, Math.round(secs || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // The filename extension must match what was actually recorded. The old code
  // hardcoded ".webm" even when MediaRecorder produced audio/mp4 (common on
  // Android WebView) — the vault then held a file whose name contradicted its
  // own MIME type.
  function _extForMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('mp4') || m.includes('aac')) return 'm4a';
    if (m.includes('ogg')) return 'ogg';
    if (m.includes('wav')) return 'wav';
    return 'webm';
  }

  function _setRecUI() {
    const btn = _el('voiceRecordBtn');
    const label = _el('voiceRecLabel');
    const pause = _el('voicePauseBtn');
    const time = _el('voiceRecTime');
    const meter = _el('voiceRecMeter');
    const actions = _el('voiceRecActions');
    const noteWrap = _el('voiceRecNoteWrap');
    const status = _el('voiceRecStatus');
    const live = _recState === 'recording' || _recState === 'paused';

    btn?.classList.toggle('is-recording', _recState === 'recording');
    btn?.classList.toggle('is-paused', _recState === 'paused');
    btn?.setAttribute('aria-pressed', String(live));
    if (btn) btn.disabled = false;
    if (label) label.textContent = live ? 'Stop' : 'Record';
    if (pause) pause.classList.toggle('hidden', !live);
    if (pause) {
      pause.textContent = _recState === 'paused' ? 'Resume' : 'Pause';
      pause.setAttribute('aria-label', _recState === 'paused' ? 'Resume recording' : 'Pause recording');
    }
    if (time) {
      time.textContent = _fmt(_liveElapsedMs() / 1000);
      time.classList.toggle('is-live', _recState === 'recording');
      time.classList.toggle('is-paused', _recState === 'paused');
    }
    meter?.classList.toggle('is-live', _recState === 'recording');
    // Review controls exist only once there is a take to review.
    actions?.classList.toggle('hidden', _recState !== 'review');
    noteWrap?.classList.toggle('hidden', _recState !== 'review');
    if (status) {
      status.textContent = _recState === 'recording' ? 'Recording'
        : _recState === 'paused' ? 'Paused'
        : _recState === 'review' ? 'Review, then save or discard'
        : 'Ready';
    }
  }

  function _resetRecorderUI() {
    _stopLevelMeter();
    if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
    _recState = 'idle';
    _elapsedMs = 0;
    _segStartAt = 0;
    if (_reviewUrl) { URL.revokeObjectURL(_reviewUrl); _reviewUrl = null; }
    _reviewBlob = null;
    const prev = _el('voicePreviewAudio');
    if (prev) { prev.pause(); prev.removeAttribute('src'); }
    const note = _el('voiceRecNote');
    if (note) note.value = '';
    _el('voiceRecMeter')?.querySelectorAll('span').forEach(b => { b.style.height = '10%'; });
    _setRecUI();
  }

  /* Wall-clock accounting, not tick counting. The timer used to do
     `_elapsedMs += 100` per interval and the saved duration was that same
     number, so it silently lost time whenever the WebView throttles timers —
     which it does aggressively once the screen is off or the app is
     backgrounded, i.e. exactly when someone records a long note. A ten-minute
     note could be saved minutes short, and the number on screen was wrong for
     the same reason. Segments are measured from Date.now() and still only
     accrue while recording, so a paused minute is not billed. */
  function _liveElapsedMs() {
    return _elapsedMs + (_segStartAt ? Date.now() - _segStartAt : 0);
  }

  function _commitSegment() {
    if (_segStartAt) { _elapsedMs += Date.now() - _segStartAt; _segStartAt = 0; }
  }

  function _startTicker() {
    if (_tickTimer) return;
    // Purely a repaint: the clock is derived, never accumulated here.
    _tickTimer = setInterval(() => {
      const time = _el('voiceRecTime');
      if (time) time.textContent = _fmt(_liveElapsedMs() / 1000);
    }, 100);
  }

  // Live input level from an AnalyserNode — visible proof the microphone is
  // capturing, which a static timer never gave.
  function _startLevelMeter(stream) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || !stream) return;
      const ctx = new Ctx();
      _analyser = ctx.createAnalyser();
      _analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(_analyser);
      const data = new Uint8Array(_analyser.frequencyBinCount);
      const bars = _el('voiceRecMeter')?.querySelectorAll('span') || [];
      const tick = () => {
        if (!_analyser) return;
        _analyser.getByteFrequencyData(data);
        const step = Math.max(1, Math.floor(data.length / Math.max(1, bars.length)));
        bars.forEach((bar, i) => {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
          const level = _recState === 'recording' ? Math.min(255, sum / step) / 255 : 0;
          bar.style.height = Math.max(10, level * 100).toFixed(0) + '%';
        });
        _levelRaf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* the meter is a nicety — recording still works without it */ }
  }

  function _stopLevelMeter() {
    if (_levelRaf) { cancelAnimationFrame(_levelRaf); _levelRaf = 0; }
    _analyser = null;
  }

  function togglePause() {
    if (!_recorder) return;
    try {
      if (_recState === 'recording' && _recorder.state === 'recording') {
        _recorder.pause();
        _commitSegment(); // freeze the portion actually recorded
        _recState = 'paused';
      } else if (_recState === 'paused' && _recorder.state === 'paused') {
        _recorder.resume();
        _segStartAt = Date.now(); // resume billing from here
        _recState = 'recording';
      }
    } catch {}
    _setRecUI();
  }

  // Pre-listen: audition the take without committing it to the vault.
  function togglePreview() {
    const audio = _el('voicePreviewAudio');
    if (!audio || !_reviewUrl) return;
    if (!audio.paused) { audio.pause(); return; }
    audio.play().catch(() => {});
  }

  async function saveTake() {
    if (!_reviewBlob) return;
    const note = (_el('voiceRecNote')?.value || '').trim();
    const duration = _liveElapsedMs() / 1000;
    const ext = _extForMime(_reviewBlob.type);
    const d = new Date();
    const name = `Voice note ${d.toLocaleDateString()} ${d.toLocaleTimeString()}.${ext}`;
    const saveBtn = _el('voiceSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Sealing…'; }
    try {
      await Vault.saveFile(new File([_reviewBlob], name, { type: _reviewBlob.type }), { duration, note });
      toast('Recording sealed in your vault');
      _resetRecorderUI();
      await refresh();
    } catch {
      await uiAlert('Voice notes', 'The recording could not be encrypted and saved.');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save note'; }
    }
  }

  function discardTake() {
    _resetRecorderUI();
    toast('Recording discarded');
  }

  /** Stop the microphone and any playback. Called on close and on lock, so a
   *  recording can never keep running behind the lock screen. */
  function abort() {
    _aborting = true;
    try { if (_recorder && _recorder.state !== 'inactive') _recorder.stop(); } catch {}
    _recorder = null;
    if (_mediaStream) { _mediaStream.getTracks().forEach(t => t.stop()); _mediaStream = null; }
    const prev = _el('voicePreviewAudio');
    if (prev) { prev.pause(); prev.removeAttribute('src'); }
    _playingId = null;
    _resetRecorderUI();
  }

  async function toggleRecord() {
    const btn = _el('voiceRecordBtn');
    if (_recState === 'recording' || _recState === 'paused') {
      try { _recorder?.stop(); } catch {}
      return;
    }
    /* 'review' already holds a finished take. Record was an unconditional tap
       away and starting a new one dropped the reviewed recording with no
       warning and no toast — the exact silent loss the review step exists to
       prevent. Discard is still one tap away for a dud take. */
    if (_recState === 'review') {
      const go = await uiConfirm('Discard recording?',
        'You have a recording waiting to be saved. Start a new one and discard it?',
        { danger: true, okLabel: 'Discard & record' });
      if (!go) return;
    }
    if (btn) btn.disabled = true;

    try {
      _mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const err = e && e.name ? e.name : String(e);
      if (err === 'NotAllowedError' || err === 'PermissionDeniedError') {
        await uiAlert('Microphone', 'Microphone access is required to record voice notes.', { danger: true });
      } else if (err === 'NotFoundError' || err === 'DevicesEmptyError') {
        await uiAlert('Microphone', 'No microphone was found on this device.');
      } else {
        await uiAlert('Microphone', 'Could not access the microphone: ' + err);
      }
      if (btn) btn.disabled = false;
      return;
    }

    _aborting = false;
    _chunks = [];
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
      .find(t => (typeof MediaRecorder.isTypeSupported === 'function' ? MediaRecorder.isTypeSupported(t) : false));
    _recorder = mime ? new MediaRecorder(_mediaStream, { mimeType: mime }) : new MediaRecorder(_mediaStream);
    _recorder.ondataavailable = e => { if (e.data && e.data.size) _chunks.push(e.data); };
    _recorder.onstop = () => {
      _stopLevelMeter();
      _commitSegment(); // the take's length is fixed the moment it stops
      if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
      if (_mediaStream) { _mediaStream.getTracks().forEach(t => t.stop()); _mediaStream = null; }
      if (_aborting) { // locked/closed mid-take — drop everything, keep nothing
        _aborting = false;
        _chunks = [];
        _recorder = null;
        return;
      }
      const type = (_recorder && _recorder.mimeType) || 'audio/webm';
      const blob = new Blob(_chunks, { type });
      _chunks = [];
      _recorder = null;
      if (!blob.size) { _resetRecorderUI(); return; }
      // Straight into review, never auto-saved: an accidental tap costs
      // nothing, and a good take can be heard before it is committed.
      if (_reviewUrl) URL.revokeObjectURL(_reviewUrl);
      _reviewBlob = blob;
      _reviewUrl = URL.createObjectURL(blob);
      const prev = _el('voicePreviewAudio');
      if (prev) prev.src = _reviewUrl;
      _recState = 'review';
      _setRecUI();
    };

    try {
      _recorder.start(250); // timeslice, so a long note is never one fragile chunk
    } catch {
      await uiAlert('Microphone', 'Recording could not be started on this device.');
      abort();
      return;
    }
    _recState = 'recording';
    _elapsedMs = 0;
    _segStartAt = Date.now();
    if (btn) btn.disabled = false;
    _startTicker();
    _startLevelMeter(_mediaStream);
    _setRecUI();
  }

  /* ── Transcription (on-device Whisper via transformers.js) ── */
  async function _getASR(opts) {
    const model = (typeof S !== 'undefined' && S.voiceModel) || 'Xenova/whisper-tiny.en';
    // The cached pipeline is only reusable if it IS the model being asked for.
    // This reload branch used to sit after an `if (_asr) return _asr` early
    // return, so it was unreachable: changing the voice model in settings
    // silently kept transcribing with whichever model was loaded first.
    if (_asr && _loadedModel === model) return _asr;
    if (_asr) { _asr = null; _loadedModel = null; _asrLoading = null; }
    if (!_asrLoading) {
      _asrLoading = (async () => {
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (opts && opts.signal && opts.signal.aborted) throw new DOMException('Cancelled.', 'AbortError');
          try {
            const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
            mod.env.allowLocalModels = false;
            const pipelineOpts = {};
            if (opts && opts.onProgress) pipelineOpts.progress_callback = opts.onProgress;
            _asr = await mod.pipeline('automatic-speech-recognition', model, pipelineOpts);
            _loadedModel = model;
            return _asr;
          } catch (e) {
            lastErr = e;
            if (opts && opts.signal && opts.signal.aborted) throw e;
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
        _asrLoading = null;
        throw lastErr;
      })();
      _asrLoading.catch(() => { _asrLoading = null; });
    }
    return _asrLoading;
  }

  async function transcribe(id) {
    if (_recorder && _recorder.state === 'recording') return;

    const statusEl = document.getElementById('voiceRecStatus');
    const progressPanel = document.getElementById('voiceProgressPanel');
    const ringEl = document.getElementById('voiceModelRing');
    const titleEl = document.getElementById('voiceModelTitle');
    const cancelBtn = document.getElementById('voiceModelCancel');
    const stBtn = document.querySelector(`.st-btn[data-id="${id}"]`);

    const controller = new AbortController();

    const setBusy = (busy) => {
      if (!stBtn) return;
      stBtn.disabled = busy;
      stBtn.classList.toggle('is-busy', busy);
      stBtn.title = busy ? 'Transcribing…' : (stBtn.title === 'Transcribing…' ? 'Transcribe' : stBtn.title);
    };
    setBusy(true);
    // Cancel stops the UI immediately, tells the service worker to tear down
    // any in-flight library/model download, and discards every result from
    // here on. (WASM inference already running can't be interrupted, but its
    // output is dropped by the stopIfAborted() checks below.)
    const onCancel = () => {
      controller.abort();
      _swPost('bb-cancel-external');
      if (statusEl) statusEl.textContent = '';
      _hideProgress();
      setBusy(false);
      toast('Cancelled');
    };
    const stopIfAborted = () => {
      if (controller.signal.aborted) throw new DOMException('Cancelled.', 'AbortError');
    };

    try {
      _swPost('bb-reset-external'); // a previous Cancel must not kill this run
      const model = (typeof S !== 'undefined' && S.voiceModel) || 'Xenova/whisper-tiny.en';
      _setProgress(0, 'Preparing ' + model + ' · on-device');
      progressPanel.classList.remove('hidden');
      statusEl.textContent = 'Preparing…';
      titleEl.textContent = 'Downloading ' + model;
      cancelBtn.textContent = 'Cancel';
      cancelBtn.disabled = false;
      cancelBtn.addEventListener('click', onCancel);

      const fileProgress = new Map();
      const asr = await _getASR({
        signal: controller.signal,
        onProgress: p => {
          // Transformers reports per-file progress; aggregate files for a smoother,
          // more accurate bar than trusting whichever event arrived last.
          if (p && typeof p === 'object') {
            if (typeof p.file === 'string' && typeof p.progress === 'number') {
              const frac = p.progress > 1 ? p.progress / 100 : p.progress;
              fileProgress.set(p.file, Math.min(1, Math.max(0, frac)));
            }
          }
          let frac = null;
          if (fileProgress.size) {
            let sum = 0;
            for (const v of fileProgress.values()) sum += v;
            frac = sum / fileProgress.size;
          } else if (p && typeof p === 'object' && typeof p.progress === 'number') {
            frac = p.progress > 1 ? p.progress / 100 : p.progress;
          } else if (typeof p === 'number') {
            frac = p > 1 ? p / 100 : p;
          }
          if (frac === null) return;
          _setProgress(0.08 + frac * 0.8, model + ' · on-device · Xenova/Hugging Face');
        },
      });
      stopIfAborted();

      _setProgress(1, 'Transcribing audio…');
      titleEl.textContent = 'Transcribing with ' + model;
      statusEl.textContent = 'Transcribing…';
      ringEl.classList.remove('ring-active');
      await _nextFrame();
      stopIfAborted();

      const blob = await Vault.getFileBlob(id);
      const audio = await _blobToFloat32(blob);
      stopIfAborted();
      const out = await asr(audio);
      stopIfAborted(); // a cancelled run's result is discarded, never saved
      const text = (out && out.text ? out.text : '').trim();
      statusEl.textContent = '';
      _hideProgress();
      if (text) {
        setBusy(false);
        await Vault.setFileTranscript(id, text);
        progressPanel.classList.add('hidden');
        await refresh();
        toast('Transcript saved to your vault');
      } else {
        await uiAlert('Transcribe', 'No speech detected in this recording.');
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '';
      _hideProgress();
      setBusy(false);
      if (controller.signal.aborted) {
        // Cancel: onCancel already stopped the UI and the service worker has
        // torn down the download — nothing else to report.
      } else {
        await uiAlert('Transcribe', 'Could not run the speech model. Check your connection and try again.');
      }
    } finally {
      cancelBtn.removeEventListener('click', onCancel);
      setBusy(false);
    }
  }

  // Ask the service worker to reset/cancel external (CDN) transfers.
  function _swPost(msg) {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(msg);
      }
    } catch (_) { /* no controller yet — cancel still stops our own steps */ }
  }

  function _nextFrame() {
    return new Promise(r => requestAnimationFrame(() => r()));
  }

  function _blobToFloat32(blob) {
    return new Promise((resolve, reject) => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const reader = new FileReader();
      reader.onload = () => {
        ctx.decodeAudioData(reader.result).then(buf => {
          resolve(buf.getChannelData(0));
        }).catch(err => {
          reject(err);
        }).finally(() => {
          ctx.close();
        });
      };
      reader.onerror = () => {
        ctx.close();
        reject(reader.error);
      };
      reader.readAsArrayBuffer(blob);
    });
  }

  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'red' ? ' red' : ' green');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  function _hideProgress() {
    const p = document.getElementById('voiceProgressPanel');
    if (p) p.classList.add('hidden');
  }

  function _setProgress(pct, sub) {
    const el = document.getElementById('voiceProgressPanel');
    if (!el) return;
    const pctEl = document.getElementById('voiceModelPct');
    const barEl = document.getElementById('voiceModelBar');
    const ringEl = document.getElementById('voiceModelRing');
    const subEl = document.getElementById('voiceModelSub');
    const clamped = Math.min(1, Math.max(0, pct));
    if (pctEl) pctEl.textContent = Math.round(clamped * 100) + '%';
    if (barEl) barEl.style.transform = 'scaleX(' + clamped + ')';
    if (ringEl) ringEl.classList.add('ring-active');
    if (subEl) subEl.textContent = sub || '';
  }

  // Markup contract for CI: index.html must contain voiceProgressPanel,
  // voiceModelTitle, voiceModelCancel, voiceModelRing, voiceModelBar,
  // voiceModelPct, voiceModelSub (the progress panel rendered above the
  // voice list when a model download starts).
  return { init, refresh, transcribe, abort };
})();
