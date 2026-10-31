import Phaser from 'phaser';

// 임시 픽셀 아트: 외부 에셋 없이 코드로 텍스처를 만든다. 최종 아트가 아니라 기술 검증용.

export type View = 'top' | 'iso';
export const DIRS = 8;
export type Pt = { x: number; y: number };

export const iso = (x: number, y: number): Pt => ({ x: x - y, y: (x + y) / 2 });
export const project = (view: View, x: number, y: number): Pt => (view === 'iso' ? iso(x, y) : { x, y });

const BODY: [number, number][] = [[-7, -4], [6, -4], [8, -2], [8, 2], [6, 4], [-7, 4]];
const GLASS: [number, number][] = [[1, -3], [4, -2.5], [4, 2.5], [1, 3]];
const WING: [number, number][] = [[-8, -4.5], [-6, -4.5], [-6, 4.5], [-8, 4.5]];

function shape(pts: [number, number][], ang: number, view: View, s: number, ox: number, oy: number): Pt[] {
  const c = Math.cos(ang), n = Math.sin(ang);
  return pts.map(([x, y]) => {
    const p = project(view, (x * c - y * n) * s, (x * n + y * c) * s);
    return { x: p.x + ox, y: p.y + oy };
  });
}

export const carKey = (view: View, dir: number) => `car-${view}-${dir}`;

export function dirOf(ang: number): number {
  const d = Math.round(ang / (Math.PI * 2 / DIRS));
  return ((d % DIRS) + DIRS) % DIRS;
}

export function makeTextures(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  const S = 28;
  for (const view of ['top', 'iso'] as View[]) {
    for (let d = 0; d < DIRS; d++) {
      const ang = (d * Math.PI * 2) / DIRS;
      g.clear();
      g.fillStyle(0x000000, 0.3);
      g.fillPoints(shape(BODY, ang, view, 1, S / 2 + 1, S / 2 + 2), true);
      // 흰 차체 + 어두운 유리: setTint로 팀 색을 입힌다.
      g.fillStyle(0xffffff);
      g.fillPoints(shape(BODY, ang, view, 1, S / 2, S / 2), true);
      g.fillPoints(shape(WING, ang, view, 1, S / 2, S / 2), true);
      g.lineStyle(1, 0x000000);
      g.strokePoints(shape(BODY, ang, view, 1, S / 2, S / 2), true);
      g.fillStyle(0x2a3140);
      g.fillPoints(shape(GLASS, ang, view, 1, S / 2, S / 2), true);
      g.generateTexture(carKey(view, d), S, S);
    }
  }

  // 정비사 (8x12)
  for (const [key, suit] of [['mech-a', 0x1e88e5], ['mech-b', 0xe53935]] as const) {
    g.clear();
    g.fillStyle(0x000000, 0.25); g.fillEllipse(4, 11, 8, 3);
    g.fillStyle(suit); g.fillRect(1, 5, 6, 5);
    g.fillStyle(0x263238); g.fillRect(1, 10, 2, 2); g.fillRect(5, 10, 2, 2);
    g.fillStyle(0xffcc99); g.fillRect(2, 1, 4, 4);
    g.fillStyle(0x4e342e); g.fillRect(2, 0, 4, 2);
    g.generateTexture(key, 8, 12);
  }

  g.clear(); g.fillStyle(0xffffff); g.fillRect(0, 0, 2, 2); g.generateTexture('spark', 2, 2);
  g.destroy();
}

export function button(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void) {
  const t = scene.add.text(x, y, label, {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff',
    backgroundColor: '#2b3a55', padding: { x: 8, y: 5 },
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  t.on('pointerdown', onClick);
  return t;
}
