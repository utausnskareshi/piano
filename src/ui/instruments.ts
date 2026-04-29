// Instrument (preset) selection screen.
// 100 presets grouped by category. Tap to preview a short phrase, double-tap or press the
// "Choose" button to set the current preset and return to the keyboard.

import { engine } from '../audio/engine';
import { PRESETS, presetParams, CATEGORIES } from '../audio/presets';
import { store } from '../state';

const PREVIEW_NOTES = [60, 64, 67, 72]; // C, E, G, C+

export function renderInstrumentsScreen(root: HTMLElement) {
  root.innerHTML = '';
  const main = document.createElement('main');
  main.className = 'list-screen';
  main.innerHTML = `
    <header class="list-header">
      <button class="icon-btn" id="back-btn" aria-label="戻る">←</button>
      <h2>音色を選ぶ</h2>
      <span class="list-count">${PRESETS.length} 音色</span>
    </header>
    <nav class="cat-tabs" id="cat-tabs"></nav>
    <ul class="preset-list" id="preset-list"></ul>
    <footer class="list-footer">
      <button class="btn-primary" id="apply-btn">この音色で演奏する</button>
    </footer>
  `;
  root.appendChild(main);

  const catTabs = main.querySelector<HTMLElement>('#cat-tabs')!;
  const list = main.querySelector<HTMLElement>('#preset-list')!;
  const applyBtn = main.querySelector<HTMLButtonElement>('#apply-btn')!;
  const backBtn = main.querySelector<HTMLButtonElement>('#back-btn')!;

  let activeCategory: string = PRESETS[store.get('presetId')]?.category ?? CATEGORIES[0];
  let chosenId = store.get('presetId');

  function renderTabs() {
    catTabs.innerHTML = '';
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.className = 'cat-tab' + (c === activeCategory ? ' active' : '');
      b.textContent = c;
      b.addEventListener('click', () => { activeCategory = c; renderTabs(); renderList(); });
      catTabs.appendChild(b);
    }
  }

  function renderList() {
    list.innerHTML = '';
    for (const p of PRESETS) {
      if (p.category !== activeCategory) continue;
      const li = document.createElement('li');
      li.className = 'preset-item' + (p.id === chosenId ? ' selected' : '');
      li.dataset.id = String(p.id);
      li.innerHTML = `
        <span class="preset-name">${p.id + 1}. ${p.name}</span>
        <span class="preset-actions">
          <button class="btn-mini preview" data-id="${p.id}">▶ 試聴</button>
          <button class="btn-mini choose" data-id="${p.id}">選択</button>
        </span>
      `;
      list.appendChild(li);
    }
    list.querySelectorAll<HTMLButtonElement>('.preview').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        const id = parseInt(b.dataset.id || '0', 10);
        previewPreset(id);
      });
    });
    list.querySelectorAll<HTMLButtonElement>('.choose').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        const id = parseInt(b.dataset.id || '0', 10);
        chosenId = id;
        renderList();
      });
    });
    list.querySelectorAll<HTMLLIElement>('.preset-item').forEach(li => {
      li.addEventListener('click', () => {
        const id = parseInt(li.dataset.id || '0', 10);
        chosenId = id;
        renderList();
      });
    });
  }

  async function previewPreset(id: number) {
    await engine.start();
    engine.setPreset(presetParams(id));
    engine.allOff();
    const startTime = performance.now();
    let i = 0;
    const next = () => {
      if (i > 0) engine.noteOff(PREVIEW_NOTES[i - 1]);
      if (i >= PREVIEW_NOTES.length) {
        // Restore the *current* preset after preview unless this id was just chosen.
        if (chosenId !== id) engine.setPreset(presetParams(chosenId));
        return;
      }
      engine.noteOn(PREVIEW_NOTES[i], 100);
      i++;
      setTimeout(next, 360);
    };
    next();
    void startTime;
  }

  applyBtn.addEventListener('click', () => {
    store.set('presetId', chosenId);
    store.applyCurrentPreset();
    location.hash = '#/play';
  });
  backBtn.addEventListener('click', () => { history.length > 1 ? history.back() : (location.hash = '#/play'); });

  renderTabs();
  renderList();
}
