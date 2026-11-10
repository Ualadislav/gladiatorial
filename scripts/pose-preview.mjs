import fs from 'fs';
import { PNG } from 'pngjs';

const skeleton = JSON.parse(fs.readFileSync('prints/gladiator_hit_animation/loongbones-web_ske.json', 'utf8'));
const armature = skeleton.armature[0];
const bones = Object.fromEntries(armature.bone.map((bone) => [bone.name, bone]));
const skinSlots = Object.fromEntries(armature.skin[0].slot.map((slot) => [slot.name, slot.display[0]]));

function load(path) {
  return PNG.sync.read(fs.readFileSync(path));
}

const images = {
  'безруки': load('prints/безруки.png'),
  'рука справа': load('prints/рука справа.png'),
  'меч': load('prints/меч.png'),
};

function deg(value) {
  return (value * Math.PI) / 180;
}

function worldOf(boneName, anim = {}) {
  const chain = [];
  let name = boneName;
  while (name) {
    chain.push(bones[name]);
    name = bones[name].parent;
  }
  chain.reverse();
  let a = 1;
  let b = 0;
  let c = 0;
  let d = 1;
  let tx = 0;
  let ty = 0;
  for (const bone of chain) {
    const t = bone.transform ?? {};
    const rot = (t.skY ?? t.skX ?? 0) + (anim[bone.name] ?? 0);
    const sx = t.scX ?? 1;
    const sy = t.scY ?? 1;
    const lx = t.x ?? 0;
    const ly = t.y ?? 0;
    const r = deg(rot);
    const la = Math.cos(r) * sx;
    const lb = Math.sin(r) * sx;
    const lc = -Math.sin(r) * sy;
    const ld = Math.cos(r) * sy;
    const nx = a * lx + c * ly + tx;
    const ny = b * lx + d * ly + ty;
    const na = a * la + c * lb;
    const nb = b * la + d * lb;
    const nc = a * lc + c * ld;
    const nd = b * lc + d * ld;
    a = na;
    b = nb;
    c = nc;
    d = nd;
    tx = nx;
    ty = ny;
  }
  return { a, b, c, d, tx, ty };
}

function blit(target, image, matrix, scale) {
  const w = image.width;
  const h = image.height;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const si = (y * w + x) * 4;
      const alpha = image.data[si + 3];
      if (alpha < 16) continue;
      const lx = x - w / 2;
      const ly = h / 2 - y;
      const wx = matrix.a * lx + matrix.c * ly + matrix.tx;
      const wy = matrix.b * lx + matrix.d * ly + matrix.ty;
      const dx = Math.round(512 + wx * scale);
      const dy = Math.round(980 - wy * scale);
      if (dx < 0 || dy < 0 || dx >= target.width || dy >= target.height) continue;
      const di = (dy * target.width + dx) * 4;
      const srcA = alpha / 255;
      const dstA = target.data[di + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA <= 0) continue;
      for (let k = 0; k < 3; k += 1) {
        target.data[di + k] = Math.round((image.data[si + k] * srcA + target.data[di + k] * dstA * (1 - srcA)) / outA);
      }
      target.data[di + 3] = Math.round(outA * 255);
    }
  }
}

const order = ['безруки', 'рука справа', 'меч'];
const canvas = new PNG({ width: 1400, height: 1100 });
for (const name of order) {
  const display = skinSlots[name];
  const bone = worldOf(armature.slot.find((slot) => slot.name === name).parent);
  const t = display.transform;
  const rot = deg(t.skY ?? 0);
  const sx = t.scX ?? 1;
  const sy = t.scY ?? 1;
  const la = Math.cos(rot) * sx;
  const lb = Math.sin(rot) * sx;
  const lc = -Math.sin(rot) * sy;
  const ld = Math.cos(rot) * sy;
  const matrix = {
    a: bone.a * la + bone.c * lb,
    b: bone.b * la + bone.d * lb,
    c: bone.a * lc + bone.c * ld,
    d: bone.b * lc + bone.d * ld,
    tx: bone.a * t.x + bone.c * t.y + bone.tx,
    ty: bone.b * t.x + bone.d * t.y + bone.ty,
  };
  console.log(name, {
    tx: matrix.tx.toFixed(1),
    ty: matrix.ty.toFixed(1),
    rot: (Math.atan2(matrix.b, matrix.a) * 180 / Math.PI).toFixed(1),
  });
  blit(canvas, images[name], matrix, 0.72);
}
fs.mkdirSync('apps/web/public/fighters', { recursive: true });
fs.writeFileSync('apps/web/public/fighters/pose-preview.png', PNG.sync.write(canvas));
