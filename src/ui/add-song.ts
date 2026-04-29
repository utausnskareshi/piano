// Add-song screen.
// Lets the user paste a notation string, name it, validate, preview-play, and save.

import { addUserSong } from '../store/db';
import { parseSong, NoteEvent } from '../data/parser';
import { engine } from '../audio/engine';
import { toast } from './toast';

export function renderAddSongScreen(root: HTMLElement) {
  root.innerHTML = '';
  const main = document.createElement('main');
  main.className = 'list-screen add-song';
  main.innerHTML = `
    <header class="list-header">
      <button class="icon-btn" id="back-btn" aria-label="戻る">←</button>
      <h2>曲を追加</h2>
    </header>
    <section class="form-block">
      <label class="form-label">タイトル</label>
      <input type="text" id="title" maxlength="60" placeholder="例: ハッピーバースデー（自分用）" />

      <label class="form-label">楽譜（テキスト）</label>
      <textarea id="notation" rows="6" placeholder="例) C C D C F E_ C C D C G F"></textarea>

      <details class="hint-box" open>
        <summary>記法のヘルプ</summary>
        <ul>
          <li>音名: <code>C D E F G A B</code>（大文字小文字どちらでも可）</li>
          <li>半音(シャープ): 音名の後ろに <code>#</code> を付ける（例: <code>F#</code>）</li>
          <li>オクターブ: 低 = <code>-</code>、中 = なし、高 = <code>+</code>（例: <code>C-</code>, <code>C</code>, <code>C+</code>）</li>
          <li>休符: <code>_</code>　（長く伸ばす音や休符は <code>~</code> を付けて2倍長）</li>
          <li>区切り: スペース・カンマ・改行・<code>|</code>（小節線）はすべて区切りとして扱われます</li>
          <li>例: <code>C-D-E-F-G-A-B-CDEFGABC+D+E+F+G+A+B+</code> ＝ 3オクターブの上昇音階</li>
        </ul>
      </details>

      <div class="parse-status" id="parse-status"></div>

      <div class="form-actions">
        <button class="btn-secondary" id="preview-btn">▶ プレビュー</button>
        <button class="btn-secondary" id="stop-btn">■ 停止</button>
        <button class="btn-primary" id="save-btn">保存</button>
      </div>
    </section>
  `;
  root.appendChild(main);

  const titleEl = main.querySelector<HTMLInputElement>('#title')!;
  const notEl = main.querySelector<HTMLTextAreaElement>('#notation')!;
  const status = main.querySelector<HTMLElement>('#parse-status')!;
  const previewBtn = main.querySelector<HTMLButtonElement>('#preview-btn')!;
  const stopBtn = main.querySelector<HTMLButtonElement>('#stop-btn')!;
  const saveBtn = main.querySelector<HTMLButtonElement>('#save-btn')!;
  const backBtn = main.querySelector<HTMLButtonElement>('#back-btn')!;

  let parsed: { events: NoteEvent[]; errors: string[] } = { events: [], errors: [] };
  let previewTimer: any = null;
  let previewMidi: number | null = null;

  function reparse() {
    parsed = parseSong(notEl.value);
    const errs = parsed.errors.length ? `<span class="warn">⚠ ${parsed.errors.length} 件の警告</span>` : '';
    status.innerHTML = `${parsed.events.length} 音 ${errs}`;
  }
  notEl.addEventListener('input', reparse);

  function stopPreview() {
    clearTimeout(previewTimer);
    if (previewMidi != null) { engine.noteOff(previewMidi); previewMidi = null; }
    engine.allOff();
  }

  previewBtn.addEventListener('click', async () => {
    stopPreview();
    reparse();
    if (!parsed.events.length) { toast('再生できる音がありません', 'error'); return; }
    await engine.start();
    let i = 0;
    const stepMs = 320;
    const playNext = () => {
      if (i >= parsed.events.length) { stopPreview(); return; }
      const ev = parsed.events[i++];
      if (ev.midi == null) {
        previewMidi = null;
      } else {
        engine.noteOn(ev.midi, 100);
        previewMidi = ev.midi;
      }
      previewTimer = setTimeout(() => {
        if (previewMidi != null) engine.noteOff(previewMidi);
        previewMidi = null;
        playNext();
      }, stepMs * (ev.weight || 1));
    };
    playNext();
  });

  stopBtn.addEventListener('click', stopPreview);

  saveBtn.addEventListener('click', async () => {
    stopPreview();
    reparse();
    const title = titleEl.value.trim();
    if (!title) { toast('タイトルを入力してください', 'error'); return; }
    if (!parsed.events.length) { toast('演奏できる音がありません', 'error'); return; }
    try {
      await addUserSong({ title, notation: notEl.value, source: 'user' });
      toast('保存しました', 'success');
      location.hash = '#/songs';
    } catch (e) {
      toast('保存に失敗しました: ' + (e as Error).message, 'error', 4000);
    }
  });

  backBtn.addEventListener('click', () => {
    stopPreview();
    history.length > 1 ? history.back() : (location.hash = '#/songs');
  });
}
