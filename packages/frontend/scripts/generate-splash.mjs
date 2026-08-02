/**
 * Generates the iOS `apple-touch-startup-image` PNGs used as the PWA launch
 * splash. iOS standalone PWAs do NOT fall back to the manifest splash, so
 * without these images the app shows a blank white screen on launch.
 *
 * The images are a branded splash: the emerald brand field with the lede
 * wordmark centred — mirroring `public/icon-512.svg`. Encoded as opaque 8-bit
 * truecolor PNGs with zero external dependencies (pure Node `zlib`), so this
 * runs in any environment without native image tooling.
 *
 * Run from `packages/frontend`:
 *   node scripts/generate-splash.mjs
 *
 * Regenerate whenever the brand colour, logo mark, or device list changes.
 * The generated files live in `public/splash/` and are committed to the repo.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/splash');

// Brand colours — kept in sync with the manifest and globals.css.
const GREEN = [0x12, 0xb9, 0x81]; // brand emerald / theme_color / manifest background_color

// The "lede" wordmark bars, expressed in the icon's native 512×512 coordinate
// space (see public/icon-512.svg). Rendered white on the emerald field.
const BARS = [
  { x: 140, y: 160, w: 236, h: 44, alpha: 1 },
  { x: 140, y: 242, w: 196, h: 26, alpha: 0.5 },
  { x: 140, y: 284, w: 214, h: 26, alpha: 0.5 },
  { x: 140, y: 326, w: 150, h: 26, alpha: 0.5 },
];

// Bounding box of the wordmark in logical space — used to centre it on screen.
const BBOX = { x: 140, y: 160, w: 236, h: 192 }; // spans x[140,376], y[160,352]

// Pre-blend the wordmark bars over the emerald field so we only need opaque
// colours when rasterising.
function blend(fg, bg, a) {
  return fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
}
const BAR_COLORS = BARS.map((b) => ({ ...b, color: blend([255, 255, 255], GREEN, b.alpha) }));

/** Point-in-rounded-rectangle test (all in logical mark space). */
function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Resolve the colour of a single sample point in logical mark coordinates. */
function sampleColor(lx, ly) {
  for (const b of BAR_COLORS) {
    if (inRoundedRect(lx, ly, b.x, b.y, b.x + b.w, b.y + b.h, b.h / 2)) return b.color;
  }
  return GREEN; // emerald fills the whole screen
}

/** Encode a raw RGB pixel buffer as an opaque PNG (Buffer). */
function encodePng(width, height, rgb) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData) >>> 0, 0);
    return Buffer.concat([len, typeAndData, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolor RGB
  // 10..12 = compression / filter / interlace = 0

  // Prepend a filter byte (0 = none) to every scanline.
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Minimal CRC-32 (PNG uses the standard IEEE polynomial).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

/** Render one splash image at the given device resolution. */
function renderSplash(width, height) {
  const rgb = Buffer.alloc(width * height * 3);
  // Target the wordmark to ~48% of the shorter screen edge, centred by its bbox.
  const scale = (Math.min(width, height) * 0.48) / BBOX.w;
  const cx = BBOX.x + BBOX.w / 2; // logical centre of the wordmark
  const cy = BBOX.y + BBOX.h / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 2×2 supersampling for smoother edges on the bars.
      let r = 0;
      let g = 0;
      let b = 0;
      for (const sy of [0.25, 0.75]) {
        for (const sx of [0.25, 0.75]) {
          const lx = (x + sx - width / 2) / scale + cx;
          const ly = (y + sy - height / 2) / scale + cy;
          const c = sampleColor(lx, ly);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (y * width + x) * 3;
      rgb[i] = Math.round(r / 4);
      rgb[i + 1] = Math.round(g / 4);
      rgb[i + 2] = Math.round(b / 4);
    }
  }
  return encodePng(width, height, rgb);
}

// Device px = CSS px × devicePixelRatio. Distinct device resolutions only —
// index.html points multiple media queries at each shared file.
const DEVICES = [
  [640, 1136], // iPhone SE (1st gen)
  [750, 1334], // iPhone 8 / SE 2·3
  [828, 1792], // iPhone XR / 11
  [1125, 2436], // iPhone X / XS / 11 Pro
  [1170, 2532], // iPhone 12 / 13 / 14
  [1179, 2556], // iPhone 14 Pro / 15 / 16
  [1206, 2622], // iPhone 16 Pro
  [1242, 2208], // iPhone 8 Plus
  [1242, 2688], // iPhone XS Max / 11 Pro Max
  [1284, 2778], // iPhone 12·13·14 Pro Max
  [1290, 2796], // iPhone 14·15 Pro Max / 15·16 Plus
  [1320, 2868], // iPhone 16 Pro Max
  [1536, 2048], // iPad 9.7"
  [1620, 2160], // iPad 10.2"
  [1640, 2360], // iPad Air 10.9"
  [1668, 2224], // iPad Pro 10.5"
  [1668, 2388], // iPad Pro 11" / Air
  [2048, 2732], // iPad Pro 12.9"
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [w, h] of DEVICES) {
  const png = renderSplash(w, h);
  const file = resolve(OUT_DIR, `splash-${w}x${h}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
console.log(`\nGenerated ${DEVICES.length} splash images.`);
