/**
 * `npm run icons` — regenerate the PWA icons in public/icons.
 *
 * Pure geometry, no text: a receipt with a torn bottom edge and three ruled
 * lines, which is the app's vernacular (BUILD_GUIDE 5) and rasterises
 * identically everywhere. Rendering a glyph would depend on whatever fonts
 * the build machine happens to have.
 *
 * Android's install prompt wants a real 192px PNG, so these are generated
 * rather than shipped as SVG.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const INK = '#16181D';
const PAPER = '#FBFAF7';
const BIRR = '#1B7A5A';

/** `inset` leaves room for Android's maskable safe zone (the outer 10%). */
function receiptSvg(size: number, inset: number, background: string): string {
  const s = size;
  const w = s * (1 - inset * 2);
  const x = s * inset;

  // Receipt body occupies the middle, with a torn zig-zag along the bottom.
  const bodyW = w * 0.62;
  const bodyH = w * 0.78;
  const bodyX = x + (w - bodyW) / 2;
  const bodyY = x + (w - bodyH) / 2;

  const teeth = 6;
  const toothW = bodyW / teeth;
  const toothH = bodyH * 0.07;

  let tear = `M ${bodyX} ${bodyY + bodyH - toothH}`;
  for (let i = 0; i < teeth; i += 1) {
    const left = bodyX + i * toothW;
    tear += ` L ${left + toothW / 2} ${bodyY + bodyH} L ${left + toothW} ${bodyY + bodyH - toothH}`;
  }
  tear += ` L ${bodyX + bodyW} ${bodyY} L ${bodyX} ${bodyY} Z`;

  const lineX = bodyX + bodyW * 0.16;
  const lineW = bodyW * 0.68;
  const lineH = Math.max(2, bodyH * 0.045);
  const gap = bodyH * 0.15;
  const firstY = bodyY + bodyH * 0.2;

  const rules = [0, 1, 2]
    .map((i) => {
      const width = i === 2 ? lineW * 0.55 : lineW;
      return `<rect x="${lineX}" y="${firstY + i * gap}" width="${width}" height="${lineH}" rx="${lineH / 2}" fill="${INK}" opacity="${i === 2 ? 1 : 0.75}"/>`;
    })
    .join('');

  // The total line, in note-green: this app is about money.
  const totalY = firstY + 3 * gap + bodyH * 0.06;
  const total = `<rect x="${lineX}" y="${totalY}" width="${lineW * 0.8}" height="${lineH * 1.6}" rx="${lineH}" fill="${BIRR}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="${background}"/>
  <path d="${tear}" fill="${PAPER}"/>
  ${rules}
  ${total}
</svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, inset: 0.08, background: INK },
  { file: 'icon-512.png', size: 512, inset: 0.08, background: INK },
  // Maskable: Android crops to a circle, so everything important stays inside
  // the middle 80%.
  { file: 'icon-maskable-512.png', size: 512, inset: 0.18, background: INK },
  { file: 'apple-icon.png', size: 180, inset: 0.08, background: INK },
];

await mkdir('public/icons', { recursive: true });

for (const target of targets) {
  const svg = receiptSvg(target.size, target.inset, target.background);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(`public/icons/${target.file}`, png);
  console.log(`public/icons/${target.file}  ${target.size}x${target.size}  ${png.length} bytes`);
}

console.log('\nIcons regenerated.');
