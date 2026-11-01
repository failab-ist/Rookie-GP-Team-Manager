// 트랙 데이터 형식 검사와 코너 검사 (CAR_STATS_TRACKS_PROTO_DRAFT.md §4.1, §4.3). 기준 차로 공식 계산한다.
import { BASE_CAR_STAT, P_APEX } from './config.ts';
import { carParams, vCorner, type CarParams } from './physics.ts';
import type { Track, TrackSegment } from './types.ts';

export type CornerCalc = {
  id: string;
  bend: number;
  vCorner: number;
  vEntry: number;
  vApex: number;
  vExit: number;
  D: number; // 앞 직선의 제동 거리. 묶음 내부는 0
  role: 'single' | 'first' | 'inner' | 'last';
  exitLength: number | null; // (c) L_next − D_next. 단독 · 마지막 코너만
  limitCapped: boolean; // 정점 뒤 한계가 코너 끝에서 V_top에 잘림
};
export type StraightCalc = { id: string; vStart: number; vS: number; D: number; reachTop: boolean };
export type TrackCalc = { errors: string[]; corners: CornerCalc[]; straights: StraightCalc[] };

const BASE = { topSpeed: BASE_CAR_STAT, accel: BASE_CAR_STAT, grip: BASE_CAR_STAT, brake: BASE_CAR_STAT };

export function checkFormat(track: Track): string[] {
  const errors: string[] = [];
  const segs = track.segments ?? [];
  if (!segs.length) errors.push('구간이 없다');
  const ids = new Set<string>();
  for (const s of segs) {
    if (!s.id || ids.has(s.id)) errors.push(`id 누락 또는 중복: ${s.id}`);
    ids.add(s.id);
    if (!(s.length > 0)) errors.push(`${s.id}: 길이 0 이하`);
    if (!(s.width > 0)) errors.push(`${s.id}: 폭 0 이하`);
    if (s.kind === 'straight' && s.bend !== 0) errors.push(`${s.id}: 직선인데 bend가 0이 아님`);
    if (s.kind === 'corner' && !(s.bend > 0 && s.bend <= 1)) errors.push(`${s.id}: 코너 bend는 (0, 1]`);
    if (s.kind !== 'straight' && s.kind !== 'corner') errors.push(`${s.id}: 종류 오류`);
    if (typeof s.passable !== 'boolean') errors.push(`${s.id}: 추월 가능 표시 누락`);
  }
  return errors;
}

// 정점 뒤 출구 속도 (F7 + AG-P024 B). 다음 구간이 코너면 그 V_corner에서 멈춘다. 거리 적분
function exitSpeed(p: CarParams, k: number, seg: TrackSegment, vApex: number, capNext: number): number {
  const n = 1000;
  const dx = ((1 - P_APEX) * seg.length) / n;
  let v = vApex;
  for (let i = 1; i <= n; i++) {
    const relax = 1 - (k * i) / n;
    const limit = relax <= 0 ? p.vTop : Math.min(p.vTop, p.vg / (seg.bend * relax));
    v = Math.min(Math.sqrt(v * v + 2 * p.A * dx), limit, capNext);
  }
  return v;
}

export function checkTrack(track: Track, k: number, p: CarParams = carParams(BASE)): TrackCalc {
  const errors = checkFormat(track);
  if (errors.length) return { errors, corners: [], straights: [] };
  const segs = track.segments;
  const n = segs.length;
  const prev = (i: number) => segs[(i - 1 + n) % n];
  const next = (i: number) => segs[(i + 1) % n];

  let corners: CornerCalc[] = [];
  let straights: StraightCalc[] = [];
  let v = 0; // 출발. 3바퀴 돌려 정상 상태 값만 쓴다 (CAR §4.2, 2랩째 이후)
  for (let lap = 0; lap < 3; lap++) {
    corners = [];
    straights = [];
    for (let i = 0; i < n; i++) {
      const s = segs[i];
      if (s.kind === 'straight') {
        const nx = next(i);
        const vStart = v;
        if (nx.kind !== 'corner') {
          v = Math.min(p.vTop, Math.sqrt(v * v + 2 * p.A * s.length)); // F6a
          straights.push({ id: s.id, vStart, vS: v, D: 0, reachTop: v >= p.vTop });
          continue;
        }
        const vc = vCorner(p, nx.bend);
        const dTop = (p.vTop ** 2 - vc ** 2) / (2 * p.aBrk);
        let D: number;
        let vS: number;
        if (vStart ** 2 + 2 * p.A * (s.length - dTop) >= p.vTop ** 2) {
          D = dTop; // F5
          vS = p.vTop;
        } else {
          D = Math.max(0, (vStart ** 2 + 2 * p.A * s.length - vc ** 2) / (2 * (p.aBrk + p.A))); // F5-b
          vS = Math.sqrt(vStart ** 2 + 2 * p.A * (s.length - D));
        }
        if (D > s.length) errors.push(`${s.id}: 제동 거리 ${D.toFixed(1)} > 직선 길이 ${s.length}`);
        straights.push({ id: s.id, vStart, vS, D, reachTop: vS >= p.vTop });
        v = D > 0 ? vc : vS;
      } else {
        const vc = vCorner(p, s.bend);
        const firstOfGroup = prev(i).kind === 'straight';
        const lastOfGroup = next(i).kind === 'straight';
        const role = firstOfGroup ? (lastOfGroup ? 'single' : 'first') : lastOfGroup ? 'last' : 'inner';
        const vEntry = v;
        const vApex = Math.min(vEntry, vc);
        const capNext = next(i).kind === 'corner' ? vCorner(p, next(i).bend) : Infinity;
        v = exitSpeed(p, k, s, vApex, capNext);
        const relax = 1 - k;
        corners.push({
          id: s.id,
          bend: s.bend,
          vCorner: vc,
          vEntry,
          vApex,
          vExit: v,
          D: 0, // 아래에서 앞 직선 값으로 채운다
          role,
          exitLength: null,
          limitCapped: relax <= 0 || p.vg / (s.bend * relax) >= p.vTop,
        });
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const s = segs[i];
    if (s.kind !== 'corner') continue;
    const c = corners.find((x) => x.id === s.id)!;
    if (c.role === 'first' || c.role === 'single') c.D = straights.find((st) => st.id === prev(i).id)?.D ?? 0;
    // (a) 접지 반응
    if (!(p.vg / s.bend < p.vTop)) errors.push(`${s.id}: (a) Vg/bend ≥ V_top`);
    // (b) 제동
    if ((c.role === 'first' || c.role === 'single') && !(c.D > 0)) errors.push(`${s.id}: (b) 제동 거리 D = 0`);
    // 묶음 내부: 앞 코너 정점 속도가 이 코너 한계를 넘으면 감속이 필요하다 → 거부
    if (c.role === 'inner' || c.role === 'last') {
      const pc = corners.find((x) => x.id === prev(i).id)!;
      if (pc.vApex > c.vCorner + 1e-9) errors.push(`${s.id}: 묶음 내부 감속 필요 (앞 정점 ${pc.vApex.toFixed(1)} > ${c.vCorner.toFixed(1)})`);
    }
    // (c) 탈출
    if (c.role === 'single' || c.role === 'last') {
      const st = straights.find((x) => x.id === next(i).id)!;
      c.exitLength = next(i).length - st.D;
      if (!(c.exitLength > 0)) errors.push(`${s.id}: (c) 탈출 길이 ${c.exitLength.toFixed(1)} ≤ 0`);
    }
  }
  return { errors, corners, straights };
}
