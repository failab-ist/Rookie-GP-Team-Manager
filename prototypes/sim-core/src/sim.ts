// 10대 레이스 시뮬레이터. 화면 · 렌더러 · 벽시계 · Math.random 없음 (TECH_STACK.md:27-32).
import {
  ENTRY_COUNT,
  PLACEHOLDER_LAP_SECONDS,
  RACER_STAT_MAX,
  RACER_STAT_TOTAL,
  TICK_SECONDS,
} from './config.ts';
import { diffOrder, makeEvent, sortEvents } from './events.ts';
import { createRng, shuffle } from './rng.ts';
import { EventKind, type Entry, type RaceEvent, type RaceInput, type RaceResult, type Track } from './types.ts';

export function simulate(input: RaceInput): RaceResult {
  validate(input);
  const { seed, track, laps, entries } = input;
  const lapLength = track.segments.reduce((sum, s) => sum + s.length, 0);
  const raceLength = lapLength * laps;

  // 출발 순서는 시드 무작위 (AG-P011 C)
  const grid = shuffle(createRng(seed), entries.map((_, i) => i));
  const slotOf = new Map(grid.map((car, slot) => [car, slot]));

  const dist = entries.map(() => 0);
  const finishTick: (number | null)[] = entries.map(() => null);
  // 순위: 먼저 완주한 차 → 많이 간 차 → 출발 슬롯 번호가 작은 차 (RACER_STATS_PASSIVES_DRAFT.md:222 가안)
  const order = () =>
    entries
      .map((_, i) => i)
      .sort(
        (a, b) =>
          (finishTick[a] ?? Infinity) - (finishTick[b] ?? Infinity) ||
          dist[b] - dist[a] ||
          slotOf.get(a)! - slotOf.get(b)!,
      );
  const where = (car: number) => ({
    lap: Math.min(Math.floor(dist[car] / lapLength) + 1, laps),
    segment: segmentAt(track, dist[car] % lapLength),
  });

  const events: RaceEvent[] = [makeEvent(0, EventKind.start, grid, { lap: 1, segment: 0 })];
  const frames: number[][] = [dist.slice()];
  let prevOrder = order();
  let tick = 0;

  while (finishTick.some((t) => t === null)) {
    tick++;
    for (let car = 0; car < entries.length; car++) {
      if (finishTick[car] !== null) continue;
      const before = dist[car];
      dist[car] += advance(entries[car], track, lapLength, before);
      const lapsDone = Math.floor(Math.min(dist[car], raceLength) / lapLength);
      if (lapsDone > Math.floor(before / lapLength) && lapsDone < laps) {
        events.push(makeEvent(tick, EventKind.lap, [car], where(car), null, `lap:${lapsDone}`));
        if (lapsDone === laps - 1) events.push(makeEvent(tick, EventKind.lastLap, [car], where(car)));
      }
      if (dist[car] >= raceLength) finishTick[car] = tick;
    }
    const nextOrder = order();
    events.push(...diffOrder(tick, prevOrder, nextOrder, where));
    nextOrder.forEach((car, i) => {
      if (finishTick[car] === tick) events.push(makeEvent(tick, EventKind.finish, [car], where(car), [i + 1, i + 1]));
    });
    prevOrder = nextOrder;
    frames.push(dist.slice());
  }

  return {
    header: { seed, inputHash: fnv1a(JSON.stringify(input)), trackId: track.id, tickSeconds: TICK_SECONDS },
    grid,
    ticks: tick,
    seconds: tick * TICK_SECONDS,
    frames,
    events: sortEvents(events),
    finishOrder: order(),
  };
}

// 한 틱 동안 차가 가는 거리.
// UNRESOLVED O-002 / O-003 / O-004 (AG-P020 초안 없음): 차량 4능력치 · 레이서 3능력치 · 패시브는 여기에 들어온다.
// 지금은 자리표시: 모든 차가 같은 속도로 한 랩을 PLACEHOLDER_LAP_SECONDS에 돈다. 능력치 미반영.
function advance(_entry: Entry, _track: Track, lapLength: number, _dist: number): number {
  return (lapLength / PLACEHOLDER_LAP_SECONDS) * TICK_SECONDS;
}

function segmentAt(track: Track, lapDist: number): number {
  let end = 0;
  for (let i = 0; i < track.segments.length; i++) {
    end += track.segments[i].length;
    if (lapDist < end) return i;
  }
  return track.segments.length - 1;
}

// 입력 해시 (가안, 알고리즘은 O-001 미정): FNV-1a 32비트
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function validate(input: RaceInput): void {
  const isInt = (v: unknown) => Number.isInteger(v);
  if (!isInt(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('seed는 0 이상 2^32-1 이하 정수');
  if (!isInt(input.laps) || input.laps < 1) throw new Error('laps는 1 이상 정수 (RACE_UNIT_LENGTH_CAMERA_P0_DRAFT.md:94-95)');
  if (!input.track?.segments?.length) throw new Error('트랙 구간이 없다');
  for (const s of input.track.segments) {
    if (!(s.length > 0)) throw new Error('트랙 구간 길이는 0보다 커야 한다');
  }
  if (input.entries?.length !== ENTRY_COUNT) throw new Error(`참가 대수는 ${ENTRY_COUNT}대`);
  // F1 총합 검증 (RACER_STATS_PASSIVES_DRAFT.md:136-150)
  for (const { racer } of input.entries) {
    const values = [racer.stats.overtake, racer.stats.control, racer.stats.focus];
    if (values.some((v) => !isInt(v) || v < 0 || v > RACER_STAT_MAX)) {
      throw new Error(`레이서 ${racer.id}: 능력치는 0~${RACER_STAT_MAX} 정수`);
    }
    const total = values.reduce((a, b) => a + b, 0);
    if (total !== RACER_STAT_TOTAL) throw new Error(`레이서 ${racer.id}: 능력치 총합 ${total} ≠ ${RACER_STAT_TOTAL}`);
  }
}
