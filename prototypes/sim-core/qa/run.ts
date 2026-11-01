// 자동 QA (CAR_STATS_TRACKS_PROTO_DRAFT.md §12, RACE_INTERACTION_P0_DRAFT.md §9.2). 마크다운 표를 stdout으로 낸다.
// node qa/run.ts [handcalc|layer1|layer2|racers|accel|length|all]
// 확인용 시드는 2층 판정에만 쓴다. 확인용 결과로 계수를 고치지 않는다. 2단계 k 비교 결과는 qa/results/2026-11-02.md
import {
  ACCEL_R_RANGE,
  EXIT_LIMIT_RELAX,
  L2_OPPONENTS,
  L2_SATURATION_MEAN,
  L2_SATURATION_TOP,
  L2_SPREAD_MIN,
  M18_BLOCK_RATIO,
  M18_CONTACTS,
  M18_OVERTAKE_RACE_SHARE,
  QA_ADJUST_SEEDS,
  QA_CONFIRM_SEEDS,
  QA_DELTA,
  QA_L_EXIT,
  QA_THETA0,
  QA_THETA1,
  TICK_SECONDS,
} from '../src/config.ts';
import { at, buildCourse, carParams, runSolo, type CarParams, type Trace } from '../src/physics.ts';
import { checkTrack } from '../src/trackCheck.ts';
import type { CarStats, Track, TrackSegment } from '../src/types.ts';
import {
  BASE,
  CARS,
  EPS,
  f,
  lapGains,
  layer2,
  listHash,
  load,
  mean,
  measureLap,
  origRun,
  out,
  pct,
  race,
  RACERS,
  STAT_KO,
  STATS,
  table,
  testCar,
  TRACKS,
  type Measured,
} from './lib.ts';

const HAND = load('./handcalc.json');

const nextOf = (track: Track, id: string) => {
  const i = track.segments.findIndex((s) => s.id === id);
  return track.segments[(i + 1) % track.segments.length];
};
const prevOf = (track: Track, id: string) => {
  const i = track.segments.findIndex((s) => s.id === id);
  return track.segments[(i - 1 + track.segments.length) % track.segments.length];
};

function handcalc(): void {
  const p = carParams(BASE);
  out('## 손계산과 실측 비교 (기준 차 단독 2랩째, CAR §5 · M-16)');
  out();
  out('손계산 = CAR §5 표 값(k 0). 공식 = 코드의 코너 검사 계산. 실측 = 시뮬레이터 주행. 차이 = 실측 − 손계산. 단위 u/s, u.');
  for (const track of TRACKS) {
    const calc = { 0: checkTrack(track, 0), [EXIT_LIMIT_RELAX]: checkTrack(track, EXIT_LIMIT_RELAX) };
    const m0 = measureLap(track, p, 0);
    const mk = measureLap(track, p, EXIT_LIMIT_RELAX);
    const rows: (string | number)[][] = [];
    for (const [id, h] of Object.entries(HAND.corners as Record<string, Record<string, number | null>>)) {
      if (!id.startsWith(track.id)) continue;
      const c0 = calc[0].corners.find((c) => c.id === id)!;
      const ck = calc[EXIT_LIMIT_RELAX].corners.find((c) => c.id === id)!;
      const s0 = m0.corners.get(id)!;
      const sk = mk.corners.get(id)!;
      const prevSt = prevOf(track, id);
      const nextSt = nextOf(track, id);
      const mD = (m: Measured) => (prevSt.kind === 'straight' ? m.straights.get(prevSt.id)!.D : 0);
      const mExitLen = (m: Measured) => (nextSt.kind === 'straight' && h.exitLength !== null ? nextSt.length - m.straights.get(nextSt.id)!.D : null);
      const line = (name: string, hv: number | null, fv: number | null, s0v: number | null, fk: number | null, skv: number | null) =>
        rows.push([id, name, f(hv), f(fv), f(s0v), hv === null || s0v === null ? '–' : f(s0v - hv, 2), f(fk), f(skv)]);
      line('V_corner', h.vCorner, c0.vCorner, null, ck.vCorner, null);
      line('v_entry', h.vEntry, c0.vEntry, s0.vEntry, ck.vEntry, sk.vEntry);
      line('v_apex', h.vApex, c0.vApex, s0.vApex, ck.vApex, sk.vApex);
      line('v_exit', h.vExit, c0.vExit, s0.vExit, ck.vExit, sk.vExit);
      line('(b) D', h.D, c0.D, mD(m0), ck.D, mD(mk));
      if (h.exitLength !== null) line('(c) 탈출 길이', h.exitLength, c0.exitLength, mExitLen(m0), ck.exitLength, mExitLen(mk));
    }
    for (const [id, h] of Object.entries(HAND.straights as Record<string, { vS: number; D: number; reachTop: boolean }>)) {
      if (!id.startsWith(track.id)) continue;
      const c0 = calc[0].straights.find((s) => s.id === id)!;
      const ck = calc[EXIT_LIMIT_RELAX].straights.find((s) => s.id === id)!;
      const s0 = m0.straights.get(id)!;
      const sk = mk.straights.get(id)!;
      rows.push([id, '시작 속도', '–', f(c0.vStart), f(s0.vStart), '–', f(ck.vStart), f(sk.vStart)]);
      rows.push([id, 'v_s', f(h.vS), f(c0.vS), f(s0.vS), f(s0.vS - h.vS, 2), f(ck.vS), f(sk.vS)]);
      rows.push([id, 'D', f(h.D), f(c0.D), f(s0.D), f(s0.D - h.D, 2), f(ck.D), f(sk.D)]);
      const yn = (b: boolean) => (b ? '도달' : '미도달');
      rows.push([id, 'V_top 도달', yn(h.reachTop), yn(c0.reachTop), yn(s0.reachTop), h.reachTop === s0.reachTop ? '같음' : '다름', yn(ck.reachTop), yn(sk.reachTop)]);
    }
    out();
    out(`### ${track.id} (코너 검사 k=0: ${calc[0].errors.length ? calc[0].errors.join('; ') : '통과'}, k=${EXIT_LIMIT_RELAX}: ${calc[EXIT_LIMIT_RELAX].errors.length ? calc[EXIT_LIMIT_RELAX].errors.join('; ') : '통과'})`);
    out();
    out(table(['구간', '항목', '손계산', '공식 k=0', '실측 k=0', '차이', `공식 k=${EXIT_LIMIT_RELAX}`, `실측 k=${EXIT_LIMIT_RELAX}`], rows));
  }
}

// ---------- 1층 단계 고정 시험 (CAR §12.1, M-12) ----------

type Scene = { stage: 'top' | 'accelStraight' | 'entry' | 'corner' | 'exit'; name: string; run: (p: CarParams, k: number) => number | null; higherBetter: boolean };
const STAGE_KO = { top: '직선(V_top 도달 길이)', accelStraight: '직선(도달 전 길이)', entry: '진입', corner: '코너 안', exit: '탈출' };

const straightSeg = (length: number): TrackSegment => ({ id: 'scene', kind: 'straight', length, bend: 0, width: 12, passable: true });
const endSpeed = (tr: Trace) => tr.v[tr.v.length - 1];

function buildScenes(k: number): Scene[] {
  const p0 = carParams(BASE);
  const scenes: Scene[] = [];
  for (const track of TRACKS) {
    const m = measureLap(track, p0, k);
    const calc = checkTrack(track, k);
    for (const s of track.segments) {
      if (s.kind === 'straight') {
        const vIn = m.straights.get(s.id)!.vStart;
        // 최고속도 장면: 직선 전체 길이, 다음 코너 없음. 기준 차가 V_top에 못 닿으면 해당 없음
        const top = (len: number) => (p: CarParams) => endSpeed(runSolo(buildCourse([straightSeg(len)], false), p, k, { x0: 0, v0: Math.min(vIn, p.vTop), xEnd: len }));
        const reachTop = top(s.length)(p0) >= p0.vTop - EPS;
        scenes.push({ stage: 'top', name: `${s.id} 끝 속도`, higherBetter: true, run: (p) => (reachTop ? top(s.length)(p) : null) });
        const shortReach = top(QA_L_EXIT)(p0) >= p0.vTop - EPS;
        scenes.push({ stage: 'accelStraight', name: `${s.id} 시작 ${QA_L_EXIT}u 끝 속도`, higherBetter: true, run: (p) => (shortReach ? null : top(QA_L_EXIT)(p)) });
      } else {
        const role = calc.corners.find((c) => c.id === s.id)!.role;
        const prev = prevOf(track, s.id);
        if (role === 'first' || role === 'single') {
          // 진입 · 코너 안: 앞 직선 + 코너. 직선 시작 속도 = 기준 차 v_s로 고정, 직선 가속 없음 (접지 시험 정합화)
          const vS = m.straights.get(prev.id)!.vS;
          const course = buildCourse([prev, s], false);
          const runScene = (p: CarParams) => runSolo(course, p, k, { x0: 0, v0: vS, xEnd: course.segs[1].apex + 1, holdOnStraight: true });
          // 평균 감속도 = Δ(v²) / (2·Δx). 스텝 중간에서 시작하는 첫 제동 스텝의 잘림 오차를 피하려고
          // 제동이 시작된 첫 샘플과 코너 입구 직전 샘플 두 점으로 잰다 (둘 다 제동 구간 안)
          const decel = (p: CarParams) => {
            const tr = runScene(p);
            const i = tr.v.findIndex((v) => v < vS - EPS);
            const j = tr.x.findLastIndex((x) => x < prev.length);
            if (i < 0 || j <= i) return null;
            return (tr.v[i] ** 2 - tr.v[j] ** 2) / (2 * (tr.x[j] - tr.x[i]));
          };
          scenes.push({ stage: 'entry', name: `${s.id} 평균 감속도`, higherBetter: true, run: decel });
          scenes.push({ stage: 'corner', name: `${s.id} 정점 속도`, higherBetter: true, run: (p) => at(runScene(p), course.segs[1].apex, 'v') });
        }
        if (role === 'last' || role === 'single') {
          // 탈출: 코너 출구 속도로 L_EXIT 통과 시간. 기준 차가 L_EXIT 안에서 V_top에 닿으면 해당 없음
          const vIn = m.corners.get(s.id)!.vExit;
          const course = buildCourse([straightSeg(QA_L_EXIT)], false);
          const reach = endSpeed(runSolo(course, p0, k, { x0: 0, v0: vIn, xEnd: QA_L_EXIT })) >= p0.vTop - EPS;
          scenes.push({
            stage: 'exit',
            name: `${s.id} 출구 ${QA_L_EXIT}u 통과 시간`,
            higherBetter: false,
            run: (p) => (reach ? null : at(runSolo(course, p, k, { x0: 0, v0: vIn, xEnd: QA_L_EXIT + 1 }), QA_L_EXIT, 't')),
          });
        }
      }
    }
  }
  return scenes;
}

const DIRECT: Record<keyof CarStats, Scene['stage'][]> = { topSpeed: ['top'], accel: ['accelStraight', 'exit'], brake: ['entry'], grip: ['corner'] };
const INDIRECT: Record<keyof CarStats, Scene['stage'][]> = {
  topSpeed: ['entry', 'corner', 'exit'],
  accel: ['entry', 'corner'],
  brake: ['top', 'accelStraight', 'corner', 'exit'],
  grip: ['top', 'accelStraight', 'entry', 'exit'],
};

type L1Row = { stat: keyof CarStats; stage: Scene['stage']; direct: boolean; n: number; na: number; min: number; max: number; pass: boolean };

function layer1(k: number): { rows: L1Row[]; passByStat: Record<string, boolean>; detail: (string | number)[][] } {
  const scenes = buildScenes(k);
  const p0 = carParams(BASE);
  const base = scenes.map((s) => s.run(p0, k));
  const rows: L1Row[] = [];
  const detail: (string | number)[][] = [];
  const passByStat: Record<string, boolean> = {};
  for (const stat of STATS) {
    const p1 = carParams({ ...BASE, [stat]: BASE[stat] + QA_DELTA });
    const plus = scenes.map((s) => s.run(p1, k));
    // 개선률 (+가 좋아짐). 시간 지표는 줄어야 좋아진다
    const gain = scenes.map((s, i) => (base[i] === null || plus[i] === null ? null : ((plus[i]! - base[i]!) / base[i]!) * (s.higherBetter ? 1 : -1)));
    scenes.forEach((s, i) => detail.push([STAT_KO[stat], STAGE_KO[s.stage], s.name, f(base[i], 3), f(plus[i], 3), pct(gain[i])]));
    passByStat[stat] = true;
    for (const [stages, direct] of [[DIRECT[stat], true], [INDIRECT[stat], false]] as const) {
      for (const stage of stages) {
        const g = scenes.map((s, i) => (s.stage === stage ? gain[i] : undefined)).filter((v) => v !== undefined);
        const vals = g.filter((v): v is number => v !== null);
        const pass = direct ? vals.length > 0 && vals.every((v) => v >= QA_THETA1) : vals.every((v) => Math.abs(v) <= QA_THETA0);
        if (!pass) passByStat[stat] = false;
        rows.push({ stat, stage, direct, n: vals.length, na: g.length - vals.length, min: Math.min(...vals), max: Math.max(...vals), pass });
      }
    }
  }
  return { rows, passByStat, detail };
}

function printLayer1(k: number): void {
  const { rows, detail } = layer1(k);
  out(`## QA 1층 단계 고정 시험 (CAR §12.1, k=${k}, Δ=${QA_DELTA}, θ1 ${QA_THETA1 * 100}%, θ0 ${QA_THETA0 * 100}%)`);
  out();
  out(
    table(
      ['능력치 +1', '장면', '종류', '장면 수', '해당 없음', '개선률 최소', '개선률 최대', '판정'],
      rows.map((r) => [STAT_KO[r.stat], STAGE_KO[r.stage], r.direct ? '직접 (≥ θ1)' : '간접 (|변화| ≤ θ0)', r.n, r.na, r.n ? pct(r.min) : '–', r.n ? pct(r.max) : '–', r.pass ? '통과' : '실패']),
    ),
  );
  out();
  out('<details><summary>장면별 값</summary>');
  out();
  out(table(['능력치 +1', '장면 종류', '장면', '기준 차', '+1 차', '개선률'], detail));
  out();
  out('</details>');
}

// ---------- 2층 재정의 (INT §9.2, M-17 · M-18) ----------
// INT = design_ssot/drafts/RACE_INTERACTION_P0_DRAFT.md. 상대 9대 F-2 고정 목록, 테스트 차 1대(원본 / +1 / +2)

type Combo = { reaction: boolean; slipstream: boolean };
const COMBOS: Combo[] = [
  { reaction: false, slipstream: false },
  { reaction: false, slipstream: true },
  { reaction: true, slipstream: false },
  { reaction: true, slipstream: true },
];
const comboName = (c: Combo) => `${c.reaction ? 'R1' : 'R0'} · ${c.slipstream ? 'SS-1' : 'SS-0'}`;

function printLayer2(): void {
  out(`## QA 2층 재정의 (INT §9.2, k=${EXIT_LIMIT_RELAX}, 3랩, 테스트 차 1대 + F-2 상대 9대)`);
  out();
  out(
    `F-2 목록 SHA-256 앞 16자 ${listHash(L2_OPPONENTS)}. 조정용 시드 ${QA_ADJUST_SEEDS[0]}~${QA_ADJUST_SEEDS.at(-1)} (${listHash(QA_ADJUST_SEEDS)}), ` +
      `확인용 ${QA_CONFIRM_SEEDS[0]}~${QA_CONFIRM_SEEDS.at(-1)} (${listHash(QA_CONFIRM_SEEDS)}). 판정은 확인용만. ` +
      `통과 조건: 대조군 0, Δ2 ≥ Δ1 > 0, 퍼짐 ≥ ${L2_SPREAD_MIN}, +1 1위 비율 ≤ ${L2_SATURATION_TOP} · 평균 ≥ ${L2_SATURATION_MEAN}, ` +
      `막힘 ≥ ${M18_BLOCK_RATIO * 100}% · 추월 있는 레이스 ≥ ${M18_OVERTAKE_RACE_SHARE} · 접촉 ≥ ${M18_CONTACTS}.`,
  );
  for (const [name, seeds] of [
    ['확인용 (판정)', QA_CONFIRM_SEEDS],
    ['조정용 (기록만)', QA_ADJUST_SEEDS],
  ] as const) {
    const rows: (string | number)[][] = [];
    for (const combo of COMBOS) {
      const r = layer2(TRACKS, seeds, combo);
      const m = `막힘 ${f(r.m18.block * 100, 1)}%, 추월 레이스 ${f(r.m18.overtakeShare, 2)}, 접촉 ${r.m18.contacts}`;
      for (const s of r.perStat)
        rows.push([comboName(combo), STAT_KO[s.stat], `${r.controlDiff} / ${r.n}`, f(s.d1, 2), f(s.d2, 2), f(r.spread, 2), `${f(s.top1, 2)} · ${f(s.meanR1, 2)}`, m, s.verdict]);
    }
    out();
    out(`### ${name}`);
    out();
    out(table(['조합', '능력치', '대조군 순위 차 시드', 'Δ1', 'Δ2', '퍼짐 sd', '+1 1위 비율 · 평균 순위', '상호작용 (M-18)', '판정'], rows));
  }
}

// ---------- 레이서 행동 비교 (같은 차, 레이서만 다름) ----------

function printRacers(): void {
  out(`## 레이서 행동 비교 (기준 차 + 레이서, 상대 F-2 9대, 확인용 시드 ${QA_CONFIRM_SEEDS.length}개 × 트랙 3종, 기록만)`);
  out();
  out('값은 테스트 차 1대의 레이스당 평균. 막힘 비율 = 막힌 틱 / 달린 틱. 0번 차선 비율 = 10대 전체가 0번 차선에 있던 틱 비율(차선 3개라 고르면 0.33).');
  for (const combo of COMBOS) {
    const rows: (string | number)[][] = [];
    const solverRows: (string | number)[][] = [];
    for (const racer of RACERS) {
      const acc = { tries: 0, succ: 0, contacts: 0, blocked: 0, racing: 0, act: 0, lane0: 0, laneAll: 0, mistakes: 0, rank: 0, n: 0 };
      const drawbacks: Record<string, number> = {};
      const solver = { opportunities: 0, forfeits: 0, successesActive: 0, successesInactive: 0 };
      for (const t of TRACKS)
        for (const s of QA_CONFIRM_SEEDS) {
          const r = race(t, s, testCar(BASE, racer), combo);
          const c = r.carStats[0];
          acc.tries += c.tries;
          acc.succ += c.successes;
          acc.contacts += c.contacts;
          acc.blocked += c.blockedTicks;
          acc.racing += c.racingTicks;
          acc.act += c.passiveActivations;
          acc.mistakes += c.mistakes;
          acc.rank += r.finishOrder.indexOf(0) + 1;
          acc.lane0 += r.carStats.reduce((a, x) => a + x.laneTicks[0], 0);
          acc.laneAll += r.carStats.reduce((a, x) => a + x.racingTicks, 0);
          for (const [k, v] of Object.entries(c.drawbacks)) drawbacks[k] = (drawbacks[k] ?? 0) + v;
          for (const k of Object.keys(solver) as (keyof typeof solver)[]) solver[k] += c.solver[k];
          acc.n++;
        }
      const per = (v: number) => f(v / acc.n, 2);
      rows.push([
        racer.id,
        `${racer.stats.overtake}/${racer.stats.control}/${racer.stats.focus}`,
        racer.passiveId ?? '없음',
        per(acc.tries),
        per(acc.succ),
        per(acc.contacts),
        `${f((acc.blocked / acc.racing) * 100, 1)}%`,
        per(acc.act),
        Object.entries(drawbacks)
          .map(([k, v]) => `${k} ${per(v)}`)
          .join(', ') || '–',
        per(acc.mistakes),
        f(acc.lane0 / acc.laneAll, 2),
        per(acc.rank),
      ]);
      if (racer.passiveId === 'calm-solver')
        solverRows.push([
          racer.id,
          per(solver.opportunities),
          per(solver.forfeits),
          solver.opportunities ? f(solver.forfeits / solver.opportunities, 2) : '–',
          per(solver.successesActive),
          per(solver.successesInactive),
        ]);
    }
    out();
    out(`### ${comboName(combo)}`);
    out();
    out(table(['레이서', '추월/제어/집중', '패시브', '추월 시도', '추월 성공', '접촉', '막힘 비율', '패시브 발동', '반대급부', '혼전 실수', '0번 차선 비율', '평균 순위'], rows));
    out();
    out(table(['침착한 해결사', '발동 중 추월 기회', '포기(T-C)', '포기 비율', '발동 중 추월 성공', '발동 밖 추월 성공'], solverRows));
  }
}

// ---------- 가속 R (AG-P029 A, INT §4.7: 1바퀴 기록 기준) ----------

function printAccelR(): void {
  out(`## 가속 R (기준 차 단독 2랩째 랩 시간, 트랙 3종 평균, k=${EXIT_LIMIT_RELAX})`);
  out();
  out(`E = (T원본 − T+1) / T원본, R = E_가속 / mean(E_최고속도, E_접지, E_제동). 목표 ${ACCEL_R_RANGE[0]} ≤ R ≤ ${ACCEL_R_RANGE[1]} (가안).`);
  const rows: (string | number)[][] = [];
  for (const formula of ['current', 'AC1'] as const) {
    const lap = (stats: CarStats) => TRACKS.map((t) => measureLap(t, carParams(stats, formula), EXIT_LIMIT_RELAX).lapTime);
    const base = lap(BASE);
    const E = Object.fromEntries(
      STATS.map((s) => {
        const plus = lap({ ...BASE, [s]: BASE[s] + QA_DELTA });
        return [s, mean(base.map((b, i) => (b - plus[i]) / b))];
      }),
    ) as Record<keyof CarStats, number>;
    const denom = mean([E.topSpeed, E.grip, E.brake]);
    const R = denom > 0 ? E.accel / denom : NaN;
    rows.push([
      formula === 'current' ? '현행 (CAR F3a)' : 'AC-1 (A = 30(1 + 1.33n))',
      `A ${f(carParams(BASE, formula).A, 2)} → ${f(carParams({ ...BASE, accel: BASE.accel + QA_DELTA }, formula).A, 2)}`,
      base.map((b) => f(b, 3)).join(' / '),
      ...STATS.map((s) => pct(E[s])),
      Number.isNaN(R) ? '판별 불가' : f(R, 2),
      Number.isNaN(R) ? '–' : R >= ACCEL_R_RANGE[0] && R <= ACCEL_R_RANGE[1] ? '목표 안' : '목표 밖',
    ]);
  }
  out();
  out(table(['가속 공식', '기준 차 A → +1', '기준 랩 T1 / T2 / T3 (초)', 'E 최고속도', 'E 가속력', 'E 접지력', 'E 제동력', 'R', '판정'], rows));
}

// ---------- 차 X, Y 1바퀴 · 트랙별 경기 길이 ----------

function printLength(): void {
  out(`## 차 X, Y 1바퀴 시간 (단독 2랩째, k=${EXIT_LIMIT_RELAX}, 기록만 · AG-P019 B)`);
  out();
  out(
    table(
      ['트랙', ...CARS.map((c) => `${c.id} (초)`)],
      TRACKS.map((t) => [t.id, ...CARS.map((c) => f(measureLap(t, carParams(c.stats), EXIT_LIMIT_RELAX).lapTime, 3))]),
    ),
  );
  out();
  out(`## 트랙별 경기 길이 (3랩, 기준 차 + F-2 9대, 확인용 시드 ${QA_CONFIRM_SEEDS.length}개 평균, 마지막 차 완주 기준)`);
  out();
  const rows = TRACKS.map((t) => [
    t.id,
    ...COMBOS.map((combo) => {
      const ticks = mean(QA_CONFIRM_SEEDS.map((s) => origRun(combo, t, s).ticks));
      return `${f(ticks, 1)}틱 (${f(ticks * TICK_SECONDS, 2)}초)`;
    }),
  ]);
  out(table(['트랙', ...COMBOS.map(comboName)], rows));
}

const what = process.argv[2] ?? 'all';
const parts: Record<string, () => void> = {
  handcalc,
  layer1: () => printLayer1(EXIT_LIMIT_RELAX),
  layer2: printLayer2,
  racers: printRacers,
  accel: printAccelR,
  length: printLength,
};
for (const [name, fn] of Object.entries(parts)) {
  if (what === 'all' || what === name) {
    fn();
    out();
  }
}
