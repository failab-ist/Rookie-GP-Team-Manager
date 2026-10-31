import Phaser from 'phaser';
import { button, carKey, dirOf, project, type View } from './art';
import { Track, TRACK_WIDTH } from './track';

// 화면 가독성 검증용 가짜 주행이다. 실제 레이스 시뮬레이터(P0, OPEN O-001)가 아니다.

const W = 360, H = 640, N = 10, LAPS = 3, DT = 1 / 60;
const COLORS = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0x8e24aa, 0xfb8c00, 0x00acc1, 0xd81b60, 0x8d6e63, 0xb0bec5];
const NAMES = ['나', '블루', '옐로', '그린', '퍼플', '오렌지', '시안', '핑크', '브라운', '실버'];
const LANE_MAX = TRACK_WIDTH / 2 - 7;
type CamMode = 'me' | 'leader' | 'all';
const CAM_LABEL: Record<CamMode, string> = { me: '내 차', leader: '선두', all: '전체' };

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Car = {
  i: number; s: number; v: number; lane: number; laneTarget: number;
  base: number; phase: number; lastHit: number; done: boolean;
  sprite: Phaser.GameObjects.Image;
};

export class RaceScene extends Phaser.Scene {
  track = new Track();
  view: View = 'iso';
  camMode: CamMode = 'me';
  seed = 1;
  cars: Car[] = [];
  t = 0;
  acc = 0;
  world: Phaser.GameObjects.GameObject[] = [];
  ui: Phaser.GameObjects.GameObject[] = [];
  rows: { chip: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }[] = [];
  trackGfx!: Phaser.GameObjects.Graphics;
  marker!: Phaser.GameObjects.Triangle;
  sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  info!: Phaser.GameObjects.Text;
  myRank = -1;
  leader = -1;
  ended = false;

  constructor() { super('race'); }

  init(data: { seed?: number; view?: View; camMode?: CamMode }) {
    this.seed = data.seed ?? 1;
    this.view = data.view ?? 'iso';
    this.camMode = data.camMode ?? 'me';
    this.cars = []; this.world = []; this.ui = []; this.rows = [];
    this.t = 0; this.acc = 0; this.myRank = -1; this.leader = -1; this.ended = false;
  }

  create() {
    this.trackGfx = this.add.graphics().setDepth(-1e6);
    this.world.push(this.trackGfx);
    this.drawTrack();

    const r = rng(this.seed);
    for (let i = 0; i < N; i++) {
      const sprite = this.add.image(0, 0, carKey(this.view, 0)).setTint(COLORS[i]);
      this.world.push(sprite);
      const lane = i % 2 ? 12 : -12;
      this.cars.push({
        i, s: -Math.floor(i / 2) * 22 - (i % 2) * 8, v: 0, lane, laneTarget: lane,
        base: 150 * (0.96 + r() * 0.08), phase: r() * Math.PI * 2, lastHit: -9, done: false, sprite,
      });
    }
    this.marker = this.add.triangle(0, 0, 0, 0, 10, 0, 5, 8, 0xffffff).setDepth(1e6);
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 30, max: 90 }, lifespan: 350, scale: { start: 1.5, end: 0 },
      tint: [0xffe082, 0xffffff], emitting: false,
    }).setDepth(1e6);
    this.world.push(this.marker, this.sparks);

    // HUD는 줌의 영향을 받지 않게 별도 카메라로 그린다.
    const uiCam = this.cameras.add(0, 0, W, H);
    this.ui.push(this.add.rectangle(4, 4, 112, N * 15 + 8, 0x000000, 0.45).setOrigin(0));
    for (let k = 0; k < N; k++) {
      const chip = this.add.rectangle(12, 14 + k * 15, 8, 8, 0xffffff);
      const text = this.add.text(20, 7 + k * 15, '', { fontFamily: 'sans-serif', fontSize: '11px', color: '#ffffff' });
      this.rows.push({ chip, text });
      this.ui.push(chip, text);
    }
    this.info = this.add.text(W - 6, 8, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', align: 'right', backgroundColor: '#00000073', padding: { x: 4, y: 3 },
    }).setOrigin(1, 0);
    this.ui.push(
      this.info,
      button(this, 50, 610, '카메라', () => { this.camMode = this.camMode === 'me' ? 'leader' : this.camMode === 'leader' ? 'all' : 'me'; this.setCamera(); }),
      button(this, 130, 610, '시점', () => { this.view = this.view === 'iso' ? 'top' : 'iso'; this.drawTrack(); this.setCamera(); }),
      button(this, 215, 610, '같은 시드', () => this.scene.restart({ seed: this.seed, view: this.view, camMode: this.camMode })),
      button(this, 305, 610, '차고', () => this.scene.start('garage')),
    );
    this.input.keyboard?.on('keydown-N', () => this.scene.restart({ seed: this.seed + 1, view: this.view, camMode: this.camMode }));
    this.ui.push(button(this, 305, 575, '새 시드', () => this.scene.restart({ seed: this.seed + 1, view: this.view, camMode: this.camMode })));

    this.cameras.main.ignore(this.ui);
    uiCam.ignore(this.world);
    this.render();
    this.setCamera();
  }

  drawTrack() {
    const g = this.trackGfx, v = this.view, P = (x: number, y: number) => project(v, x, y);
    g.clear();
    for (let i = -3; i < 11; i++) for (let j = -3; j < 7; j++) {
      const s = 80, x = i * s, y = j * s;
      g.fillStyle((i + j) & 1 ? 0x4c9a3f : 0x56a848);
      g.fillPoints([P(x, y), P(x + s, y), P(x + s, y + s), P(x, y + s)], true);
    }
    const tr = this.track, n = tr.pts.length, half = TRACK_WIDTH / 2;
    const edge = (k: number, off: number) => { const a = tr.at(tr.cum[k % n]); return P(a.x + a.nx * off, a.y + a.ny * off); };
    for (let k = 0; k < n; k++) {
      // 연석: 빨강/흰색 번갈아
      g.fillStyle(Math.floor(k / 3) % 2 ? 0xffffff : 0xd32f2f);
      g.fillPoints([edge(k, half + 4), edge(k + 1, half + 4), edge(k + 1, -half - 4), edge(k, -half - 4)], true);
    }
    for (let k = 0; k < n; k++) {
      g.fillStyle(0x5a5f66);
      g.fillPoints([edge(k, half), edge(k + 1, half), edge(k + 1, -half), edge(k, -half)], true);
    }
    // 출발선 체커
    const a = tr.at(0), b = tr.at(8);
    for (let q = 0; q < 8; q++) for (let row = 0; row < 2; row++) {
      if ((q + row) % 2) continue;
      const o0 = -half + (q * TRACK_WIDTH) / 8, o1 = o0 + TRACK_WIDTH / 8;
      const p = (t: number, o: number) => { const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; return P(x + a.nx * o, y + a.ny * o); };
      g.fillStyle(0xffffff);
      g.fillPoints([p(row / 2, o0), p(row / 2, o1), p((row + 1) / 2, o1), p((row + 1) / 2, o0)], true);
    }
  }

  setCamera() {
    const cam = this.cameras.main;
    if (this.camMode === 'all') {
      cam.stopFollow();
      const ps = this.track.pts.map((p) => project(this.view, p.x, p.y));
      const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      cam.setZoom(Math.min(W / (maxX - minX + 80), (H - 260) / (maxY - minY + 80)));
      cam.centerOn((minX + maxX) / 2, (minY + maxY) / 2 + 20);
    } else {
      cam.setZoom(1.6);
      const target = this.camMode === 'me' ? this.cars[0] : this.cars[Math.max(this.leader, 0)];
      cam.startFollow(target.sprite, true, 0.12, 0.12);
    }
  }

  step() {
    const len = this.track.len;
    for (const c of this.cars) {
      if (c.done) { c.v *= 0.985; c.s += c.v * DT; continue; }
      let target = c.base * (1 - Math.min(0.55, this.track.bend(c.s) * 0.6)) * (1 + 0.05 * Math.sin(this.t * 0.7 + c.phase));
      for (const o of this.cars) {
        if (o === c) continue;
        const gap = o.s - c.s, side = Math.abs(o.lane - c.lane);
        if (gap > 0 && gap < 18 && side < 10) {
          target = Math.min(target, o.v * 0.98);
          if (Math.abs(c.laneTarget - o.lane) < 10) c.laneTarget = o.lane > 0 ? -LANE_MAX : LANE_MAX;
        }
        if (Math.abs(gap) < 7 && side < 6 && this.t - c.lastHit > 1) {
          c.lastHit = this.t; c.v *= 0.9;
          const p = this.track.at(c.s), sp = project(this.view, p.x + p.nx * c.lane, p.y + p.ny * c.lane);
          this.sparks.explode(10, sp.x, sp.y);
        }
      }
      c.v += (target - c.v) * 0.04;
      const dl = c.laneTarget - c.lane;
      c.lane += Math.sign(dl) * Math.min(Math.abs(dl), 28 * DT);
      c.s += c.v * DT;
      if (c.s >= LAPS * len) c.done = true;
    }
    this.t += DT;
  }

  render() {
    for (const c of this.cars) {
      const p = this.track.at(c.s), sp = project(this.view, p.x + p.nx * c.lane, p.y + p.ny * c.lane);
      c.sprite.setPosition(sp.x, sp.y).setDepth(sp.y);
      if (this.view === 'iso') c.sprite.setTexture(carKey('iso', dirOf(p.ang))).setRotation(0);
      else c.sprite.setTexture(carKey('top', 0)).setRotation(p.ang);
    }
    const me = this.cars[0].sprite;
    this.marker.setPosition(me.x - 5, me.y - 20);

    const order = [...this.cars].sort((a, b) => b.s - a.s);
    order.forEach((c, k) => {
      this.rows[k].chip.setFillStyle(COLORS[c.i]);
      this.rows[k].text.setText(`P${k + 1} ${NAMES[c.i]}`).setColor(c.i === 0 ? '#ffeb3b' : '#ffffff');
    });
    const rank = order.findIndex((c) => c.i === 0);
    if (this.myRank >= 0 && rank !== this.myRank) this.flash(rank < this.myRank ? `▲ P${rank + 1}` : `▼ P${rank + 1}`, rank < this.myRank ? '#7CFC8A' : '#ff8a80');
    this.myRank = rank;
    if (order[0].i !== this.leader) { this.leader = order[0].i; if (this.camMode === 'leader') this.setCamera(); }

    const lap = Math.min(LAPS, Math.floor(Math.max(0, this.cars[0].s) / this.track.len) + 1);
    this.info.setText(`LAP ${lap}/${LAPS}  FPS ${Math.round(this.game.loop.actualFps)}\n시드 ${this.seed} · ${this.view === 'iso' ? '아이소' : '탑다운'} · ${CAM_LABEL[this.camMode]}`);
    if (!this.ended && this.cars[0].done) {
      this.ended = true;
      this.flash(`완주! P${rank + 1}`, '#ffeb3b', 2500);
    }
  }

  flash(msg: string, color: string, ms = 900) {
    const t = this.add.text(W / 2, 200, msg, {
      fontFamily: 'sans-serif', fontSize: '22px', color, stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.cameras.main.ignore(t);
    this.tweens.add({ targets: t, y: 170, alpha: 0, delay: ms - 500, duration: 500, onComplete: () => t.destroy() });
  }

  update(_time: number, delta: number) {
    this.acc += Math.min(delta, 100) / 1000;
    while (this.acc >= DT) { this.step(); this.acc -= DT; }
    this.render();
  }
}
