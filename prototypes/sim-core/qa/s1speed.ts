// S1 실패 순간 두 차 속도 확인 (측정만, 기본값 그대로. 지시서 2026-11-02). src는 바꾸지 않고 frames · trace · 판정 기록으로 다시 계산한다.
// 조건은 s1cap.ts 기준 설정과 같다: L-B 3트랙, MOTIF_ALL, 참가 10대, 출발 순서 10가지 순환.
// node qa/s1speed.ts collect <adjust|confirm> <M1|M2|M3> > <파일>.json
// node qa/s1speed.ts report <json 파일들>
//
// 시간축 (s1cap.ts 머리 주석과 같음): frames[k] = 틱 k 이동 뒤, trace[T-1] = 틱 T.
// - 틱 T의 이동은 이동 전 위치 frames[T-1]에서 effParams로 최고속도를 정하고, 슬립스트림 표시 trace[T-1][5]도 이동 전 상태, 속도 trace[T-1][0]은 틱 T 이동 뒤.
// - 실효 V_top(틱 T) = V_top × (1 + max(슬립 ? s_ss : 0, 부스트 중 ? b : 0)) (구간 모드, sim.ts effParams). 부스트 중 = 그 전 틱에 부스트 판정(종류 9)이 있었고
//   frames[T-1]이 [구간 시작, 구간 시작 + 구간 길이) 안 (sim.ts 부스트 감지와 같은 계산).
// - 시도 시작 T0 = 종류 1, 결과 T1 = 같은 두 차의 첫 종류 7 · 2 · 3. 시도 끝 순간 = 시도 중 마지막 이동 틱 T1−1: 속도 trace[T1-2][0], 위치 frames[T1-1].
// - 옆 차선으로 넘어간 순간 Tr = 막힘 상한이 원래 차선 앞차에서 풀리는 첫 틱 (sim.ts OT-2: (2)단계가 보는 차선 상태 trace[Tr-2]에서
//   옆 간격 |차선 중심 차| × 진행 ≥ 해제 간격 3, 또는 이미 원래 차선을 떠남). Tr ≤ T1이 아니면 '넘어가지 못함'.
import { readFileSync } from 'node:fs';
import * as C from '../src/config.ts';
import { buildCourse, carParams, segAt, vCorner } from '../src/physics.ts';
import { boostZoneLength } from '../src/trackCheck.ts';
import type { RaceOptions, Track } from '../src/types.ts';
import { BASE, f, load, mean, opponents, out, STUCK, table, testCar, tryRace } from './lib.ts';

const N = 10;
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...C.MOTIF_ALL };
const rotate = (k: number) => Array.from({ length: N }, (_, slot) => (slot - k + N) % N);
const [part, set, trackArg] = process.argv.slice(2);
const ONE_S = Math.round(1 / C.TICK_SECONDS);

type Rec = { kind: 'S1' | 'segEnd' | 'abort'; rA: number; rD: number; overlap: number; seg: 'straight' | 'corner'; left: number; margin: number; past: number; brk: null | { rA: number; rD: number; overlap: number; left: number; secs: number }; rel: null | { v: number; r: number; slipBefore: number; slipAt: number; dv1: number; dvLen: number; gap: number } };

if (part === 'collect') {
  const seeds = set === 'confirm' ? C.QA_CONFIRM_SEEDS : C.QA_ADJUST_SEEDS;
  const t: Track = load(`../data/tracks/motif/${trackArg}-LB.json`);
  const course = buildCourse(t.segments, true);
  const L = course.length;
  const params = [BASE, ...opponents().map((e) => e.car.stats)].map((s) => carParams(s));
  // 부스트 구간 (sim.ts와 같은 계산)
  const zone = course.segs.find((s) => s.id === t.boostZone)!;
  const zonePrev = course.segs[(course.segs.indexOf(zone) - 1 + course.segs.length) % course.segs.length];
  const boostDetect = zonePrev.start;
  const boostLen = boostZoneLength(zone.length, zonePrev.bend, zone.next!.bend, carParams(BASE));
  const recs: Rec[] = [];
  let maxRatio = 0;
  for (let k = 0; k < N; k++)
    for (const seed of seeds) {
      const r = tryRace(t, seed, testCar(BASE), FINAL, { grid: rotate(k), trace: true });
      if (!r) continue;
      const fr = r.frames;
      const tr = r.trace!;
      // 차별 부스트 구간 [from, until) 목록과 판정 틱
      const boosts = r.judgements
        .filter((j) => j.kind === 9)
        .map((j) => {
          const s = fr[j.tick][j.cars[0]];
          const from = s - ((s - boostDetect) % L) + ((zone.start - boostDetect + L) % L);
          return { car: j.cars[0], tick: j.tick, from, until: from + boostLen };
        });
      const vTopEff = (T: number, i: number) => {
        const s = fr[T - 1][i];
        const boosting = boosts.some((b) => b.car === i && b.tick < T && s >= b.from && s < b.until);
        return params[i].vTop * (1 + Math.max(tr[T - 1][i][5] ? C.SLIP_RATIO : 0, boosting ? C.BOOST_ZONE_B / 100 : 0));
      };
      const ratio = (T: number, i: number) => {
        const x = tr[T - 1][i][0] / vTopEff(T, i);
        if (x > maxRatio) maxRatio = x;
        return x;
      };
      const tries = r.judgements.filter((j) => j.kind === 1);
      const results = r.judgements.filter((j) => j.kind === 7 || j.kind === 2 || j.kind === 3);
      for (const tj of tries) {
        const T0 = tj.tick;
        const [x, y] = tj.cars;
        const a = fr[T0 - 1][x] < fr[T0 - 1][y] ? x : y;
        const d = a === x ? y : x;
        const res = results.find((j) => j.tick > T0 && j.cars[0] === x && j.cars[1] === y);
        if (!res || res.tick - 1 <= T0) continue;
        const T1 = res.tick;
        const Te = T1 - 1;
        // 넘어간 순간
        const orig = tr[T0 - 1][a][1];
        let Tr = -1;
        for (let T = T0 + 1; T <= T1; T++) {
          const [, from, to, prog] = tr[T - 2][a];
          if (from !== orig || (to !== from && C.LANE_WIDTH * Math.abs(to - from) * prog >= C.CAR_WIDTH)) {
            Tr = T;
            break;
          }
        }
        let rel: Rec['rel'] = null;
        if (Tr > 0) {
          const v = tr[Tr - 1][a][0];
          const end = Math.min(Tr - 1 + ONE_S, tr.length - 1);
          rel = { v, r: ratio(Tr, a), slipBefore: tr[Tr - 2][a][5], slipAt: tr[Tr - 1][a][5], dv1: tr[end][a][0] - v, dvLen: (end - (Tr - 1)) * C.TICK_SECONDS, gap: fr[Tr - 1][d] - fr[Tr - 1][a] - C.CAR_LENGTH };
        }
        // 끝 위치: 구간, 직선이면 끝까지 남은 거리와 다음 코너 제동 시작점(단독 감속, k 0)과의 여유
        const sA = fr[Te][a];
        const sg = segAt(course, sA);
        const vA = tr[Te - 1][a][0];
        let left = NaN;
        let margin = NaN;
        const past = sg.kind === 'corner' ? (sA % L) - sg.start : NaN; // 코너에서 끝났으면 직선 끝을 지난 거리
        // 제동 시작 틱 Tb: 시도 끝까지 공격 차 속도가 계속 줄기 시작한 틱 (끝 틱에서 줄고 있지 않으면 없음)
        let Tb = -1;
        for (let T = Te; T > T0 + 1 && tr[T - 1][a][0] < tr[T - 2][a][0] - 1e-9; T--) Tb = T;
        let brk: Rec['brk'] = null;
        if (Tb > 0) {
          const sb = fr[Tb - 1][a];
          const sgb = segAt(course, sb);
          brk = { rA: ratio(Tb - 1, a), rD: ratio(Tb - 1, d), overlap: fr[Tb - 1][a] - fr[Tb - 1][d] + C.CAR_LENGTH, left: sgb.kind === 'straight' ? sgb.end - (sb % L) : NaN, secs: (Te - Tb + 1) * C.TICK_SECONDS };
        }
        if (sg.kind === 'straight') {
          left = sg.end - (sA % L);
          const vc = vCorner(params[a], sg.next!.bend);
          margin = left - Math.max(0, vA * vA - vc * vc) / (2 * params[a].aBrk);
        }
        recs.push({ kind: res.kind === 7 ? 'S1' : res.kind === 2 ? 'segEnd' : 'abort', rA: ratio(Te, a), rD: ratio(Te, d), overlap: fr[Te][a] - fr[Te][d] + C.CAR_LENGTH, seg: sg.kind as Rec['seg'], left, margin, past, brk, rel });
      }
    }
  process.stdout.write(JSON.stringify({ set, track: t.id, recs, maxRatio, stuck: STUCK.length }) + '\n');
}

if (part === 'report') {
  const data = process.argv.slice(3).map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const all = data.flatMap((d) => d.recs) as Rec[];
  const pc = (n: number, of: number) => `${f((n / Math.max(1, of)) * 100, 1)}%`;
  const q = (xs: number[], d = 3) => {
    const s = xs.filter((x) => !Number.isNaN(x)).sort((p, r) => p - r);
    const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return s.length ? `${f(mean(s), d)} · ${[0.1, 0.25, 0.5, 0.75, 0.9].map((p) => f(at(p), d)).join(' / ')}` : '–';
  };
  const groups: [string, Rec[]][] = [
    ['실패 전체', all.filter((r) => r.kind !== 'S1')],
    ['실패: 구간 끝', all.filter((r) => r.kind === 'segEnd')],
    ['실패: 옆 차선 점유 되돌림', all.filter((r) => r.kind === 'abort')],
    ['성공 (S1)', all.filter((r) => r.kind === 'S1')],
  ];
  out(`시도 ${all.length}건 (결과가 난 시도만, 미결 제외), 멈춘 레이스 ${data.reduce((s, d) => s + d.stuck, 0)}. 자기 점검: 속도 ÷ 실효 V_top 최댓값 ${f(Math.max(...data.map((d) => d.maxRatio)), 6)} (1 이하여야 실효값 재구성이 맞다).`);
  out();
  out('### 1. 시도 끝 순간 속도 ÷ 실효 V_top (평균 · 10 / 25 / 50 / 75 / 90 백분위)');
  out();
  out(table(['묶음', '건수', '공격 차', '방어 차', '두 차 모두 ≥ 98%', '공격 차만 ≥ 98%', '방어 차만 ≥ 98%'], groups.map(([n, g]) => [n, g.length, q(g.map((r) => r.rA)), q(g.map((r) => r.rD)), pc(g.filter((r) => r.rA >= 0.98 && r.rD >= 0.98).length, g.length), pc(g.filter((r) => r.rA >= 0.98 && r.rD < 0.98).length, g.length), pc(g.filter((r) => r.rA < 0.98 && r.rD >= 0.98).length, g.length)])));
  out();
  out('### 2. 옆 차선으로 넘어간 순간 (막힘 상한이 원래 차선 앞차에서 풀리는 첫 틱)');
  out();
  out('속도 = 그 틱 이동 뒤 공격 차 속도 (u/s), 1초 뒤 변화 = 20틱 뒤 속도 − 그 속도 (레이스가 먼저 끝나면 남은 틱까지), 간격 = 방어 차 위치 − 공격 차 위치 − 차 길이.');
  out();
  out(
    table(
      ['묶음', '넘어감 / 못 넘어감', '속도', '속도 ÷ 실효 V_top', '슬립스트림 켜짐: 직전 틱 → 넘어간 틱', '1초 뒤 속도 변화', '넘어간 순간 간격 (u)'],
      groups.map(([n, g]) => {
        const rs = g.map((r) => r.rel).filter((x): x is NonNullable<Rec['rel']> => !!x);
        return [n, `${rs.length} / ${g.length - rs.length}`, q(rs.map((x) => x.v), 1), q(rs.map((x) => x.r)), `${pc(rs.filter((x) => x.slipBefore).length, rs.length)} → ${pc(rs.filter((x) => x.slipAt).length, rs.length)}`, q(rs.map((x) => x.dv1), 2), q(rs.map((x) => x.gap), 2)];
      }),
    ),
  );
  out();
  out('### 3. 시도 끝 순간 겹침 = 공격 차 앞 범퍼 − 방어 차 뒤 범퍼 (u, 차 길이 6)');
  out();
  out(table(['묶음', '건수', '겹침', '0 미만 (못 붙음)', '0~3 (꼬리 겹침)', '3 이상 (중심 넘음)'], groups.map(([n, g]) => [n, g.length, q(g.map((r) => r.overlap), 2), pc(g.filter((r) => r.overlap < 0).length, g.length), pc(g.filter((r) => r.overlap >= 0 && r.overlap < 3).length, g.length), pc(g.filter((r) => r.overlap >= 3).length, g.length)])));
  out();
  out('### 4. 시도 끝 위치 (공격 차)');
  out();
  out('남은 거리 = 그 직선 끝까지 (u). 제동 여유 = 남은 거리 − 단독 제동 거리 (v² − 다음 코너 한계²) / (2 a_brk), 코너 한계는 k 0 · 더티 에어 없이. 음수 = 이미 제동 시작점을 지남.');
  out();
  out(
    table(
      ['묶음', '건수', '코너에서 끝남', '직선 끝을 지난 거리 (코너에서 끝남, u)', '직선에서 끝남', '남은 거리 (직선)', '제동 여유 (직선)', '제동 시작점 지남 (여유 < 0)'],
      groups.map(([n, g]) => {
        const st = g.filter((r) => r.seg === 'straight');
        return [n, g.length, pc(g.length - st.length, g.length), q(g.filter((r) => r.seg === 'corner').map((r) => r.past), 2), pc(st.length, g.length), q(st.map((r) => r.left), 1), q(st.map((r) => r.margin), 1), pc(st.filter((r) => r.margin < 0).length, st.length)];
      }),
    ),
  );
  out();
  out('### 4-1. 공격 차 제동 시작 순간 (시도 끝까지 속도가 계속 줄기 시작한 틱 Tb의 직전 틱 Tb−1 이동 뒤: 속도 trace[Tb-2], 위치 frames[Tb-1])');
  out();
  out('속도 비율은 1과 같은 실효 V_top 기준. 남은 거리 = 그 직선 끝까지 (코너에서 감속을 시작했으면 빠짐). 감속 시간 = Tb부터 시도 끝 틱까지.');
  out();
  out(
    table(
      ['묶음', '감속으로 끝남 / 아님', '공격 차 속도 비율', '방어 차 속도 비율', '두 차 모두 ≥ 98%', '겹침 (u)', '겹침 0 미만 / 0~3 / 3 이상', '남은 거리 (직선에서 시작)', '감속 시간 (s)'],
      groups.map(([n, g]) => {
        const bs = g.map((r) => r.brk).filter((x): x is NonNullable<Rec['brk']> => !!x);
        return [n, `${bs.length} / ${g.length - bs.length}`, q(bs.map((b) => b.rA)), q(bs.map((b) => b.rD)), pc(bs.filter((b) => b.rA >= 0.98 && b.rD >= 0.98).length, bs.length), q(bs.map((b) => b.overlap), 2), `${pc(bs.filter((b) => b.overlap < 0).length, bs.length)} / ${pc(bs.filter((b) => b.overlap >= 0 && b.overlap < 3).length, bs.length)} / ${pc(bs.filter((b) => b.overlap >= 3).length, bs.length)}`, q(bs.map((b) => b.left), 1), q(bs.map((b) => b.secs), 2)];
      }),
    ),
  );
}
