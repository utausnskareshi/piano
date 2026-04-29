// Main keyboard / play screen.
// Layout:
//   [Top bar: mode toggle, preset name, song title]
//   [Octave shifter: << center | < lower | > middle | >> upper]
//   [Keyboard: 1 octave (C..B) with sharps]
//   [Bottom controls: sustain, recording, volume slider, reverb slider]
//
// Modes:
//   - free: each key plays its MIDI note.
//   - learning: same as free, but the "next expected" note is highlighted.
//             When the player presses the correct key, the cursor advances.
//   - auto:  any key press plays the next note from the song instead of the pressed pitch.

import { engine } from '../audio/engine';
import { PRESETS } from '../audio/presets';
import { store } from '../state';
import { BUILT_IN_SONGS } from '../data/songs';
import { listUserSongs, addUserSong } from '../store/db';
import { toast } from './toast';
import { parseSong, NoteEvent } from '../data/parser';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_INDEXES = [0, 2, 4, 5, 7, 9, 11];
const BLACK_INDEXES = [1, 3, 6, 8, 10];

interface KeyEl { el: HTMLElement; midi: number; name: string; }

export async function renderKeyboardScreen(root: HTMLElement) {
  root.innerHTML = '';
  const main = document.createElement('main');
  main.className = 'play-screen';
  main.innerHTML = `
    <header class="play-header">
      <button class="icon-btn" id="back-btn" aria-label="ホームに戻る">≡</button>
      <div class="mode-tabs" role="tablist">
        <button data-mode="free" class="mode-tab" role="tab">自由</button>
        <button data-mode="learning" class="mode-tab" role="tab">学習</button>
        <button data-mode="auto" class="mode-tab" role="tab">自動</button>
      </div>
      <div class="now-playing" aria-live="polite">
        <div class="np-row"><span class="np-label">音色</span><span id="np-preset"></span></div>
        <div class="np-row"><span class="np-label">曲</span><span id="np-song">—</span></div>
      </div>
    </header>

    <section class="octave-bar">
      <button class="oct-btn" data-oct="-1">◀ 低</button>
      <button class="oct-btn" data-oct="0">中</button>
      <button class="oct-btn" data-oct="1">高 ▶</button>
      <span class="cursor-info" id="cursor-info"></span>
    </section>

    <section class="keyboard" id="keyboard" aria-label="鍵盤"></section>

    <section class="bottom-controls">
      <button class="ctl-btn" id="sustain-btn">Sustain</button>
      <button class="ctl-btn" id="rec-btn">● 録音</button>
      <button class="ctl-btn" id="all-off-btn">音停止</button>
      <label class="slider">
        <span>音量</span>
        <input type="range" id="vol" min="0" max="100" />
      </label>
      <label class="slider">
        <span>残響</span>
        <input type="range" id="rev" min="0" max="100" />
      </label>
    </section>

    <nav class="bottom-nav">
      <a href="#/instruments">音色を選ぶ</a>
      <a href="#/songs">曲を選ぶ</a>
      <a href="#/add-song">曲を追加</a>
      <a href="#/help">使い方</a>
    </nav>
  `;
  root.appendChild(main);

  const kbEl = main.querySelector<HTMLElement>('#keyboard')!;
  const npPreset = main.querySelector<HTMLElement>('#np-preset')!;
  const npSong = main.querySelector<HTMLElement>('#np-song')!;
  const cursorInfo = main.querySelector<HTMLElement>('#cursor-info')!;
  const volEl = main.querySelector<HTMLInputElement>('#vol')!;
  const revEl = main.querySelector<HTMLInputElement>('#rev')!;
  const sustainBtn = main.querySelector<HTMLButtonElement>('#sustain-btn')!;
  const recBtn = main.querySelector<HTMLButtonElement>('#rec-btn')!;
  const allOffBtn = main.querySelector<HTMLButtonElement>('#all-off-btn')!;
  const backBtn = main.querySelector<HTMLButtonElement>('#back-btn')!;

  // ----- Build one-octave keyboard -----
  let keyEls: KeyEl[] = [];
  function buildKeyboard() {
    kbEl.innerHTML = '';
    keyEls = [];
    const offset = store.get('octaveOffset');
    // Keyboard octaves match the song notation:
    //   offset -1 (low)    -> baseC 60 (C4) == parser "C-"
    //   offset  0 (middle) -> baseC 72 (C5) == parser "C"
    //   offset +1 (high)   -> baseC 84 (C6) == parser "C+"
    const baseC = 72 + offset * 12;
    // White keys
    const whiteRow = document.createElement('div');
    whiteRow.className = 'whites';
    for (let i = 0; i < 7; i++) {
      const semi = WHITE_INDEXES[i];
      const midi = baseC + semi;
      const w = document.createElement('div');
      w.className = 'key white';
      w.dataset.midi = String(midi);
      w.dataset.name = NOTE_NAMES[semi];
      const lbl = document.createElement('span');
      lbl.className = 'key-label';
      lbl.textContent = NOTE_NAMES[semi];
      w.appendChild(lbl);
      whiteRow.appendChild(w);
      keyEls.push({ el: w, midi, name: NOTE_NAMES[semi] });
    }
    kbEl.appendChild(whiteRow);
    // Black keys overlay
    const blackRow = document.createElement('div');
    blackRow.className = 'blacks';
    const positions = [0, 1, 3, 4, 5];
    for (let i = 0; i < BLACK_INDEXES.length; i++) {
      const semi = BLACK_INDEXES[i];
      const midi = baseC + semi;
      const b = document.createElement('div');
      b.className = 'key black';
      b.style.gridColumn = `${positions[i] + 1} / span 1`;
      b.dataset.midi = String(midi);
      b.dataset.name = NOTE_NAMES[semi];
      blackRow.appendChild(b);
      keyEls.push({ el: b, midi, name: NOTE_NAMES[semi] });
    }
    kbEl.appendChild(blackRow);
    attachKeyListeners();
    refreshHighlight();
    refreshOctaveButtons();
  }

  // ----- Touch / mouse handling -----
  const activePointers = new Map<number, number>(); // pointerId -> midi
  function attachKeyListeners() {
    kbEl.querySelectorAll<HTMLElement>('.key').forEach(k => {
      k.addEventListener('pointerdown', (e) => onKeyDown(e, k));
      k.addEventListener('pointerup', (e) => onKeyUp(e, k));
      k.addEventListener('pointercancel', (e) => onKeyUp(e, k));
      k.addEventListener('pointerleave', (e) => {
        if (activePointers.has(e.pointerId)) onKeyUp(e, k);
      });
      // Prevent the browser from synthesising mouse events from touch
      k.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    });
  }

  function onKeyDown(e: PointerEvent, el: HTMLElement) {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    const pressedMidi = parseInt(el.dataset.midi || '60', 10);
    const velocity = computeVelocity(e);
    const playMidi = resolvePlayMidi(pressedMidi);
    activePointers.set(e.pointerId, playMidi);
    engine.start().then(() => {
      engine.noteOn(playMidi, velocity);
    });
    el.classList.add('pressed');
    if (store.get('recording')) {
      store.get('recordedEvents').push({ midi: playMidi, t: performance.now() });
    }
    advanceCursorIfMatch(pressedMidi);
  }
  function onKeyUp(e: PointerEvent, el: HTMLElement) {
    const playMidi = activePointers.get(e.pointerId);
    if (playMidi != null) {
      engine.noteOff(playMidi);
      activePointers.delete(e.pointerId);
    }
    el.classList.remove('pressed');
  }

  function computeVelocity(e: PointerEvent): number {
    // Velocity from pointer pressure (Pencil/finger force) where supported, else fixed.
    const p = (e as any).pressure;
    if (typeof p === 'number' && p > 0 && p < 1) {
      return Math.max(40, Math.min(127, Math.round(50 + p * 80)));
    }
    return 100;
  }

  // ----- Mode-specific note routing -----
  let currentSong: NoteEvent[] = [];
  function loadSongFromState() {
    const id = store.get('selectedSongId');
    currentSong = [];
    if (!id) { npSong.textContent = '—'; return; }
    if (id.startsWith('user:')) {
      // Lazy-load user songs.
      listUserSongs().then(rows => {
        const numId = parseInt(id.slice(5), 10);
        const found = rows.find(r => r.id === numId);
        if (found) {
          currentSong = parseSong(found.notation).events;
          npSong.textContent = found.title;
        } else {
          npSong.textContent = '(曲が見つかりません)';
        }
        store.set('songCursor', 0);
        refreshHighlight();
      });
      return;
    }
    const built = BUILT_IN_SONGS.find(s => s.id === id);
    if (built) {
      currentSong = parseSong(built.notation).events;
      npSong.textContent = built.title;
    } else {
      npSong.textContent = '—';
    }
    store.set('songCursor', 0);
    refreshHighlight();
  }

  function resolvePlayMidi(pressedMidi: number): number {
    const mode = store.get('mode');
    if (mode !== 'auto') return pressedMidi;
    // In auto mode, advance through the song. Skip rests automatically.
    if (!currentSong.length) return pressedMidi;
    let cursor = store.get('songCursor');
    let attempts = 0;
    while (attempts < currentSong.length) {
      const ev = currentSong[cursor];
      cursor = (cursor + 1) % currentSong.length;
      if (ev.midi != null) {
        store.set('songCursor', cursor);
        refreshHighlight();
        return ev.midi;
      }
      attempts++;
    }
    return pressedMidi;
  }

  function advanceCursorIfMatch(pressedMidi: number) {
    const mode = store.get('mode');
    if (mode !== 'learning' || !currentSong.length) return;
    let cursor = store.get('songCursor');
    // Skip rests in learning mode (treat them as auto-advance).
    while (cursor < currentSong.length && currentSong[cursor].midi == null) cursor++;
    if (cursor >= currentSong.length) {
      store.set('songCursor', 0);
      refreshHighlight();
      return;
    }
    const expected = currentSong[cursor].midi!;
    if (pressedMidi === expected) {
      cursor = (cursor + 1) % currentSong.length;
      store.set('songCursor', cursor);
      refreshHighlight();
    }
  }

  // ----- Highlight expected note (learning) / next note hint (auto) -----
  function refreshHighlight() {
    keyEls.forEach(k => k.el.classList.remove('hint', 'next'));
    main.querySelectorAll<HTMLButtonElement>('.oct-btn').forEach(b => b.classList.remove('flash'));
    const mode = store.get('mode');

    // Empty-state messages so users always know what to do next.
    if (mode === 'learning' || mode === 'auto') {
      if (!currentSong.length) {
        cursorInfo.textContent = '⚠ 下の「曲を選ぶ」から曲を選んでください';
        return;
      }
    } else {
      if (!currentSong.length) { cursorInfo.textContent = ''; return; }
    }

    let cursor = store.get('songCursor');
    while (cursor < currentSong.length && currentSong[cursor].midi == null) cursor++;
    const target = currentSong[cursor % currentSong.length]?.midi;
    if (target == null) { cursorInfo.textContent = ''; return; }
    const offset = store.get('octaveOffset');
    const baseC = 72 + offset * 12;
    const onScreen = target >= baseC && target < baseC + 12;
    // MIDI 60..71 -> low (-1); 72..83 -> middle (0); 84..95 -> high (+1)
    const targetOffset = Math.floor((target - 72) / 12);
    cursorInfo.textContent = `次: ${labelOf(target)}  (${cursor + 1}/${currentSong.length})`;
    if (onScreen) {
      const k = keyEls.find(k => k.midi === target);
      if (mode === 'learning') k?.el.classList.add('hint');
      else if (mode === 'auto') k?.el.classList.add('next');
    } else if (mode === 'learning' || mode === 'auto') {
      // Tell the user which octave button to tap and flash that button.
      const dir = targetOffset === -1 ? '低' : targetOffset === 1 ? '高' : '中';
      cursorInfo.textContent += `  → 「${dir}」オクターブへ`;
      const btn = main.querySelector<HTMLButtonElement>(`.oct-btn[data-oct="${targetOffset}"]`);
      btn?.classList.add('flash');
    }
  }

  function labelOf(midi: number): string {
    const semi = ((midi % 12) + 12) % 12;
    // Match parser octave convention: C5 (MIDI 72) is "C" (middle).
    const octRel = Math.floor(midi / 12) - 6;
    const sfx = octRel < 0 ? '-' : octRel > 0 ? '+' : '';
    return NOTE_NAMES[semi] + sfx;
  }

  // ----- Octave shift -----
  function refreshOctaveButtons() {
    main.querySelectorAll<HTMLButtonElement>('.oct-btn').forEach(b => {
      const v = parseInt(b.dataset.oct || '0', 10);
      b.classList.toggle('active', v === store.get('octaveOffset'));
    });
  }

  main.querySelectorAll<HTMLButtonElement>('.oct-btn').forEach(b => {
    b.addEventListener('click', () => {
      const v = parseInt(b.dataset.oct || '0', 10);
      store.set('octaveOffset', v);
      buildKeyboard();
    });
  });

  // ----- Mode tabs -----
  function refreshModeTabs() {
    main.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === store.get('mode'));
    });
  }
  main.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach(b => {
    b.addEventListener('click', () => {
      const m = (b.dataset.mode || 'free') as 'free' | 'learning' | 'auto';
      store.set('mode', m);
      store.set('songCursor', 0);
      refreshModeTabs();
      refreshHighlight();
    });
  });

  // ----- Sustain pedal -----
  function refreshSustainBtn() {
    sustainBtn.classList.toggle('active', store.get('sustain'));
  }
  sustainBtn.addEventListener('click', () => {
    const next = !store.get('sustain');
    store.set('sustain', next);
    engine.setSustain(next);
    refreshSustainBtn();
  });

  // ----- Recording -----
  function refreshRecBtn() {
    recBtn.classList.toggle('active', store.get('recording'));
    recBtn.textContent = store.get('recording') ? '■ 停止' : '● 録音';
  }
  recBtn.addEventListener('click', async () => {
    if (!store.get('recording')) {
      store.set('recordedEvents', []);
      store.set('recording', true);
    } else {
      store.set('recording', false);
      const events = store.get('recordedEvents');
      if (events.length === 0) { refreshRecBtn(); return; }
      // Convert recorded events to song notation. Use rests for big gaps.
      const notation = eventsToNotation(events);
      const title = `録音 ${new Date().toLocaleString('ja-JP')}`;
      await addUserSong({ title, notation, source: 'recording' });
      toast(`録音を保存しました`, 'success');
    }
    refreshRecBtn();
  });

  function eventsToNotation(events: { midi: number; t: number }[]): string {
    if (!events.length) return '';
    const parts: string[] = [];
    let lastT = events[0].t;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const dt = e.t - lastT;
      if (i > 0 && dt > 600) parts.push('_');
      if (i > 0 && dt > 1200) parts.push('_');
      parts.push(midiToToken(e.midi));
      lastT = e.t;
    }
    return parts.join(' ');
  }
  function midiToToken(midi: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const semi = ((midi % 12) + 12) % 12;
    // Parser convention: MIDI 72 ("C5") is the middle octave token "C".
    const octRel = Math.floor(midi / 12) - 6;
    const sfx = octRel < 0 ? '-' : octRel > 0 ? '+' : '';
    return names[semi] + sfx;
  }

  allOffBtn.addEventListener('click', () => {
    engine.allOff();
    keyEls.forEach(k => k.el.classList.remove('pressed'));
  });

  backBtn.addEventListener('click', () => { location.hash = '#/help'; });

  // ----- Volume / reverb sliders -----
  volEl.value = String(Math.round(store.get('masterGain') * 100));
  revEl.value = String(Math.round(store.get('reverbMix') * 100));
  volEl.addEventListener('input', () => {
    const v = parseInt(volEl.value, 10) / 100;
    store.set('masterGain', v);
    engine.setMasterGain(v);
  });
  revEl.addEventListener('input', () => {
    const v = parseInt(revEl.value, 10) / 100;
    store.set('reverbMix', v);
    engine.setReverbMix(v);
  });

  // ----- Now-playing labels -----
  function refreshPresetLabel() {
    const p = PRESETS[store.get('presetId')];
    npPreset.textContent = p ? `${p.name} (${p.category})` : '—';
  }

  // ----- Keyboard (computer) bindings: Z S X D C V G B H N J M for one octave -----
  const KEY_TO_SEMI: Record<string, number> = {
    z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11
  };
  const downKeys = new Set<string>();
  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k in KEY_TO_SEMI && !downKeys.has(k)) {
      downKeys.add(k);
      const baseC = 72 + store.get('octaveOffset') * 12;
      const midi = baseC + KEY_TO_SEMI[k];
      engine.start().then(() => engine.noteOn(resolvePlayMidi(midi), 100));
      const el = keyEls.find(x => x.midi === midi)?.el;
      el?.classList.add('pressed');
      advanceCursorIfMatch(midi);
    }
    if (k === 'arrowleft') { store.set('octaveOffset', Math.max(-1, store.get('octaveOffset') - 1)); buildKeyboard(); }
    if (k === 'arrowright') { store.set('octaveOffset', Math.min(1, store.get('octaveOffset') + 1)); buildKeyboard(); }
  });
  document.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k in KEY_TO_SEMI) {
      downKeys.delete(k);
      const baseC = 72 + store.get('octaveOffset') * 12;
      const midi = baseC + KEY_TO_SEMI[k];
      engine.noteOff(midi);
      const el = keyEls.find(x => x.midi === midi)?.el;
      el?.classList.remove('pressed');
    }
  });

  // ----- Initial state -----
  store.applyCurrentPreset();
  refreshPresetLabel();
  refreshModeTabs();
  refreshSustainBtn();
  refreshRecBtn();
  buildKeyboard();
  loadSongFromState();
}
