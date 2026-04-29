// Centralized application state. Components subscribe to specific keys via on()
// and call set() to mutate. Mutations also persist relevant fields to IndexedDB.

import { DEFAULT_SETTINGS, getSettings, saveSettings, Settings } from './store/db';
import { engine } from './audio/engine';
import { presetParams } from './audio/presets';

export type Mode = 'free' | 'learning' | 'auto';

export interface AppState extends Settings {
  /** Currently playing song ID or null. Built-in IDs are strings; user songs use `user:${id}`. */
  selectedSongId: string | null;
  /** Cursor position into the current song's notes (for learning/auto modes). */
  songCursor: number;
  /** Whether sustain pedal is engaged. */
  sustain: boolean;
  /** Currently held MIDI notes (for visual feedback). */
  heldNotes: Set<number>;
  /** Recording in progress in free mode? */
  recording: boolean;
  /** Recorded events (during recording). */
  recordedEvents: Array<{ midi: number; t: number }>;
}

type Listener<K extends keyof AppState> = (value: AppState[K]) => void;

class Store {
  private state: AppState;
  private listeners: { [K in keyof AppState]?: Set<Listener<K>> } = {};

  constructor() {
    this.state = {
      ...DEFAULT_SETTINGS,
      songCursor: 0,
      sustain: false,
      heldNotes: new Set<number>(),
      recording: false,
      recordedEvents: []
    };
  }

  async load() {
    const persisted = await getSettings();
    Object.assign(this.state, persisted);
  }

  get<K extends keyof AppState>(k: K): AppState[K] { return this.state[k]; }

  set<K extends keyof AppState>(k: K, v: AppState[K]) {
    if (this.state[k] === v) return;
    this.state[k] = v;
    this.listeners[k]?.forEach(fn => fn(v));
    this.persist();
  }

  /** For Set/Object values: notify listeners after mutation. */
  notify<K extends keyof AppState>(k: K) {
    this.listeners[k]?.forEach(fn => fn(this.state[k]));
  }

  on<K extends keyof AppState>(k: K, fn: Listener<K>) {
    (this.listeners[k] ??= new Set<any>()).add(fn as any);
    return () => this.listeners[k]?.delete(fn as any);
  }

  private persistTimer: any = null;
  private persist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      const s: Settings = {
        presetId: this.state.presetId,
        masterGain: this.state.masterGain,
        reverbMix: this.state.reverbMix,
        octaveOffset: this.state.octaveOffset,
        mode: this.state.mode,
        selectedSongId: this.state.selectedSongId,
        bpm: this.state.bpm
      };
      saveSettings(s).catch(console.error);
    }, 250);
  }

  /** Apply current preset to the audio engine. */
  applyCurrentPreset() {
    engine.setPreset(presetParams(this.state.presetId));
    engine.setMasterGain(this.state.masterGain);
    engine.setReverbMix(this.state.reverbMix);
  }
}

export const store = new Store();
