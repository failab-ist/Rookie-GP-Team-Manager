import Phaser from 'phaser';
import { button, carKey, iso } from './art';

const W = 360, H = 640;
const STATS = ['최고속도', '가속', '접지', '제동'] as const;

export class GarageScene extends Phaser.Scene {
  stats = [22, 41, 50, 33];
  panel!: Phaser.GameObjects.Text;
  car!: Phaser.GameObjects.Image;
  mechs: Phaser.GameObjects.Image[] = [];

  constructor() { super('garage'); }

  create() {
    const cx = W / 2, cy = 300, T = 28; // 바닥 타일 반폭
    const g = this.add.graphics();
    const tile = (i: number, j: number) => {
      const p = iso(i * T, j * T);
      return [{ x: cx + p.x, y: cy + p.y }, { x: cx + p.x + T, y: cy + p.y + T / 2 },
        { x: cx + p.x, y: cy + p.y + T }, { x: cx + p.x - T, y: cy + p.y + T / 2 }];
    };
    // 뒤쪽 벽 두 면
    const back = iso(-3 * T, -3 * T);
    g.fillStyle(0xd9dde3);
    g.fillPoints([{ x: cx + back.x, y: cy + back.y }, { x: cx + back.x + 6 * T, y: cy + back.y + 3 * T },
      { x: cx + back.x + 6 * T, y: cy + back.y + 3 * T - 110 }, { x: cx + back.x, y: cy + back.y - 110 }], true);
    g.fillStyle(0xbfc5ce);
    g.fillPoints([{ x: cx + back.x, y: cy + back.y }, { x: cx + back.x - 6 * T, y: cy + back.y + 3 * T },
      { x: cx + back.x - 6 * T, y: cy + back.y + 3 * T - 110 }, { x: cx + back.x, y: cy + back.y - 110 }], true);
    // 타이어 선반
    for (let k = 0; k < 4; k++) {
      g.fillStyle(0x222222); g.fillCircle(cx + back.x + 30 + k * 18, cy + back.y - 40 + k * 9, 8);
      g.fillStyle(0x555555); g.fillCircle(cx + back.x + 30 + k * 18, cy + back.y - 40 + k * 9, 3);
    }
    // 바닥 타일
    for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) {
      g.fillStyle((i + j) & 1 ? 0x8a929c : 0x7d858f);
      g.fillPoints(tile(i, j), true);
    }
    // 리프트 패드
    g.fillStyle(0xf2c230);
    g.fillPoints(tile(0, 0).map((p) => ({ x: p.x, y: p.y - T / 2 })), true);

    this.car = this.add.image(cx, cy + 2, carKey('iso', 1)).setScale(4).setTint(0xe53935);
    this.car.setDepth(this.car.y);

    // 정비사 두 명이 차 주위를 돈다. 깊이를 y로 정렬해서 차 뒤 · 앞을 오간다.
    const loop = [{ x: -70, y: -20 }, { x: 0, y: -55 }, { x: 70, y: -20 }, { x: 0, y: 45 }];
    ['mech-a', 'mech-b'].forEach((key, idx) => {
      const m = this.add.image(cx + loop[idx * 2].x, cy + loop[idx * 2].y, key).setScale(3).setOrigin(0.5, 1);
      this.mechs.push(m);
      let step = idx * 2;
      const walk = () => {
        step = (step + 1) % loop.length;
        this.tweens.add({ targets: m, x: cx + loop[step].x, y: cy + loop[step].y, duration: 1400, onComplete: walk });
      };
      walk();
      this.tweens.add({ targets: m, scaleY: 2.8, yoyo: true, repeat: -1, duration: 180 });
    });

    this.add.text(W / 2, 40, '차고', { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
    this.panel = this.add.text(16, 470, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', backgroundColor: '#1d2433', padding: { x: 10, y: 8 },
    });
    this.drawPanel();

    const sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 40, max: 140 }, lifespan: 600, scale: { start: 2, end: 0 },
      tint: [0xffe082, 0xffffff, 0x80deea], emitting: false,
    }).setDepth(9999);

    button(this, 270, 490, '강화 (스패너)', () => {
      const i = Phaser.Math.Between(0, 3), up = Phaser.Math.Between(1, 3);
      this.stats[i] += up;
      this.drawPanel(i);
      sparks.explode(30, this.car.x, this.car.y - 10);
      this.tweens.add({ targets: this.car, y: this.car.y - 8, yoyo: true, duration: 120 });
      this.car.setTintFill(0xffffff);
      this.time.delayedCall(90, () => this.car.setTint(0xe53935));
      const pop = this.add.text(this.car.x, this.car.y - 60, `+${up} ${STATS[i]}`, {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#7CFC8A', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(9999);
      this.tweens.add({ targets: pop, y: pop.y - 40, alpha: 0, duration: 900, onComplete: () => pop.destroy() });
    });
    button(this, W / 2, 590, '레이스 보기 ▶', () => this.scene.start('race'));
  }

  drawPanel(changed = -1) {
    this.panel.setText(STATS.map((s, i) => `${s.padEnd(4, ' ')} ${String(this.stats[i]).padStart(3)}${i === changed ? ' ▲' : ''}`).join('\n'));
  }

  update() {
    for (const m of this.mechs) m.setDepth(m.y);
  }
}
