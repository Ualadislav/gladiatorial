import fs from 'fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const j = jpeg.decode(fs.readFileSync('prints/image (1).jpeg'), { useTArray: true, formatAsRGBA: true });
const w = j.width;
const h = j.height;
const src = j.data;
const bg = new Uint8Array(w * h);

function isLight(i) {
  const r = src[i];
  const g = src[i + 1];
  const b = src[i + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max > 218 && (max - min) < 22;
}

const stack = [];
function push(x, y) {
  const p = y * w + x;
  if (bg[p] || !isLight(p * 4)) return;
  bg[p] = 1;
  stack.push(p);
}
for (let x = 0; x < w; x += 1) {
  push(x, 0);
  push(x, h - 1);
}
for (let y = 0; y < h; y += 1) {
  push(0, y);
  push(w - 1, y);
}
while (stack.length) {
  const p = stack.pop();
  const x = p % w;
  const y = (p / w) | 0;
  if (x > 0) push(x - 1, y);
  if (x + 1 < w) push(x + 1, y);
  if (y > 0) push(x, y - 1);
  if (y + 1 < h) push(x, y + 1);
}

const seen = new Uint8Array(w * h);
const holes = [];
for (let y = 0; y < h; y += 1) {
  for (let x = 0; x < w; x += 1) {
    const p = y * w + x;
    if (bg[p] || seen[p] || !isLight(p * 4)) continue;
    const comp = [];
    const st = [p];
    seen[p] = 1;
    while (st.length) {
      const q = st.pop();
      comp.push(q);
      const qx = q % w;
      const qy = (q / w) | 0;
      const nbs = [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]];
      for (const [nx, ny] of nbs) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        if (seen[np] || bg[np] || !isLight(np * 4)) continue;
        seen[np] = 1;
        st.push(np);
      }
    }
    holes.push(comp.length);
    if (comp.length > 400) {
      for (const q of comp) bg[q] = 1;
    }
  }
}
holes.sort((a, b) => b - a);
console.log('top holes', holes.slice(0, 12));

const out = new PNG({ width: w, height: h });
let minx = w;
let miny = h;
let maxx = 0;
let maxy = 0;
let kept = 0;
for (let p = 0; p < w * h; p += 1) {
  const i = p * 4;
  if (bg[p]) {
    out.data[i + 3] = 0;
    continue;
  }
  out.data[i] = src[i];
  out.data[i + 1] = src[i + 1];
  out.data[i + 2] = src[i + 2];
  out.data[i + 3] = 255;
  const x = p % w;
  const y = (p / w) | 0;
  if (x < minx) minx = x;
  if (y < miny) miny = y;
  if (x > maxx) maxx = x;
  if (y > maxy) maxy = y;
  kept += 1;
}
console.log({ kept, minx, miny, maxx, maxy });
fs.mkdirSync('apps/web/public/fighters', { recursive: true });
fs.writeFileSync('apps/web/public/fighters/body-preview.png', PNG.sync.write(out));
