import Phaser from 'phaser';
import type { PlayerProfile } from './types';
import bodyUrl from '../../../prints/безруки.png';
import armUrl from '../../../prints/рука справа.png';
import swordUrl from '../../../prints/меч.png';
import gladiatorSkeletonText from '../../../prints/gladiator_hit_animation/loongbones-web_ske.json?raw';

type BoneAnimation = {
  name: string;
  rotateFrame: Array<{ duration: number; rotate: number }>;
};

type SkeletonData = {
  armature: Array<{
    animation: Array<{ name: string; duration: number; bone: BoneAnimation[] }>;
  }>;
};

type HitAnimation = SkeletonData['armature'][number]['animation'][number];

type FighterParts = {
  body: Phaser.GameObjects.Container;
  arm: Phaser.GameObjects.Container;
  weapon: Phaser.GameObjects.Container;
};

const skeletonData = JSON.parse(gladiatorSkeletonText) as SkeletonData;
const armature = skeletonData.armature[0];
if (!armature) throw new Error('The gladiator armature is missing from its skeleton.');
const hitAnimation: HitAnimation = armature.animation.find(({ name }) => name === 'newAnimation')
  ?? (() => { throw new Error('The gladiator hit animation is missing from its skeleton.'); })();
const bodySourceKey = 'gladiator-source-body';
const armSourceKey = 'gladiator-source-arm';
const swordSourceKey = 'gladiator-source-sword';
const bodyKey = 'gladiator-body';
const armKey = 'gladiator-arm';
const swordKey = 'gladiator-sword';
const spriteScale = 0.23;
const armRestAngle = 0;
const weaponRestAngle = 0;
const armRaise = 341 * spriteScale / 5.7 * 1.5;

function getBoneFrames(animation: HitAnimation, name: string): BoneAnimation['rotateFrame'] {
  const bone = animation.bone.find((entry) => entry.name === name);
  if (!bone?.rotateFrame.length) throw new Error(`The gladiator animation has no rotation frames for "${name}".`);
  return bone.rotateFrame;
}

const armHitFrames = getBoneFrames(hitAnimation, 'bone');
const weaponHitFrames = getBoneFrames(hitAnimation, 'bone1');
const attackDuration = 440;

type BattleResult = {
  won: boolean;
  gold: number;
  xp: number;
};

class ArenaScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerArm!: Phaser.GameObjects.Container;
  private playerWeapon!: Phaser.GameObjects.Container;
  private opponentArm!: Phaser.GameObjects.Container;
  private opponentWeapon!: Phaser.GameObjects.Container;
  private warning!: Phaser.GameObjects.Text;
  private opponentAlert!: Phaser.GameObjects.Text;
  private playerHp = 100;
  private opponentHp = 110;
  private blockStartedAt = 0;
  private blockUntil = 0;
  private running = false;
  private profile: PlayerProfile;

  constructor(profile: PlayerProfile) {
    super('Arena');
    this.profile = profile;
  }

  preload(): void {
    this.load.image(bodySourceKey, bodyUrl);
    this.load.image(armSourceKey, armUrl);
    this.load.image(swordSourceKey, swordUrl);
  }

  create(): void {
    this.createSpriteFrames();
    const { width, height } = this.scale;
    const backdrop = this.add.graphics();
    backdrop.fillGradientStyle(0x28251f, 0x28251f, 0x11110f, 0x11110f, 1);
    backdrop.fillRect(0, 0, width, height);
    backdrop.fillStyle(0xc79548, 0.08);
    backdrop.fillEllipse(width / 2, height * 0.54, width * 0.48, height * 0.72);
    backdrop.fillStyle(0x8c6739, 0.24);
    backdrop.fillRect(0, height * 0.78, width, height * 0.22);
    backdrop.lineStyle(2, 0xb88a4a, 0.35);
    backdrop.beginPath();
    backdrop.moveTo(width * 0.08, height * 0.8);
    backdrop.lineTo(width * 0.92, height * 0.8);
    backdrop.strokePath();

    this.add.text(width / 2, 25, 'ПЕСОК • ЖАЖДА • СЛАВА', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '11px',
      color: '#b59a72',
      letterSpacing: 4,
    }).setOrigin(0.5);

    const player = this.makeFighter(width * 0.39, height * 0.51, 1);
    this.player = player.body;
    this.playerArm = player.arm;
    this.playerWeapon = player.weapon;
    const opponent = this.makeFighter(width * 0.61, height * 0.51, -1);
    this.opponentArm = opponent.arm;
    this.opponentWeapon = opponent.weapon;
    this.opponentAlert = this.add.text(width * 0.61, height * 0.51 - 112, '!', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '32px',
      color: '#7b2019',
      backgroundColor: '#fff4c7',
      align: 'center',
      stroke: '#7b2019',
      strokeThickness: 3,
      padding: { x: 13, y: 6 },
    }).setOrigin(0.5).setAlpha(0).setAngle(-4);
    this.warning = this.add.text(width / 2, height * 0.28, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      color: '#f0a070',
      fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(0.5).setAlpha(0);

    this.events.on('battle:start', this.startBattle, this);
    this.events.on('battle:attack', this.attack, this);
    this.events.on('battle:block', this.block, this);
    this.events.on('battle:stop', this.stopBattle, this);
    this.game.events.emit('arena:ready');
  }

  private createSpriteFrames(): void {
    const frames = [
      { source: bodySourceKey, name: bodyKey, x: 276, y: 76, width: 431, height: 853 },
      { source: armSourceKey, name: armKey, x: 575, y: 268, width: 125, height: 341 },
      { source: swordSourceKey, name: swordKey, x: 625, y: 441, width: 345, height: 177 },
    ];
    for (const frame of frames) {
      const texture = this.textures.get(frame.source);
      if (!texture.has(frame.name)) {
        const created = texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
        if (!created) throw new Error(`Could not crop the "${frame.name}" gladiator sprite.`);
      }
    }
  }

  private makeFighter(x: number, y: number, direction: number): FighterParts {
    const shadow = this.add.ellipse(0, 91, 134, 20, 0x080706, 0.35);
    const bodySprite = this.add.image(0, 0, bodySourceKey, bodyKey).setOrigin(0.5).setScale(spriteScale);
    if (direction === 1 && this.profile.skin !== 'bronze') {
      bodySprite.setTint(this.skinColor(this.profile.skin));
    }
    const armSprite = this.add.image(0, 0, armSourceKey, armKey).setOrigin(0.5, 0.04).setScale(spriteScale);
    const swordSprite = this.add.image(0, 0, swordSourceKey, swordKey).setOrigin(0.07, 0.91).setScale(spriteScale);
    const weapon = this.add.container(0, 77, [swordSprite]).setAngle(weaponRestAngle);
    const armX = 27 + (direction === 1 ? armRaise / 3 : 0);
    const arm = this.add.container(armX, -31 - armRaise, [armSprite, weapon]).setAngle(armRestAngle);
    const body = this.add.container(x, y, [shadow, bodySprite, arm]);
    body.setScale(direction, 1);
    if (direction !== 1) bodySprite.setTint(0xf3d4c3);
    return { body, arm, weapon };
  }

  private skinColor(skin: PlayerProfile['skin']): number {
    if (skin === 'ember') return 0xffc7ba;
    if (skin === 'azure') return 0xc3deff;
    return 0xffffff;
  }

  private startBattle(): void {
    this.playerHp = Math.min(170, this.profile.vitality);
    this.opponentHp = 100 + this.profile.level * 10;
    this.running = true;
    this.warning.setAlpha(0);
    this.opponentAlert.setAlpha(0);
    this.game.events.emit('arena:health', {
      player: this.playerHp,
      maxPlayer: this.playerHp,
      opponent: this.opponentHp,
      maxOpponent: this.opponentHp,
    });
    this.scheduleEnemyAttack();
  }

  private scheduleEnemyAttack(): void {
    if (!this.running) return;
    this.opponentAlert.setAngle(-4).setScale(0.75).setAlpha(0);
    this.tweens.add({
      targets: this.opponentAlert,
      alpha: 1,
      scale: 1,
      angle: 4,
      duration: 180,
      ease: 'Back.Out',
      yoyo: true,
      hold: 360,
    });
    this.game.events.emit('arena:telegraph');
    this.time.delayedCall(720, () => {
      if (!this.running) return;
      this.opponentAlert.setAlpha(0);
      this.playHitAnimation(this.opponentArm, this.opponentWeapon, () => this.resolveEnemyHit());
      this.time.delayedCall(780, () => this.scheduleEnemyAttack());
    });
  }

  private playHitAnimation(
    arm: Phaser.GameObjects.Container,
    weapon: Phaser.GameObjects.Container,
    onImpact: () => void,
  ): void {
    this.playRotationTrack(arm, armHitFrames, armRestAngle, 2, onImpact);
    this.playRotationTrack(weapon, weaponHitFrames, weaponRestAngle);
  }

  private playRotationTrack(
    target: Phaser.GameObjects.Container,
    frames: BoneAnimation['rotateFrame'],
    baseAngle: number,
    impactFrame = -1,
    onImpact?: () => void,
  ): void {
    target.setAngle(baseAngle + (frames[0]?.rotate ?? 0));
    const millisecondsPerFrame = attackDuration / hitAnimation.duration;

    const animateFrame = (index: number): void => {
      const current = frames[index - 1];
      const next = frames[index];
      if (!current || !next) return;
      this.tweens.add({
        targets: target,
        angle: baseAngle + next.rotate,
        duration: current.duration * millisecondsPerFrame,
        ease: 'Linear',
        onComplete: () => {
          if (index === impactFrame) onImpact?.();
          if (index < frames.length - 1) animateFrame(index + 1);
        },
      });
    };

    animateFrame(1);
  }

  private resolveEnemyHit(): void {
    if (!this.running) return;
    let damage = Math.max(5, 8 + this.profile.level * 2 - Math.floor(this.profile.vitality / 25));
    const now = this.time.now;
    if (now <= this.blockUntil) {
      const perfect = now - this.blockStartedAt <= 250;
      damage = perfect ? 0 : Math.ceil(damage * 0.2);
      this.warning.setText(perfect ? 'ИДЕАЛЬНЫЙ БЛОК' : 'БЛОК').setColor(perfect ? '#f5cb77' : '#c4b799');
      this.warning.setAlpha(1);
      this.time.delayedCall(500, () => this.warning.setAlpha(0));
      if (perfect) {
        this.opponentHp = Math.max(0, this.opponentHp - 8);
        this.game.events.emit('arena:damage', { side: 'opponent', amount: 8, critical: true });
      }
    } else {
      this.playerHp = Math.max(0, this.playerHp - damage);
      this.game.events.emit('arena:damage', { side: 'player', amount: damage, critical: false });
    }
    this.emitHealth();
    if (this.playerHp <= 0) this.finishBattle(false);
    else if (this.opponentHp <= 0) this.finishBattle(true);
  }

  private attack(): void {
    if (!this.running) return;
    this.playHitAnimation(this.playerArm, this.playerWeapon, () => {
      if (!this.running) return;
      const damage = Math.round(
        this.profile.strength * 0.7 + this.profile.weapon * 8 + Phaser.Math.Between(2, 7),
      );
      this.opponentHp = Math.max(0, this.opponentHp - damage);
      this.game.events.emit('arena:damage', { side: 'opponent', amount: damage, critical: false });
      this.emitHealth();
      if (this.opponentHp <= 0) this.finishBattle(true);
    });
  }

  private block(): void {
    if (!this.running) return;
    this.blockStartedAt = this.time.now;
    this.blockUntil = this.time.now + 1_050;
    this.player.setAlpha(0.72);
    this.time.delayedCall(1_050, () => this.player.setAlpha(1));
  }

  private emitHealth(): void {
    this.game.events.emit('arena:health', {
      player: this.playerHp,
      maxPlayer: Math.min(170, this.profile.vitality),
      opponent: this.opponentHp,
      maxOpponent: 100 + this.profile.level * 10,
    });
  }

  private finishBattle(won: boolean): void {
    this.running = false;
    this.opponentAlert.setAlpha(0);
    this.warning.setText(won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ')
      .setColor(won ? '#e5c27c' : '#dc8c75').setAlpha(1);
    this.game.events.emit('arena:finished', {
      won,
      gold: won ? 25 + Phaser.Math.Between(0, 10) : 5,
      xp: won ? 35 : 12,
    } satisfies BattleResult);
  }

  private stopBattle(): void {
    this.running = false;
    this.warning.setAlpha(0);
    this.opponentAlert.setAlpha(0);
  }

}

export function createArena(
  mount: HTMLElement,
  profile: PlayerProfile,
  onEvent: (event: string, value?: unknown) => void,
): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: mount,
    width: 920,
    height: 360,
    backgroundColor: '#171512',
    render: {
      antialias: true,
      roundPixels: true,
      powerPreference: 'low-power',
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      parent: mount,
    },
    scene: [new ArenaScene(profile)],
  });
  for (const event of ['arena:ready', 'arena:health', 'arena:damage', 'arena:finished', 'arena:telegraph']) {
    game.events.on(event, (value: unknown) => onEvent(event, value));
  }
  return game;
}
