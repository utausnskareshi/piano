// AudioWorkletProcessor that drives either the WASM DSP or a pure-JS fallback synth.
// Loaded by AudioContext.audioWorklet.addModule() — Vite handles the URL via ?worker.

/// <reference lib="WebWorker" />

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
}
declare function registerProcessor(name: string, ctor: any): void;

const PARAMS_LEN = 32;
const FRAMES = 128;

interface WasmExports {
  memory: WebAssembly.Memory;
  init: (sr: number) => void;
  note_on: (n: number, v: number) => void;
  note_off: (n: number) => void;
  set_sustain: (on: number) => void;
  all_notes_off: () => void;
  set_master_gain: (g: number) => void;
  set_reverb_mix: (m: number) => void;
  apply_preset: () => void;
  get_param_ptr: () => number;
  get_output_ptr: () => number;
  render: (frames: number) => void;
  frames_per_block: () => number;
  params_len: () => number;
}

class JsSynth {
  // Lightweight fallback when WASM cannot be instantiated.
  private voices: Array<{
    active: boolean;
    note: number;
    freq: number;
    velocity: number;
    phase1: number;
    phase2: number;
    rng: number;
    ampValue: number;
    ampStage: 'idle' | 'a' | 'd' | 's' | 'r';
    held: boolean;
    sustained: boolean;
    ks: { buf: Float32Array; idx: number; len: number; last: number; damp: number; fb: number };
  }> = [];
  private params = new Float32Array(PARAMS_LEN);
  private masterGain = 0.8;
  private reverbMix = 0.18;
  private sustainPedal = false;
  private sr: number;
  private combBufs: Float32Array[];
  private combIdx = [0, 0, 0, 0];
  private allpassBufs: Float32Array[];
  private allpassIdx = [0, 0];
  private lfoPhase = 0;

  constructor(sr: number) {
    this.sr = sr;
    for (let i = 0; i < 16; i++) {
      this.voices.push({
        active: false, note: 0, freq: 440, velocity: 1,
        phase1: 0, phase2: 0, rng: 0xdeadbeef, ampValue: 0, ampStage: 'idle',
        held: false, sustained: false,
        ks: { buf: new Float32Array(2048), idx: 0, len: 1, last: 0, damp: 0.5, fb: 0.99 }
      });
    }
    this.combBufs = [1557, 1617, 1491, 1422].map(n => new Float32Array(n));
    this.allpassBufs = [556, 441].map(n => new Float32Array(n));
    // default piano-ish preset
    const p = this.params;
    p[0] = 2; p[6] = 8000; p[7] = 0.7; p[8] = 4000;
    p[9] = 0.002; p[10] = 1.5; p[11] = 0; p[12] = 0.6;
    p[13] = 0.001; p[14] = 0.5; p[15] = 0; p[16] = 0.5;
    p[19] = 0.5; p[20] = 0.996; p[21] = 0.8;
  }

  setParams(arr: Float32Array) { this.params.set(arr); this.masterGain = this.params[21] || 0.8; }
  setMasterGain(g: number) { this.masterGain = Math.max(0, Math.min(1.5, g)); }
  setReverbMix(m: number) { this.reverbMix = Math.max(0, Math.min(1, m)); }
  setSustain(on: boolean) {
    const was = this.sustainPedal;
    this.sustainPedal = on;
    if (was && !on) {
      for (const v of this.voices) {
        if (v.sustained && !v.held) { v.sustained = false; v.ampStage = 'r'; }
      }
    }
  }
  allOff() {
    for (const v of this.voices) { v.held = false; v.sustained = false; v.ampStage = 'r'; }
    this.sustainPedal = false;
  }

  noteOn(note: number, vel: number) {
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    let idx = -1;
    for (let i = 0; i < this.voices.length; i++) {
      if (this.voices[i].ampStage === 'idle') { idx = i; break; }
    }
    if (idx < 0) {
      let min = Infinity;
      for (let i = 0; i < this.voices.length; i++) {
        if (this.voices[i].ampValue < min) { min = this.voices[i].ampValue; idx = i; }
      }
    }
    const v = this.voices[idx];
    v.active = true; v.note = note; v.freq = freq; v.velocity = Math.max(0.05, vel / 127);
    v.phase1 = 0; v.phase2 = 0; v.ampValue = 0; v.ampStage = 'a';
    v.held = true; v.sustained = false;
    v.rng = (0xCAFEF00D ^ (note * 2654435761)) >>> 0;
    if (this.params[0] === 2) {
      const len = Math.min(2047, Math.max(2, Math.floor(this.sr / Math.max(20, freq))));
      v.ks.len = len;
      v.ks.idx = 0;
      v.ks.last = 0;
      v.ks.damp = this.params[19];
      v.ks.fb = this.params[20];
      for (let i = 0; i < len; i++) {
        v.rng = (Math.imul(v.rng, 1664525) + 1013904223) >>> 0;
        v.ks.buf[i] = ((v.rng >>> 8) / 8388608) - 1;
      }
    }
  }

  noteOff(note: number) {
    for (const v of this.voices) {
      if (v.active && v.note === note && v.held) {
        v.held = false;
        if (this.sustainPedal) v.sustained = true;
        else v.ampStage = 'r';
      }
    }
  }

  private envStep(v: any): number {
    const a = this.params[9], d = this.params[10], s = this.params[11], r = this.params[12];
    switch (v.ampStage) {
      case 'idle': v.ampValue = 0; break;
      case 'a': {
        const rate = a > 0.0001 ? 1 / (a * this.sr) : 1;
        v.ampValue += rate;
        if (v.ampValue >= 1) { v.ampValue = 1; v.ampStage = 'd'; }
        break;
      }
      case 'd': {
        const rate = d > 0.0001 ? (1 - s) / (d * this.sr) : 1;
        v.ampValue -= rate;
        if (v.ampValue <= s) { v.ampValue = s; v.ampStage = 's'; }
        break;
      }
      case 's': v.ampValue = s; break;
      case 'r': {
        const rate = r > 0.0001 ? Math.max(0.001, s) / (r * this.sr) : 1;
        v.ampValue -= rate;
        if (v.ampValue <= 0) { v.ampValue = 0; v.ampStage = 'idle'; v.active = false; }
        break;
      }
    }
    return v.ampValue;
  }

  private osc(wave: number, phase: number, v: any): number {
    switch (wave) {
      case 0: return Math.sin(phase * Math.PI * 2);
      case 1: return 2 * (phase - Math.floor(phase + 0.5));
      case 2: return phase < 0.5 ? 1 : -1;
      case 3: return 1 - 4 * Math.abs(phase - 0.5);
      case 4: v.rng = (Math.imul(v.rng, 1664525) + 1013904223) >>> 0; return ((v.rng >>> 8) / 8388608) - 1;
      case 5: return phase < 0.25 ? 1 : -1;
      case 6: return phase < 0.10 ? 1 : -1;
    }
    return 0;
  }

  private ksStep(v: any): number {
    const k = v.ks;
    const cur = k.buf[k.idx];
    const sm = 0.5 * cur + 0.5 * k.last;
    const out = k.damp * sm + (1 - k.damp) * cur;
    k.buf[k.idx] = out * k.fb;
    k.last = cur;
    k.idx = (k.idx + 1) % k.len;
    return out;
  }

  private reverb(input: number): number {
    const fbs = [0.82, 0.82, 0.82, 0.82];
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const buf = this.combBufs[k];
      const i = this.combIdx[k];
      const v = buf[i];
      buf[i] = input + v * fbs[k];
      sum += v;
      this.combIdx[k] = (i + 1) % buf.length;
    }
    sum *= 0.25;
    for (let k = 0; k < 2; k++) {
      const buf = this.allpassBufs[k];
      const i = this.allpassIdx[k];
      const v = buf[i];
      buf[i] = sum + v * 0.5;
      sum = -sum * 0.5 + v;
      this.allpassIdx[k] = (i + 1) % buf.length;
    }
    return sum;
  }

  process(out: Float32Array) {
    const p = this.params;
    const synthType = p[0] | 0;
    const osc1 = p[1] | 0;
    const osc2 = p[2] | 0;
    const detune = Math.pow(2, p[3] / 12);
    const oscMix = Math.max(0, Math.min(1, p[4]));
    const noiseLevel = p[5];
    const lfoRate = p[22];
    const lfoPitch = p[23];
    const drive = p[24];
    const fmRatio = p[17];
    const fmIndex = p[18];

    for (let i = 0; i < out.length; i++) {
      this.lfoPhase += lfoRate / this.sr;
      if (this.lfoPhase > 1) this.lfoPhase -= 1;
      const lfo = Math.sin(this.lfoPhase * Math.PI * 2);
      const pitchMod = Math.pow(2, (lfo * lfoPitch) / 12);

      let mix = 0;
      for (const v of this.voices) {
        if (v.ampStage === 'idle') continue;
        const amp = this.envStep(v);
        const f1 = v.freq * pitchMod;
        const f2 = f1 * detune;
        const inc1 = f1 / this.sr;
        const inc2 = f2 / this.sr;
        let s = 0;
        if (synthType === 2) {
          s = this.ksStep(v);
        } else if (synthType === 1) {
          v.phase2 += fmRatio * inc1; if (v.phase2 >= 1) v.phase2 -= Math.floor(v.phase2);
          const m = Math.sin(v.phase2 * Math.PI * 2) * fmIndex;
          s = Math.sin((v.phase1 + m) * Math.PI * 2);
          v.phase1 += inc1; if (v.phase1 >= 1) v.phase1 -= Math.floor(v.phase1);
        } else if (synthType === 3) {
          v.phase1 += inc1; if (v.phase1 >= 1) v.phase1 -= Math.floor(v.phase1);
          const t = v.phase1 * Math.PI * 2;
          s = Math.sin(t) + Math.sin(t * 2) * 0.5 + Math.sin(t * 3) * 0.25;
        } else if (synthType === 4) {
          v.phase1 += inc1; if (v.phase1 >= 1) v.phase1 -= Math.floor(v.phase1);
          const t = v.phase1 * Math.PI * 2;
          s = (Math.sin(t) + Math.sin(t * 2) * 0.7 + Math.sin(t * 3) * 0.5 + Math.sin(t * 4) * 0.3) * 0.4;
        } else {
          v.phase1 += inc1; if (v.phase1 >= 1) v.phase1 -= Math.floor(v.phase1);
          v.phase2 += inc2; if (v.phase2 >= 1) v.phase2 -= Math.floor(v.phase2);
          const o1 = this.osc(osc1, v.phase1, v);
          const o2 = this.osc(osc2, v.phase2, v);
          const n = (Math.random() * 2 - 1) * noiseLevel;
          s = o1 * (1 - oscMix) + o2 * oscMix + n;
        }
        if (drive > 0.001) s = Math.tanh(s * (1 + drive * 5));
        mix += s * amp * v.velocity;
      }
      mix = mix * (1 / 16) * 4 * this.masterGain;
      const wet = this.reverb(mix);
      let o = mix * (1 - this.reverbMix) + wet * this.reverbMix;
      o = Math.tanh(o * 0.9);
      out[i] = o;
    }
  }
}

class SynthProcessor extends AudioWorkletProcessor {
  private wasm: WasmExports | null = null;
  private wasmParams: Float32Array | null = null;
  private wasmOutput: Float32Array | null = null;
  private js: JsSynth;
  private useWasm = false;
  private pendingParams: Float32Array | null = null;

  constructor() {
    super();
    this.js = new JsSynth(sampleRate);
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  private async onMessage(msg: any) {
    if (msg?.type === 'wasm-bytes' && msg.bytes instanceof ArrayBuffer) {
      try {
        const mod = await WebAssembly.instantiate(msg.bytes, {});
        const exp = mod.instance.exports as unknown as WasmExports;
        exp.init(sampleRate);
        this.wasm = exp;
        this.useWasm = true;
        this.refreshViews();
        if (this.pendingParams) {
          this.applyParams(this.pendingParams);
          this.pendingParams = null;
        }
        this.port.postMessage({ type: 'wasm-ready' });
      } catch (err) {
        this.port.postMessage({ type: 'wasm-error', error: String(err) });
      }
    } else if (msg?.type === 'note-on') {
      if (this.useWasm && this.wasm) this.wasm.note_on(msg.note, msg.velocity);
      else this.js.noteOn(msg.note, msg.velocity);
    } else if (msg?.type === 'note-off') {
      if (this.useWasm && this.wasm) this.wasm.note_off(msg.note);
      else this.js.noteOff(msg.note);
    } else if (msg?.type === 'sustain') {
      if (this.useWasm && this.wasm) this.wasm.set_sustain(msg.on ? 1 : 0);
      else this.js.setSustain(!!msg.on);
    } else if (msg?.type === 'all-off') {
      if (this.useWasm && this.wasm) this.wasm.all_notes_off();
      else this.js.allOff();
    } else if (msg?.type === 'master-gain') {
      if (this.useWasm && this.wasm) this.wasm.set_master_gain(msg.value);
      else this.js.setMasterGain(msg.value);
    } else if (msg?.type === 'reverb-mix') {
      if (this.useWasm && this.wasm) this.wasm.set_reverb_mix(msg.value);
      else this.js.setReverbMix(msg.value);
    } else if (msg?.type === 'preset' && msg.params instanceof Float32Array) {
      this.applyParams(msg.params);
    }
  }

  private applyParams(params: Float32Array) {
    if (this.useWasm && this.wasm && this.wasmParams) {
      this.wasmParams.set(params);
      this.wasm.apply_preset();
    } else if (this.useWasm && this.wasm && !this.wasmParams) {
      this.pendingParams = params;
    } else {
      this.js.setParams(params);
    }
  }

  private refreshViews() {
    if (!this.wasm) return;
    const mem = this.wasm.memory;
    const paramPtr = this.wasm.get_param_ptr();
    const outPtr = this.wasm.get_output_ptr();
    const paramLen = this.wasm.params_len();
    const frames = this.wasm.frames_per_block();
    this.wasmParams = new Float32Array(mem.buffer, paramPtr, paramLen);
    this.wasmOutput = new Float32Array(mem.buffer, outPtr, frames);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0];
    const ch0 = out[0];
    if (this.useWasm && this.wasm) {
      // Re-resolve views in case memory was grown.
      if (!this.wasmOutput || this.wasmOutput.buffer !== this.wasm.memory.buffer) {
        this.refreshViews();
      }
      this.wasm.render(ch0.length);
      ch0.set(this.wasmOutput!.subarray(0, ch0.length));
    } else {
      this.js.process(ch0);
    }
    if (out.length > 1) out[1].set(ch0);
    return true;
  }
}

registerProcessor('synth-processor', SynthProcessor);
