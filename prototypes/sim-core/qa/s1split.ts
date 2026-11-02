// S1 실패 원인 분리 측정 (측정만, 기본값 그대로. 지시서 2026-11-02). 측정용 옵션 carWidth · laneWidth를 하나씩만 바꾼다.
// 조건은 s1cap.ts 기준 설정과 같다: L-B 3트랙, MOTIF_ALL(더티 에어 3, 부스트 4), 참가 10대, 출발 순서 10가지 순환.
// node qa/s1split.ts collect <base|car19|lane5> <adjust|confirm> <M1|M2|M3> > <파일>.json
// node qa/s1split.ts report <json 파일들>
//
// 시간축 (s1cap.ts · s1speed.ts와 같음): frames[k] = 틱 k 이동 뒤, trace[T-1] = 틱 T(속도는 이동 뒤, 차선 상태는 (3)단계 뒤, 슬립 · 상한 표시는 이동 전 상태).
// - 시도 시작 T0 = 종류 1, 결과 T1 = 같은 두 차의 첫 종류 7 · 2 · 3. 목표 차선 = trace[T0-1]의 to.
// - 차선 변경 완료 Tc = T0 뒤 처음으로 trace[T-1]에서 from = to = 목표 차선인 틱 (T1 전에 없으면 '변경 미완료').
// - 제동 시작 Tb = Tc 이후 처음으로 공격 차 속도가 줄었고(trace[T-1][0] < trace[T-2][0]) 그 틱 막힘 상한 표시가 없는 틱. 레이스가 끝나도록 없으면 '제동 없음'.
//   Tc → Tb 구간은 시도 결과와 상관없이 잰다 (성공 시도는 결과가 먼저 날 수 있다).
// - 실효 V_top = V_top × (1 + max(슬립 0.03, 부스트 구간 0.04)) (s1speed.ts와 같은 재구성).
// - 4. 직선별: 시도 중 이동 틱(T0 ≤ T < T1)을 그 틱 이동 전 위치의 직선으로 나눠, 공격 차가 실효 V_top 98% 이상인 시간과
//   슬립스트림으로 줄인 거리 Σ max(0, v − 슬립 없는 실효 V_top) × 0.05 (가속 +3%로 얻은 거리는 넣지 않는다).
import { readFileSync } from 'node:fs';
import * as C from '../src/config.ts';
import { buildCourse, carParams, segAt } from '../src/physics.ts';
import { boostZoneLength } from '../src/trackCheck.ts';
import type { RaceOptions, Track } from '../src/types.ts';
import { BASE, f, load, mean, opponents, out, STUCK, table, testCar, tryRace } from './lib.ts';

const N = 10;
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...C.MOTIF_ALL };
const SETS: Record<string, { name: string; opts: Partial<RaceOptions> }> = {
  base: { name: `기준선 (차 폭 ${C.CAR_WIDTH}, 차선 폭 ${C.LANE_WIDTH})`, opts: FINAL },
  car19: { name: `차 폭 ${C.CAR_WIDTH_COMPARE} (차선 폭 ${C.LANE_WIDTH})`, opts: { ...FINAL, carWidth: C.CAR_WIDTH_COMPARE } },
  lane5: { name: `차선 폭 ${C.LANE_WIDTH_COMPARE} (차 폭 ${C.CAR_WIDTH})`, opts: { ...FINAL, laneWidth: C.LANE_WIDTH_COMPARE } },
};
const rotate = (k: number) => Array.from({ length: N }, (_, slot) => (slot - k + N) % N);
const ONE_S = Math.round(1 / C.TICK_SECONDS);
const CAUSE_KO: Record<string, string> = { start: '출발부터 1위', contact: '접촉', mistake: '상대 실수', boost: '부스트', brake: '제동', corner: '코너', exit: '탈출', straight: '직선', none: 'OT-4 기록 없음' };

type Att = {
  ok: boolean;
  tc: null | { v: number; slip: number; dv1: number; dur: number | null; ticks: number; both98: number; rA: number[]; rD: number[]; overlap: number | null };
  segs: Record<string, { full: number; slipGain: number }>;
};

const [part, key, set, trackArg] = process.argv.slice(2);

if (part === 'collect') {
  const v0 = SETS[key];
  const seeds = set === 'confirm' ? C.QA_CONFIRM_SEEDS : C.QA_ADJUST_SEEDS;
  const t: Track = load(`../data/tracks/motif/${trackArg}-LB.json`);
  const course = buildCourse(t.segments, true);
  const L = course.length;
  const params = [BASE, ...opponents().map((e) => e.car.stats)].map((s) => carParams(s));
  const zone = course.segs.find((s) => s.id === t.boostZone)!;
  const zonePrev = course.segs[(course.segs.indexOf(zone) - 1 + course.segs.length) % course.segs.length];
  const boostLen = boostZoneLength(zone.length, zonePrev.bend, zone.next!.bend, carParams(BASE));
  const atts: Att[] = [];
  const wins = { races: 0, pole: 0, back: 0, causes: {} as Record<string, number> };
  let maxRatio = 0;
  for (let k = 0; k < N; k++)
    for (const seed of seeds) {
      const grid = rotate(k);
      const r = tryRace(t, seed, testCar(BASE), v0.opts, { grid, trace: true });
      if (!r) continue;
      const fr = r.frames;
      const tr = r.trace!;
      // 5. 우승: 출발 자리, 이긴 이유 = 우승자가 마지막으로 1위가 된 순간의 OT-4 원인 (winpath.ts와 같은 정의)
      const winner = r.finishOrder[0];
      const slot = grid.indexOf(winner);
      wins.races++;
      if (slot === 0) wins.pole++;
      if (slot >= 2) wins.back++;
      const lead = [...r.events].reverse().find((e) => e.kind === 6 && e.cause === `by:${winner}`);
      const pass = lead && r.events.find((e) => e.kind === 3 && e.tick === lead.tick && e.cause!.endsWith(`:by:${winner}`));
      const cause = !lead ? 'start' : pass ? pass.cause!.split(':')[0] : 'none';
      wins.causes[cause] = (wins.causes[cause] ?? 0) + 1;

      const boosts = r.judgements.filter((j) => j.kind === 9).map((j) => {
        const s = fr[j.tick][j.cars[0]];
        const from = s - ((s - zonePrev.start) % L) + ((zone.start - zonePrev.start + L) % L);
        return { car: j.cars[0], tick: j.tick, from, until: from + boostLen };
      });
      const boosting = (T: number, i: number) => boosts.some((b) => b.car === i && b.tick < T && fr[T - 1][i] >= b.from && fr[T - 1][i] < b.until);
      const vTopEff = (T: number, i: number, slip = tr[T - 1][i][5]) => params[i].vTop * (1 + Math.max(slip ? C.SLIP_RATIO : 0, boosting(T, i) ? C.BOOST_ZONE_B / 100 : 0));
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
        if (!res) continue;
        const T1 = res.tick;
        const target = tr[T0 - 1][a][2];
        let Tc = -1;
        for (let T = T0 + 1; T < T1; T++)
          if (tr[T - 1][a][1] === target && tr[T - 1][a][2] === target) {
            Tc = T;
            break;
          }
        let tc: Att['tc'] = null;
        if (Tc > 0) {
          let Tb = -1;
          for (let T = Tc + 1; T <= tr.length; T++)
            if (tr[T - 1][a][0] < tr[T - 2][a][0] - 1e-9 && !tr[T - 1][a][4]) {
              Tb = T;
              break;
            }
          const end = Tb > 0 ? Tb - 1 : tr.length;
          const rA: number[] = [];
          const rD: number[] = [];
          let both = 0;
          for (let T = Tc; T <= end; T++) {
            if (fr[T - 1][a] >= 3 * L || fr[T - 1][d] >= 3 * L) break; // 완주한 뒤는 빼기
            const p = ratio(T, a);
            const q = ratio(T, d);
            rA.push(p);
            rD.push(q);
            if (p >= 0.98 && q >= 0.98) both++;
          }
          const v = tr[Tc - 1][a][0];
          tc = {
            v,
            slip: tr[Tc - 1][a][5],
            dv1: tr[Math.min(Tc - 1 + ONE_S, tr.length - 1)][a][0] - v,
            dur: Tb > 0 ? (Tb - Tc) * C.TICK_SECONDS : null,
            ticks: rA.length,
            both98: both,
            rA,
            rD,
            overlap: Tb > 0 ? fr[Tb - 1][a] - fr[Tb - 1][d] + C.CAR_LENGTH : null,
          };
        }
        const segs: Att['segs'] = {};
        for (let T = T0; T < T1; T++) {
          const sg = segAt(course, fr[T - 1][a]);
          if (sg.kind !== 'straight') continue;
          const e = (segs[sg.id] ??= { full: 0, slipGain: 0 });
          if (ratio(T, a) >= 0.98) e.full += C.TICK_SECONDS;
          if (tr[T - 1][a][5]) e.slipGain += Math.max(0, tr[T - 1][a][0] - vTopEff(T, a, 0)) * C.TICK_SECONDS;
        }
        atts.push({ ok: res.kind === 7, tc, segs });
      }
    }
  process.stdout.write(JSON.stringify({ key, name: v0.name, set, track: t.id, atts, wins, maxRatio, stuck: STUCK.length }) + '\n');
}

if (part === 'report') {
  const data = process.argv.slice(3).map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const keys = [...new Set(data.map((d) => d.key as string))];
  const pc = (n: number, of: number) => `${f((n / Math.max(1, of)) * 100, 1)}%`;
  const q = (xs: number[], dd = 3) => {
    const s = xs.filter((x) => x !== null && !Number.isNaN(x)).sort((p, r) => p - r);
    const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return s.length ? `${f(mean(s), dd)} · ${[0.1, 0.25, 0.5, 0.75, 0.9].map((p) => f(at(p), dd)).join(' / ')}` : '–';
  };
  const byKey = (k: string) => data.filter((d) => d.key === k);
  const name = (k: string) => byKey(k)[0].name;
  out(`멈춘 레이스 ${data.reduce((s, d) => s + d.stuck, 0)}. 자기 점검: 속도 ÷ 실효 V_top 최댓값 ${f(Math.max(...data.map((d) => d.maxRatio)), 6)} (1 이하).`);
  out();
  const rows = (fn: (n: string, g: Att[]) => (string | number)[]) =>
    keys.flatMap((k) => {
      const all = byKey(k).flatMap((d) => d.atts) as Att[];
      return [fn(`${name(k)} · 실패`, all.filter((a) => !a.ok)), fn(`${name(k)} · 성공`, all.filter((a) => a.ok))];
    });
  out('### 1. 차선 변경 완료 → 제동 시작 구간 (평균 · 10 / 25 / 50 / 75 / 90 백분위)');
  out();
  out(
    table(
      ['설정 · 묶음', '시도', '변경 완료 / 미완료', '구간 시간 (s)', '공격 차 속도 ÷ 실효 V_top (틱)', '방어 차 속도 ÷ 실효 V_top (틱)', '두 차 모두 ≥ 98% 시간 비율'],
      rows((n, g) => {
        const tcs = g.map((a) => a.tc).filter((x): x is NonNullable<Att['tc']> => !!x);
        const ticks = tcs.reduce((s, x) => s + x.ticks, 0);
        return [n, g.length, `${tcs.length} / ${g.length - tcs.length}`, q(tcs.map((x) => x.dur!).filter((x) => x !== null), 2), q(tcs.flatMap((x) => x.rA)), q(tcs.flatMap((x) => x.rD)), pc(tcs.reduce((s, x) => s + x.both98, 0), ticks)];
      }),
    ),
  );
  out();
  out('### 2. 차선 변경 완료 순간 (공격 차)');
  out();
  out(
    table(
      ['설정 · 묶음', '변경 완료', '속도 (u/s)', '슬립스트림 켜짐', '1초 뒤 속도 변화 (u/s)'],
      rows((n, g) => {
        const tcs = g.map((a) => a.tc).filter((x): x is NonNullable<Att['tc']> => !!x);
        return [n, tcs.length, q(tcs.map((x) => x.v), 1), pc(tcs.filter((x) => x.slip).length, tcs.length), q(tcs.map((x) => x.dv1), 2)];
      }),
    ),
  );
  out();
  out('### 3. 제동 시작 순간 겹침 = 공격 차 앞 범퍼 − 방어 차 뒤 범퍼 (u)');
  out();
  out(
    table(
      ['설정 · 묶음', '제동 있음 / 없음', '겹침', '0 미만', '0~3', '3 이상'],
      rows((n, g) => {
        const tcs = g.map((a) => a.tc).filter((x): x is NonNullable<Att['tc']> => !!x);
        const ov = tcs.map((x) => x.overlap).filter((x): x is number => x !== null);
        return [n, `${ov.length} / ${tcs.length - ov.length}`, q(ov, 2), pc(ov.filter((x) => x < 0).length, ov.length), pc(ov.filter((x) => x >= 0 && x < 3).length, ov.length), pc(ov.filter((x) => x >= 3).length, ov.length)];
      }),
    ),
  );
  out();
  out('### 4. 직선별 전속 시간과 슬립스트림으로 줄인 거리 (시도 중 그 직선을 지난 한 번당 평균: 실패 / 성공)');
  out();
  const segIds = [...new Set(data.flatMap((d) => (d.atts as Att[]).flatMap((a) => Object.keys(a.segs))))].sort();
  const segStat = (k: string, ok: boolean, id: string) => {
    const xs = (byKey(k).flatMap((d) => d.atts) as Att[]).filter((a) => a.ok === ok && a.segs[id]).map((a) => a.segs[id]);
    return xs.length ? `${xs.length}회 · ${f(mean(xs.map((x) => x.full)), 2)} s · ${f(mean(xs.map((x) => x.slipGain)), 2)} u` : '–';
  };
  out(table(['직선', ...keys.flatMap((k) => [`${name(k)} 실패`, `${name(k)} 성공`])], segIds.map((id) => [id, ...keys.flatMap((k) => [segStat(k, false, id), segStat(k, true, id)])])));
  out();
  out('칸 = 지난 횟수 · 공격 차 98% 이상 시간 · 슬립스트림으로 줄인 거리.');
  out();
  out('### 5. 시도 · 성공률 · 우승');
  out();
  out(
    table(
      ['설정', '레이스', '정식 시도 (결과가 난 것)', 'S1 성공 (성공률)', '폴(자리 1) 승률', '자리 3~10 승률', '이긴 이유 (우승자가 마지막으로 1위가 된 순간)'],
      keys.map((k) => {
        const ds = byKey(k);
        const at = ds.flatMap((d) => d.atts) as Att[];
        const races = ds.reduce((s, d) => s + d.wins.races, 0);
        const causes: Record<string, number> = {};
        for (const d of ds) for (const [c, n] of Object.entries(d.wins.causes as Record<string, number>)) causes[c] = (causes[c] ?? 0) + n;
        const order = ['start', 'contact', 'mistake', 'boost', 'brake', 'corner', 'exit', 'straight', 'none'].filter((c) => causes[c]);
        return [name(k), races, at.length, `${at.filter((a) => a.ok).length} (${pc(at.filter((a) => a.ok).length, at.length)})`, pc(ds.reduce((s, d) => s + d.wins.pole, 0), races), pc(ds.reduce((s, d) => s + d.wins.back, 0), races), order.map((c) => `${CAUSE_KO[c]} ${pc(causes[c], races)}`).join('<br>')];
      }),
    ),
  );
}
