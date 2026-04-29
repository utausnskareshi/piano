// Main-thread audio engine wrapper. Manages AudioContext lifecycle, sends control messages
// to the AudioWorklet, and handles iOS/Android unlock quirks.
//
// Public API:
//   - AudioEngine.start(): resume context (call from a user gesture)
//   - noteOn(note, vel) / noteOff(note)
//   - setSustain(on)
//   - setPreset(params: Float32Array)
//   - setMasterGain(g) / setReverbMix(m)

import workletUrl from './worklet.ts?worker&url';

const BASE = (import.meta as any).env?.BASE_URL ?? '/';
const WASM_URL = `${BASE}wasm/synth.wasm`.replace(/\/+/, '/');

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private wasmReady = false;
  private wasmFailed = false;
  private pendingPreset: Float32Array | null = null;
  private pendingMaster: number | null = null;
  private pendingReverb: number | null = null;
  private startedPromise: Promise<void> | null = null;

  isStarted() { return !!this.ctx && this.ctx.state === 'running'; }

  async start(): Promise<void> {
    // First-time setup (one-shot).
    if (!this.startedPromise) {
      this.startedPromise = this._start();
      this.installLifecycleHooks();
    }
    await this.startedPromise;
    // Always re-resume if the context has fallen into the "suspended" state.
    // iOS Safari suspends the context whenever a system dialog (alert/confirm),
    // tab switch, page navigation, or audio session interruption occurs.
    if (this.ctx && this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
  }

  /** Re-arm the AudioContext when the page becomes visible or regains focus. */
  private installLifecycleHooks() {
    const tryResume = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => { /* ignore */ });
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tryResume();
    });
    window.addEventListener('focus', tryResume);
    window.addEventListener('pageshow', tryResume);
    // First user pointer/touch on the document — guarantees a gesture-bound resume on iOS.
    const onGesture = () => tryResume();
    window.addEventListener('pointerdown', onGesture, { capture: true });
    window.addEventListener('touchstart', onGesture, { capture: true, passive: true });
  }

  private async _start() {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    // Add the worklet module.
    await this.ctx.audioWorklet.addModule(workletUrl);
    this.node = new AudioWorkletNode(this.ctx, 'synth-processor', { outputChannelCount: [2] });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1;
    this.node.connect(this.gain).connect(this.ctx.destination);
    this.node.port.onmessage = (e) => {
      const m = e.data;
      if (m?.type === 'wasm-ready') {
        this.wasmReady = true;
        this.flushPending();
      } else if (m?.type === 'wasm-error') {
        this.wasmFailed = true;
        // JS fallback in worklet handles audio without further action.
        this.flushPending();
        // eslint-disable-next-line no-console
        console.warn('WASM init failed; using JS fallback synth:', m.error);
      }
    };
    // Try to load the WASM module and hand it to the worklet. Vite's dev server
    // returns the SPA index.html (HTML, not WASM) when the file is missing in `public/`,
    // so we sniff the first bytes for the WASM magic and fall back silently otherwise.
    try {
      const res = await fetch(WASM_URL);
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        const view = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
        const isWasm = view.length >= 4 && view[0] === 0x00 && view[1] === 0x61 && view[2] === 0x73 && view[3] === 0x6d;
        if (isWasm) {
          this.node.port.postMessage({ type: 'wasm-bytes', bytes }, [bytes]);
        } else {
          // Not a real WASM file (e.g. Vite SPA fallback). Skip cleanly.
          this.wasmFailed = true;
          this.flushPending();
        }
      } else {
        this.wasmFailed = true;
        this.flushPending();
      }
    } catch {
      this.wasmFailed = true;
      this.flushPending();
    }
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
  }

  private flushPending() {
    if (this.pendingPreset) { this.setPreset(this.pendingPreset); }
    if (this.pendingMaster != null) this.setMasterGain(this.pendingMaster);
    if (this.pendingReverb != null) this.setReverbMix(this.pendingReverb);
  }

  private send(msg: any, transfer?: Transferable[]) {
    if (!this.node) return;
    if (transfer) this.node.port.postMessage(msg, transfer);
    else this.node.port.postMessage(msg);
  }

  noteOn(note: number, velocity: number = 100) { this.send({ type: 'note-on', note, velocity }); }
  noteOff(note: number) { this.send({ type: 'note-off', note }); }
  setSustain(on: boolean) { this.send({ type: 'sustain', on }); }
  allOff() { this.send({ type: 'all-off' }); }

  setPreset(params: Float32Array) {
    if (!this.node || (!this.wasmReady && !this.wasmFailed)) {
      this.pendingPreset = params.slice();
      return;
    }
    const copy = params.slice();
    this.send({ type: 'preset', params: copy });
  }

  setMasterGain(g: number) {
    if (!this.node) { this.pendingMaster = g; return; }
    this.send({ type: 'master-gain', value: g });
  }

  setReverbMix(m: number) {
    if (!this.node) { this.pendingReverb = m; return; }
    this.send({ type: 'reverb-mix', value: m });
  }
}

export const engine = new AudioEngine();
