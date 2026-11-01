import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTACT_LOSS, L2_OPPONENTS, LANE_WIDTH, LAT_SPEED } from '../src/config.ts';
import { lateralErr, pTry } from '../src/racer.ts';
import { subStream } from '../src/rng.ts';
import { blockCap, rearFix, simulate } from '../src/sim.ts';
import type { Entry, Track } from '../src/types.ts';

const load = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const tracks: Track[] = ['T1', 'T2', 'T3'].map((t) => load(`../data/tracks/${t}.json`));
const npc = { overtake: 5, control: 5, focus: 5 };
const car = (a: number[], id: string) => ({ id, stats: { topSpeed: a[0], accel: a[1], grip: a[2], brake: a[3] } });
const lineup: Entry[] = [
  { racer: { id: 'A', stats: { overtake: 7, control: 4, focus: 4 }, passiveId: 'gap-hunter' }, car: car([5, 5, 5, 5], 'base') },
  { racer: { id: 'B', stats: { overtake: 4, control: 7, focus: 4 }, passiveId: 'corner-architect' }, car: car([7, 5, 4, 4], 'X') },
  { racer: { id: 'C', stats: { overtake: 4, control: 4, focus: 7 }, passiveId: 'calm-solver' }, car: car([4, 4, 6, 6], 'Y') },
  ...L2_OPPONENTS.slice(0, 7).map((o, i) => ({ racer: { id: `n${i}`, stats: npc, passiveId: null }, car: car(o, `o${i}`) })),
];

test('결정론: 반응 지연 · 슬립스트림 4조합 × 트랙 3종, 같은 입력 두 번이 바이트 단위로 같다', () => {
  for (const track of tracks)
    for (const reaction of [false, true])
      for (const slipstream of [false, true]) {
        const run = () => JSON.stringify(simulate({ seed: 11, track, laps: 3, entries: lineup }, { reaction, slipstream }));
        assert.equal(run(), run(), `${track.id} R${+reaction} SS${+slipstream}`);
      }
});

test('하위 스트림: 같은 (시드, 슬롯, 종류)면 같은 수열, 하나라도 다르면 다른 수열', () => {
  const take = (seed: number, slot: number, kind: 'try' | 'eps') => Array.from({ length: 5 }, subStream(seed, slot, kind));
  assert.deepEqual(take(1, 2, 'try'), take(1, 2, 'try'));
  assert.notDeepEqual(take(1, 2, 'try'), take(1, 2, 'eps'));
  assert.notDeepEqual(take(1, 2, 'try'), take(1, 3, 'try'));
  assert.notDeepEqual(take(1, 2, 'try'), take(2, 2, 'try'));
});

test('INT 계산 예시: t_lc, 막힘 상한, p_try, 횡 오차, 접촉', () => {
  assert.equal(LANE_WIDTH / LAT_SPEED, 1.0); // §4.1 t_lc = 1.0 s
  assert.equal(blockCap(100, 100 - 80 - 6), 112); // §4.2
  assert.equal(blockCap(100, 2), 100); // §4.2 간격 2
  assert.equal(blockCap(0, 10), 8); // §4.2 앞차 0
  assert.ok(Math.abs(pTry({ overtake: 7, control: 4, focus: 4 }) - 0.7) < 1e-12); // §4.3
  assert.ok(Math.abs(lateralErr({ overtake: 4, control: 7, focus: 4 }) - 0.88) < 1e-12); // §4.4 S-A
  // §4.4 접촉 시작 예시: A(앞) 100/100, B(뒤) 95/104 → 손실 뒤 A 88.0, B 91.52 → B를 92로, v_B 88.0
  const A = { s: 100, v: 100 * (1 - CONTACT_LOSS) };
  const B = { s: 95, v: 104 * (1 - CONTACT_LOSS) };
  assert.ok(Math.abs(A.v - 88) < 1e-9 && Math.abs(B.v - 91.52) < 1e-9);
  rearFix(B, A);
  assert.deepEqual([B.s, Math.round(B.v * 100) / 100], [92, 88]);
});

test('상호작용 레이스: 접촉 · 막힘이 생기고, 사건 구간은 CAR 문자열 id', () => {
  const r = simulate({ seed: 3, track: tracks[1], laps: 3, entries: lineup });
  assert.ok(r.carStats.some((c) => c.contacts > 0));
  assert.ok(r.carStats.some((c) => c.blockedTicks > 0));
  assert.ok(r.events.every((e) => /^T2-\d\d$/.test(e.segment)));
  assert.equal(r.lateral.length, r.ticks);
});

test('단독 주행 모드는 상호작용 기록이 없다', () => {
  const r = simulate({ seed: 3, track: tracks[0], laps: 3, entries: lineup }, { interaction: false });
  assert.equal(r.lateral.length, 0);
  assert.equal(r.judgements.length, 0);
  assert.ok(r.events.every((e) => e.kind !== 3 && e.kind !== 4 && e.kind !== 5));
});

test('추월 5단계 흐름 묶음(OT_FLOW_ALL): 같은 입력 두 번이 바이트 단위로 같고, 추월 기록은 원인:S1|free:by:차 형식', async () => {
  const { OT_FLOW_ALL } = await import('../src/config.ts');
  for (const track of tracks) {
    const run = () => simulate({ seed: 5, track, laps: 3, entries: lineup }, { ...OT_FLOW_ALL, slipstream: true });
    const a = run();
    assert.equal(JSON.stringify(a), JSON.stringify(run()), track.id);
    for (const e of a.events.filter((x) => x.kind === 3)) {
      const [cause, how, by, car] = e.cause!.split(':');
      assert.ok(['contact', 'mistake', 'boost', 'brake', 'corner', 'exit', 'straight'].includes(cause), e.cause!);
      assert.ok(how === 'S1' || how === 'free');
      assert.equal(by, 'by');
      assert.ok(e.cars.includes(Number(car)));
    }
  }
});
