import Phaser from 'phaser';
import {
  isTrainingDummy,
  opponentCombat,
  opponentSkin,
  type Opponent,
} from './opponents';
import { DUMMY_SPRITES } from './dummy-sprites';
import type { PlayerProfile } from './types';
import arenaBackgroundUrl from '../../../prints/arena/gladiator-arena-background.jpg';
import {
  BLOOD_HITS_FOR_FINISH,
  CLINCH_DAMAGE_FACTOR,
  CLINCH_WINDOW_MS,
  DOUBLE_SECOND_FACTOR,
  FINISH_DAMAGE_MUL,
  HEAVY_DAMAGE_MUL,
  HEAVY_TELEGRAPH_MUL,
  KNOCKBACK_BONUS_MS,
  KNOCKBACK_DAMAGE_MUL,
  PARRY_WINDOW_MS,
  PERFECT_BLOCK_MS,
  RICOCHET_GAP_MS,
  RICOCHET_STUN_MS,
  SHIELD_BROKEN_FACTOR,
  SHIELD_COST_BLOCK,
  SHIELD_COST_FEINT_PUNISH,
  SHIELD_COST_PERFECT,
  SHIELD_MAX,
  SHIELD_REGEN_PER_CYCLE,
  berserkerTelegraphMul,
  rollAttackPattern,
  type AttackPattern,
} from './combat-mechanics';
import {
  blockActiveMs,
  counterGuardMs,
  createGladiatorArmature,
  GLADIATOR_PART_URLS,
  gladiatorPartKey,
  lowHitDurationMs,
  interruptArmature,
  playBlock,
  playCounter,
  playHardHit,
  playLowHit,
  playTakingDmg,
  HEATER_TEXTURE_KEY,
  HEATER_URL,
  BUCKLER_TEXTURE_KEY,
  BUCKLER_URL,
  type GladiatorArmature,
  type ShieldKind,
} from './dragonbones-fighter';

type FighterParts = {
  body: Phaser.GameObjects.Container;
  armature: GladiatorArmature | null;
  arm: Phaser.GameObjects.Container;
  weapon: Phaser.GameObjects.Container;
  direction: number;
};

const arenaBackgroundKey = 'arena-background';
const playerSlot = 0.4;
const opponentSlot = 0.6;

type BattleResult = {
  won: boolean;
  gold: number;
  xp: number;
};

class ArenaScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerFighter!: FighterParts;
  private opponentFigure!: Phaser.GameObjects.Container;
  private opponentFighter!: FighterParts;
  private warning!: Phaser.GameObjects.Text;
  private opponentAlert!: Phaser.GameObjects.Text;
  private playerHp = 100;
  private opponentHp = 80;
  private maxOpponentHp = 80;
  private blockStartedAt = 0;
  private blockUntil = 0;
  private parryUntil = 0;
  private running = false;
  private enemyAttackEpoch = 0;
  private enemyTimers: Phaser.Time.TimerEvent[] = [];
  private profile: PlayerProfile;
  private opponent: Opponent;

  private shieldHp = SHIELD_MAX;
  private bloodHits = 0;
  private finishReady = false;
  private enemyBlocksTaken = 0;
  private enemyBrokenUntil = 0;
  private knockbackBonusUntil = 0;
  private playerSwingUntil = 0;
  private lastDummyHitAt = 0;
  private playerStunnedUntil = 0;
  private pendingPattern: AttackPattern = 'normal';
  private sandSlowUntil = 0;

  constructor(profile: PlayerProfile, opponent: Opponent) {
    super('Arena');
    this.profile = profile;
    this.opponent = opponent;
  }

  preload(): void {
    this.load.image(arenaBackgroundKey, arenaBackgroundUrl);
    this.load.image(HEATER_TEXTURE_KEY, HEATER_URL);
    this.load.image(BUCKLER_TEXTURE_KEY, BUCKLER_URL);
    for (const [name, url] of Object.entries(GLADIATOR_PART_URLS)) {
      this.load.image(gladiatorPartKey(name), url);
    }
    const skin = opponentSkin(this.opponent);
    if (skin) {
      for (const [name, url] of Object.entries(skin.parts)) {
        this.load.image(gladiatorPartKey(name, skin.id), url);
      }
    }
    if (isTrainingDummy(this.opponent)) {
      const dummy = DUMMY_SPRITES[this.opponent.dummyId ?? 'wood'];
      this.load.image(dummy.textureKey, dummy.url);
    }
  }

  create(): void {
    const { width, height } = this.scale;
    this.drawArenaBackground(width, height);

    this.add.text(width / 2, 18, 'ПЕСОК • ЖАЖДА • СЛАВА', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '11px',
      color: '#fff4d8',
      letterSpacing: 4,
      stroke: '#2a1c0d',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const ground = height * 0.96;
    this.playerFighter = this.makeFighter(width * playerSlot, ground, 1);
    this.player = this.playerFighter.body;
    this.opponentFighter = isTrainingDummy(this.opponent)
      ? this.makeTrainingDummy(width * opponentSlot, ground)
      : this.makeOpponent(width * opponentSlot, ground);
    this.opponentFigure = this.opponentFighter.body;
    this.breathe(this.player);
    if (this.opponentFighter.armature) this.breathe(this.opponentFigure);
    this.opponentAlert = this.add.text(width * opponentSlot, ground - 210, '!', {
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
    this.events.on('battle:hard-attack', this.hardAttack, this);
    this.events.on('battle:block', this.block, this);
    this.events.on('battle:counter', this.counter, this);
    this.events.on('battle:finish', this.finishStrike, this);
    this.events.on('battle:stop', this.stopBattle, this);
    this.game.events.emit('arena:ready');
  }

  private drawArenaBackground(width: number, height: number): void {
    const background = this.add.image(width / 2, height * 0.58, arenaBackgroundKey).setOrigin(0.5);
    const cover = Math.max(width / background.width, height / background.height) * 1.08;
    background.setScale(cover).setDepth(-2);
    const shade = this.add.graphics().setDepth(-1);
    shade.fillStyle(0x17120c, 0.18);
    shade.fillRect(0, 0, width, height);
    shade.fillStyle(0x000000, 0.12);
    shade.fillRect(0, 0, width, height * 0.22);
  }

  private makeFighter(
    x: number,
    y: number,
    direction: number,
    options: {
      tint?: number;
      skinId?: string;
      partUrls?: Record<string, string>;
      scaleMul?: number;
      withShield?: boolean | ShieldKind;
    } = {},
  ): FighterParts {
    const tint = direction === 1 && this.profile.skin !== 'bronze'
      ? this.skinColor(this.profile.skin)
      : (options.tint ?? 0xffffff);
    const armature = createGladiatorArmature(this, x, y, direction, {
      ...options,
      tint,
      withShield: options.withShield ?? (direction === 1 ? 'heater' : false),
    });
    const shadowW = 200 * (options.scaleMul ?? 1);
    const shadow = this.add.ellipse(0, 4, shadowW, 28, 0x080706, 0.38);
    armature.root.addAt(shadow, 0);
    return {
      body: armature.root,
      armature,
      arm: armature.bones.get('лево_плечо') ?? armature.root,
      weapon: armature.bones.get('лево_кулак_меч') ?? armature.root,
      direction,
    };
  }

  private makeOpponent(x: number, y: number): FighterParts {
    const skin = opponentSkin(this.opponent);
    const scaleMul = (skin?.scaleMul ?? 1) * (this.opponent.scaleMul ?? 1);
    return this.makeFighter(x, y, -1, {
      tint: this.opponent.tint ?? 0xffffff,
      skinId: skin?.id,
      partUrls: skin?.parts,
      scaleMul,
      withShield: this.opponent.id === 'oro' || this.opponent.archetype === 'wall'
        ? (this.opponent.id === 'oro' ? 'buckler' : 'heater')
        : false,
    });
  }

  private makeTrainingDummy(x: number, y: number): FighterParts {
    const dummy = DUMMY_SPRITES[this.opponent.dummyId ?? 'wood'];
    const sprite = this.add.image(0, 0, dummy.textureKey);
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(
      dummy.displayHeight * (sprite.width / Math.max(1, sprite.height)),
      dummy.displayHeight,
    );
    sprite.setFlipX(true);
    const shadow = this.add.ellipse(0, 4, 112, 24, 0x080706, 0.34);
    const stub = this.add.container(0, -120);
    const body = this.add.container(x, y, [shadow, sprite, stub]);
    body.setData('homeX', x);
    body.setData('homeY', y);
    return { body, armature: null, arm: stub, weapon: stub, direction: -1 };
  }

  private breathe(figure: Phaser.GameObjects.Container): void {
    const home = figure.getData('homeY') as number;
    figure.setY(home);
    this.tweens.add({
      targets: figure,
      y: home - 2,
      duration: 920,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private skinColor(skin: PlayerProfile['skin']): number {
    if (skin === 'ember') return 0xffc7ba;
    if (skin === 'azure') return 0xc3deff;
    return 0xffffff;
  }

  private combat() {
    return opponentCombat(this.opponent);
  }

  private startBattle(): void {
    this.playerHp = Math.min(170, this.profile.vitality);
    this.opponentHp = this.opponent.hp;
    this.maxOpponentHp = this.opponent.hp;
    this.shieldHp = SHIELD_MAX;
    this.bloodHits = 0;
    this.finishReady = false;
    this.enemyBlocksTaken = 0;
    this.enemyBrokenUntil = 0;
    this.knockbackBonusUntil = 0;
    this.playerSwingUntil = 0;
    this.lastDummyHitAt = 0;
    this.playerStunnedUntil = 0;
    this.sandSlowUntil = 0;
    this.running = true;
    this.warning.setAlpha(0);
    this.opponentAlert.setAlpha(0);
    this.emitHealth();
    this.emitCombatHud();
    if (!isTrainingDummy(this.opponent)) this.scheduleEnemyAttack();
  }

  private clearEnemyTimers(): void {
    for (const timer of this.enemyTimers) timer.remove(false);
    this.enemyTimers = [];
  }

  private trackEnemyTimer(timer: Phaser.Time.TimerEvent): Phaser.Time.TimerEvent {
    this.enemyTimers.push(timer);
    return timer;
  }

  private flashAlert(hold = 320): void {
    this.opponentAlert.setAngle(-4).setScale(0.75).setAlpha(0);
    this.tweens.add({
      targets: this.opponentAlert,
      alpha: 1,
      scale: 1,
      angle: 4,
      duration: 180,
      ease: 'Back.Out',
      yoyo: true,
      hold,
    });
  }

  private scheduleEnemyAttack(): void {
    if (!this.running || isTrainingDummy(this.opponent)) return;
    if (this.time.now < this.enemyBrokenUntil) {
      this.trackEnemyTimer(this.time.delayedCall(this.enemyBrokenUntil - this.time.now + 40, () => {
        if (this.running) this.scheduleEnemyAttack();
      }));
      return;
    }

    const epoch = this.enemyAttackEpoch;
    const combat = this.combat();
    const pattern = rollAttackPattern(combat);
    this.pendingPattern = pattern;

    let telegraph = this.opponent.telegraphMs ?? 700;
    if (this.opponent.archetype === 'berserker') {
      telegraph *= berserkerTelegraphMul(this.opponentHp / Math.max(1, this.maxOpponentHp));
    }
    if (pattern === 'heavy') telegraph *= HEAVY_TELEGRAPH_MUL;
    if (this.time.now < this.sandSlowUntil) telegraph *= 1.35;

    const cooldown = this.opponent.cooldownMs
      ?? Math.max(860, lowHitDurationMs * 0.55);

    this.flashAlert(pattern === 'heavy' ? 480 : 320);
    this.game.events.emit('arena:telegraph', { pattern });

    this.trackEnemyTimer(this.time.delayedCall(telegraph, () => {
      if (!this.running || epoch !== this.enemyAttackEpoch) return;
      this.opponentAlert.setAlpha(0);

      if (pattern === 'feint') {
        this.resolveFeint(epoch);
        this.regenShield();
        this.trackEnemyTimer(this.time.delayedCall(cooldown * 0.7, () => {
          if (!this.running || epoch !== this.enemyAttackEpoch) return;
          this.scheduleEnemyAttack();
        }));
        return;
      }

      this.playEnemySwing(pattern, epoch, () => {
        if (epoch !== this.enemyAttackEpoch) return;
        this.resolveEnemyHit(pattern === 'heavy' ? HEAVY_DAMAGE_MUL : 1, pattern);
      });

      if (pattern === 'double') {
        this.trackEnemyTimer(this.time.delayedCall(340, () => {
          if (!this.running || epoch !== this.enemyAttackEpoch) return;
          this.flashAlert(180);
          this.playEnemySwing('normal', epoch, () => {
            if (epoch !== this.enemyAttackEpoch) return;
            this.resolveEnemyHit(DOUBLE_SECOND_FACTOR, 'double');
          });
        }));
      }

      this.regenShield();
      this.trackEnemyTimer(this.time.delayedCall(
        cooldown + (pattern === 'double' ? 360 : 0),
        () => {
          if (!this.running || epoch !== this.enemyAttackEpoch) return;
          this.scheduleEnemyAttack();
        },
      ));
    }));
  }

  private playEnemySwing(
    pattern: AttackPattern,
    epoch: number,
    onImpact: () => void,
  ): void {
    if (!this.opponentFighter.armature) return;
    const play = pattern === 'heavy' ? playHardHit : playLowHit;
    play(this, this.opponentFighter.armature, () => {
      if (epoch !== this.enemyAttackEpoch) return;
      this.slashEffect(this.opponentFighter);
      onImpact();
    });
  }

  private resolveFeint(epoch: number): void {
    if (epoch !== this.enemyAttackEpoch) return;
    const now = this.time.now;
    const earlyBlock = now <= this.blockUntil;
    const earlyParry = now <= this.parryUntil;
    if (earlyBlock || earlyParry) {
      this.spendShield(SHIELD_COST_FEINT_PUNISH);
      this.flashWarning('ФИНТ — ЩИТ', '#dc8c75');
      this.game.events.emit('arena:status', 'Финт: ранний блок/контр сожгли щит');
    } else {
      this.flashWarning('ФИНТ', '#c4b799');
      this.game.events.emit('arena:status', 'Финт — удар оборван');
    }
    this.emitCombatHud();
  }

  private interruptEnemyOffense(): void {
    this.enemyAttackEpoch += 1;
    this.clearEnemyTimers();
    this.tweens.killTweensOf(this.opponentAlert);
    this.opponentAlert.setAlpha(0);
    if (this.opponentFighter.armature) {
      interruptArmature(this, this.opponentFighter.armature);
    }
    if (isTrainingDummy(this.opponent)) return;
    this.trackEnemyTimer(this.time.delayedCall(620, () => {
      if (!this.running) return;
      this.scheduleEnemyAttack();
    }));
  }

  private shakeOpponent(): void {
    const home = this.opponentFigure.getData('homeY') as number | undefined;
    this.tweens.killTweensOf(this.opponentFigure);
    this.opponentFigure.setAngle(0);
    if (home !== undefined) this.opponentFigure.setY(home);
    this.tweens.add({
      targets: this.opponentFigure,
      angle: { from: -5, to: 5 },
      duration: 55,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.opponentFigure.setAngle(0);
        if (home !== undefined && this.opponentFighter.armature) this.breathe(this.opponentFigure);
      },
    });
  }

  private knockbackOpponent(): void {
    const homeX = this.opponentFigure.getData('homeX') as number;
    this.tweens.killTweensOf(this.opponentFigure);
    this.opponentFigure.setX(homeX);
    this.tweens.add({
      targets: this.opponentFigure,
      x: homeX + 28,
      duration: 120,
      yoyo: true,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.opponentFigure.setX(homeX);
        if (this.opponentFighter.armature) this.breathe(this.opponentFigure);
      },
    });
    this.knockbackBonusUntil = this.time.now + KNOCKBACK_BONUS_MS;
  }

  private sandBurst(): void {
    const x = (this.player.x + this.opponentFigure.x) / 2;
    const y = this.player.y - 40;
    for (let i = 0; i < 10; i += 1) {
      const speck = this.add.rectangle(
        x + Phaser.Math.Between(-20, 20),
        y + Phaser.Math.Between(-8, 12),
        Phaser.Math.Between(2, 5),
        Phaser.Math.Between(2, 4),
        0xc9a56a,
        0.85,
      ).setDepth(7);
      this.tweens.add({
        targets: speck,
        x: speck.x + Phaser.Math.Between(-40, 40),
        y: speck.y - Phaser.Math.Between(18, 46),
        alpha: 0,
        duration: Phaser.Math.Between(280, 520),
        ease: 'Quad.Out',
        onComplete: () => speck.destroy(),
      });
    }
    this.sandSlowUntil = this.time.now + 700;
  }

  private slashEffect(source: FighterParts): void {
    const dir = source.direction;
    const centerX = source.body.x + dir * 76;
    const centerY = source.body.y - 104;
    const sweep = (from: number, to: number): [number, number, boolean] => (
      dir === 1 ? [from, to, false] : [180 - from, 180 - to, true]
    );
    const [start, end, anticlockwise] = sweep(-86, 34);
    const slash = this.add.graphics({ x: centerX, y: centerY }).setDepth(6);
    for (const [radius, width, alpha, color] of [[50, 8, 0.28, 0xfff2cf], [46, 4, 0.95, 0xffffff]] as const) {
      slash.lineStyle(width, color, alpha);
      slash.beginPath();
      slash.arc(0, 0, radius, Phaser.Math.DegToRad(start), Phaser.Math.DegToRad(end), anticlockwise);
      slash.strokePath();
    }
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scale: 1.18,
      duration: 170,
      ease: 'Quad.Out',
      onComplete: () => slash.destroy(),
    });
    this.cameras.main.shake(70, 0.0035);
  }

  private spendShield(cost: number): void {
    this.shieldHp = Math.max(0, this.shieldHp - cost);
    this.emitCombatHud();
  }

  private regenShield(): void {
    this.shieldHp = Math.min(SHIELD_MAX, this.shieldHp + SHIELD_REGEN_PER_CYCLE);
    this.emitCombatHud();
  }

  private flashWarning(text: string, color: string): void {
    this.warning.setText(text).setColor(color).setAlpha(1);
    this.time.delayedCall(520, () => this.warning.setAlpha(0));
  }

  private resolveEnemyHit(damageMul = 1, pattern: AttackPattern = 'normal'): void {
    if (!this.running) return;
    const now = this.time.now;
    let damage = Math.round(this.opponent.damage * damageMul);

    // Клинч: оба в ударе почти одновременно.
    const inClinch = now <= this.playerSwingUntil;
    if (inClinch) {
      damage = Math.max(1, Math.ceil(damage * CLINCH_DAMAGE_FACTOR));
      const clinchBack = Math.max(1, Math.ceil(
        (this.profile.strength * 0.7 + this.profile.weapon * 8) * CLINCH_DAMAGE_FACTOR,
      ));
      this.opponentHp = Math.max(0, this.opponentHp - clinchBack);
      this.bloodHits = 0;
      this.finishReady = false;
      this.playerHp = Math.max(0, this.playerHp - damage);
      this.flashWarning('КЛИНЧ', '#e0c080');
      this.game.events.emit('arena:damage', { side: 'player', amount: damage, critical: false });
      this.game.events.emit('arena:damage', { side: 'opponent', amount: clinchBack, critical: false });
      this.game.events.emit('arena:status', 'Клинч — оба получили урезанный урон');
      this.emitHealth();
      this.emitCombatHud();
      if (this.playerHp <= 0) this.finishBattle(false);
      else if (this.opponentHp <= 0) this.finishBattle(true);
      return;
    }

    const guarding = now <= this.blockUntil || now <= this.parryUntil;
    if (guarding) {
      const perfect = now - this.blockStartedAt <= PERFECT_BLOCK_MS;
      const parried = now <= this.parryUntil && now - this.blockStartedAt <= PARRY_WINDOW_MS;
      const shieldBroken = this.shieldHp <= 0;
      this.spendShield(perfect || parried ? SHIELD_COST_PERFECT : SHIELD_COST_BLOCK);

      if (parried) {
        damage = 0;
        this.flashWarning('ПАРИРОВАНИЕ', '#f5cb77');
        this.sandBurst();
        this.knockbackOpponent();
        this.registerEnemyBlock();
        const punish = Math.round(12 + this.opponent.damage * 0.08);
        this.opponentHp = Math.max(0, this.opponentHp - punish);
        this.interruptEnemyOffense();
        if (this.opponentFighter.armature) playTakingDmg(this, this.opponentFighter.armature);
        this.game.events.emit('arena:damage', { side: 'opponent', amount: punish, critical: true });
        this.game.events.emit('arena:status', 'Парирование! Контрудар прошёл');
      } else {
        damage = perfect
          ? 0
          : Math.ceil(damage * (shieldBroken ? SHIELD_BROKEN_FACTOR : 0.2));
        this.flashWarning(
          perfect ? 'ИДЕАЛЬНЫЙ БЛОК' : (shieldBroken ? 'ЩИТ СЛОМАН' : 'БЛОК'),
          perfect ? '#f5cb77' : '#c4b799',
        );
        this.registerEnemyBlock();
        if (perfect) {
          this.sandBurst();
          this.knockbackOpponent();
          const chip = pattern === 'heavy' ? 16 : 8;
          this.opponentHp = Math.max(0, this.opponentHp - chip);
          this.interruptEnemyOffense();
          if (this.opponentFighter.armature) playTakingDmg(this, this.opponentFighter.armature);
          else this.shakeOpponent();
          this.game.events.emit('arena:damage', { side: 'opponent', amount: chip, critical: true });
        }
      }
      if (damage > 0) {
        this.playerHp = Math.max(0, this.playerHp - damage);
        this.game.events.emit('arena:damage', { side: 'player', amount: damage, critical: false });
      }
    } else {
      this.playerHp = Math.max(0, this.playerHp - damage);
      this.interruptPlayerOffense();
      this.bloodHits = 0;
      this.finishReady = false;
      if (this.playerFighter.armature) playTakingDmg(this, this.playerFighter.armature);
      else this.flinch(this.player);
      this.game.events.emit('arena:damage', { side: 'player', amount: damage, critical: false });
    }

    this.emitHealth();
    this.emitCombatHud();
    if (this.playerHp <= 0) this.finishBattle(false);
    else if (this.opponentHp <= 0) this.finishBattle(true);
  }

  private registerEnemyBlock(): void {
    const combat = this.combat();
    this.enemyBlocksTaken += 1;
    if (this.enemyBlocksTaken >= combat.blocksToBreak && combat.breakStunMs > 0) {
      this.enemyBlocksTaken = 0;
      this.enemyBrokenUntil = this.time.now + combat.breakStunMs;
      this.interruptEnemyOffense();
      this.flashWarning('СЛОМ СТОЙКИ', '#e5c27c');
      this.game.events.emit('arena:status', 'Стойка врага сломлена — бей!');
    }
  }

  private dealPlayerDamage(multiplier: number, critical = false, opts: {
    isLunge?: boolean;
    isFinish?: boolean;
  } = {}): void {
    if (!this.running) return;
    if (this.time.now < this.playerStunnedUntil) {
      this.flashWarning('ОГЛУШЁН', '#dc8c75');
      return;
    }

    let mul = multiplier;
    if (this.time.now <= this.knockbackBonusUntil && opts.isLunge) {
      mul *= KNOCKBACK_DAMAGE_MUL;
      this.knockbackBonusUntil = 0;
      this.flashWarning('ВЫПАД С РАЗГОНА', '#f5cb77');
    }

    // Стена гасит выпад.
    const wallChance = this.combat().wallBlockChance;
    if (opts.isLunge && wallChance > 0 && Math.random() < wallChance) {
      this.flashWarning('ЩИТ ВРАГА', '#c4b799');
      this.game.events.emit('arena:status', 'Стена погасила выпад');
      this.bloodHits = 0;
      this.finishReady = false;
      this.emitCombatHud();
      return;
    }

    let damage = Math.round(
      (this.profile.strength * 0.7 + this.profile.weapon * 8 + Phaser.Math.Between(2, 7)) * mul,
    );
    this.opponentHp = Math.max(0, this.opponentHp - damage);
    this.interruptEnemyOffense();

    if (this.combat().ricochet) {
      const gap = this.time.now - this.lastDummyHitAt;
      this.lastDummyHitAt = this.time.now;
      if (gap > 0 && gap < RICOCHET_GAP_MS) {
        this.playerStunnedUntil = this.time.now + RICOCHET_STUN_MS;
        this.flashWarning('РИКОШЕТ', '#dc8c75');
        this.game.events.emit('arena:status', 'Рикошет столба — сбей ритм');
        this.game.events.emit('arena:stun', { ms: RICOCHET_STUN_MS });
      }
    }

    if (!opts.isFinish) {
      this.bloodHits += 1;
      if (this.bloodHits >= BLOOD_HITS_FOR_FINISH && !this.finishReady) {
        this.finishReady = true;
        this.flashWarning('ДОБИВАНИЕ', '#e5c27c');
        this.game.events.emit('arena:finish-ready');
      }
    } else {
      this.bloodHits = 0;
      this.finishReady = false;
    }

    if (this.opponentFighter.armature) playTakingDmg(this, this.opponentFighter.armature);
    else this.shakeOpponent();
    this.game.events.emit('arena:damage', { side: 'opponent', amount: damage, critical });
    this.emitHealth();
    this.emitCombatHud();
    if (this.opponentHp <= 0) this.finishBattle(true);
  }

  private attack(): void {
    if (!this.running || !this.playerFighter.armature) return;
    if (this.time.now < this.playerStunnedUntil) return;
    this.playerSwingUntil = this.time.now + CLINCH_WINDOW_MS + 400;
    playLowHit(this, this.playerFighter.armature, () => {
      this.slashEffect(this.playerFighter);
      this.dealPlayerDamage(1);
    });
  }

  private hardAttack(): void {
    if (!this.running || !this.playerFighter.armature) return;
    if (this.time.now < this.playerStunnedUntil) return;
    this.playerSwingUntil = this.time.now + CLINCH_WINDOW_MS + 500;
    playHardHit(this, this.playerFighter.armature, () => {
      this.slashEffect(this.playerFighter);
      this.dealPlayerDamage(1.45, false, { isLunge: true });
    });
  }

  private finishStrike(): void {
    if (!this.running || !this.finishReady || !this.playerFighter.armature) return;
    if (this.time.now < this.playerStunnedUntil) return;
    this.finishReady = false;
    this.playerSwingUntil = this.time.now + CLINCH_WINDOW_MS + 500;
    playHardHit(this, this.playerFighter.armature, () => {
      this.slashEffect(this.playerFighter);
      this.dealPlayerDamage(FINISH_DAMAGE_MUL, true, { isFinish: true, isLunge: true });
      this.flashWarning('ДОБИВАНИЕ!', '#f5cb77');
    });
    this.emitCombatHud();
  }

  private block(): void {
    if (!this.running || !this.playerFighter.armature) return;
    this.blockStartedAt = this.time.now;
    this.blockUntil = this.time.now + blockActiveMs;
    this.parryUntil = 0;
    playBlock(this, this.playerFighter.armature);
  }

  private counter(): void {
    if (!this.running || !this.playerFighter.armature) return;
    this.blockStartedAt = this.time.now;
    this.blockUntil = this.time.now + counterGuardMs;
    this.parryUntil = this.time.now + PARRY_WINDOW_MS + 40;
    playCounter(this, this.playerFighter.armature, () => {
      // Ответный взмах анимации — если враг уже прерван парированием, всё равно бьём слабее.
      this.slashEffect(this.playerFighter);
      this.dealPlayerDamage(1.15, true);
      this.flashWarning('КОНТРАТАКА', '#f5cb77');
    });
  }

  private interruptPlayerOffense(): void {
    if (!this.playerFighter.armature?.playing) return;
    interruptArmature(this, this.playerFighter.armature);
    this.blockUntil = 0;
    this.parryUntil = 0;
    this.playerSwingUntil = 0;
    this.game.events.emit('arena:interrupt');
  }

  private flinch(figure: Phaser.GameObjects.Container): void {
    const home = figure.getData('homeX') as number;
    this.tweens.killTweensOf(figure);
    figure.setX(home);
    this.tweens.add({
      targets: figure,
      x: home - 10,
      duration: 70,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => figure.setX(home),
    });
  }

  private emitHealth(): void {
    this.game.events.emit('arena:health', {
      player: this.playerHp,
      maxPlayer: Math.min(170, this.profile.vitality),
      opponent: this.opponentHp,
      maxOpponent: this.maxOpponentHp,
    });
  }

  private emitCombatHud(): void {
    this.game.events.emit('arena:combat', {
      shield: this.shieldHp,
      shieldMax: SHIELD_MAX,
      blood: this.bloodHits,
      bloodNeed: BLOOD_HITS_FOR_FINISH,
      finishReady: this.finishReady,
      pattern: this.pendingPattern,
    });
  }

  private finishBattle(won: boolean): void {
    this.running = false;
    this.enemyAttackEpoch += 1;
    this.clearEnemyTimers();
    this.opponentAlert.setAlpha(0);
    this.finishReady = false;
    const winText = isTrainingDummy(this.opponent)
      ? `${this.opponent.name.toUpperCase()} СЛОМАН`
      : 'ПОБЕДА';
    this.warning.setText(won ? winText : 'ПОРАЖЕНИЕ')
      .setColor(won ? '#e5c27c' : '#dc8c75').setAlpha(1);
    const [minGold, maxGold] = this.opponent.goldWin;
    this.game.events.emit('arena:finished', {
      won,
      gold: won ? Phaser.Math.Between(minGold, maxGold) : Math.max(2, Math.floor(minGold / 4)),
      xp: won ? this.opponent.xpWin : this.opponent.xpLose,
    } satisfies BattleResult);
    this.emitCombatHud();
  }

  private stopBattle(): void {
    this.running = false;
    this.enemyAttackEpoch += 1;
    this.clearEnemyTimers();
    this.warning.setAlpha(0);
    this.opponentAlert.setAlpha(0);
  }
}

export function createArena(
  mount: HTMLElement,
  profile: PlayerProfile,
  opponent: Opponent,
  onEvent: (event: string, value?: unknown) => void,
): Phaser.Game {
  // Портретный холст (телефон): бойцы бок о бок, кнопки — в HTML снизу.
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: mount,
    width: 390,
    height: 340,
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
    scene: [new ArenaScene(profile, opponent)],
  });
  for (const event of [
    'arena:ready',
    'arena:health',
    'arena:damage',
    'arena:finished',
    'arena:telegraph',
    'arena:interrupt',
    'arena:combat',
    'arena:finish-ready',
    'arena:status',
    'arena:stun',
  ]) {
    game.events.on(event, (value: unknown) => onEvent(event, value));
  }
  return game;
}
