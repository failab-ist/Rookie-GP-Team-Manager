import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QA_R_REPRO } from '../src/config.ts';
import { at, buildCourse, carParams, runSolo, vCorner } from '../src/physics.ts';
import { checkCarTotal, simulate } from '../src/sim.ts';
import { checkTrack } from '../src/trackCheck.ts';
import type { Track } from '../src/types.ts';

const load = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const tracks: Track[] = ['T1', 'T2', 'T3'].map((t) => load(`../data/tracks/${t}.json`));
const example = load('../examples/race.json');
const base = carParams({ topSpeed: 5, accel: 5, grip: 5, brake: 5 });

test('M-15 재현: 트랙 3종 각각 같은 입력을 R_REPRO회 돌리면 결과 JSON이 같다', () => {
  for (const track of tracks) {
    const runs = Array.from({ length: QA_R_REPRO }, () =>
      JSON.stringify(simulate({ seed: 7, track, laps: 3, entries: example.entries })),
    );
    assert.ok(runs.every((r) => r === runs[0]), track.id);
  }
});

test('트랙 3종은 k = 0, 0.2에서 코너 검사를 통과한다', () => {
  for (const track of tracks) for (const k of [0, 0.2]) assert.deepEqual(checkTrack(track, k).errors, [], `${track.id} k=${k}`);
});

test('코너 검사 거부: (a) 완만한 코너, 직선 bend, id 중복, 묶음 내부 감속 필요', () => {
  const seg = (id: string, kind: 'straight' | 'corner', length: number, bend: number) => ({ id, kind, length, bend, width: 12, passable: kind === 'straight' });
  const t = (segments: ReturnType<typeof seg>[]): Track => ({ id: 't', segments });
  assert.match(checkTrack(t([seg('a', 'straight', 400, 0), seg('b', 'corner', 150, 0.5)]), 0).errors.join(), /\(a\)/);
  assert.match(checkTrack(t([seg('a', 'straight', 400, 0.1), seg('b', 'corner', 150, 0.7)]), 0).errors.join(), /bend/);
  assert.match(checkTrack(t([seg('a', 'straight', 400, 0), seg('a', 'corner', 150, 0.7)]), 0).errors.join(), /중복/);
  // 0.65 (V_corner 115.4) 뒤에 0.9 (83.3): 앞 코너 정점 속도가 다음 코너 한계를 넘는다
  const inner = checkTrack(t([seg('a', 'straight', 300, 0), seg('b', 'corner', 100, 0.65), seg('c', 'corner', 100, 0.9)]), 0);
  assert.match(inner.errors.join(), /묶음 내부 감속 필요/);
});

test('정점 전에는 가속하지 않고, k=0이면 코너 안 속도는 V_corner 이하', () => {
  for (const track of tracks) {
    const c = buildCourse(track.segments, true);
    const tr = runSolo(c, base, 0, { x0: 0, v0: 0, xEnd: 2 * c.length });
    for (const s of c.segs.filter((s) => s.kind === 'corner')) {
      const vc = vCorner(base, s.bend);
      for (let i = 1; i < tr.x.length; i++) {
        const xm = tr.x[i] % c.length;
        if (xm < s.start || xm >= s.end) continue;
        assert.ok(tr.v[i] <= vc + 1e-9, `${s.id} ${tr.v[i]} > ${vc}`);
        if (xm < s.apex && (tr.x[i - 1] % c.length) >= s.start) assert.ok(tr.v[i] <= tr.v[i - 1] + 1e-9, `${s.id} 정점 전 가속`);
      }
    }
  }
});

test('k가 크면 정점 뒤 출구가 빨라진다 (T1-04, 단독 제동 코너)', () => {
  const c = buildCourse(tracks[0].segments, true);
  const s = c.segs.find((s) => s.id === 'T1-04')!;
  const exit = (k: number) => at(runSolo(c, base, k, { x0: 0, v0: 0, xEnd: 2 * c.length }), c.length + s.end, 'v');
  assert.ok(exit(0.2) > exit(0.1) && exit(0.1) > exit(0) + 1);
});

test('차량 합계 검사는 20만 통과 (CAR §6)', () => {
  for (const car of load('../data/cars.json').cars) checkCarTotal(car.id, car.stats);
  assert.throws(() => checkCarTotal('z', { topSpeed: 6, accel: 5, grip: 5, brake: 5 }), /합계/);
});

test('1점 효과 실험 P-1: 1점당 비율 p를 4%로 주면 지금 계수와 같은 값, 5점 값은 p와 무관 (K = p / (0.1 − 0.5p))', () => {
  for (const v of [0, 3, 5, 8, 10]) {
    const s = { topSpeed: 5, accel: v, grip: 5, brake: v };
    const now = carParams(s);
    const p4 = carParams(s, 'current', { accelPoint: 0.04, brakePoint: 0.04, abScale: 1 });
    assert.ok(Math.abs(now.A - p4.A) < 1e-9 && Math.abs(now.aBrk - p4.aBrk) < 1e-9);
  }
  const t = { accelPoint: 0.1, brakePoint: 0.15, abScale: 1 };
  assert.equal(carParams({ topSpeed: 5, accel: 5, grip: 5, brake: 5 }, 'current', t).A, 50);
  // 5 → 6에서 A가 정확히 10%, a_brk가 15% 오른다
  const six = carParams({ topSpeed: 5, accel: 6, grip: 5, brake: 6 }, 'current', t);
  assert.ok(Math.abs(six.A / 50 - 1.1) < 1e-12 && Math.abs(six.aBrk / 75 - 1.15) < 1e-12);
  assert.throws(() => carParams({ topSpeed: 5, accel: 5, grip: 5, brake: 5 }, 'current', { accelPoint: 0.2, brakePoint: 0, abScale: 1 }), /1점당 비율/);
});

test('1점 효과 실험 P-2: A0 · B0 배율은 A와 a_brk만 같은 비율로 바꾼다', () => {
  const s = { topSpeed: 5, accel: 5, grip: 5, brake: 5 };
  const p = carParams(s, 'current', { accelPoint: 0, brakePoint: 0, abScale: 0.5 });
  assert.deepEqual(p, { vTop: base.vTop, A: 25, vg: base.vg, aBrk: 37.5 });
});

test('QA 출발 순서 지정: qa.grid의 자리 0 차가 맨 앞에서 출발한다', () => {
  const grid = [3, 0, 1, 2, 4, 5, 6, 7, 8, 9];
  const r = simulate({ seed: 7, track: tracks[0], laps: 1, entries: example.entries }, {}, { grid });
  assert.deepEqual(r.grid, grid);
  assert.equal(Math.max(...r.frames[0]), r.frames[0][3]);
  assert.throws(() => simulate({ seed: 7, track: tracks[0], laps: 1, entries: example.entries }, {}, { grid: [0, 0, 1, 2, 4, 5, 6, 7, 8, 9] }), /순열/);
});

test('가속 곡선 (AG-P046 A): a(v) = A(1 − c(v/V_top)²), 0 → V_top 시간은 (V_top/A)·atanh(√c)/√c에 가깝다', async () => {
  const { accelAt } = await import('../src/physics.ts');
  const { straightCurve } = await import('../src/trackCheck.ts');
  const p = carParams({ topSpeed: 5, accel: 5, grip: 5, brake: 5 }, 'current', { accelPoint: 0, brakePoint: 0, abScale: 1, accelDrag: 0.5 });
  assert.equal(accelAt(p, 0), 50);
  assert.equal(accelAt(p, 125), 25);
  assert.equal(accelAt(base, 125), 50); // 꺼짐
  const course = buildCourse([{ id: 's', kind: 'straight', length: 2000, bend: 0, width: 12, passable: true }], false);
  const tr = runSolo(course, p, 0, { x0: 0, v0: 0, xEnd: 1000 });
  const reach = tr.t[tr.v.findIndex((v) => v >= 125 - 1e-9)];
  const expect = (125 / 50) * (Math.atanh(Math.sqrt(0.5)) / Math.sqrt(0.5));
  assert.ok(Math.abs(reach - expect) < 0.02, `${reach} vs ${expect}`);
  // 꺼져 있으면 적분 직선 계산이 F5 손계산과 같다 (M1-S1 L-B: 62.5 → 100, 324 u, D 37.5)
  const r = straightCurve(base, 62.5, 324, 100);
  assert.ok(Math.abs(r.vS - 125) < 1e-9 && Math.abs(r.D - 37.5) < 0.1);
  assert.throws(() => carParams({ topSpeed: 5, accel: 5, grip: 5, brake: 5 }, 'current', { accelPoint: 0, brakePoint: 0, abScale: 1, accelDrag: 1 }), /가속 곡선/);
});
