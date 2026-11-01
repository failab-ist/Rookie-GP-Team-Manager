import { EventKind, type RaceEvent } from './types.ts';

type Where = (car: number) => { lap: number; segment: number };

export function makeEvent(
  tick: number,
  kind: RaceEvent['kind'],
  cars: number[],
  where: { lap: number; segment: number },
  rank: RaceEvent['rank'] = null,
  cause: string | null = null,
): RaceEvent {
  const sorted = [...cars].sort((a, b) => a - b);
  return { tick, kind, cars: sorted, leadCar: sorted[0], rank, lap: where.lap, segment: where.segment, cause };
}

// 앞 순서와 뒤 순서(차 번호 배열, 1위부터)를 비교해 순위 변화 · 추월 · 선두 변경을 만든다.
// 추월 · 선두 변경의 cause `by:<차>`는 앞지른 차 (가안, 기록 형식).
export function diffOrder(tick: number, prev: number[], next: number[], where: Where): RaceEvent[] {
  const out: RaceEvent[] = [];
  const prevRank = new Map(prev.map((car, i) => [car, i + 1]));
  const nextRank = new Map(next.map((car, i) => [car, i + 1]));
  for (const car of next) {
    const before = prevRank.get(car)!;
    const after = nextRank.get(car)!;
    if (before !== after) out.push(makeEvent(tick, EventKind.rankChange, [car], where(car), [before, after]));
  }
  for (const a of next) {
    for (const b of next) {
      // a가 b 뒤에 있다가 앞으로 나옴
      if (prevRank.get(a)! > prevRank.get(b)! && nextRank.get(a)! < nextRank.get(b)!) {
        out.push(makeEvent(tick, EventKind.overtake, [a, b], where(a), [prevRank.get(a)!, nextRank.get(a)!], `by:${a}`));
      }
    }
  }
  if (prev[0] !== next[0]) {
    out.push(makeEvent(tick, EventKind.leadChange, [prev[0], next[0]], where(next[0]), null, `by:${next[0]}`));
  }
  return out;
}

const keyOf = (e: RaceEvent) => JSON.stringify(e);

// 정렬 (틱, 종류, 대표 차, 관련 차 목록, 원인) 고정. 모든 필드가 같은 기록만 하나로 합친다.
// RACE_DIRECTING_P0_DRAFT.md:147-149
export function sortEvents(events: RaceEvent[]): RaceEvent[] {
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
