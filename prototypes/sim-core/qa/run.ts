// 자동 QA (CAR_STATS_TRACKS_PROTO_DRAFT.md §12). 마크다운 표를 stdout으로 낸다.
// node qa/run.ts [handcalc|layer1|layer2|ksweep|length|all]
// 확인용 시드는 layer2(k = 가안) 판정에만 쓴다. ksweep은 조정용 시드만 쓴다 (디렉터 2026-11-02).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  BASE_CAR_STAT,
  EXIT_LIMIT_RELAX,
  QA_ADJUST_SEEDS,
  QA_ADVANCE_SHARE,
  QA_CONFIRM_SEEDS,
  QA_DELTA,
  QA_L_EXIT,
  QA_Q_RANK,
  QA_THETA0,
  QA_THETA1,
} from '../src/config.ts';
import { at, buildCourse, carParams, runSolo, type CarParams, type Trace } from '../src/physics.ts';
import { simulate } from '../src/sim.ts';
import { checkTrack } from '../src/trackCheck.ts';
import type { CarStats, Entry, Track, TrackSegment } from '../src/types.ts';

const load = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const TRACKS: Track[] = ['T1', 'T2', 'T3'].map((t) => load(`../data/tracks/${t}.json`));
const CARS: { id: string; stats: CarStats }[] = load('../data/cars.json').cars;
const HAND = load('./handcalc.json');
const K_SWEEP = [0, 0.1, 0.2, 0.3];
const STATS: (keyof CarStats)[] = ['topSpeed', 'accel', 'grip', 'brake'];
const STAT_KO: Record<keyof CarStats, string> = { topSpeed: '최고속도', accel: '가속력', grip: '접지력', brake: '제동력' };
const BASE: CarStats = { topSpeed: BASE_CAR_STAT, accel: BASE_CAR_STAT, grip: BASE_CAR_STAT, brake: BASE_CAR_STAT };
const EPS = 1e-6;

const f = (v: number | null | undefined, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v.toFixed(d));
const pct = (v: number | null) => (v === null ? '해당 없음' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`);
const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const out = (s = '') => process.stdout.write(s + '\n');

// ---------- 기준 차 단독 2랩 실측 (M-16) ----------

type Measured = {
  corners: Map<string, { vEntry: number; vApex: number; vExit: number; vMax: number }>;
  straights: Map<string, { vStart: number; vS: number; D: number; reachTop: boolean }>;
  lapTime: number;
};

function measureLap(track: Track, p: CarParams, k: number): Measured {
  const c = buildCourse(track.segments, true);
  const L = c.length;
  const tr = runSolo(c, p, k, { x0: 0, v0: 0, xEnd: 2 * L + 1 });
  const corners: Measured['corners'] = new Map();
  const straights: Measured['straights'] = new Map();
  for (const s of c.segs) {
    const idx = tr.x.map((x, i) => i).filter((i) => tr.x[i] >= L + s.start && tr.x[i] < L + s.end);
    const vMax = Math.max(...idx.map((i) => tr.v[i]));
    if (s.kind === 'corner') {
      corners.set(s.id, { vEntry: at(tr, L + s.start, 'v'), vApex: at(tr, L + s.apex, 'v'), vExit: at(tr, L + s.end, 'v'), vMax });
    } else {
      // 제동 시작점 = 최고 속도의 마지막 지점. 그 뒤로 속도가 줄어야 제동으로 본다
      let iMax = idx[0];
      for (const i of idx) if (tr.v[i] >= vMax - EPS) iMax = i;
      const braked = tr.v[idx[idx.length - 1]] < vMax - EPS;
      const D = braked ? L + s.end - tr.x[iMax] : 0;
      straights.set(s.id, { vStart: at(tr, L + s.start, 'v'), vS: vMax, D, reachTop: vMax >= p.vTop - EPS });
    }
  }
  return { corners, straights, lapTime: at(tr, 2 * L, 't') - at(tr, L, 't') };
}

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

// ---------- 2층 순위 비교 (CAR §12.2, M-13) ----------

const NPC = { overtake: 5, control: 5, focus: 5 }; // 9대 고정 프로필 = 테스트 차 레이서도 같음 (RACER_STATS_PASSIVES_DRAFT.md:269 가안)
const entry = (stats: CarStats, i: number): Entry => ({ racer: { id: `npc-${i}`, stats: NPC, passiveId: null }, car: { id: i === 0 ? 'test' : 'base', stats } });
const rankOfTest = (track: Track, seed: number, stats: CarStats, k: number) =>
  simulate({ seed, track, laps: 3, entries: Array.from({ length: 10 }, (_, i) => entry(i === 0 ? stats : BASE, i)) }, k).finishOrder.indexOf(0) + 1;

type L2 = { stat: keyof CarStats; perTrack: Record<string, { orig: number; plus: number; changed: number; ahead: number }>; orig: number; plus: number; changed: number; ahead: number; pass: boolean };

function layer2(seeds: number[], k: number): L2[] {
  const origRank = new Map<string, number>();
  for (const t of TRACKS) for (const s of seeds) origRank.set(`${t.id}:${s}`, rankOfTest(t, s, BASE, k));
  return STATS.map((stat) => {
    const plusStats = { ...BASE, [stat]: BASE[stat] + QA_DELTA };
    let o = 0, pl = 0, ch = 0, ah = 0, n = 0;
    const perTrack: L2['perTrack'] = {};
    for (const t of TRACKS) {
      let to = 0, tp = 0, tc = 0, ta = 0;
      for (const s of seeds) {
        const ro = origRank.get(`${t.id}:${s}`)!;
        const rp = rankOfTest(t, s, plusStats, k);
        to += ro;
        tp += rp;
        if (rp !== ro) tc++;
        if (rp < ro) ta++;
      }
      perTrack[t.id] = { orig: to / seeds.length, plus: tp / seeds.length, changed: tc / seeds.length, ahead: tc ? ta / tc : 0 };
      o += to; pl += tp; ch += tc; ah += ta; n += seeds.length;
    }
    const r = { orig: o / n, plus: pl / n, changed: ch / n, ahead: ch ? ah / ch : 0 };
    return { stat, perTrack, ...r, pass: r.plus <= r.orig && r.changed >= QA_Q_RANK && r.ahead >= QA_ADVANCE_SHARE };
  });
}

const seedHash = (s: number[]) => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16);

function printLayer2(): void {
  out(`## QA 2층 순위 비교 (CAR §12.2, k=${EXIT_LIMIT_RELAX}, 3랩, 테스트 차 1대 + 기준 차 9대)`);
  out();
  out(`조정용 시드 ${QA_ADJUST_SEEDS[0]}~${QA_ADJUST_SEEDS.at(-1)} (${QA_ADJUST_SEEDS.length}개, SHA-256 앞 16자 ${seedHash(QA_ADJUST_SEEDS)}), 확인용 시드 ${QA_CONFIRM_SEEDS[0]}~${QA_CONFIRM_SEEDS.at(-1)} (${QA_CONFIRM_SEEDS.length}개, ${seedHash(QA_CONFIRM_SEEDS)}). 판정은 확인용만.`);
  for (const [name, seeds] of [['조정용 (기록만)', QA_ADJUST_SEEDS], ['확인용 (판정)', QA_CONFIRM_SEEDS]] as const) {
    const res = layer2(seeds, EXIT_LIMIT_RELAX);
    out();
    out(`### ${name}`);
    out();
    out(
      table(
        ['능력치 +1', '트랙', '원본 평균 순위', '+1 평균 순위', '순위 바뀐 시드 비율', '바뀐 시드 중 +1이 앞선 비율', '판정'],
        res.flatMap((r) => [
          ...TRACKS.map((t) => {
            const v = r.perTrack[t.id];
            return [STAT_KO[r.stat], t.id, f(v.orig, 2), f(v.plus, 2), f(v.changed, 2), f(v.ahead, 2), '기록'];
          }),
          [STAT_KO[r.stat], '합계', f(r.orig, 2), f(r.plus, 2), f(r.changed, 2), f(r.ahead, 2), r.pass ? '통과' : '실패'],
        ]),
      ),
    );
  }
}

// ---------- k 비교 (조정용 시드만) · 경기 길이 ----------

const raceSeconds = (track: Track, stats: CarStats, k: number) => {
  const r = simulate({ seed: 42, track, laps: 3, entries: Array.from({ length: 10 }, (_, i) => entry(stats, i)) }, k);
  return { ticks: r.ticks, seconds: r.seconds };
};

function ksweep(): void {
  const p0 = carParams(BASE);
  const lap0 = new Map(TRACKS.map((t) => [t.id, measureLap(t, p0, 0)]));
  out('## k 비교 (k = 0, 0.1, 0.2, 0.3. 2층은 조정용 시드만)');
  out();
  out('탈출 가속 코너 = 기준 차 2랩째 출구 속도가 정점 속도보다 0.05 u/s 넘게 빠른 코너. V_top 잘림 = 코너 안 속도가 V_top(125)에 닿은 코너. 출구 차이 = k=0 대비.');
  const rows: (string | number)[][] = [];
  const exitRows: (string | number)[][] = [];
  for (const k of K_SWEEP) {
    const l1 = layer1(k).passByStat;
    const l2 = layer2(QA_ADJUST_SEEDS, k);
    for (const t of TRACKS) {
      const m = measureLap(t, p0, k);
      const corners = [...m.corners.entries()];
      const exitAccel = corners.filter(([, c]) => c.vExit > c.vApex + 0.05).length;
      const capped = corners.filter(([, c]) => c.vMax >= p0.vTop - EPS).length;
      const diffs = corners.map(([id, c]) => c.vExit - lap0.get(t.id)!.corners.get(id)!.vExit);
      const len = raceSeconds(t, BASE, k);
      const errors = checkTrack(t, k).errors;
      rows.push([
        k,
        t.id,
        errors.length ? `거부: ${errors.join('; ')}` : '통과',
        `${exitAccel} / ${corners.length}`,
        `평균 +${f(diffs.reduce((a, b) => a + b, 0) / diffs.length)}, 최대 +${f(Math.max(...diffs))}`,
        capped,
        `${len.ticks}틱 (${f(len.seconds, 2)}초), 랩 ${f(m.lapTime, 2)}초`,
        t === TRACKS[0] ? STATS.map((s) => `${STAT_KO[s]} ${l1[s] ? '통과' : '실패'}`).join(', ') : '〃',
        t === TRACKS[0] ? l2.map((r) => `${STAT_KO[r.stat]} ${r.pass ? '통과' : '실패'}(${f(r.orig, 2)}→${f(r.plus, 2)}, 바뀜 ${f(r.changed, 2)}, 앞섬 ${f(r.ahead, 2)})`).join(', ') : '〃',
      ]);
      for (const [id, c] of corners) exitRows.push([k, id, f(c.vApex), f(c.vExit), f(c.vExit - lap0.get(t.id)!.corners.get(id)!.vExit), c.vMax >= p0.vTop - EPS ? '잘림' : '–']);
    }
  }
  out();
  out(table(['k', '트랙', '코너 검사', '탈출 가속 코너', '출구 속도 차이 (u/s)', 'V_top 잘림 코너', '경기 길이 (기준 차 10대, 3랩)', '1층 (트랙 3종 합산)', '2층 조정용 (원본→+1 평균 순위)'], rows));
  out();
  out('<details><summary>코너별 출구 속도</summary>');
  out();
  out(table(['k', '코너', '정점 속도', '출구 속도', 'k=0 대비', 'V_top'], exitRows));
  out();
  out('</details>');
}

function length(): void {
  out(`## 트랙별 경기 길이 (k=${EXIT_LIMIT_RELAX}, 3랩, 시드 42)`);
  out();
  const rows = TRACKS.map((t) => {
    const base = raceSeconds(t, BASE, EXIT_LIMIT_RELAX);
    const lap = (stats: CarStats) => f(measureLap(t, carParams(stats), EXIT_LIMIT_RELAX).lapTime, 2);
    return [t.id, base.ticks, f(base.seconds, 2), ...CARS.map((c) => lap(c.stats))];
  });
  out(table(['트랙', '기준 차 10대 경기 틱', '초', ...CARS.map((c) => `${c.id} 단독 랩 시간(초)`)], rows));
}

const what = process.argv[2] ?? 'all';
const parts: Record<string, () => void> = {
  handcalc,
  layer1: () => printLayer1(EXIT_LIMIT_RELAX),
  layer2: printLayer2,
  ksweep,
  length,
};
for (const [name, fn] of Object.entries(parts)) {
  if (what === 'all' || what === name) {
    fn();
    out();
  }
}
