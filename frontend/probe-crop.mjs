import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';

const [dir, x0, y0, w, h, scale] = [
  process.argv[2],
  Number(process.argv[3]),
  Number(process.argv[4]),
  Number(process.argv[5]),
  Number(process.argv[6]),
  Number(process.argv[7] ?? 8),
];
const OUT =
  '/private/tmp/claude-501/-Users-ok-Development-GitHub-go-mark-edit/3cd5f87b-d847-4af4-8701-1c6936dab110/scratchpad/';
for (const [name, file] of [
  ['ref', 'reference.png'],
  ['act', 'actual.png'],
]) {
  const img = PNG.sync.read(readFileSync(`${dir}/${file}`));
  const out = new PNG({ width: w * scale, height: h * scale });
  for (let y = 0; y < h * scale; y += 1) {
    for (let x = 0; x < w * scale; x += 1) {
      const sx = x0 + Math.floor(x / scale);
      const sy = y0 + Math.floor(y / scale);
      const so = (sy * img.width + sx) * 4;
      const o = (y * out.width + x) * 4;
      for (let c = 0; c < 4; c += 1) out.data[o + c] = img.data[so + c];
    }
  }
  writeFileSync(`${OUT}crop-${name}.png`, PNG.sync.write(out));
}
console.log('written');
