import fs from 'fs';
import { PNG } from 'pngjs';

function bounds(path) {
  const image = PNG.sync.read(fs.readFileSync(path));
  let minx = image.width;
  let miny = image.height;
  let maxx = 0;
  let maxy = 0;
  const rows = [];
  for (let y = 0; y < image.height; y += 1) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] > 30) {
        if (left < 0) left = x;
        right = x;
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (x > maxx) maxx = x;
        if (y > maxy) maxy = y;
      }
    }
    if (left >= 0 && rows.length < 8) rows.push({ y, left, right, mid: Math.round((left + right) / 2) });
  }
  return { minx, miny, maxx, maxy, top: rows };
}

console.log('arm', bounds('prints/рука справа.png'));
console.log('sword', bounds('prints/меч.png'));
console.log('body', bounds('prints/безруки.png'));
