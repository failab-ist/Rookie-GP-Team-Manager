import type { Pt } from './art';

// 시험용 서킷 하나. 긴 직선 · 헤어핀 · 시케인이 섞이게 만든 제어점.
const CTRL: Pt[] = [
  { x: 0, y: 0 }, { x: 520, y: 0 }, { x: 640, y: 40 }, { x: 680, y: 160 },
  { x: 640, y: 280 }, { x: 520, y: 320 }, { x: 420, y: 260 }, { x: 320, y: 320 },
  { x: 200, y: 380 }, { x: 60, y: 360 }, { x: -60, y: 260 }, { x: -80, y: 100 },
];

export const TRACK_WIDTH = 56;

export class Track {
  pts: Pt[] = [];
  cum: number[] = [];
  len = 0;

  constructor() {
    const n = CTRL.length;
    // Catmull-Rom으로 부드러운 폐곡선을 만든다.
    for (let i = 0; i < n; i++) {
      const p0 = CTRL[(i - 1 + n) % n], p1 = CTRL[i], p2 = CTRL[(i + 1) % n], p3 = CTRL[(i + 2) % n];
      for (let k = 0; k < 24; k++) {
        const t = k / 24, t2 = t * t, t3 = t2 * t;
        const f = (a: number, b: number, c: number, d: number) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        this.pts.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    this.cum = [0];
    for (let i = 1; i <= this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i % this.pts.length];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.len = this.cum[this.cum.length - 1];
  }

  /** 거리 s 지점의 위치 · 진행 방향 · 왼쪽 법선. */
  at(s: number) {
    s = ((s % this.len) + this.len) % this.len;
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const a = this.pts[lo], b = this.pts[(lo + 1) % this.pts.length];
    const t = (s - this.cum[lo]) / (this.cum[lo + 1] - this.cum[lo]);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang, nx: -Math.sin(ang), ny: Math.cos(ang) };
  }

  /** 앞쪽 구간의 방향 변화량(코너 세기). */
  bend(s: number, ahead = 60) {
    let d = this.at(s + ahead).ang - this.at(s).ang;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }
}
