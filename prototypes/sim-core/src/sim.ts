// 10대 레이스 시뮬레이터. 화면 · 렌더러 · 벽시계 · Math.random 없음 (TECH_STACK.md:27-32).
// 차끼리 충돌 · 추월 판단 · 레이서 능력치 · 패시브는 주행에 반영하지 않는다 (O-001, O-003, O-004 미정).
import {
  CAR_STAT_MAX,
  CAR_TOTAL,
  ENTRY_COUNT,
  EXIT_LIMIT_RELAX,
  RACER_STAT_MAX,
  RACER_STAT_TOTAL,
  SUBSTEPS,
  TICK_SECONDS,
} from './config.ts';
import { diffOrder, makeEvent, sortEvents } from './events.ts';
import { buildCourse, carParams, DT, segAt, step } from './physics.ts';
import { createRng, shuffle } from './rng.ts';
import { checkTrack } from './trackCheck.ts';
import { EventKind, type CarStats, type RaceEvent, type RaceInput, type RaceResult } from './types.ts';

// k = 정점 뒤 한계 풀림 계수 (AG-P024 B). QA 비교용으로만 바꾼다
export function simulate(input: RaceInput, k = EXIT_LIMIT_RELAX): RaceResult {
  validate(input, k);
  const { seed, track, laps, entries } = input;
  const course = buildCourse(track.segments, true);
  const lapLength = course.length;
  const raceLength = lapLength * laps;
  const params = entries.map((e) => carParams(e.car.stats));

  // 출발 순서는 시드 무작위 (AG-P011 C). 모든 차는 출발선 0에서 정지 출발 (슬롯 간격은 Q-35 미정)
  const grid = shuffle(createRng(seed), entries.map((_, i) => i));
  const slotOf = new Map(grid.map((car, slot) => [car, slot]));

  const dist = entries.map(() => 0);
  const speed = entries.map(() => 0);
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
    segment: course.segs.indexOf(segAt(course, dist[car])),
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
      for (let i = 0; i < SUBSTEPS; i++) {
        speed[car] = step(course, params[car], k, dist[car], speed[car]);
        dist[car] += speed[car] * DT;
      }
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
    header: {
      seed,
      inputHash: fnv1a(JSON.stringify(input)),
      trackId: track.id,
      tickSeconds: TICK_SECONDS,
      exitLimitRelax: k,
    },
    grid,
    ticks: tick,
    seconds: tick * TICK_SECONDS,
    frames,
    events: sortEvents(events),
    finishOrder: order(),
  };
}

// 입력 해시 (가안, 알고리즘은 O-001 미정): FNV-1a 32비트
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const isInt = (v: unknown) => Number.isInteger(v);

// 차량 능력치 합계 검사 (CAR §6). QA의 +Δ 차는 합계가 달라서 simulate에서는 검사하지 않고 데이터 로드 때만 쓴다
export function checkCarTotal(id: string, s: CarStats): void {
  const total = s.topSpeed + s.accel + s.grip + s.brake;
  if (total !== CAR_TOTAL) throw new Error(`차량 ${id}: 능력치 합계 ${total} ≠ ${CAR_TOTAL}`);
}

export function validate(input: RaceInput, k = EXIT_LIMIT_RELAX): void {
  if (!isInt(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('seed는 0 이상 2^32-1 이하 정수');
  if (!isInt(input.laps) || input.laps < 1) throw new Error('laps는 1 이상 정수 (RACE_UNIT_LENGTH_CAMERA_P0_DRAFT.md:94-95)');
  if (!(k >= 0 && k <= 1)) throw new Error('정점 뒤 한계 풀림 계수 k는 0 이상 1 이하');
  if (input.entries?.length !== ENTRY_COUNT) throw new Error(`참가 대수는 ${ENTRY_COUNT}대`);
  // 레이서 F1 총합 검증 (RACER_STATS_PASSIVES_DRAFT.md:136-150)
  for (const { racer, car } of input.entries) {
    const values = [racer.stats.overtake, racer.stats.control, racer.stats.focus];
    if (values.some((v) => !isInt(v) || v < 0 || v > RACER_STAT_MAX)) {
      throw new Error(`레이서 ${racer.id}: 능력치는 0~${RACER_STAT_MAX} 정수`);
    }
    const total = values.reduce((a, b) => a + b, 0);
    if (total !== RACER_STAT_TOTAL) throw new Error(`레이서 ${racer.id}: 능력치 총합 ${total} ≠ ${RACER_STAT_TOTAL}`);
    // 차량 F1 범위 (CAR §7 F1)
    const cs = car.stats;
    if ([cs.topSpeed, cs.accel, cs.grip, cs.brake].some((v) => !isInt(v) || v < 0 || v > CAR_STAT_MAX)) {
      throw new Error(`차량 ${car.id}: 능력치는 0~${CAR_STAT_MAX} 정수`);
    }
  }
  // 트랙 형식과 코너 검사 (CAR §4.1, §4.3)
  const { errors } = checkTrack(input.track, k);
  if (errors.length) throw new Error(`트랙 ${input.track?.id} 거부: ${errors.join('; ')}`);
}
