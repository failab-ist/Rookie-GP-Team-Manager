// 2대 시험: 긴 직선(1000u)에서 같은 차선의 뒤차가 앞차를 앞지르는지 틱 단위로 본다 (지시서 2026-11-02, 추월 0건 원인 확인).
// 앞차 기준 차(최고속도 5), 뒤차 최고속도 5 / 6 / 7, 간격 2 / 5 / 10u, 슬립스트림 켬 / 끔, 원하는 속도 해석 step / target.
// 두 차 모두 직선 시작 부근에서 125 u/s(앞차 최고속도)로 가운데 차선(1번)에서 출발한다. 레이서는 둘 다 NPC 5/5/5.
// node qa/twocar.ts > qa/results/<파일>.md
import { CAR_LENGTH, TICK_SECONDS } from '../src/config.ts';
import { carParams } from '../src/physics.ts';
import { simulate } from '../src/sim.ts';
import type { Entry, Track } from '../src/types.ts';
import { BASE, f, load, NPC, out, table } from './lib.ts';

const track: Track = load('../data/tracks/experiment/LONG-1000.json');
const STRAIGHT_END = 1000;
const V0 = carParams(BASE).vTop; // 125
const entry = (top: number, id: string): Entry => ({ racer: { id, stats: NPC, passiveId: null }, car: { id, stats: { ...BASE, topSpeed: top } } });

function runCase(gap: number, dTop: number, slipstream: boolean, desiredSpeed: 'step' | 'target', capWhileChanging = true, seed = 1) {
  const rearS = 10;
  const frontS = rearS + CAR_LENGTH + gap;
  const entries = [entry(5, 'front'), entry(5 + dTop, 'rear')];
  const r = simulate(
    { seed, track, laps: 1, entries },
    { slipstream, desiredSpeed, reaction: false, capWhileChanging },
    { start: [{ s: frontS, lane: 1, v: V0 }, { s: rearS, lane: 1, v: V0 }], trace: true },
  );
  const tr = r.trace!;
  const fr = r.frames; // fr[k] = 틱 k 끝 위치 (fr[0] = 출발), tr[k-1] = 틱 k의 상태
  const vTopRear = carParams({ ...BASE, topSpeed: 5 + dTop }).vTop;
  const attempt = r.judgements.find((j) => j.kind === 1);
  const lcStart = tr.findIndex((row) => row[1][1] !== row[1][2]);
  const lcEnd = lcStart < 0 ? -1 : tr.findIndex((row, k) => k > lcStart && row[1][1] === row[1][2]);
  const during = lcStart < 0 ? [] : tr.slice(lcStart, lcEnd < 0 ? undefined : lcEnd);
  const cappedDuring = during.filter((row) => row[1][4] === 1).length;
  const maxGapDuring = during.length ? Math.max(...during.map((row) => row[1][0] - row[0][0])) : NaN;
  // 차선 변경이 끝난 뒤 자기 최고속도에 닿기까지
  let reachTop: number | null = null;
  if (lcEnd >= 0) {
    const k = tr.findIndex((row, i) => i >= lcEnd && row[1][0] >= vTopRear - 1e-6 && fr[i + 1][1] < STRAIGHT_END);
    if (k >= 0) reachTop = (k - lcEnd) * TICK_SECONDS;
  }
  // 위치로 본 앞지름: 뒤차가 앞차보다 L_car 이상 앞선 첫 틱
  const aheadTick = fr.findIndex((p) => p[1] - p[0] >= CAR_LENGTH);
  const success = r.events.find((e) => e.kind === 3);
  const ends = r.judgements.filter((j) => j.kind === 2 || j.kind === 3).map((j) => (j.kind === 2 ? '구간 끝 실패' : '되돌림'));
  const contacts = r.events.filter((e) => e.kind === 4).map((e) => `${e.cause}@${f(fr[e.tick][1], 0)}u`);
  return {
    r,
    row: [
      `${gap}u`,
      `+${dTop} (${V0}→${vTopRear})`,
      slipstream ? 'SS-1' : 'SS-0',
      desiredSpeed,
      capWhileChanging ? '묶임(현행)' : '안 묶임',
      attempt ? `${f(attempt.tick * TICK_SECONDS, 2)}초 · ${f(fr[attempt.tick][1], 0)}u` : '없음',
      lcStart >= 0 ? `${f(lcStart * TICK_SECONDS, 2)}~${lcEnd >= 0 ? f(lcEnd * TICK_SECONDS, 2) : '–'}초` : '–',
      during.length ? `${cappedDuring} / ${during.length}` : '–',
      f(maxGapDuring, 2),
      reachTop === null ? '–' : `${f(reachTop, 2)}초`,
      aheadTick >= 0 ? `${f(fr[aheadTick][1], 0)}u (${aheadTick < tr.length && tr[aheadTick - 1]?.[1][1] !== tr[aheadTick - 1]?.[1][2] ? '변경 중' : '변경 끝'})` : '없음',
      success ? `${f(fr[success.tick][1], 0)}u` : '없음',
      ends.join(', ') || '–',
      contacts.join(', ') || '–',
    ],
  };
}

out('# 2대 시험 (긴 직선 1000u, 추월 0건 원인 확인)');
out();
out(`앞차 최고속도 ${V0} u/s, 뒤차 +0 / +1 / +2 (125 / 130 / 135). 두 차 모두 ${V0} u/s, 1번 차선, 직선 시작 부근에서 출발. 시드 1. 위치는 직선 시작부터의 거리.`);
out();
out('- 변경 중 상한 = 차선을 바꾸는 동안 막힘 상한이 걸린 틱 수 / 변경 틱 수. 변경 중 최대 속도 차 = 뒤차 − 앞차.');
out('- 앞지름(위치) = 뒤차가 앞차보다 L_car(6u) 이상 앞선 첫 위치. 추월 기록 = 사건 종류 3(S1)이 남은 위치.');
const rows: (string | number)[][] = [];
for (const desiredSpeed of ['step', 'target'] as const)
  for (const slipstream of [true, false])
    for (const dTop of [0, 1, 2]) for (const gap of [2, 5, 10]) rows.push(runCase(gap, dTop, slipstream, desiredSpeed).row);
// 비교 스위치: 차선 변경 중 원래 차선 앞차에 묶이지 않게 (초안 §4.3 예시), 원하는 속도 target
for (const slipstream of [true, false])
  for (const dTop of [0, 1, 2]) for (const gap of [2, 5, 10]) rows.push(runCase(gap, dTop, slipstream, 'target', false).row);
out();
out(
  table(
    ['간격', '뒤차 최고속도', '슬립', '원하는 속도', '변경 중 원래 차선 상한', '시도(시각 · 위치)', '차선 변경', '변경 중 상한', '변경 중 최대 속도 차', '변경 뒤 최고속도까지', '앞지름(위치)', '추월 기록', '시도 끝', '접촉'],
    rows,
  ),
);

// 틱 기록 예시: 간격 5u, +2, SS-1, target
const ex = runCase(5, 2, true, 'target').r;
out();
out('## 틱 기록 예시 (간격 5u, 뒤차 +2, SS-1, 원하는 속도 target, 0.25초마다)');
out();
const tl: (string | number)[][] = [];
for (let k = 0; k < ex.trace!.length; k += 5) {
  const row = ex.trace![k];
  const p = ex.frames[k + 1];
  if (p[1] > STRAIGHT_END) break;
  tl.push([
    f((k + 1) * TICK_SECONDS, 2),
    f(p[1], 1),
    f(p[0], 1),
    f(p[1] - p[0], 1),
    f(row[1][0], 1),
    f(row[0][0], 1),
    row[1][1] === row[1][2] ? `${row[1][1]}` : `${row[1][1]}→${row[1][2]} (${f(row[1][3], 2)})`,
    row[1][4] ? '예' : '–',
    row[1][5] ? '예' : '–',
  ]);
}
out(table(['시각(초)', '뒤차 위치', '앞차 위치', '뒤차 − 앞차', '뒤차 속도', '앞차 속도', '뒤차 차선', '막힘 상한', '슬립스트림'], tl));
