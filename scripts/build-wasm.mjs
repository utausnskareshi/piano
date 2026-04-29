// Build the Rust DSP crate to wasm32-unknown-unknown and copy the .wasm to public/wasm/.
// If the Rust toolchain is not available, the build is skipped with a warning so the JS
// fallback synth still ships.
import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('public/wasm');
mkdirSync(outDir, { recursive: true });

const cargo = spawnSync('cargo', ['--version'], { stdio: 'pipe' });
if (cargo.status !== 0) {
  console.warn('[build-wasm] cargo not found; skipping WASM build (JS synth fallback will be used).');
  process.exit(0);
}

const target = 'wasm32-unknown-unknown';
const profile = 'release';

console.log('[build-wasm] cargo build --release --target', target);
const build = spawnSync(
  'cargo',
  ['build', '--release', '--target', target, '--manifest-path', 'wasm/Cargo.toml'],
  { stdio: 'inherit' }
);

if (build.status !== 0) {
  console.warn('[build-wasm] cargo build failed; skipping WASM (JS fallback will be used).');
  process.exit(0);
}

const wasmSrc = path.resolve(`wasm/target/${target}/${profile}/synth.wasm`);
if (!existsSync(wasmSrc)) {
  console.warn('[build-wasm] expected wasm output not found:', wasmSrc);
  process.exit(0);
}
const wasmDst = path.join(outDir, 'synth.wasm');
copyFileSync(wasmSrc, wasmDst);
console.log('[build-wasm] copied to', wasmDst);
