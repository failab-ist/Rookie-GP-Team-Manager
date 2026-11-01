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
  innerLane?: number; // 코너 안쪽 차선. 코너 방향 데이터가 없어 비워 두면 config DEFAULT_INNER_LANE (가안)
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

// 사건 종류 번호 = 정렬 번호 (RACE_DIRECTING_P0_DRAFT.md:131). 반대급부는 종류 5의 원인 코드로 구분 (INT Q-57 (b), 지시서 가안)
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
  segment: string; // 트랙 구간 id (CAR §4.1 문자열, INT Q-59 가안)
  cause: string | null; // 원인 코드. 추월 S1, 접촉 rear/side, 패시브 activate:<id> · 반대급부 T-A/T-B-inner/T-B-straight/T-C (INT Q-57 (b))
};

// 판정 기록: 사건 기록과 따로 둔다 (INT §6.2). 형식과 정렬은 사건 기록과 같다
export const JudgementKind = {
  overtakeTry: 1,
  overtakeFail: 2, // 구간 끝까지 S1 성공 못 함
  overtakeAbort: 3, // 목표 차선 창에 차가 들어와 되돌림
  contactRelease: 4,
  passiveGrace: 5, // 출발 유예 중 조건 성립 (RACER §6)
  passiveCooldownHit: 6, // 쿨다운 중 조건 성립 (RACER §4)
} as const;
export type Judgement = Omit<RaceEvent, 'kind'> & { kind: (typeof JudgementKind)[keyof typeof JudgementKind] };

// 차별 집계 (QA용)
export type CarStatsLog = {
  tries: number;
  successes: number;
  fails: number;
  contacts: number;
  blockedTicks: number;
  racingTicks: number;
  laneTicks: number[];
  mistakes: number;
  passiveActivations: number;
  drawbacks: Record<string, number>;
  solver: { opportunities: number; forfeits: number; successesActive: number; successesInactive: number };
};

export type RaceOptions = {
  k: number; // 정점 뒤 한계 풀림 (AG-P024 B)
  interaction: boolean; // false = 2단계와 같은 단독 주행 10대
  reaction: boolean; // R1 출발 반응 지연 (INT Q-52)
  slipstream: boolean; // SS-1 (INT Q-53)
  accelFormula: 'current' | 'AC1'; // INT §4.7
  latSpeed: number; // 차선 변경 횡 속도 v_lat u/s (INT §4.1)
  // 추월 시도 조건의 '원하는 속도' (INT R3-1, 초안에 정의 없음). step = 다음 물리 스텝 속도(3단계 구현), target = 막히지 않았을 때의 한계 속도
  desiredSpeed: 'step' | 'target';
};

export type RaceHeader = {
  seed: number;
  inputHash: string;
  trackId: string;
  tickSeconds: number;
  exitLimitRelax: number; // 정점 뒤 한계 풀림 계수 k (AG-P024 B)
  options: RaceOptions;
};

export type RaceResult = {
  header: RaceHeader;
  grid: number[]; // 출발 슬롯 순서대로 차 번호
  ticks: number; // 마지막 차 완주까지 틱 수
  seconds: number; // ticks × tickSeconds
  frames: number[][]; // [틱][차 번호] = 누적 주행 거리
  lateral: number[][]; // [틱][차 번호] = 횡 위치 y (u). 단독 주행 모드는 빈 배열
  events: RaceEvent[];
  judgements: Judgement[];
  carStats: CarStatsLog[];
  finishOrder: number[]; // 최종 순위대로 차 번호
};
