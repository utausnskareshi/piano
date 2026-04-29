// IndexedDB wrapper for user-added songs, recordings, and settings.
// Schema:
//   - songs:    { id (auto), title, notation, createdAt }
//   - settings: keyed kv (id = string)

const DB_NAME = 'piano-pwa';
const DB_VERSION = 1;

export interface UserSong {
  id?: number;
  title: string;
  notation: string;
  createdAt: number;
  /** "user"=user added; "recording"=recorded in free mode */
  source?: 'user' | 'recording';
}

export interface Settings {
  presetId: number;
  masterGain: number;
  reverbMix: number;
  octaveOffset: number; // 0 = middle, -1 = lower, +1 = upper
  mode: 'free' | 'learning' | 'auto';
  selectedSongId: string | null;
  bpm: number;
}

export const DEFAULT_SETTINGS: Settings = {
  presetId: 0,
  masterGain: 0.85,
  reverbMix: 0.18,
  octaveOffset: 0,
  mode: 'free',
  selectedSongId: null,
  bpm: 100
};

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result: T;
    Promise.resolve(op(s))
      .then(r => { result = r; })
      .catch(reject);
    t.oncomplete = () => resolve(result!);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function listUserSongs(): Promise<UserSong[]> {
  return tx('songs', 'readonly', s => new Promise<UserSong[]>((resolve, reject) => {
    const req = s.getAll();
    req.onsuccess = () => resolve((req.result as UserSong[]).sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  }));
}

export async function addUserSong(song: Omit<UserSong, 'id' | 'createdAt'> & { createdAt?: number }): Promise<number> {
  const record: UserSong = { ...song, createdAt: song.createdAt ?? Date.now() };
  return tx('songs', 'readwrite', s => new Promise<number>((resolve, reject) => {
    const req = s.add(record);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  }));
}

export async function deleteUserSong(id: number): Promise<void> {
  return tx('songs', 'readwrite', s => new Promise<void>((resolve, reject) => {
    const req = s.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

export async function getSettings(): Promise<Settings> {
  const got = await tx('settings', 'readonly', s => new Promise<Settings | null>((resolve, reject) => {
    const req = s.get('main');
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  }));
  return { ...DEFAULT_SETTINGS, ...(got || {}) };
}

export async function saveSettings(s: Settings): Promise<void> {
  return tx('settings', 'readwrite', store => new Promise<void>((resolve, reject) => {
    const req = store.put({ id: 'main', value: s });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}
