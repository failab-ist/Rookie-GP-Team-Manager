// 10대 레이스 시뮬레이터. 화면 · 렌더러 · 벽시계 · Math.random 없음 (TECH_STACK.md:27-32).
// INT = design_ssot/drafts/RACE_INTERACTION_P0_DRAFT.md (차선, 막힘, 추월, 접촉, 출발, 슬립스트림, 능력치 · 패시브 연결)
import * as C from './config.ts';
import { diffOrder, makeEvent, sortEvents } from './events.ts';
import { buildCourse, carParams, DT, segAt, step, type CarParams } from './physics.ts';
import { isPassive, lateralErr, pFocus, pTry, type PassiveId } from './racer.ts';
import { createRng, shuffle, subStream, type Rng } from './rng.ts';
import { checkTrack } from './trackCheck.ts';
import {
  EventKind,
  JudgementKind,
  type CarStats,
  type CarStatsLog,
  type Judgement,
  type RaceEvent,
  type RaceInput,
  type RaceOptions,
  type RaceResult,
} from './types.ts';

export const DEFAULT_OPTIONS: RaceOptions = {
  k: C.EXIT_LIMIT_RELAX,
  interaction: true,
  reaction: C.DEFAULT_REACTION,
  slipstream: C.DEFAULT_SLIPSTREAM,
  accelFormula: C.ACCEL_FORMULA,
};

// 막힘 상한 v_cap (INT §4.2). gap = 같은 차선 앞뒤 간격 g
export const blockCap = (vFront: number, gap: number) => vFront + Math.max(0, gap - C.GAP_MIN) / C.BLOCK_TAU;

// 앞뒤 접촉 위치 처리 (INT R4-5): 뒤차를 앞차 − L_car − g_min으로, 속도는 앞차 이하로
export function rearFix(rear: { s: number; v: number }, front: { s: number; v: number }): void {
  rear.s = front.s - C.CAR_LENGTH - C.GAP_MIN;
  rear.v = Math.min(rear.v, front.v);
}

const ticksOf = (seconds: number) => Math.round(seconds / C.TICK_SECONDS);
const laneCenter = (lane: number) => C.LANE_WIDTH / 2 + C.LANE_WIDTH * lane; // INT R1-6 (2, 6, 10 u)

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
};

// opts: 비교 실험용. 빠진 값은 DEFAULT_OPTIONS
export function simulate(input: RaceInput, opts: Partial<RaceOptions> = {}): RaceResult {
  const o: RaceOptions = { ...DEFAULT_OPTIONS, ...opts };
  validate(input, o.k);
  const { seed, track, laps, entries } = input;
  const course = buildCourse(track.segments, true);
  const L = course.length;
  const raceLength = L * laps;
  const n = entries.length;
  const idx = entries.map((_, i) => i);

  // 출발 순서는 시드 무작위 (AG-P011 C). 단독 주행 모드는 2단계와 같이 모두 0에서 출발
  const grid = o.interaction ? shuffle(subStream(seed, 0, 'grid'), idx) : shuffle(createRng(seed), idx);
  const slotOf = new Map(grid.map((car, slot) => [car, slot]));

  const cars: Car[] = entries.map((e, i) => ({
    i,
    p: carParams(e.car.stats, o.accelFormula),
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
    },
  }));
  if (o.interaction) {
    // 2열 엇갈림 그리드 (INT §4.5). 출발 순서 0번이 맨 앞 줄 B열
    grid.forEach((car, pos) => {
      const row = n / 2 - 1 - Math.floor(pos / 2);
      const colB = pos % 2 === 0;
      cars[car].s = C.GRID_ROW_GAP * row + (colB ? C.GRID_STAGGER : 0);
      cars[car].from = cars[car].to = colB ? C.GRID_LANES[1] : C.GRID_LANES[0];
    });
  }
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

  while (finishTick.some((t) => t === null)) {
    // 끝나지 않는 레이스 방지 (서버에서 멈추지 않게). 정상 레이스는 수십 초다
    if (++tick > ticksOf(600)) throw new Error(`레이스가 600초 안에 끝나지 않음 (시드 ${seed}, 트랙 ${track.id})`);
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

      // (2) 막힘 상한 (INT §4.2)
      const cap = new Map<Car, number>();
      for (const c of act) {
        const f = frontOf(c);
        if (f) cap.set(c, blockCap(f.v, gapTo(c, f)));
      }

      // (3) 차선 변경 진행 · 목표 창 점검 · 되돌림 (INT R1-3, R1-4, §4.1)
      for (const c of act) {
        if (!changing(c)) continue;
        if (c.dir === 1 && !c.ignoreWindow && windowBusy(c, c.to)) revert(c);
        const vLat = C.LAT_SPEED * (c.passive === 'gap-hunter' && c.ps.state === 'active' ? C.GAP_HUNTER_LAT_MUL : 1);
        c.prog += (c.dir * vLat * C.TICK_SECONDS) / C.LANE_WIDTH;
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
            events.push(makeEvent(tick, EventKind.overtake, [c.i, f.i], where(c.i), null, 'S1'));
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
            } else if (origClear) startChange(c, c.ot.orig);
            c.pendingCooldown = true;
            c.ot = null;
          }
        }
        if (c.pendingCooldown && !changing(c)) {
          c.pendingCooldown = false;
          c.cooldownUntil = tick + ticksOf(C.OVERTAKE_COOLDOWN);
        }
        if (tick % decTicks !== 0 || c.ot || changing(c) || tick < c.cooldownUntil || t < c.react) continue;
        const seg = segAt(course, c.s);
        const f = frontOf(c);
        if (!seg.passable || !f || !shareLane(c, f)) continue;
        const g = gapTo(c, f);
        if (g > C.TRY_GAP || desired.get(c)! - f.v < C.TRY_DV_MIN) continue;
        // 코너 설계자 반대급부: 발동 끝 4 s 안 직선에서 시도 안 함 (T-B 직선 미시도)
        if (c.passive === 'corner-architect' && t - c.ps.lastEnd <= C.ARCHITECT_NO_TRY_SECONDS && g <= C.ARCHITECT_NO_TRY_GAP) {
          passiveEvent(c, 'T-B-straight');
          continue;
        }
        let lanes = [c.from - 1, c.from + 1].filter((l) => l >= 0 && l < C.LANE_COUNT && !windowBusy(c, l));
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
        c.ot = { front: f.i, segEnd: c.s - (c.s % L) + seg.end, orig: c.from, target: lanes[0] };
        startChange(c, lanes[0]);
      }

      // 이동 (막힘 상한, 슬립스트림, 패시브 반영)
      for (const c of act) {
        const p = effParams(c);
        const capV = cap.get(c) ?? Infinity;
        if (capV < desired.get(c)! - 1e-9) c.log.blockedTicks++;
        c.log.racingTicks++;
        c.log.laneTicks[c.from]++;
        for (let k = 0; k < C.SUBSTEPS; k++) {
          c.v = step(course, p, o.k, c.s, c.v, false, { cap: capV, noAccel: t < c.react });
          c.s += c.v * DT;
        }
      }

      // (5) 접촉 (INT §3.4, §4.4): 손실 → 위치 처리
      const fixPosition = (a: Car, b: Car) => (a.s <= b.s ? rearFix(a, b) : rearFix(b, a));
      for (let ai = 0; ai < act.length; ai++) {
        for (let bi = ai + 1; bi < act.length; bi++) {
          const a = act[ai];
          const b = act[bi];
          const key = Math.min(a.i, b.i) * 64 + Math.max(a.i, b.i);
          const st = contactPairs.get(key) ?? { on: false, offTicks: 0, sinceFix: 0, releasedAt: -Infinity };
          contactPairs.set(key, st);
          const touching = Math.abs(a.s - b.s) - C.CAR_LENGTH < 0 && Math.abs(y(a) - y(b)) < C.CAR_WIDTH;
          if (touching && !st.on) {
            st.on = true;
            st.offTicks = 0;
            st.sinceFix = 0;
            const side = changing(a) || changing(b) || a.from !== b.from;
            events.push(makeEvent(tick, EventKind.contact, [a.i, b.i], where(Math.min(a.i, b.i)), null, side ? 'side' : 'rear'));
            a.log.contacts++;
            b.log.contacts++;
            if (tick - st.releasedAt >= ticksOf(C.CONTACT_RELOSS_SECONDS)) {
              a.v *= 1 - C.CONTACT_LOSS; // 두 차 모두, 여러 쌍이면 곱 (INT Q-51)
              b.v *= 1 - C.CONTACT_LOSS;
            }
            for (const c of [a, b]) if (side && c.passive === 'gap-hunter' && c.ps.state === 'active') passiveEvent(c, 'T-A');
            // 위치 처리: 차선을 바꾸던 차를 되돌린다(둘 다면 슬롯 번호가 큰 차). 아니면 뒤차를 뒤로 (INT R4-5)
            if (changing(a) && changing(b)) revert(a.i > b.i ? a : b);
            else if (changing(a)) revert(a);
            else if (changing(b)) revert(b);
            else fixPosition(a, b);
          } else if (touching && st.on) {
            st.offTicks = 0;
            if (++st.sinceFix >= ticksOf(C.CONTACT_FORCE_SECONDS)) {
              st.sinceFix = 0;
              fixPosition(a, b); // 무한 지속 방지 (INT R4-6)
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
          if (nearCount(c, C.PACK_RADIUS) >= C.PACK_COUNT && rng() >= pFocus(stats)) {
            mul *= C.MISTAKE_EPS_MUL; // 혼전 실수 (S-A 집중)
            c.log.mistakes++;
          }
          if (solverActive(c)) mul *= C.SOLVER_EPS_MUL;
          c.eps = (2 * rng() - 1) * lateralErr(stats) * mul;
        }
        if (c.passive) updatePassive(c, t);
      }
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

  // 슬립스트림 (INT §4.6 SS-1)과 코너 설계자 탈출 가속 (INT §6.1)을 반영한 이번 틱 능력치
  function effParams(c: Car): CarParams {
    let { vTop, A } = c.p;
    const f = o.slipstream ? frontOf(c) : null;
    if (f && segAt(course, c.s).bend === 0 && gapTo(c, f) <= C.SLIP_GAP) {
      vTop *= 1 + C.SLIP_RATIO;
      A *= 1 + C.SLIP_RATIO;
    }
    if (c.passive === 'corner-architect' && c.ps.state === 'active') A *= c.ps.aMul;
    return vTop === c.p.vTop && A === c.p.A ? c.p : { ...c.p, vTop, A };
  }

  function passiveCondition(c: Car): boolean {
    const seg = segAt(course, c.s);
    if (c.passive === 'gap-hunter') {
      const f = frontOf(c);
      if (seg.bend >= C.GAP_HUNTER_BEND || !f || changing(c) || gapTo(c, f) > C.GAP_HUNTER_GAP) return false;
      return [c.from - 1, c.from + 1].some(
        (l) => l >= 0 && l < C.LANE_COUNT && !cars.some((d) => d !== c && !d.finished && occupies(d, l) && Math.abs(d.s - c.s) <= C.GAP_HUNTER_SIDE),
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
        const inner = segAt(course, c.s).next?.innerLane ?? C.DEFAULT_INNER_LANE;
        const blocked = c.from !== inner && cars.some((d) => d !== c && !d.finished && occupies(d, inner) && d.s >= c.s && d.s <= c.s + C.WINDOW_FRONT);
        ps.aMul = 1 + (C.ARCHITECT_A_MUL - 1) * (blocked ? C.ARCHITECT_BLOCKED_SCALE : 1);
        if (blocked) passiveEvent(c, 'T-B-inner');
      }
    }
    // 코너 설계자 발동 중: 안쪽 차선으로 한 칸씩, 창 검사 없이 (겹치면 접촉 규칙)
    if (c.passive === 'corner-architect' && ps.state === 'active' && !changing(c) && !c.ot) {
      const cur = segAt(course, c.s);
      const inner = (cur.kind === 'corner' ? cur.innerLane : cur.next?.innerLane) ?? C.DEFAULT_INNER_LANE;
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

export function validate(input: RaceInput, k = C.EXIT_LIMIT_RELAX): void {
  if (!isInt(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('seed는 0 이상 2^32-1 이하 정수');
  if (!isInt(input.laps) || input.laps < 1) throw new Error('laps는 1 이상 정수 (RACE_UNIT_LENGTH_CAMERA_P0_DRAFT.md:94-95)');
  if (!(k >= 0 && k <= 1)) throw new Error('정점 뒤 한계 풀림 계수 k는 0 이상 1 이하');
  if (input.entries?.length !== C.ENTRY_COUNT) throw new Error(`참가 대수는 ${C.ENTRY_COUNT}대`);
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
  const { errors } = checkTrack(input.track, k);
  if (errors.length) throw new Error(`트랙 ${input.track?.id} 거부: ${errors.join('; ')}`);
}
