// 차량 4능력치 주행 물리 (CAR_STATS_TRACKS_PROTO_DRAFT.md §3, §7). 화면 · node: 모듈 없음.
import { A0, B0, CAR_STAT_MAX, G0, KA, KB, KG, KV, P_APEX, SUBSTEPS, TICK_SECONDS, V0 } from './config.ts';
import type { CarStats, TrackSegment } from './types.ts';

export type CarParams = {
  vTop: number; // F2 최고속도 상한
  A: number; // F3a 가속도
  vg: number; // F4 bend 1일 때 접지 한계
  aBrk: number; // F5a 진입 감속도
};

export function carParams(s: CarStats): CarParams {
  const n = (v: number) => v / CAR_STAT_MAX; // F1
  return {
    vTop: V0 * (1 + KV * n(s.topSpeed)),
    A: A0 * (1 + KA * n(s.accel)),
    vg: G0 * (1 + KG * n(s.grip)),
    aBrk: B0 * (1 + KB * n(s.brake)),
  };
}

// F4 코너 한계 속도
export const vCorner = (p: CarParams, bend: number) => Math.min(p.vTop, p.vg / bend);

export type Seg = TrackSegment & { start: number; end: number; apex: number; next: TrackSegment | null };
export type Course = { length: number; cyclic: boolean; segs: Seg[] };

// cyclic이면 마지막 구간 다음은 첫 구간 (CAR §8 랩 경계). 장면 시험은 cyclic=false
export function buildCourse(segments: TrackSegment[], cyclic: boolean): Course {
  let at = 0;
  const segs = segments.map((s, i): Seg => {
    const start = at;
    at += s.length;
    const next = i + 1 < segments.length ? segments[i + 1] : cyclic ? segments[0] : null;
    return { ...s, start, end: at, apex: start + P_APEX * s.length, next };
  });
  return { length: at, cyclic, segs };
}

const wrap = (c: Course, x: number) => (c.cyclic ? ((x % c.length) + c.length) % c.length : x);

export function segAt(c: Course, x: number): Seg {
  const xm = wrap(c, x);
  for (const s of c.segs) if (xm < s.end) return s;
  return c.segs[c.segs.length - 1];
}

// 코너 안 한계. 정점 전 = V_corner (F7). 정점 뒤 = 휘는 정도가 코너 끝으로 갈수록 k만큼 줄어든다 (AG-P024 B).
// 다음 구간이 코너(묶음)이면 그 코너의 V_corner에서 멈춘다 (디렉터 2026-11-02, CAR §4.3과 다름).
export function limitAt(c: Course, p: CarParams, k: number, x: number): number {
  const s = segAt(c, x);
  if (s.kind === 'straight') return p.vTop;
  const xm = wrap(c, x);
  if (xm < s.apex) return vCorner(p, s.bend);
  const progress = Math.min(1, (xm - s.apex) / (s.end - s.apex));
  const relax = 1 - k * progress;
  let limit = relax <= 0 ? p.vTop : Math.min(p.vTop, p.vg / (s.bend * relax));
  if (s.next?.kind === 'corner') limit = Math.min(limit, vCorner(p, s.next.bend));
  return limit;
}

// 앞쪽 코너 시작점마다 a_brk로 V_corner까지 줄일 수 있는 최대 속도 (F5를 거리마다 적용)
export function envelopeAt(c: Course, p: CarParams, x: number): number {
  const xm = wrap(c, x);
  let v = Infinity;
  for (const s of c.segs) {
    if (s.kind !== 'corner') continue;
    let d = s.start - xm;
    if (d < 0) {
      if (!c.cyclic) continue;
      d += c.length;
    }
    v = Math.min(v, Math.sqrt(vCorner(p, s.bend) ** 2 + 2 * p.aBrk * d));
  }
  return v;
}

export const DT = TICK_SECONDS / SUBSTEPS;

// 한 물리 스텝 뒤 속도. 가속은 직선과 정점 뒤에서만 (F3, F7). 감속은 envelope가 만든다 (제동은 코너 전, AG-P017).
// holdOnStraight: QA 장면에서 직선 시작 속도를 고정할 때 (CAR §12.1 접지 시험 정합화)
export function step(c: Course, p: CarParams, k: number, x: number, v: number, holdOnStraight = false): number {
  const s = segAt(c, x);
  const accel = s.kind === 'straight' ? !holdOnStraight : wrap(c, x) >= s.apex;
  const xn = x + v * DT;
  const vn = accel ? v + p.A * DT : v;
  // 스텝 시작점과 끝점의 한계를 모두 지킨다 (구간 경계에서 한 스텝 넘치는 것 방지)
  return Math.min(vn, p.vTop, limitAt(c, p, k, x), limitAt(c, p, k, xn), envelopeAt(c, p, xn));
}

export type Trace = { x: number[]; v: number[]; t: number[] };

// 단독 1대 주행 궤적. 손계산 비교와 QA 1층 장면이 쓴다
export function runSolo(
  c: Course,
  p: CarParams,
  k: number,
  o: { x0: number; v0: number; xEnd: number; holdOnStraight?: boolean },
): Trace {
  const tr: Trace = { x: [o.x0], v: [o.v0], t: [0] };
  let x = o.x0;
  let v = o.v0;
  let t = 0;
  while (x < o.xEnd) {
    v = step(c, p, k, x, v, o.holdOnStraight);
    x += v * DT;
    t += DT;
    tr.x.push(x);
    tr.v.push(v);
    tr.t.push(t);
  }
  return tr;
}

// 궤적에서 위치 X를 지날 때의 값 (선형 보간)
export function at(tr: Trace, X: number, key: 'v' | 't'): number {
  for (let i = 1; i < tr.x.length; i++) {
    if (tr.x[i] >= X) {
      const f = (X - tr.x[i - 1]) / (tr.x[i] - tr.x[i - 1]);
      return tr[key][i - 1] + f * (tr[key][i] - tr[key][i - 1]);
    }
  }
  return tr[key][tr[key].length - 1];
}
