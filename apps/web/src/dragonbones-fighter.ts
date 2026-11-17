import Phaser from 'phaser';
// dmg_taken = тот же риг, что gladiarot_all, плюс анимация taking_dmg.
import spineData from '../../../prints/gladiator_hit_animation/dmg_taken/dmg_taken_ske.json';
import headUrl from '../../../after_PS/голова.png';
import leftThighUrl from '../../../after_PS/лево_бедро.png';
import leftShinUrl from '../../../after_PS/лево_голень.png';
import leftFistSwordUrl from '../../../after_PS/лево_кулак_меч.png';
import leftShoulderUrl from '../../../after_PS/лево_плечо.png';
import leftForearmUrl from '../../../after_PS/лево_предплечЬе.png';
import rightFistUrl from '../../../after_PS/право кулак.png';
import rightThighUrl from '../../../after_PS/право_бедро.png';
import rightShinUrl from '../../../after_PS/право_голень.png';
import rightShoulderUrl from '../../../after_PS/право_плечо.png';
import rightForearmUrl from '../../../after_PS/предплечъе левое.png';
import bodyUrl from '../../../after_PS/тело.png';
import heaterShieldUrl from '../../../prints/rig/shield/shield-heater.png';
import bucklerShieldUrl from '../../../prints/rig/shield/shield-buckler.png';

/** Spine 3.8 export → наша рабочая поза: y' = -y, angle' = -angle. */

type SpineBone = {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
};

type SpineSlot = {
  name: string;
  bone: string;
  attachment?: string;
};

type SpineAttachment = {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width: number;
  height: number;
};

type SpineRotateKey = { time?: number; angle?: number };
type SpineTranslateKey = { time?: number; x?: number; y?: number };

type SpineBoneTimeline = {
  rotate?: SpineRotateKey[];
  translate?: SpineTranslateKey[];
};

type SpineAnimation = {
  bones?: Record<string, SpineBoneTimeline>;
};

type SpineSkeleton = {
  bones: SpineBone[];
  slots: SpineSlot[];
  skins: Array<{
    name: string;
    attachments: Record<string, Record<string, SpineAttachment>>;
  }>;
  animations: Record<string, SpineAnimation>;
};

type BoneRest = {
  x: number;
  y: number;
  angle: number;
  scaleX: number;
  scaleY: number;
};

type AnimRotateKey = { time: number; angle: number };
type AnimTranslateKey = { time: number; x: number; y: number };

type CompiledAnimation = {
  name: string;
  duration: number;
  rotate: Map<string, AnimRotateKey[]>;
  translate: Map<string, AnimTranslateKey[]>;
};

export const GLADIATOR_PART_KEY_PREFIX = 'gladiator-part:';

export const ANIM_LOW_HIT = 'low_hit';
export const ANIM_HARD_HIT = 'hard_hit';
export const ANIM_TAKING_DMG = 'taking_dmg';
/**
 * В ske имена перепутаны с содержимым:
 * `blockCounteAtack` — короткий чистый блок рукой;
 * `block` — блок + ответный взмах мечом.
 */
export const ANIM_BLOCK = 'blockCounteAtack';
export const ANIM_COUNTER = 'block';

/** Слоты → принты after_PS. */
export const GLADIATOR_PART_URLS: Record<string, string> = {
  лево_предплечЬе: leftForearmUrl,
  лево_кулак_меч: leftFistSwordUrl,
  лево_плечо: leftShoulderUrl,
  лево_голень: leftShinUrl,
  лево_бедро: leftThighUrl,
  тело: bodyUrl,
  право_голень: rightShinUrl,
  право_бедро: rightThighUrl,
  голова: headUrl,
  'право кулак': rightFistUrl,
  право_плечо: rightShoulderUrl,
  'предплечъе левое': rightForearmUrl,
};

export function gladiatorPartKey(frameName: string, skinId = 'default'): string {
  return skinId === 'default'
    ? `${GLADIATOR_PART_KEY_PREFIX}${frameName}`
    : `${GLADIATOR_PART_KEY_PREFIX}${skinId}:${frameName}`;
}

export type ShieldKind = 'heater' | 'buckler';

export type ArmatureCreateOptions = {
  tint?: number;
  skinId?: string;
  partUrls?: Record<string, string>;
  scaleMul?: number;
  /** Щит в свободной руке (ПравоКулак). false — без щита. */
  withShield?: boolean | ShieldKind;
};

export const HEATER_TEXTURE_KEY = 'gladiator-shield-heater';
export const BUCKLER_TEXTURE_KEY = 'gladiator-shield-buckler';
export const HEATER_URL = heaterShieldUrl;
export const BUCKLER_URL = bucklerShieldUrl;
/** @deprecated alias — heater игрока */
export const SHIELD_TEXTURE_KEY = HEATER_TEXTURE_KEY;
export const SHIELD_URL = HEATER_URL;

export const gladiatorRigScale = 0.135;
/** Ступни на y=0 контейнера (после конвертации Spine → наша система). */
export const gladiatorFootOffsetY = -806;

const spine = spineData as SpineSkeleton;

function n(value: number | undefined, fallback = 0): number {
  return value ?? fallback;
}

function compileAnimation(name: string, source: SpineAnimation): CompiledAnimation {
  const rotate = new Map<string, AnimRotateKey[]>();
  const translate = new Map<string, AnimTranslateKey[]>();
  let duration = 0;

  for (const [boneName, tracks] of Object.entries(source.bones ?? {})) {
    if (tracks.rotate?.length) {
      const keys = tracks.rotate.map((key) => {
        const time = n(key.time);
        duration = Math.max(duration, time);
        return { time, angle: -n(key.angle) };
      });
      rotate.set(boneName, keys);
    }
    if (tracks.translate?.length) {
      const keys = tracks.translate.map((key) => {
        const time = n(key.time);
        duration = Math.max(duration, time);
        return { time, x: n(key.x), y: -n(key.y) };
      });
      translate.set(boneName, keys);
    }
  }

  return { name, duration, rotate, translate };
}

const animations = new Map<string, CompiledAnimation>(
  Object.entries(spine.animations).map(([name, anim]) => [name, compileAnimation(name, anim)]),
);

function requireAnim(name: string): CompiledAnimation {
  const anim = animations.get(name);
  if (!anim) throw new Error(`Animation "${name}" is missing in gladiarot_all.`);
  return anim;
}

const lowHit = requireAnim(ANIM_LOW_HIT);
const hardHit = requireAnim(ANIM_HARD_HIT);
const takingDmg = requireAnim(ANIM_TAKING_DMG);
const blockAnim = requireAnim(ANIM_BLOCK);
const counterAnim = requireAnim(ANIM_COUNTER);

export const lowHitDurationMs = lowHit.duration * 1000;
export const lowHitImpactMs = 800;
export const hardHitDurationMs = hardHit.duration * 1000;
export const hardHitImpactMs = 400;
export const takingDmgDurationMs = takingDmg.duration * 1000;
export const blockDurationMs = blockAnim.duration * 1000;
export const blockActiveMs = 700;
export const counterDurationMs = counterAnim.duration * 1000;
/** Ответный взмах мечом в анимации `block` около 1.17 с. */
export const counterImpactMs = 1170;
export const counterGuardMs = 800;

type SlotBinding = {
  image: Phaser.GameObjects.Image;
  bone: Phaser.GameObjects.Container;
  localX: number;
  localY: number;
  localAngle: number;
  localScaleX: number;
  localScaleY: number;
  /** Щит: позиция с кулака, угол стабильный (без скачков 180°). */
  mode?: 'shield';
  /** Кость для ориентации щита (предплечье). */
  orientBone?: Phaser.GameObjects.Container;
  /** Непрерывный угол в space — чтобы не прыгал через ±π. */
  smoothRot?: number;
};

/**
 * Порядок отрисовки (сзади → спереди):
 * рука с мечом и дальняя (левая) нога за корпусом;
 * правая рука без меча — поверх всего.
 */
const DRAW_ORDER = [
  // рука с мечом и дальняя нога — строго за корпусом
  'лево_плечо',
  'лево_предплечЬе',
  'лево_кулак_меч',
  'лево_голень',
  'лево_бедро',
  'тело',
  'право_голень',
  'право_бедро',
  'голова',
  // правая рука без меча — поверх всего (плечо → предплечье → кулак)
  'право_плечо',
  'предплечъе левое',
  // щит вставляется кодом перед кулаком
  'право кулак',
] as const;

export type GladiatorArmature = {
  root: Phaser.GameObjects.Container;
  space: Phaser.GameObjects.Container;
  bones: Map<string, Phaser.GameObjects.Container>;
  images: Phaser.GameObjects.Image[];
  slots: SlotBinding[];
  rest: Map<string, BoneRest>;
  tweenProxies: Array<Record<string, number>>;
  /** Отдельные proxy пружинного idle — не смешиваем с боевыми твинами. */
  idleProxies: Array<Record<string, number>>;
  /** Растёт при старте/стопе анимации — отменяет отложенный impact. */
  actionEpoch: number;
  /** Растёт при стопе idle — отменяет отложенные циклы дыхания. */
  idleEpoch: number;
  impactTimer: Phaser.Time.TimerEvent | null;
  playing: boolean;
  idling: boolean;
};

export function ensureGladiatorPartsLoaded(
  scene: Phaser.Scene,
  partUrls: Record<string, string> = GLADIATOR_PART_URLS,
  skinId = 'default',
): void {
  for (const name of Object.keys(partUrls)) {
    if (!scene.textures.exists(gladiatorPartKey(name, skinId))) {
      throw new Error(`Gladiator part texture missing: ${skinId}/${name}`);
    }
  }
}

function applyBoneRest(bone: Phaser.GameObjects.Container, rest: BoneRest): void {
  bone.setPosition(rest.x, rest.y);
  bone.rotation = Phaser.Math.DegToRad(rest.angle);
  bone.setScale(rest.scaleX, rest.scaleY);
}

/** Угол кости относительно armature.space (сумма локальных углов по цепочке). */
function boneAngleInSpace(
  bone: Phaser.GameObjects.Container,
  space: Phaser.GameObjects.Container,
): number {
  let angle = 0;
  let node: Phaser.GameObjects.Container | null = bone;
  while (node && node !== space) {
    angle += node.rotation;
    const parentContainer: Phaser.GameObjects.Container | null =
      node.parentContainer instanceof Phaser.GameObjects.Container
        ? node.parentContainer
        : null;
    node = parentContainer;
  }
  return angle;
}

/** Картинки в плоском display — слои не зависят от дерева костей. */
export function syncArmatureDisplays(armature: GladiatorArmature): void {
  const boneWorld = new Phaser.GameObjects.Components.TransformMatrix();
  const local = new Phaser.GameObjects.Components.TransformMatrix();
  const spaceWorld = new Phaser.GameObjects.Components.TransformMatrix();
  const spaceInverse = new Phaser.GameObjects.Components.TransformMatrix();
  const composed = new Phaser.GameObjects.Components.TransformMatrix();
  const result = new Phaser.GameObjects.Components.TransformMatrix();

  armature.space.getWorldTransformMatrix(spaceWorld);
  spaceInverse.copyFrom(spaceWorld).invert();

  for (const slot of armature.slots) {
    if (slot.mode === 'shield') {
      // Позиция — с кулака (offset без локального поворота, чтобы не крутило точку).
      slot.bone.getWorldTransformMatrix(boneWorld);
      local.applyITRS(slot.localX, slot.localY, 0, 1, 1);
      boneWorld.multiply(local, composed);
      spaceInverse.multiply(composed, result);
      slot.image.setPosition(result.tx, result.ty);

      // Угол — с предплечья + фиксированный вынос лица щита.
      // Без матричной декомпозиции: она на блоке даёт скачки ±180°.
      const orient = slot.orientBone ?? slot.bone;
      let rot = boneAngleInSpace(orient, armature.space)
        + Phaser.Math.DegToRad(slot.localAngle);
      if (slot.smoothRot != null) {
        rot = slot.smoothRot + Phaser.Math.Angle.Wrap(rot - slot.smoothRot);
      }
      slot.smoothRot = rot;
      slot.image.setRotation(rot);
      slot.image.setScale(slot.localScaleX, slot.localScaleY);
      continue;
    }

    slot.bone.getWorldTransformMatrix(boneWorld);
    local.applyITRS(
      slot.localX,
      slot.localY,
      Phaser.Math.DegToRad(slot.localAngle),
      slot.localScaleX,
      slot.localScaleY,
    );
    boneWorld.multiply(local, composed);
    spaceInverse.multiply(composed, result);
    slot.image.setPosition(result.tx, result.ty);
    slot.image.setRotation(result.rotation);
    slot.image.setScale(result.scaleX, result.scaleY);
  }
}

/**
 * Собирает бойца из Spine gladiarot_all + принтов (after_PS или enemies/).
 * Кости анимируются отдельно, слоты рисуются плоским списком.
 */
export function createGladiatorArmature(
  scene: Phaser.Scene,
  x: number,
  y: number,
  direction: number,
  options: ArmatureCreateOptions | number = {},
): GladiatorArmature {
  const opts: ArmatureCreateOptions = typeof options === 'number'
    ? { tint: options }
    : options;
  const tint = opts.tint ?? 0xffffff;
  const skinId = opts.skinId ?? 'default';
  const partUrls = opts.partUrls ?? GLADIATOR_PART_URLS;
  const scaleMul = opts.scaleMul ?? 1;
  const shieldKind: ShieldKind | null = opts.withShield === false
    ? null
    : opts.withShield === 'buckler'
      ? 'buckler'
      : opts.withShield === 'heater' || opts.withShield === true || opts.withShield === undefined
        ? 'heater'
        : null;
  const shieldTextureKey = shieldKind === 'buckler' ? BUCKLER_TEXTURE_KEY : HEATER_TEXTURE_KEY;

  ensureGladiatorPartsLoaded(scene, partUrls, skinId);
  if (shieldKind && !scene.textures.exists(shieldTextureKey)) {
    throw new Error(`Shield texture missing (${shieldKind}). Preload HEATER_URL / BUCKLER_URL first.`);
  }

  const bones = new Map<string, Phaser.GameObjects.Container>();
  const rest = new Map<string, BoneRest>();
  const images: Phaser.GameObjects.Image[] = [];
  const slots: SlotBinding[] = [];

  const root = scene.add.container(x, y);
  const space = scene.add.container(0, gladiatorFootOffsetY);
  const display = scene.add.container(0, 0);
  root.add(space);
  space.add(display);

  for (const bone of spine.bones) {
    const node = scene.add.container(0, 0);
    const pose: BoneRest = {
      x: n(bone.x),
      y: -n(bone.y),
      angle: -n(bone.rotation),
      scaleX: n(bone.scaleX, 1),
      scaleY: n(bone.scaleY, 1),
    };
    applyBoneRest(node, pose);
    rest.set(bone.name, pose);
    bones.set(bone.name, node);
  }

  for (const bone of spine.bones) {
    const node = bones.get(bone.name);
    if (!node) continue;
    if (!bone.parent) {
      space.add(node);
      continue;
    }
    const parent = bones.get(bone.parent);
    if (!parent) throw new Error(`Bone parent "${bone.parent}" is missing for "${bone.name}".`);
    parent.add(node);
  }

  // Кости пустые (только FK). display — плоский список слотов сверху.
  space.bringToTop(display);

  const attachments = spine.skins[0]?.attachments ?? {};
  const slotByAttachment = new Map<string, { bone: string; display: SpineAttachment }>();
  for (const slot of spine.slots) {
    const attachmentName = slot.attachment;
    if (!attachmentName) continue;
    const displayData = attachments[slot.name]?.[attachmentName];
    if (!displayData) continue;
    slotByAttachment.set(attachmentName, { bone: slot.bone, display: displayData });
  }

  for (const attachmentName of DRAW_ORDER) {
    const entry = slotByAttachment.get(attachmentName);
    if (!entry) throw new Error(`Draw-order slot missing: ${attachmentName}`);
    if (!partUrls[attachmentName]) {
      throw new Error(`No print for "${attachmentName}" (skin ${skinId}).`);
    }
    const bone = bones.get(entry.bone);
    if (!bone) throw new Error(`Slot bone "${entry.bone}" is missing.`);
    const textureKey = gladiatorPartKey(attachmentName, skinId);
    const image = scene.add.image(0, 0, textureKey);
    image.setOrigin(0.5, 0.5);
    if (tint !== 0xffffff) image.setTint(tint);
    // Принты enemies/ другого размера, чем слот скелета — подгоняем
    // под width/height из ske, иначе кости «рвутся».
    const frame = image.frame;
    const fitX = entry.display.width / Math.max(1, frame.width);
    const fitY = entry.display.height / Math.max(1, frame.height);
    display.add(image);
    images.push(image);
    slots.push({
      image,
      bone,
      localX: n(entry.display.x),
      localY: -n(entry.display.y),
      localAngle: -n(entry.display.rotation),
      localScaleX: n(entry.display.scaleX, 1) * fitX,
      localScaleY: n(entry.display.scaleY, 1) * fitY,
    });
  }

  // Щит 3/4 — позиция на кулаке, угол с предплечья (плавно с рукой).
  if (shieldKind) {
    const shieldBone = bones.get('ПравоКулак');
    const forearm = bones.get('ПредплъечьеПраво') ?? shieldBone;
    if (!shieldBone) throw new Error('Shield bone ПравоКулак is missing.');
    const shield = scene.add.image(0, 0, shieldTextureKey);
    const isBuckler = shieldKind === 'buckler';
    shield.setOrigin(isBuckler ? 0.5 : 0.48, isBuckler ? 0.52 : 0.55);
    if (tint !== 0xffffff) shield.setTint(tint);
    display.add(shield);
    images.push(shield);
    slots.push({
      image: shield,
      bone: shieldBone,
      orientBone: forearm,
      mode: 'shield',
      localX: isBuckler ? 28 : 30,
      localY: isBuckler ? 2 : 4,
      // Лицом к сопернику/игроку относительно предплечья.
      localAngle: isBuckler ? -48 : -52,
      localScaleX: isBuckler ? 0.42 : 0.52,
      localScaleY: isBuckler ? 0.42 : 0.52,
    });
  }

  const armature: GladiatorArmature = {
    root,
    space,
    bones,
    images,
    slots,
    rest,
    tweenProxies: [],
    idleProxies: [],
    actionEpoch: 0,
    idleEpoch: 0,
    impactTimer: null,
    playing: false,
    idling: false,
  };

  syncArmatureDisplays(armature);
  scene.events.on('update', () => {
    if (root.active) syncArmatureDisplays(armature);
  });

  const scale = gladiatorRigScale * scaleMul;
  root.setScale(direction * scale, scale);
  root.setData('homeX', x);
  root.setData('homeY', y);

  // Пружинный idle сразу после сборки — бойцы «живые» ещё до первого удара.
  startIdleSpring(scene, armature);

  return armature;
}

/** Останавливает idle, оставляя кости в текущей позе (для blend в атаку/блок). */
function stopIdleSpring(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
): void {
  armature.idleEpoch += 1;
  armature.idling = false;
  for (const proxy of armature.idleProxies) scene.tweens.killTweensOf(proxy);
  armature.idleProxies = [];
}

/**
 * Лёгкий cartoon-idle без подпрыгивания:
 * пружина через сгиб колен (бедро + голень), плюс тихое дыхание корпуса.
 * Root X/Y не трогаем — иначе получается hop.
 */
export function startIdleSpring(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
): void {
  if (!armature.root.active || armature.playing || armature.idling) return;
  stopIdleSpring(scene, armature);
  armature.idling = true;
  const epoch = armature.idleEpoch;

  const body = armature.bones.get('тело');
  const head = armature.bones.get('голова');
  const leftShoulder = armature.bones.get('лево_плечо');
  const rightShoulder = armature.bones.get('право_плечо');
  const leftThigh = armature.bones.get('Левая_нога');
  const rightThigh = armature.bones.get('ПраваяНога');
  const leftShin = armature.bones.get('леваяГолень');
  const rightShin = armature.bones.get('право_голень');

  const bodyRest = armature.rest.get('тело');
  const headRest = armature.rest.get('голова');
  const leftShoulderRest = armature.rest.get('лево_плечо');
  const rightShoulderRest = armature.rest.get('право_плечо');
  const leftThighRest = armature.rest.get('Левая_нога');
  const rightThighRest = armature.rest.get('ПраваяНога');
  const leftShinRest = armature.rest.get('леваяГолень');
  const rightShinRest = armature.rest.get('право_голень');
  if (!body || !bodyRest) return;

  const stillIdle = (): boolean => (
    epoch === armature.idleEpoch && armature.idling && !armature.playing && armature.root.active
  );

  /** Малый сгиб колена: бедро +deg, голень −deg (ступни остаются у земли). */
  const THIGH_FLEX = 5.2;
  const SHIN_FLEX = -4.4;
  const THIGH_OVERSHOOT = -1.1;
  const SHIN_OVERSHOOT = 0.9;

  type KneeTrack = {
    thigh: Phaser.GameObjects.Container;
    shin: Phaser.GameObjects.Container;
    thighRest: number;
    shinRest: number;
    state: Record<string, number>;
  };

  const knees: KneeTrack[] = [];
  if (leftThigh && leftShin && leftThighRest && leftShinRest) {
    knees.push({
      thigh: leftThigh,
      shin: leftShin,
      thighRest: leftThighRest.angle,
      shinRest: leftShinRest.angle,
      state: {
        thigh: Phaser.Math.RadToDeg(leftThigh.rotation),
        shin: Phaser.Math.RadToDeg(leftShin.rotation),
      },
    });
  }
  if (rightThigh && rightShin && rightThighRest && rightShinRest) {
    knees.push({
      thigh: rightThigh,
      shin: rightShin,
      thighRest: rightThighRest.angle,
      shinRest: rightShinRest.angle,
      state: {
        thigh: Phaser.Math.RadToDeg(rightThigh.rotation),
        shin: Phaser.Math.RadToDeg(rightShin.rotation),
      },
    });
  }

  for (const knee of knees) armature.idleProxies.push(knee.state);

  const applyKnees = (): void => {
    for (const knee of knees) {
      knee.thigh.rotation = Phaser.Math.DegToRad(knee.state.thigh);
      knee.shin.rotation = Phaser.Math.DegToRad(knee.state.shin);
    }
  };

  const runKneeSpring = (): void => {
    if (!stillIdle() || knees.length === 0) return;
    // 1) Сжатие — вес в колени.
    for (const knee of knees) {
      scene.tweens.add({
        targets: knee.state,
        thigh: knee.thighRest + THIGH_FLEX,
        shin: knee.shinRest + SHIN_FLEX,
        duration: 480,
        ease: 'Sine.InOut',
        onUpdate: applyKnees,
      });
    }
    scene.time.delayedCall(480, () => {
      if (!stillIdle()) return;
      // 2) Разгибание с крошечным пружинным overshoot (без root hop).
      let pending = knees.length;
      for (const knee of knees) {
        scene.tweens.add({
          targets: knee.state,
          thigh: knee.thighRest + THIGH_OVERSHOOT,
          shin: knee.shinRest + SHIN_OVERSHOOT,
          duration: 420,
          ease: 'Back.Out',
          onUpdate: applyKnees,
          onComplete: () => {
            pending -= 1;
            if (pending > 0 || !stillIdle()) return;
            // 3) Мягко в нейтраль.
            let settleLeft = knees.length;
            for (const knee of knees) {
              scene.tweens.add({
                targets: knee.state,
                thigh: knee.thighRest,
                shin: knee.shinRest,
                duration: 260,
                ease: 'Sine.Out',
                onUpdate: applyKnees,
                onComplete: () => {
                  settleLeft -= 1;
                  if (settleLeft > 0 || !stillIdle()) return;
                  scene.time.delayedCall(90, () => {
                    if (stillIdle()) runKneeSpring();
                  });
                },
              });
            }
          },
        });
      }
    });
  };
  if (knees.length) runKneeSpring();

  // Тихое дыхание корпуса (меньше, чем раньше — без «качания»).
  const torso: Record<string, number> = { deg: Phaser.Math.RadToDeg(body.rotation) };
  armature.idleProxies.push(torso);
  scene.tweens.add({
    targets: torso,
    deg: bodyRest.angle + 1.4,
    duration: 1100,
    ease: 'Sine.InOut',
    yoyo: true,
    repeat: -1,
    onUpdate: () => {
      if (!stillIdle()) return;
      body.rotation = Phaser.Math.DegToRad(torso.deg);
    },
  });

  if (head && headRest) {
    const nod: Record<string, number> = { deg: Phaser.Math.RadToDeg(head.rotation) };
    armature.idleProxies.push(nod);
    scene.tweens.add({
      targets: nod,
      deg: headRest.angle - 1.0,
      duration: 1100,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
      delay: 140,
      onUpdate: () => {
        if (!stillIdle()) return;
        head.rotation = Phaser.Math.DegToRad(nod.deg);
      },
    });
  }

  if (leftShoulder && leftShoulderRest) {
    const sway: Record<string, number> = { deg: Phaser.Math.RadToDeg(leftShoulder.rotation) };
    armature.idleProxies.push(sway);
    scene.tweens.add({
      targets: sway,
      deg: leftShoulderRest.angle - 1.8,
      duration: 1200,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
      delay: 80,
      onUpdate: () => {
        if (!stillIdle()) return;
        leftShoulder.rotation = Phaser.Math.DegToRad(sway.deg);
      },
    });
  }
  if (rightShoulder && rightShoulderRest) {
    const sway: Record<string, number> = { deg: Phaser.Math.RadToDeg(rightShoulder.rotation) };
    armature.idleProxies.push(sway);
    scene.tweens.add({
      targets: sway,
      deg: rightShoulderRest.angle + 1.5,
      duration: 1200,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
      delay: 200,
      onUpdate: () => {
        if (!stillIdle()) return;
        rightShoulder.rotation = Phaser.Math.DegToRad(sway.deg);
      },
    });
  }
}

export function stopArmatureAnimation(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
): void {
  // Сначала гасим idle, не сбрасывая позу — атака/блок блендятся из текущего дыхания.
  stopIdleSpring(scene, armature);
  for (const bone of armature.bones.values()) scene.tweens.killTweensOf(bone);
  for (const proxy of armature.tweenProxies) scene.tweens.killTweensOf(proxy);
  armature.tweenProxies = [];
  if (armature.impactTimer) {
    armature.impactTimer.remove(false);
    armature.impactTimer = null;
  }
  armature.actionEpoch += 1;
  armature.playing = false;
}

/** Мягкий возврат в rest вместо мгновенного snap (убирает «каменный» обрыв). */
const SETTLE_MS = 110;
/** Короткий довод костей, которых нет в боевом клипе, из idle-оффсета в rest. */
const IDLE_HANDOFF_MS = 100;

/** Обрыв текущей атаки/анимации с плавным возвратом в rest + idle. */
export function interruptArmature(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
): void {
  stopArmatureAnimation(scene, armature);
  settleArmatureToRest(scene, armature, SETTLE_MS);
}

export function resetArmaturePose(armature: GladiatorArmature): void {
  for (const [name, bone] of armature.bones) {
    const pose = armature.rest.get(name);
    if (pose) applyBoneRest(bone, pose);
  }
  // Не сбрасываем smoothRot — иначе щит на конце анимации дёргается.
  syncArmatureDisplays(armature);
}

/** Плавный довод костей к rest-позе (Cubic.Out), затем пружинный idle. */
function settleArmatureToRest(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
  durationMs: number,
  onComplete?: () => void,
): void {
  const epoch = armature.actionEpoch;
  let pending = 0;

  const finishSettle = (): void => {
    if (epoch !== armature.actionEpoch) return;
    resetArmaturePose(armature);
    onComplete?.();
    if (epoch === armature.actionEpoch && !armature.playing) {
      startIdleSpring(scene, armature);
    }
  };

  const done = (): void => {
    if (epoch !== armature.actionEpoch) return;
    pending -= 1;
    if (pending > 0) return;
    finishSettle();
  };

  for (const [name, bone] of armature.bones) {
    const pose = armature.rest.get(name);
    if (!pose) continue;
    const curDeg = Phaser.Math.RadToDeg(bone.rotation);
    const needAngle = Math.abs(curDeg - pose.angle) > 0.2;
    const needPos = Math.abs(bone.x - pose.x) > 0.4 || Math.abs(bone.y - pose.y) > 0.4;
    if (!needAngle && !needPos) continue;

    pending += 1;
    const state: Record<string, number> = {};
    const tweenTo: Record<string, number> = {};
    if (needAngle) {
      state.deg = curDeg;
      tweenTo.deg = pose.angle;
    }
    if (needPos) {
      state.x = bone.x;
      state.y = bone.y;
      tweenTo.x = pose.x;
      tweenTo.y = pose.y;
    }
    armature.tweenProxies.push(state);
    scene.tweens.add({
      targets: state,
      ...tweenTo,
      duration: durationMs,
      ease: 'Cubic.Out',
      onUpdate: () => {
        if (state.deg !== undefined) bone.rotation = Phaser.Math.DegToRad(state.deg);
        if (state.x !== undefined) bone.setX(state.x);
        if (state.y !== undefined) bone.setY(state.y);
      },
      onComplete: done,
    });
  }

  if (pending === 0) {
    finishSettle();
  }
}

/**
 * Сегментный easing для редких Spine-ключей без curve:
 * уход от rest — разгон (удар/замах), возврат — торможение, иначе мягкий InOut.
 */
function segmentEase(
  from: Record<string, number>,
  to: Record<string, number>,
  restAngle?: number,
): string {
  if (from.deg !== undefined && to.deg !== undefined && restAngle !== undefined) {
    const fromDev = Math.abs(from.deg - restAngle);
    const toDev = Math.abs(to.deg - restAngle);
    if (toDev > fromDev + 0.5) return 'Cubic.In';
    if (fromDev > toDev + 0.5) return 'Cubic.Out';
  }
  if (from.x !== undefined || from.y !== undefined) {
    const fromDist = Math.hypot(from.x ?? 0, from.y ?? 0);
    const toDist = Math.hypot(to.x ?? 0, to.y ?? 0);
    // translate в скелете — абсолютные координаты кости, не дельта от rest;
    // для чистого x/y без angle используем Sine.InOut.
    if (Math.abs(toDist - fromDist) > 8) return 'Sine.InOut';
  }
  return 'Sine.InOut';
}

/**
 * Углы твиним через proxy с полем `deg` (не `angle`) —
 * иначе Phaser включает shortest-path и рука крутит полный оборот
 * вместо дуги блока снизу → вверх → вперёд и обратно.
 */
function tweenKeyframes(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
  bone: Phaser.GameObjects.Container,
  keys: Array<{ time: number; props: Record<string, number> }>,
  onSegmentEnd?: (endedAt: number) => void,
  onTrackDone?: () => void,
  options: { fromCurrent?: boolean; restAngle?: number; handoffEase?: string } = {},
): void {
  const play = (index: number): void => {
    const current = keys[index];
    const next = keys[index + 1];
    if (!current) {
      onTrackDone?.();
      return;
    }

    const blendFromPose = Boolean(options.fromCurrent) && index === 0;
    if (!blendFromPose) {
      if (current.props.angle !== undefined) {
        bone.rotation = Phaser.Math.DegToRad(current.props.angle);
      }
      if (current.props.x !== undefined) bone.setX(current.props.x);
      if (current.props.y !== undefined) bone.setY(current.props.y);
      syncArmatureDisplays(armature);
    }

    if (!next) {
      onTrackDone?.();
      return;
    }
    const duration = Math.max(0, (next.time - current.time) * 1000);
    const state: Record<string, number> = {};
    const tweenTo: Record<string, number> = {};
    if (next.props.angle !== undefined) {
      state.deg = blendFromPose
        ? Phaser.Math.RadToDeg(bone.rotation)
        : (current.props.angle ?? Phaser.Math.RadToDeg(bone.rotation));
      tweenTo.deg = next.props.angle;
    }
    if (next.props.x !== undefined) {
      state.x = blendFromPose ? bone.x : (current.props.x ?? bone.x);
      tweenTo.x = next.props.x;
    }
    if (next.props.y !== undefined) {
      state.y = blendFromPose ? bone.y : (current.props.y ?? bone.y);
      tweenTo.y = next.props.y;
    }
    // Выход из idle: мягкий Sine.Out, дальше — сегментный combat-easing.
    const ease = blendFromPose && options.handoffEase
      ? options.handoffEase
      : segmentEase(state, tweenTo, options.restAngle);
    armature.tweenProxies.push(state);
    scene.tweens.add({
      targets: state,
      ...tweenTo,
      duration,
      ease,
      onUpdate: () => {
        if (state.deg !== undefined) bone.rotation = Phaser.Math.DegToRad(state.deg);
        if (state.x !== undefined) bone.setX(state.x);
        if (state.y !== undefined) bone.setY(state.y);
      },
      onComplete: () => {
        onSegmentEnd?.(next.time);
        play(index + 1);
      },
    });
  };
  play(0);
}

/** Кости с idle-оффсетом, которых нет в клипе, плавно возвращаем в rest. */
function handoffIdleOrphansToRest(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
  animatedBones: Set<string>,
): void {
  for (const [name, bone] of armature.bones) {
    if (animatedBones.has(name)) continue;
    const pose = armature.rest.get(name);
    if (!pose) continue;
    const curDeg = Phaser.Math.RadToDeg(bone.rotation);
    const needAngle = Math.abs(curDeg - pose.angle) > 0.15;
    const needPos = Math.abs(bone.x - pose.x) > 0.3 || Math.abs(bone.y - pose.y) > 0.3;
    if (!needAngle && !needPos) continue;

    const state: Record<string, number> = {};
    const tweenTo: Record<string, number> = {};
    if (needAngle) {
      state.deg = curDeg;
      tweenTo.deg = pose.angle;
    }
    if (needPos) {
      state.x = bone.x;
      state.y = bone.y;
      tweenTo.x = pose.x;
      tweenTo.y = pose.y;
    }
    armature.tweenProxies.push(state);
    scene.tweens.add({
      targets: state,
      ...tweenTo,
      duration: IDLE_HANDOFF_MS,
      ease: 'Sine.Out',
      onUpdate: () => {
        if (state.deg !== undefined) bone.rotation = Phaser.Math.DegToRad(state.deg);
        if (state.x !== undefined) bone.setX(state.x);
        if (state.y !== undefined) bone.setY(state.y);
      },
    });
  }
}

export type PlayAnimOptions = {
  impactAtMs?: number;
  onImpact?: () => void;
  onComplete?: () => void;
};

/** Универсальный проигрыватель rotate/translate из gladiarot_all. */
export function playArmatureAnimation(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
  animationName: string,
  options: PlayAnimOptions = {},
): number {
  const anim = requireAnim(animationName);
  // stopIdle внутри: поза дыхания сохраняется → fromCurrent блендит в удар/блок.
  stopArmatureAnimation(scene, armature);
  const epoch = armature.actionEpoch;
  armature.playing = true;

  let pending = 0;
  let impactDone = false;
  const animatedBones = new Set<string>([
    ...anim.rotate.keys(),
    ...anim.translate.keys(),
  ]);
  // Кости только из idle (root bounce и т.п.) — мягко в rest, без hard cut.
  handoffIdleOrphansToRest(scene, armature, animatedBones);

  const finishOne = (): void => {
    if (epoch !== armature.actionEpoch) return;
    pending -= 1;
    if (pending > 0) return;
    armature.playing = false;
    armature.impactTimer = null;
    // Settle → onComplete → startIdleSpring (внутри settle).
    settleArmatureToRest(scene, armature, 70, () => {
      if (epoch !== armature.actionEpoch) return;
      options.onComplete?.();
    });
  };

  const fireImpact = (): void => {
    if (epoch !== armature.actionEpoch || impactDone) return;
    impactDone = true;
    armature.impactTimer = null;
    options.onImpact?.();
  };

  if (options.onImpact && options.impactAtMs != null && options.impactAtMs >= 0) {
    armature.impactTimer = scene.time.delayedCall(options.impactAtMs, fireImpact);
  }

  for (const [boneName, keys] of anim.rotate) {
    const bone = armature.bones.get(boneName);
    const pose = armature.rest.get(boneName);
    if (!bone || !pose || !keys.length) continue;
    pending += 1;
    tweenKeyframes(
      scene,
      armature,
      bone,
      keys.map((key) => ({ time: key.time, props: { angle: pose.angle + key.angle } })),
      undefined,
      finishOne,
      { fromCurrent: true, restAngle: pose.angle, handoffEase: 'Sine.Out' },
    );
  }

  for (const [boneName, keys] of anim.translate) {
    const bone = armature.bones.get(boneName);
    const pose = armature.rest.get(boneName);
    if (!bone || !pose || !keys.length) continue;
    pending += 1;
    tweenKeyframes(
      scene,
      armature,
      bone,
      keys.map((key) => ({
        time: key.time,
        props: { x: pose.x + key.x, y: pose.y + key.y },
      })),
      undefined,
      finishOne,
      { fromCurrent: true, handoffEase: 'Sine.Out' },
    );
  }

  if (pending === 0) {
    armature.playing = false;
    // Если костей нет — удар всё равно должен пройти по таймеру impact.
    if (options.onImpact && (options.impactAtMs == null || options.impactAtMs < 0)) {
      fireImpact();
    }
    options.onComplete?.();
    startIdleSpring(scene, armature);
  }

  return anim.duration * 1000;
}

export function playLowHit(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
  onImpact?: () => void,
  onComplete?: () => void,
): number {
  return playArmatureAnimation(scene, armature, ANIM_LOW_HIT, {
    impactAtMs: lowHitImpactMs,
    onImpact,
    onComplete,
  });
}

export function playHardHit(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
  onImpact?: () => void,
  onComplete?: () => void,
): number {
  return playArmatureAnimation(scene, armature, ANIM_HARD_HIT, {
    impactAtMs: hardHitImpactMs,
    onImpact,
    onComplete,
  });
}

export function playBlock(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
  onComplete?: () => void,
): number {
  return playArmatureAnimation(scene, armature, ANIM_BLOCK, { onComplete });
}

export function playCounter(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
  onImpact?: () => void,
  onComplete?: () => void,
): number {
  return playArmatureAnimation(scene, armature, ANIM_COUNTER, {
    impactAtMs: counterImpactMs,
    onImpact,
    onComplete,
  });
}

export function playTakingDmg(
  scene: Phaser.Scene,
  armature: GladiatorArmature,
  onComplete?: () => void,
): number {
  return playArmatureAnimation(scene, armature, ANIM_TAKING_DMG, { onComplete });
}
