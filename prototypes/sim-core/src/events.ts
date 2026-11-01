import { EventKind, type RaceEvent } from './types.ts';

type Where = { lap: number; segment: string };

export function makeEvent<K extends number>(
  tick: number,
  kind: K,
  cars: number[],
  where: Where,
  rank: RaceEvent['rank'] = null,
  cause: string | null = null,
): Omit<RaceEvent, 'kind'> & { kind: K } {
  const sorted = [...cars].sort((a, b) => a - b);
  return { tick, kind, cars: sorted, leadCar: sorted[0], rank, lap: where.lap, segment: where.segment, cause };
}

// 앞 순서와 뒤 순서(차 번호 배열, 1위부터)를 비교해 순위 변화 · 선두 변경을 만든다.
// 추월 사건(종류 3)은 추월 규칙의 S1 성공에서만 만든다 (INT §6.2). 선두 변경 cause `by:<차>`는 새 선두 (가안).
export function diffOrder(tick: number, prev: number[], next: number[], where: (car: number) => Where): RaceEvent[] {
  const out: RaceEvent[] = [];
  const prevRank = new Map(prev.map((car, i) => [car, i + 1]));
  next.forEach((car, i) => {
    const before = prevRank.get(car)!;
    if (before !== i + 1) out.push(makeEvent(tick, EventKind.rankChange, [car], where(car), [before, i + 1]));
  });
  if (prev[0] !== next[0]) {
    out.push(makeEvent(tick, EventKind.leadChange, [prev[0], next[0]], where(next[0]), null, `by:${next[0]}`));
  }
  return out;
}

const keyOf = (e: unknown) => JSON.stringify(e);

// 정렬 (틱, 종류, 대표 차, 관련 차 목록, 원인) 고정. 모든 필드가 같은 기록만 하나로 합친다.
// RACE_DIRECTING_P0_DRAFT.md:147-149. 판정 기록도 같은 규칙 (INT §6.2)
export function sortEvents<T extends Omit<RaceEvent, 'kind'> & { kind: number }>(events: T[]): T[] {
  const unique = [...new Map(events.map((e) => [keyOf(e), e])).values()];
  return unique.sort(
    (x, y) =>
      x.tick - y.tick ||
      x.kind - y.kind ||
      x.leadCar - y.leadCar ||
      compareList(x.cars, y.cars) ||
      compareStr(x.cause ?? '', y.cause ?? '') ||
      compareStr(keyOf(x), keyOf(y)),
  );
}

function compareList(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

// localeCompare는 환경에 따라 달라질 수 있어 코드 단위로 비교한다
const compareStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
