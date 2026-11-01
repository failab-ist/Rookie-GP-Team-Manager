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
