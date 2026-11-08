import Phaser from 'phaser';
import type { PlayerProfile } from './types';

type BattleResult = {
  won: boolean;
  gold: number;
  xp: number;
};

class ArenaScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private opponent!: Phaser.GameObjects.Container;
  private warning!: Phaser.GameObjects.Text;
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

  create(): void {
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

    this.player = this.makeFighter(
      width * 0.29,
      height * 0.62,
      this.skinColor(this.profile.skin),
      0x513b2d,
      1,
    );
    this.opponent = this.makeFighter(width * 0.71, height * 0.62, 0xb05a40, 0x412c2a, -1);
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

  private makeFighter(
    x: number,
    y: number,
    armor: number,
    helmet: number,
    direction: number,
  ): Phaser.GameObjects.Container {
    const figure = this.add.graphics();
    figure.fillStyle(0x10100f, 0.28);
    figure.fillEllipse(0, 94, 130, 23);
    figure.lineStyle(13, 0x30271f, 1);
    figure.beginPath();
    figure.moveTo(-20, 45);
    figure.lineTo(-27, 86);
    figure.moveTo(20, 45);
    figure.lineTo(27, 86);
    figure.strokePath();
    figure.lineStyle(8, 0x9e7744, 1);
    figure.beginPath();
    figure.moveTo(-30, 86);
    figure.lineTo(-13, 86);
    figure.moveTo(20, 86);
    figure.lineTo(39, 86);
    figure.strokePath();
    figure.fillStyle(armor, 1);
    figure.fillRoundedRect(-36, -6, 72, 60, 16);
    figure.fillStyle(0xc39c5c, 1);
    figure.fillRect(-36, 34, 72, 7);
    figure.fillStyle(0x221f1a, 1);
    figure.fillRoundedRect(-8, -18, 16, 20, 5);
    figure.fillStyle(0xc79268, 1);
    figure.fillCircle(0, -39, 21);
    figure.fillStyle(helmet, 1);
    figure.fillRoundedRect(-24, -61, 48, 17, 7);
    figure.fillRect(-21, -47, 42, 8);
    figure.fillStyle(0x251d18, 1);
    figure.fillRoundedRect(2, -40, 20, 5, 2);
    figure.lineStyle(13, 0xc79268, 1);
    figure.beginPath();
    figure.moveTo(31, 4);
    figure.lineTo(48, 28);
    figure.strokePath();
    figure.fillStyle(0xc69b59, 1);
    figure.fillRoundedRect(41, 22, 14, 22, 4);
    figure.lineStyle(5, 0xd5c39b, 1);
    figure.beginPath();
    figure.moveTo(49, 26);
    figure.lineTo(82, 48);
    figure.lineTo(98, 68);
    figure.strokePath();
    figure.fillStyle(0xe5ddd0, 0.85);
    figure.fillTriangle(95, 65, 103, 70, 91, 73);
    figure.fillStyle(0xc79268, 1);
    figure.fillCircle(-43, 7, 9);

    const fighter = this.add.container(x, y, [figure]);
    fighter.setScale(direction, 1);
    return fighter;
  }

  private skinColor(skin: PlayerProfile['skin']): number {
    if (skin === 'ember') return 0x8e4939;
    if (skin === 'azure') return 0x385d72;
    return 0x947443;
  }

  private startBattle(): void {
    this.playerHp = Math.min(170, this.profile.vitality);
    this.opponentHp = 100 + this.profile.level * 10;
    this.running = true;
    this.warning.setAlpha(0);
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
    this.warning.setText('ПРОТИВНИК ЗАМЫСЛИЛ УДАР').setColor('#f0a070');
    this.tweens.add({ targets: this.warning, alpha: 1, duration: 180 });
    this.game.events.emit('arena:telegraph');
    this.time.delayedCall(720, () => {
      if (!this.running) return;
      this.warning.setAlpha(0);
      this.tweens.add({
        targets: this.opponent,
        x: this.opponent.x - 26,
        duration: 130,
        yoyo: true,
        onYoyo: () => this.resolveEnemyHit(),
      });
      this.time.delayedCall(780, () => this.scheduleEnemyAttack());
    });
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
    this.tweens.add({
      targets: this.player,
      x: this.player.x + 46,
      duration: 115,
      yoyo: true,
      onYoyo: () => {
        if (!this.running) return;
        const damage = Math.round(
          this.profile.strength * 0.7 + this.profile.weapon * 8 + Phaser.Math.Between(2, 7),
        );
        this.opponentHp = Math.max(0, this.opponentHp - damage);
        this.game.events.emit('arena:damage', { side: 'opponent', amount: damage, critical: false });
        this.emitHealth();
        if (this.opponentHp <= 0) this.finishBattle(true);
      },
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
