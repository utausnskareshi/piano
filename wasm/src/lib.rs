// Polyphonic synthesizer DSP core.
// Exposed as raw C-ABI WASM exports so the AudioWorklet can use it without wasm-bindgen.
//
// Voice model:
//   - 16 voices, each with 2 oscillators + noise + biquad LP filter + ADSR amp env + ADSR filter env.
//   - 100 presets defined in JS. Each preset is uploaded as a parameter blob via set_preset_params.
//   - Synthesis types selected per voice via osc waveforms + Karplus-Strong delay line for plucked timbres.
//
// Memory layout:
//   - The host writes parameters and reads the output buffer through a single linear memory region.
//   - get_output_ptr / get_param_ptr expose pointers; the host uses Float32Array views.

#![no_std]

use core::cell::UnsafeCell;
use core::f32::consts::{PI, TAU};

const SAMPLE_RATE: f32 = 48000.0;
const VOICES: usize = 16;
const FRAMES: usize = 128;
const KS_DELAY_MAX: usize = 2048;

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    loop {}
}

// ---------- Math helpers (no_std friendly) ----------

#[inline]
fn fast_sin(x: f32) -> f32 {
    // Bhaskara-like polynomial approximation, periodic with TAU.
    let mut x = x % TAU;
    if x < 0.0 { x += TAU; }
    if x > PI { x -= TAU; }
    let x2 = x * x;
    x * (1.0 - x2 / 6.0 + x2 * x2 / 120.0 - x2 * x2 * x2 / 5040.0)
}

#[inline]
fn powf(base: f32, exp: f32) -> f32 {
    // Approximation: e^(exp * ln(base)) using Taylor; sufficient for envelope curves.
    if base <= 0.0 { return 0.0; }
    let ln_b = ln(base);
    exp_approx(exp * ln_b)
}

#[inline]
fn ln(x: f32) -> f32 {
    // ln(x) via bit manipulation + polynomial. Accurate enough for audio rates.
    let bits = x.to_bits();
    let e = ((bits >> 23) & 0xff) as i32 - 127;
    let m_bits = (bits & 0x007fffff) | 0x3f800000;
    let m = f32::from_bits(m_bits); // m in [1, 2)
    let y = m - 1.0;
    let p = y * (1.0 - y * 0.5 + y * y * (1.0 / 3.0) - y * y * y * 0.25);
    p + e as f32 * core::f32::consts::LN_2
}

#[inline]
fn exp_approx(x: f32) -> f32 {
    // exp(x) via 2^(x / ln 2) with bit construction.
    let y = x * core::f32::consts::LOG2_E;
    let i = y as i32;
    let f = y - i as f32;
    // 2^f via polynomial
    let p = 1.0 + f * (0.6931472 + f * (0.2402265 + f * (0.0555041 + f * 0.0096181)));
    let bits = ((i + 127) as u32) << 23;
    f32::from_bits(bits) * p
}

#[inline]
fn tanh_approx(x: f32) -> f32 {
    // Fast tanh for soft clipping.
    let x2 = x * x;
    let n = x * (27.0 + x2);
    let d = 27.0 + 9.0 * x2;
    n / d
}

// ---------- Oscillators ----------

#[derive(Clone, Copy)]
enum Wave { Sine, Saw, Square, Triangle, Noise, Pulse25, Pulse10 }

#[inline]
fn osc(wave: Wave, phase: f32, rng_state: &mut u32) -> f32 {
    match wave {
        Wave::Sine => fast_sin(phase * TAU),
        Wave::Saw => 2.0 * (phase - (phase + 0.5).floor()),
        Wave::Square => if phase < 0.5 { 1.0 } else { -1.0 },
        Wave::Triangle => 1.0 - 4.0 * (phase - 0.5).abs(),
        Wave::Pulse25 => if phase < 0.25 { 1.0 } else { -1.0 },
        Wave::Pulse10 => if phase < 0.10 { 1.0 } else { -1.0 },
        Wave::Noise => {
            *rng_state = rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
            ((*rng_state >> 8) as f32 / 8388608.0) - 1.0
        }
    }
}

fn wave_from_id(id: u8) -> Wave {
    match id {
        0 => Wave::Sine,
        1 => Wave::Saw,
        2 => Wave::Square,
        3 => Wave::Triangle,
        4 => Wave::Noise,
        5 => Wave::Pulse25,
        6 => Wave::Pulse10,
        _ => Wave::Sine,
    }
}

// ---------- ADSR ----------

#[derive(Clone, Copy, Default)]
struct Adsr {
    a: f32, d: f32, s: f32, r: f32,
}

#[derive(Clone, Copy)]
enum Stage { Idle, Attack, Decay, Sustain, Release }

#[derive(Clone, Copy)]
struct EnvState {
    stage: Stage,
    value: f32,
}

impl EnvState {
    fn new() -> Self { Self { stage: Stage::Idle, value: 0.0 } }
    fn note_on(&mut self) { self.stage = Stage::Attack; }
    fn note_off(&mut self) { self.stage = Stage::Release; }
    fn step(&mut self, env: &Adsr) -> f32 {
        match self.stage {
            Stage::Idle => self.value = 0.0,
            Stage::Attack => {
                let rate = if env.a > 0.0001 { 1.0 / (env.a * SAMPLE_RATE) } else { 1.0 };
                self.value += rate;
                if self.value >= 1.0 { self.value = 1.0; self.stage = Stage::Decay; }
            }
            Stage::Decay => {
                let rate = if env.d > 0.0001 { (1.0 - env.s) / (env.d * SAMPLE_RATE) } else { 1.0 };
                self.value -= rate;
                if self.value <= env.s { self.value = env.s; self.stage = Stage::Sustain; }
            }
            Stage::Sustain => self.value = env.s,
            Stage::Release => {
                let rate = if env.r > 0.0001 { env.s.max(0.001) / (env.r * SAMPLE_RATE) } else { 1.0 };
                self.value -= rate;
                if self.value <= 0.0 { self.value = 0.0; self.stage = Stage::Idle; }
            }
        }
        self.value
    }
    fn is_active(&self) -> bool { !matches!(self.stage, Stage::Idle) }
}

// ---------- Biquad lowpass filter ----------

#[derive(Clone, Copy, Default)]
struct Biquad {
    a1: f32, a2: f32, b0: f32, b1: f32, b2: f32,
    z1: f32, z2: f32,
}
impl Biquad {
    fn set_lp(&mut self, cutoff_hz: f32, q: f32) {
        let f = cutoff_hz.clamp(20.0, SAMPLE_RATE * 0.45);
        let w0 = TAU * f / SAMPLE_RATE;
        let cos_w = fast_sin(w0 + PI * 0.5);
        let sin_w = fast_sin(w0);
        let alpha = sin_w / (2.0 * q.max(0.1));
        let b0 = (1.0 - cos_w) * 0.5;
        let b1 = 1.0 - cos_w;
        let b2 = (1.0 - cos_w) * 0.5;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_w;
        let a2 = 1.0 - alpha;
        self.b0 = b0 / a0;
        self.b1 = b1 / a0;
        self.b2 = b2 / a0;
        self.a1 = a1 / a0;
        self.a2 = a2 / a0;
    }
    fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
}

// ---------- Karplus-Strong delay (for plucked-string timbres) ----------

#[derive(Clone, Copy)]
struct KsDelay {
    buf: [f32; KS_DELAY_MAX],
    write: usize,
    length: usize,
    damping: f32,
    last: f32,
    feedback: f32,
}
impl KsDelay {
    const fn new() -> Self {
        Self {
            buf: [0.0; KS_DELAY_MAX],
            write: 0,
            length: 1,
            damping: 0.5,
            last: 0.0,
            feedback: 0.99,
        }
    }
    fn excite(&mut self, freq: f32, rng: &mut u32) {
        let len = (SAMPLE_RATE / freq.max(20.0)) as usize;
        self.length = len.min(KS_DELAY_MAX - 1).max(2);
        self.write = 0;
        self.last = 0.0;
        for i in 0..self.length {
            *rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
            self.buf[i] = ((*rng >> 8) as f32 / 8388608.0) - 1.0;
        }
    }
    fn step(&mut self) -> f32 {
        let read = if self.write == 0 { self.length - 1 } else { self.write - 1 };
        let cur = self.buf[self.write];
        let smoothed = 0.5 * cur + 0.5 * self.last;
        let out = self.damping * smoothed + (1.0 - self.damping) * cur;
        let new_val = out * self.feedback;
        self.last = cur;
        self.buf[self.write] = new_val;
        self.write += 1;
        if self.write >= self.length { self.write = 0; }
        // also use 'read' to avoid dead-code warning and provide a tiny phase offset blend
        let _ = read;
        out
    }
}

// ---------- Voice ----------

#[derive(Clone, Copy)]
struct Voice {
    active: bool,
    note: u8,
    freq: f32,
    velocity: f32,
    phase1: f32,
    phase2: f32,
    rng: u32,
    amp_env: EnvState,
    flt_env: EnvState,
    filter: Biquad,
    ks: KsDelay,
    held: bool,
    sustained: bool,
}

impl Voice {
    const fn new() -> Self {
        Self {
            active: false,
            note: 0,
            freq: 440.0,
            velocity: 1.0,
            phase1: 0.0,
            phase2: 0.0,
            rng: 0xDEADBEEF,
            amp_env: EnvState { stage: Stage::Idle, value: 0.0 },
            flt_env: EnvState { stage: Stage::Idle, value: 0.0 },
            filter: Biquad { a1: 0.0, a2: 0.0, b0: 1.0, b1: 0.0, b2: 0.0, z1: 0.0, z2: 0.0 },
            ks: KsDelay::new(),
            held: false,
            sustained: false,
        }
    }
}

// ---------- Preset parameters ----------
//
// The host sends a parameter blob (see set_preset_params) consisting of f32 values in this order:
//   0  synth_type  (0=subtractive, 1=fm2op, 2=karplus_strong, 3=additive3, 4=organ_drawbar)
//   1  osc1_wave (0..6)
//   2  osc2_wave (0..6)
//   3  osc2_detune_semitones
//   4  osc_mix (0=osc1 only, 1=osc2 only)
//   5  noise_level
//   6  filter_cutoff_hz  (base)
//   7  filter_resonance
//   8  filter_env_amount (Hz)
//   9  amp_a
//   10 amp_d
//   11 amp_s
//   12 amp_r
//   13 flt_a
//   14 flt_d
//   15 flt_s
//   16 flt_r
//   17 fm_ratio
//   18 fm_index
//   19 ks_damping
//   20 ks_feedback
//   21 master_gain
//   22 lfo_rate_hz
//   23 lfo_pitch_amount (semitones)
//   24 drive (waveshaper amount)
//   25..31 reserved

const PARAMS_LEN: usize = 32;

#[derive(Clone, Copy)]
struct Preset {
    p: [f32; PARAMS_LEN],
}

impl Preset {
    const fn default_piano() -> Self {
        let mut p = [0.0f32; PARAMS_LEN];
        // synth_type = karplus_strong (2) for piano-like attack
        p[0] = 2.0;
        p[1] = 1.0; // saw (used as backup)
        p[2] = 1.0;
        p[3] = 0.0;
        p[4] = 0.5;
        p[5] = 0.0;
        p[6] = 8000.0;
        p[7] = 0.7;
        p[8] = 4000.0;
        p[9] = 0.002; p[10] = 1.5; p[11] = 0.0; p[12] = 0.6;
        p[13] = 0.001; p[14] = 0.5; p[15] = 0.0; p[16] = 0.5;
        p[17] = 1.0; p[18] = 0.0;
        p[19] = 0.5; p[20] = 0.996;
        p[21] = 0.8;
        p[22] = 0.0; p[23] = 0.0;
        p[24] = 0.0;
        Self { p }
    }
}

// ---------- Reverb (simple Schroeder) ----------
//
// 4 comb filters in parallel + 2 allpass in series. Light enough for mobile.

const COMB_LENS: [usize; 4] = [1557, 1617, 1491, 1422];
const ALLPASS_LENS: [usize; 2] = [556, 441];

struct Reverb {
    comb_buf: [[f32; 1700]; 4],
    comb_idx: [usize; 4],
    allpass_buf: [[f32; 600]; 2],
    allpass_idx: [usize; 2],
    mix: f32,
}

impl Reverb {
    const fn new() -> Self {
        Self {
            comb_buf: [[0.0; 1700]; 4],
            comb_idx: [0; 4],
            allpass_buf: [[0.0; 600]; 2],
            allpass_idx: [0; 2],
            mix: 0.18,
        }
    }
    fn process(&mut self, input: f32) -> f32 {
        let mut sum = 0.0;
        for k in 0..4 {
            let len = COMB_LENS[k];
            let i = self.comb_idx[k];
            let v = self.comb_buf[k][i];
            let new_val = input + v * 0.82;
            self.comb_buf[k][i] = new_val;
            self.comb_idx[k] = if i + 1 >= len { 0 } else { i + 1 };
            sum += v;
        }
        sum *= 0.25;
        for k in 0..2 {
            let len = ALLPASS_LENS[k];
            let i = self.allpass_idx[k];
            let v = self.allpass_buf[k][i];
            let new_val = sum + v * 0.5;
            self.allpass_buf[k][i] = new_val;
            sum = -sum * 0.5 + v;
            self.allpass_idx[k] = if i + 1 >= len { 0 } else { i + 1 };
        }
        sum
    }
}

// ---------- Engine ----------

struct Engine {
    voices: [Voice; VOICES],
    preset: Preset,
    sustain_pedal: bool,
    output: [f32; FRAMES],
    params_in: [f32; PARAMS_LEN],
    master_gain: f32,
    reverb: Reverb,
    reverb_mix: f32,
    lfo_phase: f32,
    sample_rate: f32,
}

impl Engine {
    const fn new() -> Self {
        Self {
            voices: [Voice::new(); VOICES],
            preset: Preset { p: [0.0; PARAMS_LEN] },
            sustain_pedal: false,
            output: [0.0; FRAMES],
            params_in: [0.0; PARAMS_LEN],
            master_gain: 0.8,
            reverb: Reverb::new(),
            reverb_mix: 0.18,
            lfo_phase: 0.0,
            sample_rate: SAMPLE_RATE,
        }
    }

    fn note_on(&mut self, note: u8, vel: u8) {
        let freq = 440.0 * exp_approx(((note as i32 - 69) as f32) * core::f32::consts::LN_2 / 12.0);
        // Voice steal: prefer idle, else oldest releasing.
        let mut idx = 0usize;
        let mut found = false;
        for i in 0..VOICES {
            if !self.voices[i].amp_env.is_active() {
                idx = i; found = true; break;
            }
        }
        if !found {
            // steal voice with smallest amp_env value
            let mut min_val = f32::MAX;
            for i in 0..VOICES {
                if self.voices[i].amp_env.value < min_val {
                    min_val = self.voices[i].amp_env.value;
                    idx = i;
                }
            }
        }
        let v = &mut self.voices[idx];
        v.active = true;
        v.note = note;
        v.freq = freq;
        v.velocity = (vel as f32 / 127.0).max(0.05);
        v.phase1 = 0.0;
        v.phase2 = 0.0;
        v.rng = 0xCAFE_F00D ^ (note as u32 * 2654435761).wrapping_add(idx as u32);
        v.amp_env.value = 0.0;
        v.flt_env.value = 0.0;
        v.amp_env.note_on();
        v.flt_env.note_on();
        v.held = true;
        v.sustained = false;
        let synth_type = self.preset.p[0] as i32;
        if synth_type == 2 {
            v.ks.damping = self.preset.p[19];
            v.ks.feedback = self.preset.p[20];
            v.ks.excite(freq, &mut v.rng);
        }
    }

    fn note_off(&mut self, note: u8) {
        for v in self.voices.iter_mut() {
            if v.active && v.note == note && v.held {
                v.held = false;
                if self.sustain_pedal {
                    v.sustained = true;
                } else {
                    v.amp_env.note_off();
                    v.flt_env.note_off();
                }
            }
        }
    }

    fn set_sustain(&mut self, on: bool) {
        let was = self.sustain_pedal;
        self.sustain_pedal = on;
        if was && !on {
            // pedal released: end sustained notes
            for v in self.voices.iter_mut() {
                if v.sustained && !v.held {
                    v.sustained = false;
                    v.amp_env.note_off();
                    v.flt_env.note_off();
                }
            }
        }
    }

    fn all_notes_off(&mut self) {
        for v in self.voices.iter_mut() {
            v.held = false;
            v.sustained = false;
            v.amp_env.note_off();
            v.flt_env.note_off();
        }
        self.sustain_pedal = false;
    }

    fn apply_preset(&mut self) {
        self.preset.p = self.params_in;
        self.master_gain = self.preset.p[21];
    }

    fn render(&mut self, frames: usize) {
        let p = &self.preset.p;
        let synth_type = p[0] as i32;
        let osc1_w = wave_from_id(p[1] as u8);
        let osc2_w = wave_from_id(p[2] as u8);
        let detune_semi = p[3];
        let osc_mix = p[4].clamp(0.0, 1.0);
        let noise_level = p[5];
        let filter_base = p[6];
        let filter_q = p[7].max(0.5);
        let filter_env_amt = p[8];
        let amp_env = Adsr { a: p[9], d: p[10], s: p[11], r: p[12] };
        let flt_env = Adsr { a: p[13], d: p[14], s: p[15], r: p[16] };
        let fm_ratio = p[17];
        let fm_index = p[18];
        let lfo_rate = p[22];
        let lfo_pitch = p[23];
        let drive = p[24];
        let detune_factor = exp_approx(detune_semi * core::f32::consts::LN_2 / 12.0);

        for i in 0..frames {
            self.lfo_phase += lfo_rate / self.sample_rate;
            if self.lfo_phase > 1.0 { self.lfo_phase -= 1.0; }
            let lfo = fast_sin(self.lfo_phase * TAU);

            let mut mix = 0.0f32;
            for v in self.voices.iter_mut() {
                if !v.amp_env.is_active() { continue; }

                let amp = v.amp_env.step(&amp_env);
                let flt = v.flt_env.step(&flt_env);

                let pitch_mod = exp_approx(lfo * lfo_pitch * core::f32::consts::LN_2 / 12.0);
                let f1 = v.freq * pitch_mod;
                let f2 = f1 * detune_factor;

                let inc1 = f1 / self.sample_rate;
                let inc2 = f2 / self.sample_rate;

                let s = match synth_type {
                    2 => {
                        // Karplus-Strong (plucked / piano-like)
                        v.ks.step()
                    }
                    1 => {
                        // 2-op FM
                        let mod_phase = v.phase2;
                        v.phase2 += fm_ratio * inc1;
                        if v.phase2 >= 1.0 { v.phase2 -= v.phase2.floor(); }
                        let m = fast_sin(mod_phase * TAU) * fm_index;
                        let car = fast_sin((v.phase1 + m) * TAU);
                        v.phase1 += inc1;
                        if v.phase1 >= 1.0 { v.phase1 -= v.phase1.floor(); }
                        car
                    }
                    3 => {
                        // Additive 3-partial (bell/organ-ish)
                        v.phase1 += inc1;
                        if v.phase1 >= 1.0 { v.phase1 -= v.phase1.floor(); }
                        let s1 = fast_sin(v.phase1 * TAU);
                        let s2 = fast_sin(v.phase1 * TAU * 2.0) * 0.5;
                        let s3 = fast_sin(v.phase1 * TAU * 3.0) * 0.25;
                        s1 + s2 + s3
                    }
                    4 => {
                        // Drawbar organ: 4 sine partials with phase wrap
                        v.phase1 += inc1;
                        if v.phase1 >= 1.0 { v.phase1 -= v.phase1.floor(); }
                        let s1 = fast_sin(v.phase1 * TAU);
                        let s2 = fast_sin(v.phase1 * TAU * 2.0) * 0.7;
                        let s3 = fast_sin(v.phase1 * TAU * 3.0) * 0.5;
                        let s4 = fast_sin(v.phase1 * TAU * 4.0) * 0.3;
                        (s1 + s2 + s3 + s4) * 0.4
                    }
                    _ => {
                        // Subtractive: osc1 + osc2 + noise
                        v.phase1 += inc1;
                        if v.phase1 >= 1.0 { v.phase1 -= v.phase1.floor(); }
                        v.phase2 += inc2;
                        if v.phase2 >= 1.0 { v.phase2 -= v.phase2.floor(); }
                        let o1 = osc(osc1_w, v.phase1, &mut v.rng);
                        let o2 = osc(osc2_w, v.phase2, &mut v.rng);
                        let n = osc(Wave::Noise, 0.0, &mut v.rng) * noise_level;
                        (o1 * (1.0 - osc_mix) + o2 * osc_mix) + n
                    }
                };

                let cutoff = filter_base + flt * filter_env_amt;
                v.filter.set_lp(cutoff, filter_q);
                let s = v.filter.process(s);

                let s = if drive > 0.001 { tanh_approx(s * (1.0 + drive * 5.0)) } else { s };

                mix += s * amp * v.velocity;
            }
            let mix = mix * (1.0 / VOICES as f32) * 4.0 * self.master_gain;
            let wet = self.reverb.process(mix);
            let out = mix * (1.0 - self.reverb_mix) + wet * self.reverb_mix;
            self.output[i] = tanh_approx(out * 0.9);
        }
    }
}

// ---------- Static engine + exports ----------

struct EngineCell(UnsafeCell<Engine>);
unsafe impl Sync for EngineCell {}

static ENGINE: EngineCell = EngineCell(UnsafeCell::new(Engine::new()));

#[inline]
fn engine() -> &'static mut Engine {
    unsafe { &mut *ENGINE.0.get() }
}

#[no_mangle]
pub extern "C" fn init(sample_rate: f32) {
    let e = engine();
    e.sample_rate = sample_rate;
    e.preset = Preset::default_piano();
    e.params_in = e.preset.p;
    e.master_gain = e.preset.p[21];
}

#[no_mangle]
pub extern "C" fn note_on(note: i32, velocity: i32) {
    engine().note_on(note as u8, velocity as u8);
}

#[no_mangle]
pub extern "C" fn note_off(note: i32) {
    engine().note_off(note as u8);
}

#[no_mangle]
pub extern "C" fn set_sustain(on: i32) {
    engine().set_sustain(on != 0);
}

#[no_mangle]
pub extern "C" fn all_notes_off() {
    engine().all_notes_off();
}

#[no_mangle]
pub extern "C" fn set_master_gain(g: f32) {
    engine().master_gain = g.clamp(0.0, 1.5);
}

#[no_mangle]
pub extern "C" fn set_reverb_mix(m: f32) {
    engine().reverb_mix = m.clamp(0.0, 1.0);
}

#[no_mangle]
pub extern "C" fn apply_preset() {
    engine().apply_preset();
}

#[no_mangle]
pub extern "C" fn get_param_ptr() -> *mut f32 {
    engine().params_in.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn get_output_ptr() -> *mut f32 {
    engine().output.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn render(frames: i32) {
    engine().render(frames as usize);
}

#[no_mangle]
pub extern "C" fn frames_per_block() -> i32 { FRAMES as i32 }

#[no_mangle]
pub extern "C" fn params_len() -> i32 { PARAMS_LEN as i32 }
