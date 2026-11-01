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
