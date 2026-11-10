import fs from 'fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

function loadJpeg(path) {
  const j = jpeg.decode(fs.readFileSync(path), { useTArray: true, formatAsRGBA: true });
  return j;
}

const body = loadJpeg('prints/image (1).jpeg');
const full = loadJpeg('prints/image (1).jpg');
const w = body.width;
const h = body.height;

let minx = w;
let miny = h;
let maxx = 0;
let maxy = 0;
let count = 0;
for (let y = 0; y < h; y += 1) {
  for (let x = 0; x < w; x += 1) {
    const i = (y * w + x) * 4;
    const dr = Math.abs(body.data[i] - full.data[i]);
    const dg = Math.abs(body.data[i + 1] - full.data[i + 1]);
    const db = Math.abs(body.data[i + 2] - full.data[i + 2]);
    if (dr + dg + db > 40) {
      count += 1;
      if (x < minx) minx = x;
      if (y < miny) miny = y;
      if (x > maxx) maxx = x;
      if (y > maxy) maxy = y;
    }
  }
}
console.log({ count, minx, miny, maxx, maxy, bw: maxx - minx, bh: maxy - miny });

const arm = PNG.sync.read(fs.readFileSync('prints/рукасмечом.png'));
let ax0 = arm.width;
let ay0 = arm.height;
let ax1 = 0;
let ay1 = 0;
for (let y = 0; y < arm.height; y += 1) {
  for (let x = 0; x < arm.width; x += 1) {
    const a = arm.data[(y * arm.width + x) * 4 + 3];
    if (a > 20) {
      if (x < ax0) ax0 = x;
      if (y < ay0) ay0 = y;
      if (x > ax1) ax1 = x;
      if (y > ay1) ay1 = y;
    }
  }
}
console.log({ ax0, ay0, ax1, ay1, aw: ax1 - ax0, ah: ay1 - ay0 });

const pad = 8;
const cw = maxx - minx + 1 + pad * 2;
const ch = maxy - miny + 1 + pad * 2;
const preview = new PNG({ width: cw, height: ch });
for (let y = 0; y < ch; y += 1) {
  for (let x = 0; x < cw; x += 1) {
    const sx = minx - pad + x;
    const sy = miny - pad + y;
    const di = (y * cw + x) * 4;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const si = (sy * w + sx) * 4;
    preview.data[di] = full.data[si];
    preview.data[di + 1] = full.data[si + 1];
    preview.data[di + 2] = full.data[si + 2];
    preview.data[di + 3] = 255;
  }
}
fs.writeFileSync('apps/web/public/fighters/arm-region.jpg.png', PNG.sync.write(preview));

const aw = ax1 - ax0 + 1;
const ah = ay1 - ay0 + 1;
const armCrop = new PNG({ width: aw, height: ah });
for (let y = 0; y < ah; y += 1) {
  for (let x = 0; x < aw; x += 1) {
    const si = ((y + ay0) * arm.width + (x + ax0)) * 4;
    const di = (y * aw + x) * 4;
    armCrop.data[di] = arm.data[si];
    armCrop.data[di + 1] = arm.data[si + 1];
    armCrop.data[di + 2] = arm.data[si + 2];
    armCrop.data[di + 3] = arm.data[si + 3];
  }
}
fs.writeFileSync('apps/web/public/fighters/arm-crop.png', PNG.sync.write(armCrop));
