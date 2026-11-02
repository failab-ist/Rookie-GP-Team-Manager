// 10대 레이스 시뮬레이터. 화면 · 렌더러 · 벽시계 · Math.random 없음 (TECH_STACK.md:27-32).
// INT = design_ssot/drafts/RACE_INTERACTION_P0_DRAFT.md (차선, 막힘, 추월, 접촉, 출발, 슬립스트림, 능력치 · 패시브 연결)
import * as C from './config.ts';
import { diffOrder, makeEvent, sortEvents } from './events.ts';
import { buildCourse, carParams, DT, envelopeAt, limitAt, segAt, step, vCorner, type CarParams } from './physics.ts';
import { isPassive, lateralErr, pFocus, pTry, type PassiveId } from './racer.ts';
import { createRng, shuffle, subStream, type Rng } from './rng.ts';
import { boostZoneLength, checkTrack } from './trackCheck.ts';
import {
  EventKind,
  JudgementKind,
  type CarStats,
  type CarStatsLog,
  type Judgement,
  type RaceEvent,
  type RaceInput,
  type QaHooks,
  type RaceOptions,
  type RaceResult,
  type TraceRow,
  type TrackSegment,
} from './types.ts';

export const DEFAULT_OPTIONS: RaceOptions = {
  k: C.EXIT_LIMIT_RELAX,
  interaction: true,
  reaction: C.DEFAULT_REACTION,
  slipstream: C.DEFAULT_SLIPSTREAM,
  accelFormula: C.ACCEL_FORMULA,
  accelPoint: C.ACCEL_POINT,
  brakePoint: C.BRAKE_POINT,
  abScale: C.AB_BASE_SCALE,
  accelDrag: C.ACCEL_DRAG,
  latSpeed: C.LAT_SPEED,
  desiredSpeed: C.DESIRED_SPEED,
  slipRatio: C.SLIP_RATIO,
  laneCount: C.LANE_COUNT,
  capWhileChanging: C.CAP_WHILE_CHANGING,
  otRelease: C.OT_RELEASE,
  otSpanCorner: C.OT_SPAN_CORNER,
  dirtyAir: C.DIRTY_AIR,
  boost: C.BOOST,
  cornerPriority: C.CORNER_PRIORITY,
  blockCap: C.BLOCK_CAP_ON,
  otSpanStraights: C.OT_SPAN_STRAIGHTS,
  yieldMinRatio: C.YIELD_MIN_RATIO,
  tryGap: C.TRY_GAP,
  otReleaseWidth: C.CAR_WIDTH,
  carWidth: C.CAR_WIDTH,
  laneWidth: C.LANE_WIDTH,
  boostZone: C.BOOST_ZONE,
  ctWobble: C.CT_WOBBLE,
  ctLine: C.CT_LINE,
  ctContact: C.CT_CONTACT,
};

// 막힘 상한 v_cap (INT §4.2). gap = 같은 차선 앞뒤 간격 g
export const blockCap = (vFront: number, gap: number) => vFront + Math.max(0, gap - C.GAP_MIN) / C.BLOCK_TAU;

// 앞뒤 접촉 위치 처리 (INT R4-5): 뒤차를 앞차 − L_car − g_min으로, 속도는 앞차 이하로
export function rearFix(rear: { s: number; v: number }, front: { s: number; v: number }): void {
  rear.s = front.s - C.CAR_LENGTH - C.GAP_MIN;
  rear.v = Math.min(rear.v, front.v);
}

const ticksOf = (seconds: number) => Math.round(seconds / C.TICK_SECONDS);

type Car = {
  i: number;
  p: CarParams;
  s: number; // 누적 주행 거리
  v: number;
  from: number; // 차선 변경 중이 아니면 from = to = 현재 차선
  to: number;
  prog: number; // 0 → 1 변경 진행
  dir: 1 | -1; // -1 = 되돌림 (INT R1-4)
  ignoreWindow: boolean; // 코너 설계자 apex 선점 이동
  eps: number; // 횡 입력 (INT §4.4)
  react: number; // 출발 반응 지연 s (R1)
  ot: { front: number; segEnd: number; orig: number; target: number } | null;
  pendingCooldown: boolean;
  cooldownUntil: number; // 틱
  finished: boolean;
  passive: PassiveId | null;
  ps: { state: 'idle' | 'active' | 'cooldown'; until: number; prevCond: boolean; usedMove: boolean; lastEnd: number; aMul: number };
  log: CarStatsLog;
  vPrev: number; // 직전 틱 속도 (OT-4 원인 판정)
  pendingReturn: number | null; // OT-3: 코너에서 실패하면 다음 직선에서 원래 차선으로
  boostFrom: number; // OT-6 구간 모드에서 부스트가 시작되는 누적 거리 (아니면 -Infinity)
  boostUntil: number; // OT-6 부스트가 끝나는 누적 거리
  yieldTo: number | null; // OT-7 코너 우선권을 진 상대
  yieldEnd: number; // OT-7 그 코너 끝 누적 거리
  yieldFloor: number; // OT-7 양보 감속 하한 = 자기 코너 한계 × YIELD_MIN_RATIO
  lastMistake: number; // 혼전 실수 틱
  lastContact: number; // 접촉 시작 틱
  inMistake: boolean; // 지금 횡 오차가 혼전 실수로 뽑힌 값인지 (CT-1, CT-4)
};

// opts: 비교 실험용. 빠진 값은 DEFAULT_OPTIONS
export function simulate(input: RaceInput, opts: Partial<RaceOptions> = {}, qa: QaHooks = {}): RaceResult {
  // 상한 해제 옆 간격은 따로 주지 않으면 차 폭 (OT-2 정의: 옆 간격이 차 폭 이상)
  const o: RaceOptions = { ...DEFAULT_OPTIONS, otReleaseWidth: opts.carWidth ?? DEFAULT_OPTIONS.otReleaseWidth, ...opts };
  const baseP = carParams({ topSpeed: C.BASE_CAR_STAT, accel: C.BASE_CAR_STAT, grip: C.BASE_CAR_STAT, brake: C.BASE_CAR_STAT }, undefined, o); // 기준 차 코너 검사 · 부스트 구간 (지금까지와 같이 기본 가속 공식)
  validate(input, o.k, qa.start ? qa.start.length : C.ENTRY_COUNT, baseP);
  if (!(o.latSpeed > 0)) throw new Error('횡 속도 v_lat은 0보다 커야 한다 (INT §4.1)');
  if (!(o.tryGap > 0)) throw new Error('시도 시작 거리 g_try는 0보다 커야 한다 (INT §4.3)');
  if (!(o.otReleaseWidth > 0)) throw new Error('상한 해제 옆 간격은 0보다 커야 한다 (OT-2)');
  if (!(o.carWidth > 0 && o.laneWidth >= o.carWidth)) throw new Error('차 폭은 0보다 크고 차선 폭 이하 (INT §4.1, §4.4)');
  const laneCenter = (lane: number) => o.laneWidth / 2 + o.laneWidth * lane; // INT R1-6 (2, 6, 10 u)
  const laneSlack = (o.laneWidth - o.carWidth) / 2; // CT-1 차선 여유 (config LANE_SLACK과 같은 계산)
  if (!(o.slipRatio >= 0)) throw new Error('슬립스트림 비율 s_ss는 0 이상 (INT §4.6)');
  if (!(Number.isInteger(o.laneCount) && o.laneCount >= 3)) throw new Error('차선 수는 3 이상 정수 (출발 그리드가 0번, 2번 차선을 쓴다)');
  const { seed, track, laps, entries } = input;
  const course = buildCourse(track.segments, true);
  const L = course.length;
  const raceLength = L * laps;
  const n = entries.length;
  const idx = entries.map((_, i) => i);

  // 출발 순서는 시드 무작위 (AG-P011 C). 단독 주행 모드는 2단계와 같이 모두 0에서 출발
  // qa.grid: QA 전용 출발 순서 지정 (출발 자리 영향 측정). 경기 규칙이 아니다
  if (qa.grid && (!o.interaction || qa.grid.length !== n || [...qa.grid].sort((a, b) => a - b).some((v, i) => v !== i))) throw new Error('qa.grid는 상호작용 모드에서 차 번호 순열');
  const grid = qa.grid ? [...qa.grid] : o.interaction ? shuffle(subStream(seed, 0, 'grid'), idx) : shuffle(createRng(seed), idx);
  const slotOf = new Map(grid.map((car, slot) => [car, slot]));

  const cars: Car[] = entries.map((e, i) => ({
    i,
    p: carParams(e.car.stats, o.accelFormula, o),
    s: 0,
    v: 0,
    from: 1,
    to: 1,
    prog: 0,
    dir: 1,
    ignoreWindow: false,
    eps: 0,
    react: o.interaction && o.reaction ? subStream(seed, i, 'react')() * C.REACTION_MAX : 0,
    ot: null,
    pendingCooldown: false,
    cooldownUntil: 0,
    finished: false,
    passive: o.interaction && isPassive(e.racer.passiveId) ? e.racer.passiveId : null,
    ps: { state: 'idle', until: 0, prevCond: false, usedMove: false, lastEnd: -Infinity, aMul: 1 },
    log: {
      tries: 0,
      successes: 0,
      fails: 0,
      contacts: 0,
      blockedTicks: 0,
      racingTicks: 0,
      laneTicks: [0, 0, 0],
      mistakes: 0,
      passiveActivations: 0,
      drawbacks: {},
      solver: { opportunities: 0, forfeits: 0, successesActive: 0, successesInactive: 0 },
      passes: 0,
      passesS1: 0,
      passCauses: {},
      boosts: 0,
      contactsCaused: 0,
      contactsSuffered: 0,
    },
    vPrev: 0,
    pendingReturn: null,
    boostFrom: -Infinity,
    boostUntil: -Infinity,
    yieldTo: null,
    yieldEnd: -Infinity,
    yieldFloor: 0,
    lastMistake: -Infinity,
    lastContact: -Infinity,
    inMistake: false,
  }));
  if (o.interaction) {
    // 2열 엇갈림 그리드 (INT §4.5). 출발 순서 0번이 맨 앞 줄 B열
    grid.forEach((car, pos) => {
      const row = n / 2 - 1 - Math.floor(pos / 2);
      const colB = pos % 2 === 0;
      cars[car].s = C.GRID_ROW_GAP * row + (colB ? C.GRID_STAGGER : 0);
      cars[car].from = cars[car].to = colB ? C.GRID_LANES[1] : C.GRID_LANES[0];
    });
    qa.start?.forEach((st, i) => {
      cars[i].s = st.s;
      cars[i].v = st.v;
      cars[i].from = cars[i].to = st.lane;
    });
  }
  const trace: TraceRow[][] = [];
  const tryRng: Rng[] = idx.map((i) => subStream(seed, i, 'try'));
  const epsRng: Rng[] = idx.map((i) => subStream(seed, i, 'eps'));

  const finishTick: (number | null)[] = idx.map(() => null);
  // 순위: 먼저 완주한 차 → 많이 간 차 → 출발 순서가 앞인 차 (RACER_STATS_PASSIVES_DRAFT.md:222 가안)
  const order = () =>
    idx
      .slice()
      .sort(
        (a, b) =>
          (finishTick[a] ?? Infinity) - (finishTick[b] ?? Infinity) || cars[b].s - cars[a].s || slotOf.get(a)! - slotOf.get(b)!,
      );
  const where = (car: number) => ({
    lap: Math.min(Math.floor(cars[car].s / L) + 1, laps),
    segment: segAt(course, cars[car].s).id,
  });

  const events: RaceEvent[] = [makeEvent(0, EventKind.start, grid, { lap: 1, segment: course.segs[0].id })];
  const judgements: Judgement[] = [];
  const frames: number[][] = [cars.map((c) => c.s)];
  const lateral: number[][] = [];
  let prevOrder = order();
  let tick = 0;

  // ---------- 상호작용 보조 ----------
  const changing = (c: Car) => c.from !== c.to;
  const lanesOf = (c: Car) => (changing(c) ? [c.from, c.to] : [c.from]);
  const occupies = (c: Car, lane: number) => c.from === lane || c.to === lane;
  const shareLane = (a: Car, b: Car) => lanesOf(a).some((l) => occupies(b, l));
  const y = (c: Car) => laneCenter(c.from) + (laneCenter(c.to) - laneCenter(c.from)) * c.prog + c.eps;
  const active = () => prevOrder.map((i) => cars[i]).filter((c) => !c.finished);
  const gapTo = (back: Car, front: Car) => front.s - back.s - C.CAR_LENGTH; // INT §4.2 g
  // 같은 차선(변경 중이면 두 차선 중 하나라도)의 가장 가까운 앞차
  const frontOf = (c: Car, lane?: number) => {
    let best: Car | null = null;
    for (const d of cars) {
      if (d === c || d.finished || d.s <= c.s) continue;
      if (lane === undefined ? !shareLane(c, d) : !occupies(d, lane)) continue;
      if (!best || d.s < best.s) best = d;
    }
    return best;
  };
  // 목표 차선 창 (INT §4.1): 차선에 s ∈ [s − W_b, s + W_f]인 차가 있으면 점유
  const windowBusy = (c: Car, lane: number, exclude?: Car) =>
    cars.some((d) => d !== c && d !== exclude && !d.finished && occupies(d, lane) && d.s >= c.s - C.WINDOW_BACK && d.s <= c.s + C.WINDOW_FRONT);
  const nearCount = (c: Car, radius: number, yAt = y(c)) =>
    cars.filter((d) => d !== c && !d.finished && Math.hypot(d.s - c.s, y(d) - yAt) <= radius).length;
  const startChange = (c: Car, target: number, ignoreWindow = false) => {
    c.to = target;
    c.prog = 0;
    c.dir = 1;
    c.ignoreWindow = ignoreWindow;
  };
  const revert = (c: Car) => {
    if (changing(c) && c.dir === 1) c.dir = -1;
  };
  const passiveEvent = (c: Car, cause: string) => {
    events.push(makeEvent(tick, EventKind.passive, [c.i], where(c.i), null, cause));
    if (!cause.startsWith('activate:')) c.log.drawbacks[cause] = (c.log.drawbacks[cause] ?? 0) + 1;
  };
  const judge = (kind: Judgement['kind'], carsIn: number[], cause: string | null = null) =>
    judgements.push(makeEvent(tick, kind, carsIn, where(carsIn[0]), null, cause));
  const solverActive = (c: Car) => c.passive === 'calm-solver' && c.ps.state === 'active';
  const contactPairs = new Map<number, { on: boolean; offTicks: number; sinceFix: number; releasedAt: number }>();

  const decTicks = ticksOf(C.DECISION_SECONDS);
  const holdTicks = ticksOf(C.PASS_HOLD_SECONDS);
  // OT-3: 지금 직선 다음, 코너를 하나 이상 지난 직선의 끝 (누적 거리)
  const nextStraightEnd = (sAbs: number) => {
    let i = course.segs.indexOf(segAt(course, sAbs));
    let off = sAbs - (sAbs % L);
    let seenCorner = false;
    for (let k = 0; k < 2 * course.segs.length; k++) {
      i++;
      if (i === course.segs.length) {
        i = 0;
        off += L;
      }
      const sg = course.segs[i];
      if (sg.kind === 'corner') seenCorner = true;
      else if (seenCorner) return off + sg.end;
    }
    return sAbs - (sAbs % L) + segAt(course, sAbs).end;
  };
  const inCorner = (c: Car) => segAt(course, c.s).kind === 'corner';
  const canStartChange = (c: Car) => !o.otSpanCorner || !inCorner(c); // OT-3 코너 안에서는 차선 유지
  // OT-5 추격 상태: 바로 앞차(차선 무관)와 시간 간격 ≤ CHASE_SECONDS. 틱 시작에 정한다
  let chasing = new Set<Car>();
  const computeChasing = (act: Car[]) => {
    chasing = new Set();
    for (const c of act) {
      let ahead: Car | null = null;
      for (const d of act) if (d !== c && d.s > c.s && (!ahead || d.s < ahead.s)) ahead = d;
      if (ahead && (ahead.s - c.s) / Math.max(c.v, 1) <= C.CHASE_SECONDS) chasing.add(c);
    }
  };
  // OT-6 부스트 구간: 트랙에서 가장 긴 직선(같으면 앞 구간) 1곳, 그 직선 시작점에서 감지해 직선 끝까지.
  // 구간 모드(boostZone)이고 트랙에 구간이 있으면 그 직선, 감지는 앞 코너 진입점, 끝은 E1 고정 끝 (DIRECTION 초안 §4, F-B2)
  const zone = o.boostZone && track.boostZone ? course.segs.find((s) => s.id === track.boostZone) : undefined;
  if (o.boostZone && track.boostZone && zone?.kind !== 'straight') throw new Error(`트랙 ${track.id}: 부스트 구간 ${track.boostZone}이 직선이 아니다`);
  const boostSeg = zone ?? course.segs.filter((s) => s.kind === 'straight').reduce((a, b) => (b.length > a.length ? b : a));
  const zonePrev = zone && course.segs[(course.segs.indexOf(zone) - 1 + course.segs.length) % course.segs.length];
  const boostDetect = zonePrev ? zonePrev.start : boostSeg.start;
  const boostLen = zone && zonePrev ? boostZoneLength(zone.length, zonePrev.bend, zone.next!.bend, baseP) : boostSeg.length;
  if (!(boostLen > 0)) throw new Error(`트랙 ${track.id}: 부스트 구간 길이 ${boostLen} ≤ 0 (F-B2)`);
  // 코너 안쪽 차선: innerLane → 방향 칸 (차선 규약 A: L = 0, R = 오른쪽 끝) → 기본값 (AG-P045 A)
  const innerOf = (sg: TrackSegment | null | undefined) =>
    sg?.innerLane ?? (sg?.direction === 'L' ? 0 : sg?.direction === 'R' ? o.laneCount - 1 : C.DEFAULT_INNER_LANE);
  const crossed = (from: number, to: number, at: number) => Math.floor((from - at) / L) < Math.floor((to - at) / L);
  // OT-4 추월 기록: 앞뒤가 바뀐 뒤 PASS_HOLD_SECONDS 유지되면 기록
  const pendingPasses: { tick: number; passer: Car; passed: Car; cause: string; attempt: boolean; where: { lap: number; segment: string } }[] = [];
  const phaseOf = (c: Car): 'corner' | 'exit' | 'brake' | 'straight' => {
    const sg = segAt(course, c.s);
    if (sg.kind === 'corner') return c.s % L < sg.apex ? 'corner' : 'exit';
    if (c.v < c.vPrev - 1e-6) return 'brake';
    return c.v >= effParams(c).vTop - 0.5 ? 'straight' : 'exit';
  };
  const passCause = (passer: Car, passed: Car): string => {
    const recent = (t0: number) => tick - t0 <= holdTicks;
    if (recent(passer.lastContact) || recent(passed.lastContact)) return 'contact';
    if (recent(passed.lastMistake)) return 'mistake';
    if (passer.s >= passer.boostFrom && passer.s < passer.boostUntil) return 'boost';
    const pp = phaseOf(passer);
    if (pp === 'brake' || phaseOf(passed) === 'brake') return 'brake';
    return pp;
  };
  const recordPass = (pp: (typeof pendingPasses)[number]) => {
    events.push(makeEvent(pp.tick, EventKind.overtake, [pp.passer.i, pp.passed.i], pp.where, null, `${pp.cause}:${pp.attempt ? 'S1' : 'free'}:by:${pp.passer.i}`));
    pp.passer.log.passes++;
    if (pp.attempt) pp.passer.log.passesS1++;
    pp.passer.log.passCauses[pp.cause] = (pp.passer.log.passCauses[pp.cause] ?? 0) + 1;
  };
  const resolvePasses = (final: boolean) => {
    for (let i = pendingPasses.length - 1; i >= 0; i--) {
      const pp = pendingPasses[i];
      if (!final && tick - pp.tick < holdTicks) continue;
      if (pp.passer.s > pp.passed.s) recordPass(pp);
      pendingPasses.splice(i, 1);
    }
  };

  while (finishTick.some((t) => t === null)) {
    // 끝나지 않는 레이스 방지 (서버에서 멈추지 않게). 정상 레이스는 수십 초다
    if (++tick > ticksOf(600)) {
      // 멈춘 상황을 같이 남긴다 (QA가 시드와 상황을 보고할 수 있게)
      const stuck = cars
        .filter((c) => !c.finished)
        .map((c) => `차${c.i} ${segAt(course, c.s).id} v=${c.v.toFixed(2)} 차선 ${c.from}${c.from !== c.to ? `→${c.to}` : ''} 양보 ${c.yieldTo ?? '-'}`)
        .join('; ');
      throw new Error(`레이스가 600초 안에 끝나지 않음 (시드 ${seed}, 트랙 ${track.id}) ${stuck}`);
    }
    const t = tick * C.TICK_SECONDS;
    const before = cars.map((c) => c.s);

    if (!o.interaction) {
      // 2단계와 같은 단독 주행
      for (const c of cars) {
        if (c.finished) continue;
        for (let k = 0; k < C.SUBSTEPS; k++) {
          c.v = step(course, c.p, o.k, c.s, c.v);
          c.s += c.v * DT;
        }
      }
    } else {
      const act = active(); // (1) 직전 틱 (순위, 슬롯) 순서 (INT §8)
      if (qa.reverseOrder) act.reverse(); // QA 전용: 처리 순서 뒤집기 (순서 의존 확인)
      if (o.dirtyAir > 0 || o.boost > 0) computeChasing(act);

      // (2) 막힘 상한 (INT §4.2)
      const cap = new Map<Car, number>();
      for (const c of act) {
        // 변경 중(나가는 중)인 차가 원래 차선 앞차를 무시하는 것은 비교 스위치일 때만. 뒤차는 두 차선 모두에서 이 차에 막힌다 (R1-3)
        // OT-2: 옆 간격이 차 폭 이상 벌어지면(변경 진행 0.75 이상) 원래 차선 앞차 상한을 푼다
        const outward = changing(c) && c.dir === 1;
        const clear = Math.abs(laneCenter(c.to) - laneCenter(c.from)) * c.prog >= o.otReleaseWidth;
        const f = outward && (!o.capWhileChanging || (o.otRelease && clear)) ? frontOf(c, c.to) : frontOf(c);
        if (f && o.blockCap) cap.set(c, blockCap(f.v, gapTo(c, f)));
        // OT-7 우선권을 진 차: 이긴 차 뒤 최소 간격까지 물러난다 (제동 능력 안에서)
        if (c.yieldTo !== null) {
          const w = cars[c.yieldTo];
          // 끝: 이긴 차 뒤 최소 간격까지 물러남, 코너 끝, 또는 이긴 차가 진 차 뒤로 완전히 처짐(더 양보할 상대가 없음. 막힘과 엮여 멈추는 것 방지)
          if (w.finished || c.s >= c.yieldEnd || c.s <= w.s - C.CAR_LENGTH - C.GAP_MIN || w.s <= c.s - C.CAR_LENGTH) c.yieldTo = null;
          else {
            // 하한: 자기 코너 한계 × YIELD_MIN_RATIO (정점 전에는 가속하지 않으므로 0까지 줄이면 멈춘다, F7 · AG-P023 C)
            const yv = Math.max(c.yieldFloor, c.v - c.p.aBrk * C.TICK_SECONDS, w.v + (w.s - c.s - C.CAR_LENGTH - C.GAP_MIN) / C.BLOCK_TAU);
            cap.set(c, Math.min(cap.get(c) ?? Infinity, yv));
          }
        }
      }

      // (3) 차선 변경 진행 · 목표 창 점검 · 되돌림 (INT R1-3, R1-4, §4.1)
      for (const c of act) {
        if (!changing(c)) continue;
        if (c.dir === 1 && !c.ignoreWindow && windowBusy(c, c.to)) revert(c);
        const vLat = o.latSpeed * (c.passive === 'gap-hunter' && c.ps.state === 'active' ? C.GAP_HUNTER_LAT_MUL : 1);
        c.prog += (c.dir * vLat * C.TICK_SECONDS) / o.laneWidth;
        if (c.prog >= 1) c.from = c.to;
        if (c.prog <= 0) c.to = c.from;
        if (!changing(c)) {
          c.prog = 0;
          c.dir = 1;
          c.ignoreWindow = false;
        }
      }

      // (4) 추월: 성공 · 실패 판정과 시도 (INT §3.3, §4.3)
      const desired = new Map<Car, number>();
      for (const c of act) desired.set(c, step(course, effParams(c), o.k, c.s, c.v, false, { noAccel: t < c.react }));
      for (const c of act) {
        if (c.ot) {
          const f = cars[c.ot.front];
          const inTarget = !changing(c) && c.from === c.ot.target;
          if (!changing(c) && c.from === c.ot.orig) {
            // 창에 차가 들어와 되돌아왔다
            judge(JudgementKind.overtakeAbort, [c.i, f.i]);
            c.log.fails++;
            c.ot = null;
            c.cooldownUntil = tick + ticksOf(C.OVERTAKE_COOLDOWN);
          } else if (inTarget && c.s - f.s >= C.CAR_LENGTH && c.s < c.ot.segEnd) {
            judge(JudgementKind.overtakeS1, [c.i, f.i], 'S1');
            c.log.successes++;
            if (solverActive(c)) c.log.solver.successesActive++;
            else c.log.solver.successesInactive++;
            c.ot = null;
          } else if (c.s >= c.ot.segEnd) {
            // 구간 끝까지 성공 못 함 → 복귀, 안 되면 목표 차선에 머문다 (RB-1, INT Q-50)
            judge(JudgementKind.overtakeFail, [c.i, f.i]);
            c.log.fails++;
            const origClear = !windowBusy(c, c.ot.orig);
            if (changing(c)) {
              if (origClear) revert(c);
            } else if (!canStartChange(c)) c.pendingReturn = c.ot.orig;
            else if (origClear) startChange(c, c.ot.orig);
            c.pendingCooldown = true;
            c.ot = null;
          }
        }
        // OT-3: 코너에서 미룬 복귀는 직선에 들어서면 (창이 비었을 때만, 아니면 RB-1 머묾)
        if (c.pendingReturn !== null && !changing(c) && canStartChange(c)) {
          if (!windowBusy(c, c.pendingReturn)) startChange(c, c.pendingReturn);
          c.pendingReturn = null;
        }
        if (c.pendingCooldown && !changing(c) && c.pendingReturn === null) {
          c.pendingCooldown = false;
          c.cooldownUntil = tick + ticksOf(C.OVERTAKE_COOLDOWN);
        }
        if (tick % decTicks !== 0 || c.ot || changing(c) || tick < c.cooldownUntil || t < c.react) continue;
        const seg = segAt(course, c.s);
        const f = frontOf(c);
        if (!seg.passable || !f || !shareLane(c, f)) continue;
        const g = gapTo(c, f);
        const p = effParams(c);
        const want = o.desiredSpeed === 'target' ? Math.min(p.vTop, limitAt(course, p, o.k, c.s), envelopeAt(course, p, c.s)) : desired.get(c)!;
        if (g > o.tryGap || want - f.v < C.TRY_DV_MIN) continue;
        // 코너 설계자 반대급부: 발동 끝 4 s 안 직선에서 시도 안 함 (T-B 직선 미시도)
        if (c.passive === 'corner-architect' && t - c.ps.lastEnd <= C.ARCHITECT_NO_TRY_SECONDS && g <= C.ARCHITECT_NO_TRY_GAP) {
          passiveEvent(c, 'T-B-straight');
          continue;
        }
        let lanes = [c.from - 1, c.from + 1].filter((l) => l >= 0 && l < o.laneCount && !windowBusy(c, l));
        if (!lanes.length) continue;
        if (solverActive(c)) {
          // 침착한 해결사: 위험한 차선은 포기하고, 남으면 주변 차가 적은 차선 (디렉터 2026-11-02)
          c.log.solver.opportunities++;
          const risk = (l: number) => nearCount(c, C.SOLVER_RISK_RADIUS, laneCenter(l));
          const safe = lanes.filter((l) => risk(l) === 0);
          if (!safe.length) {
            c.log.solver.forfeits++;
            passiveEvent(c, 'T-C');
            continue;
          }
          lanes = safe.sort((a, b) => risk(a) - risk(b) || a - b);
        }
        // 틈새 사냥꾼 발동 중: 주사위 없이 한 번 이동 (INT §6.1 P-C)
        const freeMove = c.passive === 'gap-hunter' && c.ps.state === 'active' && !c.ps.usedMove;
        if (freeMove) c.ps.usedMove = true;
        else if (!(tryRng[c.i]() < pTry(entries[c.i].racer.stats))) continue;
        c.log.tries++;
        judge(JudgementKind.overtakeTry, [c.i, f.i], freeMove ? 'free' : null);
        let segEnd = o.otSpanCorner ? nextStraightEnd(c.s) : c.s - (c.s % L) + seg.end;
        if (o.otSpanCorner) for (let k = 1; k < o.otSpanStraights; k++) segEnd = nextStraightEnd(segEnd - 1e-6);
        c.ot = { front: f.i, segEnd, orig: c.from, target: lanes[0] };
        startChange(c, lanes[0]);
      }

      // 이동 (막힘 상한, 슬립스트림, 패시브 반영)
      const row: TraceRow[] = cars.map((c) => [c.v, c.from, c.to, c.prog, 0, 0, c.eps, c.inMistake ? 1 : 0]);
      for (const c of act) {
        const p = effParams(c);
        const capV = cap.get(c) ?? Infinity;
        if (capV < desired.get(c)! - 1e-9) {
          c.log.blockedTicks++;
          row[c.i][4] = 1;
        }
        if (slipOn(c)) row[c.i][5] = 1;
        c.log.racingTicks++;
        c.log.laneTicks[c.from]++;
        c.vPrev = c.v;
        for (let k = 0; k < C.SUBSTEPS; k++) {
          c.v = step(course, p, o.k, c.s, c.v, false, { cap: capV, noAccel: t < c.react });
          c.s += c.v * DT;
        }
        row[c.i][0] = c.v;
      }
      if (qa.trace) trace.push(row);

      // (5) 접촉 (INT §3.4, §4.4): 손실 → 위치 처리
      const fixPosition = (a: Car, b: Car) => (a.s <= b.s ? rearFix(a, b) : rearFix(b, a));
      for (let ai = 0; ai < act.length; ai++) {
        for (let bi = ai + 1; bi < act.length; bi++) {
          const a = act[ai];
          const b = act[bi];
          const key = Math.min(a.i, b.i) * 64 + Math.max(a.i, b.i);
          const st = contactPairs.get(key) ?? { on: false, offTicks: 0, sinceFix: 0, releasedAt: -Infinity };
          contactPairs.set(key, st);
          const touching = Math.abs(a.s - b.s) - C.CAR_LENGTH < 0 && Math.abs(y(a) - y(b)) < o.carWidth;
          if (touching && !st.on) {
            st.on = true;
            st.offTicks = 0;
            st.sinceFix = 0;
            const side = changing(a) || changing(b) || a.from !== b.from;
            // CT-4 접촉 종류와 원인 제공자 (항상 기록). 종류: lane = 하나라도 차선 변경 중, side = 다른 차선, rear = 같은 차선
            // 원인: 실수한 차 > 차선을 바꾸던 차 > 뒤에서 들이받은 차 > 레이싱 사고(none). 같은 기준에 둘 다 걸리면 both (가안)
            const kind = changing(a) || changing(b) ? 'lane' : a.from !== b.from ? 'side' : 'rear';
            const [rearCar, frontCar] = a.s <= b.s ? [a, b] : [b, a];
            const pick = (basis: string, xs: Car[]) => (xs.length ? { basis, who: xs } : null);
            const resp =
              pick('mistake', [a, b].filter((x) => x.inMistake)) ??
              pick('lane', [a, b].filter(changing)) ??
              (kind === 'rear' ? { basis: 'rear', who: [rearCar] } : { basis: 'none', who: [] as Car[] });
            const whoCode = resp.who.length === 2 ? 'both' : resp.who.length ? String(resp.who[0].i) : '-';
            events.push(makeEvent(tick, EventKind.contact, [a.i, b.i], where(Math.min(a.i, b.i)), null, `${kind}:${resp.basis}:${whoCode}`));
            for (const x of [a, b]) {
              if (resp.who.includes(x)) x.log.contactsCaused++;
              else x.log.contactsSuffered++;
            }
            a.log.contacts++;
            b.log.contacts++;
            a.lastContact = b.lastContact = tick;
            const lossOk = tick - st.releasedAt >= ticksOf(C.CONTACT_RELOSS_SECONDS);
            for (const c of [a, b]) if (side && c.passive === 'gap-hunter' && c.ps.state === 'active') passiveEvent(c, 'T-A');
            if (!o.ctContact) {
              if (lossOk) {
                a.v *= 1 - C.CONTACT_LOSS; // 두 차 모두, 여러 쌍이면 곱 (INT Q-51)
                b.v *= 1 - C.CONTACT_LOSS;
              }
              // 위치 처리: 차선을 바꾸던 차를 되돌린다(둘 다면 슬롯 번호가 큰 차). 아니면 뒤차를 뒤로 (INT R4-5)
              if (changing(a) && changing(b)) revert(a.i > b.i ? a : b);
              else if (changing(a)) revert(a);
              else if (changing(b)) revert(b);
              else fixPosition(a, b);
            } else if (kind === 'side') {
              // CT-3 옆 접촉: 두 차 3%, 위치 이동 없음, 각자 차선 중심으로
              if (lossOk) for (const x of [a, b]) x.v *= 1 - C.CT_LOSS_MINOR;
              a.eps = b.eps = 0;
            } else if (kind === 'lane') {
              // CT-3 차선 변경 중 접촉: 바꾸던 차 12%(둘 다면 둘 다), 다른 차 3%. 바꾸던 차는 되돌린다(지금 규칙)
              if (lossOk) for (const x of [a, b]) x.v *= 1 - (changing(x) ? C.CT_LOSS_MAJOR : C.CT_LOSS_MINOR);
              if (changing(a) && changing(b)) revert(a.i > b.i ? a : b);
              else revert(changing(a) ? a : b);
            } else {
              // CT-3 뒤 추돌: 뒤차 12%, 앞차 3%. 뒤차를 앞차 뒤로 (지금 규칙)
              if (lossOk) {
                rearCar.v *= 1 - C.CT_LOSS_MAJOR;
                frontCar.v *= 1 - C.CT_LOSS_MINOR;
              }
              fixPosition(a, b);
            }
          } else if (touching && st.on) {
            st.offTicks = 0;
            if (++st.sinceFix >= ticksOf(C.CONTACT_FORCE_SECONDS)) {
              st.sinceFix = 0;
              // 무한 지속 방지 (INT R4-6). CT-3 옆 접촉은 위치를 옮기지 않고 차선 중심으로
              if (o.ctContact && !changing(a) && !changing(b) && a.from !== b.from) a.eps = b.eps = 0;
              else fixPosition(a, b);
            }
          } else if (!touching && st.on && ++st.offTicks >= ticksOf(C.CONTACT_SEPARATE_SECONDS)) {
            st.on = false;
            st.releasedAt = tick;
            judge(JudgementKind.contactRelease, [a.i, b.i]);
          }
        }
      }

      // (6) 횡 입력 갱신 · 패시브 상태 (RACER §4)
      for (const c of act) {
        const stats = entries[c.i].racer.stats;
        if (tick % decTicks === 0) {
          const rng = epsRng[c.i];
          let mul = 1;
          let mistake = false;
          if (nearCount(c, C.PACK_RADIUS) >= C.PACK_COUNT && rng() >= pFocus(stats)) {
            mul *= C.MISTAKE_EPS_MUL; // 혼전 실수 (S-A 집중)
            c.log.mistakes++;
            c.lastMistake = tick;
            mistake = true;
          }
          if (solverActive(c)) mul *= C.SOLVER_EPS_MUL;
          const e = (2 * rng() - 1) * lateralErr(stats) * mul;
          // CT-1: 평소 흔들림은 차선 여유 안으로 자른다. 실수일 때만 넘는다
          c.eps = o.ctWobble && !mistake ? Math.max(-laneSlack, Math.min(laneSlack, e)) : e;
          c.inMistake = mistake;
        }
        if (c.passive) updatePassive(c, t);
      }

      // OT-6 부스트: 감지 지점을 지날 때 추격 상태면 그 구간 동안
      if (o.boost > 0)
        for (const c of act) {
          if (!crossed(before[c.i], c.s, boostDetect) || !chasing.has(c)) continue;
          const detectAt = c.s - ((c.s - boostDetect) % L);
          const zoneStart = detectAt + ((boostSeg.start - boostDetect + L) % L);
          c.boostFrom = zone ? zoneStart : -Infinity;
          c.boostUntil = zoneStart + boostLen;
          c.log.boosts++;
          judge(JudgementKind.boost, [c.i]);
        }

      // OT-7 코너 우선권: 나란히 선 두 차 중 하나가 코너 시작점에 닿을 때 정한다
      if (o.cornerPriority)
        for (const c of act)
          for (const sg of course.segs) {
            if (sg.kind !== 'corner' || !crossed(before[c.i], c.s, sg.start)) continue;
            const cornerStart = c.s - ((c.s - sg.start) % L);
            for (const d of act) {
              // 나란히 = 바로 옆 차선(차선 번호 차이 1)에서 앞뒤로 겹침. 0번과 2번 차선은 닿지 않으므로 제외 (가안)
              if (d === c || shareLane(c, d) || Math.abs(c.from - d.from) !== 1 || Math.abs(c.s - d.s) >= C.CAR_LENGTH || c.yieldTo === d.i || d.yieldTo === c.i) continue;
              const cAhead = c.s > d.s - C.CAR_LENGTH / 2; // 앞 범퍼가 상대 차 중심보다 앞
              const dAhead = d.s > c.s - C.CAR_LENGTH / 2;
              const inner = innerOf(sg);
              let winner: Car;
              let why: string;
              if (cAhead !== dAhead) {
                winner = cAhead ? c : d;
                why = 'front';
              } else {
                // 둘 다 상대 중심보다 앞(동률)이면 안쪽 차선 차, 그것도 같으면 슬롯 번호가 작은 차 (가안)
                const dist = (x: Car) => Math.abs(x.from - inner);
                winner = dist(c) !== dist(d) ? (dist(c) < dist(d) ? c : d) : c.i < d.i ? c : d;
                why = 'inner';
              }
              const loser = winner === c ? d : c;
              // 양보가 고리(A→B→C→A)를 만들면 모두 멈추므로 그 양보는 두지 않는다 (가안)
              let k: Car | null = winner;
              const seen = new Set<number>();
              let cycle = false;
              while (k && k.yieldTo !== null && !seen.has(k.i)) {
                if (k.yieldTo === loser.i) cycle = true;
                seen.add(k.i);
                k = cars[k.yieldTo];
              }
              if (cycle) continue;
              loser.yieldTo = winner.i;
              loser.yieldEnd = cornerStart + sg.length;
              loser.yieldFloor = o.yieldMinRatio * vCorner(loser.p, sg.bend);
              judge(JudgementKind.cornerPriority, [winner.i, loser.i], `winner:${winner.i}:${why}`);
            }
          }

      // OT-4 추월 기록: 이번 틱에 앞뒤가 바뀐 쌍 (둘 다 주행 중)
      for (let ai = 0; ai < act.length; ai++)
        for (let bi = ai + 1; bi < act.length; bi++) {
          const a = act[ai];
          const b = act[bi];
          const was = Math.sign(before[a.i] - before[b.i]);
          const now = Math.sign(a.s - b.s);
          if (!was || !now || was === now) continue;
          const back = pendingPasses.findIndex((pp) => (pp.passer === a && pp.passed === b) || (pp.passer === b && pp.passed === a));
          if (back >= 0) pendingPasses.splice(back, 1); // 1초 안에 되돌아감
          const passer = now > 0 ? a : b;
          const passed = passer === a ? b : a;
          if (back < 0)
            pendingPasses.push({ tick, passer, passed, cause: passCause(passer, passed), attempt: passer.ot?.front === passed.i, where: where(passer.i) });
        }
      resolvePasses(false);
    }

    for (const c of cars) {
      if (c.finished) continue;
      const lapsDone = Math.floor(Math.min(c.s, raceLength) / L);
      if (lapsDone > Math.floor(before[c.i] / L) && lapsDone < laps) {
        events.push(makeEvent(tick, EventKind.lap, [c.i], where(c.i), null, `lap:${lapsDone}`));
        if (lapsDone === laps - 1) events.push(makeEvent(tick, EventKind.lastLap, [c.i], where(c.i)));
      }
      if (c.s >= raceLength) {
        finishTick[c.i] = tick;
        c.finished = true;
      }
    }
    const nextOrder = order();
    events.push(...diffOrder(tick, prevOrder, nextOrder, where));
    nextOrder.forEach((car, i) => {
      if (finishTick[car] === tick) events.push(makeEvent(tick, EventKind.finish, [car], where(car), [i + 1, i + 1]));
    });
    prevOrder = nextOrder;
    frames.push(cars.map((c) => c.s));
    if (o.interaction) lateral.push(cars.map((c) => y(c)));
  }

  resolvePasses(true); // 끝날 때 남은 바뀜은 그때 앞서 있으면 기록

  // 슬립스트림 SS-1 조건: 같은 차선 앞차, 간격 ≤ g_ss, 직선 (INT §4.6)
  function slipOn(c: Car): boolean {
    const f = o.slipstream ? frontOf(c) : null;
    return !!f && segAt(course, c.s).bend === 0 && gapTo(c, f) <= C.SLIP_GAP;
  }

  // 슬립스트림 (INT §4.6 SS-1)과 코너 설계자 탈출 가속 (INT §6.1)을 반영한 이번 틱 능력치
  function effParams(c: Car): CarParams {
    let { vTop, A, vg } = c.p;
    const slip = slipOn(c);
    if (slip) {
      if (!zone) vTop *= 1 + o.slipRatio;
      A *= 1 + o.slipRatio;
    }
    if (c.passive === 'corner-architect' && c.ps.state === 'active') A *= c.ps.aMul;
    // OT-5 더티 에어: 추격 상태면 접지 한계(코너 한계와 그 앞 제동 기준)를 x% 낮춘다
    if (o.dirtyAir > 0 && chasing.has(c)) vg *= 1 - o.dirtyAir / 100;
    // CT-2 라인 정확도: 횡 오차만큼 코너 한계(와 그 앞 제동 기준)를 낮춘다. ε_max = e0(제어 0일 때 범위), 비율은 1에서 자름
    if (o.ctLine > 0) vg *= 1 - o.ctLine * Math.min(1, Math.abs(c.eps) / C.LAT_ERR_E0);
    // OT-6 부스트 중 최고속도 +y%. 구간 모드는 슬립스트림과 겹치면 최고속도 보너스는 큰 값만 (Q-80 가안)
    const boosting = c.s >= c.boostFrom && c.s < c.boostUntil;
    if (zone) vTop *= 1 + Math.max(slip ? o.slipRatio : 0, boosting ? o.boost / 100 : 0);
    else if (boosting) vTop *= 1 + o.boost / 100;
    return vTop === c.p.vTop && A === c.p.A && vg === c.p.vg ? c.p : { ...c.p, vTop, A, vg };
  }

  function passiveCondition(c: Car): boolean {
    const seg = segAt(course, c.s);
    if (c.passive === 'gap-hunter') {
      const f = frontOf(c);
      if (seg.bend >= C.GAP_HUNTER_BEND || !f || changing(c) || gapTo(c, f) > C.GAP_HUNTER_GAP) return false;
      return [c.from - 1, c.from + 1].some(
        (l) => l >= 0 && l < o.laneCount && !cars.some((d) => d !== c && !d.finished && occupies(d, l) && Math.abs(d.s - c.s) <= C.GAP_HUNTER_SIDE),
      );
    }
    if (c.passive === 'corner-architect') {
      return seg.kind === 'straight' && seg.next?.kind === 'corner' && seg.next.bend >= C.ARCHITECT_BEND && seg.end - (c.s % L) <= C.ARCHITECT_LEAD;
    }
    // calm-solver: 혼전 또는 마지막 랩
    return nearCount(c, C.PACK_RADIUS) >= C.PACK_COUNT || Math.floor(c.s / L) >= laps - 1;
  }

  function updatePassive(c: Car, t: number): void {
    const ps = c.ps;
    if (ps.state === 'active' && tick >= ps.until) {
      ps.state = 'cooldown';
      ps.until = tick + ticksOf(C.PASSIVE_COOLDOWN);
      ps.lastEnd = t;
    }
    if (ps.state === 'cooldown' && tick >= ps.until) ps.state = 'idle';
    const cond = passiveCondition(c);
    if (cond && !ps.prevCond) {
      if (ps.state === 'idle' && t < C.PASSIVE_GRACE) judge(JudgementKind.passiveGrace, [c.i], c.passive);
      if (ps.state === 'cooldown') judge(JudgementKind.passiveCooldownHit, [c.i], c.passive);
    }
    ps.prevCond = cond;
    if (cond && ps.state === 'idle' && t >= C.PASSIVE_GRACE) {
      ps.state = 'active';
      ps.until = tick + ticksOf(C.PASSIVE_DURATION);
      ps.usedMove = false;
      c.log.passiveActivations++;
      passiveEvent(c, `activate:${c.passive}`);
      if (c.passive === 'corner-architect') {
        // apex 선점: 다음 코너 안쪽 차선으로 (코너 방향 데이터가 없어 기본 0번, 가안). 안쪽이 막혀 있으면 효과 반감
        const inner = innerOf(segAt(course, c.s).next);
        const blocked = c.from !== inner && cars.some((d) => d !== c && !d.finished && occupies(d, inner) && d.s >= c.s && d.s <= c.s + C.WINDOW_FRONT);
        ps.aMul = 1 + (C.ARCHITECT_A_MUL - 1) * (blocked ? C.ARCHITECT_BLOCKED_SCALE : 1);
        if (blocked) passiveEvent(c, 'T-B-inner');
      }
    }
    // 코너 설계자 발동 중: 안쪽 차선으로 한 칸씩, 창 검사 없이 (겹치면 접촉 규칙)
    if (c.passive === 'corner-architect' && ps.state === 'active' && !changing(c) && !c.ot && canStartChange(c)) {
      const cur = segAt(course, c.s);
      const inner = innerOf(cur.kind === 'corner' ? cur : cur.next);
      if (c.from !== inner) startChange(c, c.from + Math.sign(inner - c.from), true);
    }
  }

  return {
    header: {
      seed,
      inputHash: fnv1a(JSON.stringify(input)),
      trackId: track.id,
      tickSeconds: C.TICK_SECONDS,
      exitLimitRelax: o.k,
      options: o,
    },
    grid,
    ticks: tick,
    seconds: tick * C.TICK_SECONDS,
    frames,
    lateral,
    ...(qa.trace ? { trace } : {}),
    events: sortEvents(events),
    judgements: sortEvents(judgements),
    carStats: cars.map((c) => c.log),
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
  if (total !== C.CAR_TOTAL) throw new Error(`차량 ${id}: 능력치 합계 ${total} ≠ ${C.CAR_TOTAL}`);
}

// base: 코너 검사에 쓰는 기준 차 (실험 스위치를 켜면 그 값으로 검사)
export function validate(input: RaceInput, k = C.EXIT_LIMIT_RELAX, count: number = C.ENTRY_COUNT, base?: CarParams): void {
  if (!isInt(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('seed는 0 이상 2^32-1 이하 정수');
  if (!isInt(input.laps) || input.laps < 1) throw new Error('laps는 1 이상 정수 (RACE_UNIT_LENGTH_CAMERA_P0_DRAFT.md:94-95)');
  if (!(k >= 0 && k <= 1)) throw new Error('정점 뒤 한계 풀림 계수 k는 0 이상 1 이하');
  if (input.entries?.length !== count) throw new Error(`참가 대수는 ${count}대`);
  // 레이서 F1 총합 검증 (RACER_STATS_PASSIVES_DRAFT.md:136-150)
  for (const { racer, car } of input.entries) {
    const values = [racer.stats.overtake, racer.stats.control, racer.stats.focus];
    if (values.some((v) => !isInt(v) || v < 0 || v > C.RACER_STAT_MAX)) {
      throw new Error(`레이서 ${racer.id}: 능력치는 0~${C.RACER_STAT_MAX} 정수`);
    }
    const total = values.reduce((a, b) => a + b, 0);
    if (total !== C.RACER_STAT_TOTAL) throw new Error(`레이서 ${racer.id}: 능력치 총합 ${total} ≠ ${C.RACER_STAT_TOTAL}`);
    if (racer.passiveId !== null && !isPassive(racer.passiveId)) throw new Error(`레이서 ${racer.id}: 알 수 없는 패시브 ${racer.passiveId}`);
    // 차량 F1 범위 (CAR §7 F1)
    const cs = car.stats;
    if ([cs.topSpeed, cs.accel, cs.grip, cs.brake].some((v) => !isInt(v) || v < 0 || v > C.CAR_STAT_MAX)) {
      throw new Error(`차량 ${car.id}: 능력치는 0~${C.CAR_STAT_MAX} 정수`);
    }
  }
  // 트랙 형식과 코너 검사 (CAR §4.1, §4.3)
  const { errors } = checkTrack(input.track, k, base);
  if (errors.length) throw new Error(`트랙 ${input.track?.id} 거부: ${errors.join('; ')}`);
}
