import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const dir = process.argv[2];
const r = PNG.sync.read(readFileSync(`${dir}/reference.png`));
const a = PNG.sync.read(readFileSync(`${dir}/actual.png`));
if (r.width !== a.width || r.height !== a.height) {
  console.log('size mismatch', r.width, r.height, a.width, a.height);
  process.exit(0);
}
const boxes = [];
let total = 0;
let edge = 0;
const interior = [];
for (let y = 0; y < r.height; y += 1) {
  for (let x = 0; x < r.width; x += 1) {
    const o = (y * r.width + x) * 4;
    let d = false;
    for (let c = 0; c < 4; c += 1)
      if (r.data[o + c] !== a.data[o + c]) {
        d = true;
        break;
      }
    if (!d) continue;
    total += 1;
    const onEdge = x <= 2 || y <= 2 || x >= r.width - 3 || y >= r.height - 3;
    if (onEdge) edge += 1;
    else interior.push([x, y, r.data[o], r.data[o + 1], r.data[o + 2], a.data[o], a.data[o + 1], a.data[o + 2]]);
  }
}
console.log(`size ${r.width}x${r.height} total=${total} outerEdge(<=2px)=${edge} interior=${interior.length}`);
// cluster interior by 8px grid
const clusters = new Map();
for (const [x, y] of interior) {
  const k = `${Math.floor(x / 12) * 12},${Math.floor(y / 12) * 12}`;
  clusters.set(k, (clusters.get(k) || 0) + 1);
}
console.log(
  'interior clusters:',
  [...clusters.entries()]
    .sort((p, q) => q[1] - p[1])
    .slice(0, 12)
    .map(([k, n]) => `${k}:${n}`)
    .join(' '),
);
for (const s of interior.slice(0, 6)) console.log('  sample', s.join(','));
