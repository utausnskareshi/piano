// Song selection screen. Lists 50 built-in songs + any user-added/recorded songs.
// Selecting a song sets state.selectedSongId and returns to the play screen.

import { BUILT_IN_SONGS, BuiltInSong } from '../data/songs';
import { listUserSongs, deleteUserSong, UserSong } from '../store/db';
import { store } from '../state';
import { parseSong } from '../data/parser';

export async function renderSongsScreen(root: HTMLElement) {
  root.innerHTML = '';
  const main = document.createElement('main');
  main.className = 'list-screen';
  main.innerHTML = `
    <header class="list-header">
      <button class="icon-btn" id="back-btn" aria-label="戻る">←</button>
      <h2>曲を選ぶ</h2>
      <a href="#/add-song" class="btn-mini">＋追加</a>
    </header>
    <nav class="cat-tabs">
      <button class="cat-tab active" data-cat="all">すべて</button>
      <button class="cat-tab" data-cat="童謡・伝承">童謡・伝承</button>
      <button class="cat-tab" data-cat="クラシック">クラシック</button>
      <button class="cat-tab" data-cat="クリスマス・賛美歌">クリスマス・賛美歌</button>
      <button class="cat-tab" data-cat="user">マイ曲</button>
    </nav>
    <ul class="song-list" id="song-list"></ul>
    <footer class="list-footer">
      <button class="btn-secondary" id="clear-btn">選択解除</button>
    </footer>
  `;
  root.appendChild(main);

  const list = main.querySelector<HTMLElement>('#song-list')!;
  const backBtn = main.querySelector<HTMLButtonElement>('#back-btn')!;
  const clearBtn = main.querySelector<HTMLButtonElement>('#clear-btn')!;
  let activeCat: string = 'all';
  let userSongs: UserSong[] = [];

  async function refreshUserSongs() {
    userSongs = await listUserSongs();
  }

  function renderList() {
    list.innerHTML = '';
    const selectedId = store.get('selectedSongId');
    if (activeCat === 'user') {
      if (!userSongs.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = '（追加された曲はありません。「＋追加」または自由演奏で録音してください）';
        list.appendChild(li);
      }
      for (const s of userSongs) {
        const id = `user:${s.id}`;
        const noteCount = parseSong(s.notation).events.length;
        const li = document.createElement('li');
        li.className = 'song-item' + (selectedId === id ? ' selected' : '');
        li.dataset.id = id;
        li.innerHTML = `
          <div class="song-info">
            <div class="song-title">${escapeHtml(s.title)}</div>
            <div class="song-meta">${noteCount} 音 · ユーザー追加</div>
          </div>
          <div class="song-actions">
            <button class="btn-mini choose">選ぶ</button>
            <button class="btn-mini danger" data-id="${s.id}">削除</button>
          </div>
        `;
        list.appendChild(li);
      }
    } else {
      const filtered: BuiltInSong[] = BUILT_IN_SONGS
        .filter(s => activeCat === 'all' || s.category === activeCat);
      for (const s of filtered) {
        const noteCount = parseSong(s.notation).events.length;
        const li = document.createElement('li');
        li.className = 'song-item' + (selectedId === s.id ? ' selected' : '');
        li.dataset.id = s.id;
        const composer = s.composer ? ` · ${s.composer}` : '';
        li.innerHTML = `
          <div class="song-info">
            <div class="song-title">${escapeHtml(s.title)}</div>
            <div class="song-meta">${s.category}${composer} · ${noteCount} 音</div>
          </div>
          <div class="song-actions">
            <button class="btn-mini choose">選ぶ</button>
          </div>
        `;
        list.appendChild(li);
      }
    }
    list.querySelectorAll<HTMLButtonElement>('.choose').forEach(b => {
      b.addEventListener('click', e => {
        const li = (e.target as HTMLElement).closest('li.song-item') as HTMLLIElement;
        const id = li.dataset.id!;
        store.set('selectedSongId', id);
        store.set('songCursor', 0);
        // Always start from the middle octave when a song is chosen.
        store.set('octaveOffset', 0);
        location.hash = '#/play';
      });
    });
    list.querySelectorAll<HTMLButtonElement>('.danger').forEach(b => {
      b.addEventListener('click', async e => {
        e.stopPropagation();
        const id = parseInt(b.dataset.id || '0', 10);
        const li = b.closest<HTMLLIElement>('li.song-item');
        // Two-tap delete: first tap arms, second confirms. Avoids window.confirm()
        // which suspends the iOS AudioContext.
        if (b.classList.contains('armed')) {
          await deleteUserSong(id);
          if (store.get('selectedSongId') === `user:${id}`) {
            store.set('selectedSongId', null);
          }
          await refreshUserSongs();
          renderList();
        } else {
          b.classList.add('armed');
          b.textContent = 'もう一度押す';
          li?.classList.add('arming');
          setTimeout(() => {
            b.classList.remove('armed');
            b.textContent = '削除';
            li?.classList.remove('arming');
          }, 3000);
        }
      });
    });
  }

  main.querySelectorAll<HTMLButtonElement>('.cat-tab').forEach(b => {
    b.addEventListener('click', () => {
      activeCat = b.dataset.cat || 'all';
      main.querySelectorAll<HTMLButtonElement>('.cat-tab').forEach(x => x.classList.toggle('active', x === b));
      renderList();
    });
  });

  clearBtn.addEventListener('click', () => {
    store.set('selectedSongId', null);
    store.set('songCursor', 0);
    renderList();
  });

  backBtn.addEventListener('click', () => { history.length > 1 ? history.back() : (location.hash = '#/play'); });

  await refreshUserSongs();
  renderList();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
