// Gera ícones e splash (PNG) sem dependências: fundo sólido + marca "V" em traço.
// Uso: node scripts/generate-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'assets');

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (width * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const hex = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));

/** Distância ponto-segmento, para desenhar o "V" como traço com pontas arredondadas. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function mark(size, bg, fg, { transparentBg = false, scale = 1, dot = false } = {}) {
  const [br, bgc, bb] = hex(bg);
  const [fr, fgc, fb] = hex(fg);
  const c = size / 2;
  const s = size * 0.26 * scale;
  const stroke = size * 0.075 * scale;
  const pts = { ax: c - s, ay: c - s * 0.75, vx: c, vy: c + s * 0.8, bx: c + s, by: c - s * 0.75 };
  return png(size, size, (x, y) => {
    const d = Math.min(segDist(x, y, pts.ax, pts.ay, pts.vx, pts.vy), segDist(x, y, pts.vx, pts.vy, pts.bx, pts.by));
    const inDot = dot && Math.hypot(x - (c + s * 1.15), y - (c - s * 0.95)) < stroke * 0.55;
    const edge = Math.max(0, Math.min(1, stroke / 2 - d + 0.5));
    if (edge > 0 || inDot) {
      const a = inDot ? 1 : edge;
      if (transparentBg) return [fr, fgc, fb, Math.round(a * 255)];
      return [Math.round(br + (fr - br) * a), Math.round(bgc + (fgc - bgc) * a), Math.round(bb + (fb - bb) * a), 255];
    }
    return transparentBg ? [0, 0, 0, 0] : [br, bgc, bb, 255];
  });
}

const variants = {
  customer: { bg: '#215468', fg: '#FBFAF7', dot: false },
  provider: { bg: '#0B1E26', fg: '#F2A93B', dot: true },
};
for (const [name, v] of Object.entries(variants)) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'icon.png'), mark(1024, v.bg, v.fg, { dot: v.dot }));
  writeFileSync(join(dir, 'adaptive-icon.png'), mark(1024, v.bg, v.fg, { transparentBg: true, scale: 0.8, dot: v.dot }));
  writeFileSync(join(dir, 'splash.png'), mark(1024, v.bg, v.fg, { transparentBg: true, scale: 0.5, dot: v.dot }));
  console.log(`assets/${name}: icon.png, adaptive-icon.png, splash.png`);
}
