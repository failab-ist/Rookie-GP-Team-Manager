// 시뮬레이터 입력 · 결과 타입. 차 번호 = entries 배열 위치(0부터).

// 레이서 3능력치 (SPEC_INDEX.md:36). 주행 동작은 O-003 미정.
export type RacerStats = {
  overtake: number; // 추월
  control: number; // 제어
  focus: number; // 집중
};

export type Racer = {
  id: string;
  stats: RacerStats;
  passiveId: string | null; // 고유 패시브 1개 (SPEC_INDEX.md:36). 동작은 O-004 미정. NPC는 null
};

// 차량 4능력치 (SPEC_INDEX.md:37). 제동 = 코너 진입 전 감속, 접지 = 코너 안 한계 속도 (AG-P017 A).
// 주행 공식은 src/physics.ts (CAR_STATS_TRACKS_PROTO_DRAFT.md §7, 가안).
export type CarStats = {
  topSpeed: number; // 최고속도
  accel: number; // 가속
  grip: number; // 접지
  brake: number; // 제동
};

export type Car = {
  id: string;
  stats: CarStats;
};

export type SegmentKind = 'straight' | 'corner';

// 트랙 구간 (CAR_STATS_TRACKS_PROTO_DRAFT.md §4.1). 길이 단위 u는 가안.
export type TrackSegment = {
  id: string; // 랩 안의 순서대로. 예: T1-01
  kind: SegmentKind;
  length: number;
  bend: number; // 휘는 정도. 0에 가까울수록 직선
  width: number;
  passable: boolean; // 추월 가능 표시
};

export type Track = {
  id: string;
  segments: TrackSegment[];
};

// 참가자 세팅 1대분
export type Entry = {
  racer: Racer;
  car: Car;
};

export type RaceInput = {
  seed: number; // uint32
  track: Track;
  laps: number;
  entries: Entry[];
};

// 사건 종류 번호 = 정렬 번호 (RACE_DIRECTING_P0_DRAFT.md:131). passiveDrawback은 목록에 없어 가안 10 (O-004).
export const EventKind = {
  start: 1,
  rankChange: 2,
  overtake: 3,
  contact: 4,
  passive: 5,
  leadChange: 6,
  lap: 7,
  lastLap: 8,
  finish: 9,
  passiveDrawback: 10,
} as const;
export type EventKindId = (typeof EventKind)[keyof typeof EventKind];

// 사건 기록 공통 필드 (RACE_DIRECTING_P0_DRAFT.md:133-144)
export type RaceEvent = {
  tick: number;
  kind: EventKindId;
  cars: number[]; // 관련 차, 오름차순
  leadCar: number; // 대표 차 번호 = cars 중 가장 작은 번호
  rank: [before: number, after: number] | null; // 순위는 1부터
  lap: number; // 1부터
  segment: number; // 트랙 구간 번호
  cause: string | null; // 원인 코드. 패시브 원인 값은 O-004 미정
};

export type RaceHeader = {
  seed: number;
  inputHash: string;
  trackId: string;
  tickSeconds: number;
  exitLimitRelax: number; // 정점 뒤 한계 풀림 계수 k (AG-P024 B)
};

export type RaceResult = {
  header: RaceHeader;
  grid: number[]; // 출발 슬롯 순서대로 차 번호
  ticks: number; // 마지막 차 완주까지 틱 수
  seconds: number; // ticks × tickSeconds
  frames: number[][]; // [틱][차 번호] = 누적 주행 거리
  events: RaceEvent[];
  finishOrder: number[]; // 최종 순위대로 차 번호
};
