import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate } from '../src/sim.ts';
import { diffOrder, makeEvent, sortEvents } from '../src/events.ts';
import { EventKind, type RaceInput } from '../src/types.ts';

const example = JSON.parse(readFileSync(new URL('../examples/race.json', import.meta.url), 'utf8'));
const input = (over: Partial<RaceInput> = {}): RaceInput => ({
  seed: example.seed,
  track: example.track,
  laps: example.laps,
  entries: example.entries,
  ...over,
});

const SEEDS = [1, 2, 3, 4, 5]; // 재현성 시드 M = 5 (가안, RACER_STATS_PASSIVES_DRAFT.md:258)

test('결정론: 같은 입력을 두 번 돌리면 결과 JSON이 바이트 단위로 같다', () => {
  for (const seed of SEEDS) {
    assert.equal(JSON.stringify(simulate(input({ seed }))), JSON.stringify(simulate(input({ seed }))));
  }
});

test('출발 순서는 시드로 바뀐다', () => {
  const grids = new Set(SEEDS.map((seed) => simulate(input({ seed })).grid.join(',')));
  assert.ok(grids.size > 1);
});

test('결과 기본 형태: 10대 완주, 프레임은 틱 + 1개, 사건은 정렬됨', () => {
  const r = simulate(input());
  assert.equal(r.finishOrder.length, 10);
  assert.equal(r.frames.length, r.ticks + 1);
  assert.equal(r.events.filter((e) => e.kind === EventKind.finish).length, 10);
  assert.equal(r.events[0].kind, EventKind.start);
  assert.deepEqual(r.events, sortEvents(r.events));
});

test('잘못된 입력은 거부한다', () => {
  const bad = structuredClone(example.entries);
  bad[0].racer.stats.focus = 5; // 7/4/5 = 16
  assert.throws(() => simulate(input({ entries: bad })), /총합/);
  assert.throws(() => simulate(input({ entries: example.entries.slice(0, 9) })), /10대/);
  assert.throws(() => simulate(input({ laps: 0 })), /laps/);
  assert.throws(() => simulate(input({ laps: 1.5 })), /laps/);
  assert.throws(() => simulate(input({ seed: -1 })), /seed/);
});

test('순위 비교: 차 1이 차 0을 앞지르면 순위 변화 2건, 선두 변경 1건 (추월 사건은 S1 성공에서만)', () => {
  const where = () => ({ lap: 1, segment: 'x' });
  const events = diffOrder(10, [0, 1, 2], [1, 0, 2], where);
  assert.deepEqual(
    events.map((e) => [e.kind, e.cars, e.rank, e.cause]),
    [
      [EventKind.rankChange, [1], [2, 1], null],
      [EventKind.rankChange, [0], [1, 2], null],
      [EventKind.leadChange, [0, 1], null, 'by:1'],
    ],
  );
  assert.deepEqual(diffOrder(11, [1, 0, 2], [1, 0, 2], where), []);
});

test('사건 정렬과 중복 제거: 모든 필드가 같을 때만 합친다', () => {
  const at = { lap: 1, segment: 'x' };
  const a = makeEvent(5, EventKind.contact, [2, 5], at);
  const b = makeEvent(5, EventKind.contact, [2, 7], at);
  const early = makeEvent(1, EventKind.lap, [9], at);
  assert.deepEqual(sortEvents([b, a, a, early]), [early, a, b]);
});

test('부스트 구간 E1 고정 끝: M1-S4 (L-B) L_z = 468 − 57.8704 = 410.1296 u (DIRECTION 초안 F-B2)', async () => {
  const { boostZoneLength } = await import('../src/trackCheck.ts');
  assert.ok(Math.abs(boostZoneLength(468, 1.5, 0.9) - 410.1296) < 1e-4);
});

test('부스트 구간 모드는 구간 데이터가 없는 트랙(T1)에서 결과를 바꾸지 않는다', async () => {
  const { OT_FLOW_ALL } = await import('../src/config.ts');
  const T1 = JSON.parse(readFileSync(new URL('../data/tracks/T1.json', import.meta.url), 'utf8'));
  const run = (boostZone: boolean) => {
    const r = simulate(input({ track: T1 }), { ...OT_FLOW_ALL, boostZone });
    return JSON.stringify({ ...r, header: null });
  };
  assert.equal(run(true), run(false));
});

test('부스트 구간 모드: 부스트는 구간(M1-S4) 안에서만 최고속도를 올린다', async () => {
  const { MOTIF_ALL } = await import('../src/config.ts');
  const M1 = JSON.parse(readFileSync(new URL('../data/tracks/motif/M1-LB.json', import.meta.url), 'utf8'));
  const r = simulate(input({ track: M1 }), { ...MOTIF_ALL, slipstream: false });
  const boosts = r.judgements.filter((j) => j.kind === 9);
  assert.ok(boosts.length > 0);
  // 감지는 앞 코너(헤어핀 M1-C3) 진입점
  assert.ok(boosts.every((j) => j.segment === 'M1-C3'));
  // 틱 평균 속도가 자기 V_top을 넘는 곳은 구간 [M1-S4 시작, 시작 + L_z] 안뿐이고, 거기서도 V_top × 1.04 이하 (슬립스트림 끔)
  const { carParams } = await import('../src/physics.ts');
  const { boostZoneLength } = await import('../src/trackCheck.ts');
  const L = M1.segments.reduce((x: number, g: { length: number }) => x + g.length, 0);
  const z0 = 324 + 54 + 162 + 72 + 144 + 72;
  const z1 = z0 + boostZoneLength(468, 1.5, 0.9);
  let above = 0;
  r.frames.slice(1).forEach((p, k) =>
    p.forEach((x, i) => {
      const vTop = carParams(example.entries[i].car.stats).vTop;
      const v = (x - r.frames[k][i]) / r.header.tickSeconds;
      const m = (((r.frames[k][i] % L) + L) % L);
      if (v > vTop + 1e-9) {
        above++;
        assert.ok(m >= z0 - 1e-9 && m <= z1 + 10, `차${i} ${m.toFixed(1)}u에서 ${v.toFixed(2)} > V_top ${vTop}`);
        assert.ok(v <= vTop * 1.04 + 1e-9);
      }
    }),
  );
  assert.ok(above > 0);
});

test('코너 방향 칸: R은 innerLane 2, L은 0, 빈칸은 기본값과 같은 결과 (AG-P045 A, 차선 규약 A)', async () => {
  const { MOTIF_ALL } = await import('../src/config.ts');
  const M1 = JSON.parse(readFileSync(new URL('../data/tracks/motif/M1-LB.json', import.meta.url), 'utf8'));
  const withCorners = (f: (s: Record<string, unknown>) => Record<string, unknown>) => ({ ...M1, segments: M1.segments.map((s: Record<string, unknown>) => (s.kind === 'corner' ? f(s) : s)) });
  const run = (track: unknown) => {
    const r = simulate(input({ track: track as RaceInput['track'] }), MOTIF_ALL);
    return JSON.stringify({ ...r, header: null });
  };
  const noField = withCorners(({ direction, ...s }) => s);
  assert.equal(run(M1), run(noField)); // 빈칸 = 필드 없음 = 기본 0번
  assert.equal(run(withCorners((s) => ({ ...s, direction: 'R' }))), run(withCorners((s) => ({ ...s, direction: '', innerLane: 2 }))));
  assert.equal(run(withCorners((s) => ({ ...s, direction: 'L' }))), run(M1)); // L = 0 = 기본값
  assert.notEqual(run(withCorners((s) => ({ ...s, direction: 'R' }))), run(M1));
  assert.throws(() => simulate(input({ track: withCorners((s) => ({ ...s, direction: 'X' })) })), /방향 칸/);
});
