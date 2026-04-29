// Generate PWA icons from an inline SVG using sharp.
// Output goes to public/icons/. Idempotent — safe to re-run.
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const outDir = path.resolve('public/icons');

const svg = (size, masked = false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)" rx="${masked ? 0 : size * 0.18}"/>
  ${(() => {
    const pad = masked ? size * 0.18 : size * 0.1;
    const kbW = size - pad * 2;
    const kbH = kbW * 0.45;
    const x0 = pad;
    const y0 = (size - kbH) / 2 + size * 0.05;
    const whiteCount = 7;
    const ww = kbW / whiteCount;
    let s = '';
    for (let i = 0; i < whiteCount; i++) {
      s += `<rect x="${x0 + i * ww + 1}" y="${y0}" width="${ww - 2}" height="${kbH}" fill="#f8fafc" rx="${ww * 0.06}"/>`;
    }
    const blackPos = [0, 1, 3, 4, 5];
    const bw = ww * 0.6;
    const bh = kbH * 0.62;
    for (const p of blackPos) {
      s += `<rect x="${x0 + (p + 1) * ww - bw / 2}" y="${y0}" width="${bw}" height="${bh}" fill="#0b1220" rx="${bw * 0.1}"/>`;
    }
    return s;
  })()}
  <text x="50%" y="${size * 0.22}" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-weight="700" fill="#38bdf8" font-size="${size * 0.16}">Piano</text>
</svg>`;

async function generate() {
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const targets = [
    { name: 'icon-192.png', size: 192, masked: false },
    { name: 'icon-512.png', size: 512, masked: false },
    { name: 'icon-maskable-512.png', size: 512, masked: true },
    { name: 'apple-touch-icon.png', size: 180, masked: false }
  ];

  for (const t of targets) {
    const buf = Buffer.from(svg(t.size, t.masked));
    await sharp(buf).png().toFile(path.join(outDir, t.name));
    console.log('icon written:', t.name);
  }
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
