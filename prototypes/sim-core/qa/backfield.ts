// 뒤에서 출발한 차가 못 올라오는 이유 진단 (측정만, 기본값 그대로. 지시서 2026-11-02).
// 참가 10대(기준 차 + F-2 9대, 레이서 NPC)를 그대로 두고 출발 순서만 10가지로 순환한다(qa.grid, gridside.ts와 같은 설계).
// node qa/backfield.ts stage1 <adjust|confirm>          1단계: 단독 랩타임 차, 붙어 있던 시간 · 시도 · 성공, 실패 원인, 1·2위 간격
// node qa/backfield.ts stage2 <base|laps5|nocap|span2> <adjust|confirm>   2단계: 스위치 하나씩
// node qa/backfield.ts stage3 <da0|da15|da3|b5|b8|b12|combo> <adjust|confirm> · dirtysolo · report3 <json...>   3단계: 더티 에어 · 부스트 크기
import { CAR_LENGTH, EXIT_LIMIT_RELAX, GRID_ROW_GAP, GRID_STAGGER, MOTIF_ALL, QA_ADJUST_SEEDS, QA_CONFIRM_SEEDS, TICK_SECONDS } from '../src/config.ts';
import { at, buildCourse, carParams, runSolo } from '../src/physics.ts';
import type { CarStats, RaceOptions, Track } from '../src/types.ts';
import { readFileSync } from 'node:fs';
import { BASE, CARS as CAR_DATA, f, load, mean, measureLap, opponents, out, printStuck, registerTrack, STUCK, table, testCar, tryRace } from './lib.ts';

const N = 10;
const LB: Track[] = ['M1', 'M2', 'M3'].map((m) => load(`../data/tracks/motif/${m}-LB.json`));
LB.forEach(registerTrack);
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...MOTIF_ALL };
const [part, a1, a2] = process.argv.slice(2);
const set = (part === 'stage2' || part === 'stage3' ? a2 : a1) ?? 'adjust';
const seeds = set === 'confirm' ? QA_CONFIRM_SEEDS : QA_ADJUST_SEEDS;
const SET_KO = set === 'confirm' ? '확인용' : '조정용';
const rotate = (k: number) => Array.from({ length: N }, (_, slot) => (slot - k + N) % N);
const CARS: CarStats[] = [BASE, ...opponents().map((e) => e.car.stats)];
const CHASE = 1.0; // 앞차 1초 안 (OT-5 추격 상태와 같은 기준 CHASE_SECONDS)

// 레이스 안 순위 상관 (스피어만, 동률 없음)
const spearman = (grid: number[], order: number[]) => 1 - (6 * grid.reduce((s, carI, slot) => s + (slot - order.indexOf(carI)) ** 2, 0)) / (N * (N * N - 1));
// 틱 t에 위치 x를 지난 시각 (선형 보간)
const crossTime = (frames: number[][], i: number, x: number) => {
  const k = frames.findIndex((p) => p[i] >= x);
  if (k <= 0) return k === 0 ? 0 : NaN;
  const a = frames[k - 1][i];
  return (k - 1 + (x - a) / (frames[k][i] - a)) * TICK_SECONDS;
};

// 레이스 하나의 2~4 집계 (1단계 · 3단계 공용)
const newAcc = () => ({
  bySlot: Array.from({ length: N }, () => ({ chase: [] as number[], tries: [] as number[], succ: [] as number[] })),
  outcome: { S1: 0, segEnd: 0, abort: 0, open: 0 } as Record<string, number>,
  failFlags: { cap: 0, capShare: [] as number[], yield: 0, contact: 0, none: 0, n: 0 },
  gapLap: [[], [], [], []] as number[][],
  gap23: [[], [], [], []] as number[][],
});
function analyze(r: NonNullable<ReturnType<typeof tryRace>>, t: Track, grid: number[], { bySlot, outcome, failFlags, gapLap, gap23 }: ReturnType<typeof newAcc>) {
  const fr = r.frames;
  const tr = r.trace!;
  const L = t.segments.reduce((s, x) => s + x.length, 0);
  // 2. 앞차(차선 무관) 1초 안에 붙어 있던 시간
  const chase = new Array(N).fill(0);
  for (let tk = 1; tk < fr.length; tk++) {
    const p = fr[tk];
    for (let i = 0; i < N; i++) {
      if (p[i] >= 3 * L) continue;
      const v = (p[i] - fr[tk - 1][i]) / TICK_SECONDS;
      let ahead = Infinity;
      for (let j = 0; j < N; j++) if (j !== i && p[j] > p[i] && p[j] < ahead) ahead = p[j];
      if (ahead !== Infinity && (ahead - p[i]) / Math.max(v, 1) <= CHASE) chase[i] += TICK_SECONDS;
    }
  }
  grid.forEach((carI, slot) => {
    bySlot[slot].chase.push(chase[carI]);
    bySlot[slot].tries.push(r.carStats[carI].tries);
    bySlot[slot].succ.push(r.carStats[carI].successes);
  });
  // 3. 시도 결과와 실패 원인: 시도(종류 1)마다 같은 두 차의 다음 결과(7 성공, 2 구간 끝, 3 창 점유 되돌림)
  const tries = r.judgements.filter((j) => j.kind === 1);
  for (const tj of tries) {
    const [x, y] = tj.cars;
    const trier = fr[tj.tick][x] < fr[tj.tick][y] ? x : y;
    const res = r.judgements.find((j) => j.tick >= tj.tick && j !== tj && (j.kind === 7 || j.kind === 2 || j.kind === 3) && j.cars[0] === x && j.cars[1] === y);
    if (!res) {
      outcome.open++;
      continue;
    }
    outcome[res.kind === 7 ? 'S1' : res.kind === 2 ? 'segEnd' : 'abort']++;
    if (res.kind === 7) continue;
    failFlags.n++;
    let capped = 0;
    for (let tk = tj.tick; tk < res.tick && tk < tr.length; tk++) if (tr[tk][trier][4]) capped++;
    const span = Math.max(1, res.tick - tj.tick);
    const yielded = r.judgements.some((j) => j.kind === 8 && j.tick >= tj.tick && j.tick <= res.tick && j.cars.includes(trier) && !j.cause!.startsWith(`winner:${trier}:`));
    const contact = r.events.some((e) => e.kind === 4 && e.tick >= tj.tick && e.tick <= res.tick && e.cars.includes(trier));
    if (capped) failFlags.cap++;
    failFlags.capShare.push(capped / span);
    if (yielded) failFlags.yield++;
    if (contact) failFlags.contact++;
    if (!capped && !yielded && !contact) failFlags.none++;
  }
  // 4. 랩 경계(누적 거리 L, 2L, 3L)를 1위 · 2위 · 3위로 지난 차의 시간 간격 (0 = 출발 직후 첫 기록 위치 36 u)
  for (let lap = 0; lap <= 3; lap++) {
    const x = lap === 0 ? 40 : lap * L;
    const ts = Array.from({ length: N }, (_, i) => crossTime(fr, i, x)).sort((p, q) => p - q);
    gapLap[lap].push(ts[1] - ts[0]);
    gap23[lap].push(ts[2] - ts[1]);
  }
}

if (part === 'stage1') {
  out(`# 뒤 출발 차 진단 1단계 (MOTIF_ALL, L-B 3트랙, ${SET_KO} 시드 ${seeds[0]}~${seeds.at(-1)}, 출발 순서 순환 10가지)`);
  out();
  // 1. 단독 랩타임 차
  out('## 1. 참가 10대 단독 랩타임 (기준 차 + F-2 9대, k 0.2)');
  out();
  out('1랩 = 단독 2랩째, 3랩 = 정지 출발 단독 3랩. 그리드 간격: 줄 간격 8 u, 같은 줄 엇갈림 4 u, 맨 앞 자리(36 u)와 맨 뒤 자리(0 u) 차 36 u.');
  out();
  const soloRows = LB.map((t) => {
    const c = buildCourse(t.segments, true);
    const laps = CARS.map((cs) => measureLap(t, carParams(cs), EXIT_LIMIT_RELAX).lapTime);
    const three = CARS.map((cs) => at(runSolo(c, carParams(cs), EXIT_LIMIT_RELAX, { x0: 0, v0: 0, xEnd: 3 * c.length + 1 }), 3 * c.length, 't'));
    const vAvg = c.length / mean(laps);
    return { t, laps, three, vAvg };
  });
  out(
    table(
      ['트랙', '1랩 가장 빠름 / 느림 (s)', '1랩 차', '3랩 차', '평균 속도 (u/s)', '그리드 36 u의 시간 (평균 속도 / V_top 125)', '자리 하나(4 u)의 시간'],
      soloRows.map(({ t, laps, three, vAvg }) => [
        t.id,
        `${f(Math.min(...laps), 3)} / ${f(Math.max(...laps), 3)}`,
        f(Math.max(...laps) - Math.min(...laps), 3),
        f(Math.max(...three) - Math.min(...three), 3),
        f(vAvg, 1),
        `${f(36 / vAvg, 3)} / ${f(36 / 125, 3)}`,
        f(GRID_STAGGER / vAvg, 3),
      ]),
    ),
  );
  out();
  out(
    table(
      ['차', ...LB.map((t) => `${t.id} 1랩 (s)`), '3트랙 3랩 합 (s)'],
      CARS.map((cs, i) => [
        `${i === 0 ? '기준 차' : `O${i}`} ${cs.topSpeed}/${cs.accel}/${cs.grip}/${cs.brake}`,
        ...soloRows.map((r) => f(r.laps[i], 3)),
        f(soloRows.reduce((s, r) => s + r.three[i], 0), 3),
      ]),
    ),
  );
  out();

  // 2~4. 레이스
  const acc = newAcc();
  for (let k = 0; k < N; k++)
    for (const t of LB)
      for (const seed of seeds) {
        const grid = rotate(k);
        const r = tryRace(t, seed, testCar(BASE), FINAL, { grid, trace: true });
        if (r) analyze(r, t, grid, acc);
      }
  const { bySlot, outcome, failFlags, gapLap, gap23 } = acc;
  out('## 2. 출발 자리별: 앞차(차선 무관) 1초 안에 붙어 있던 시간, 정식 시도, 성공 (레이스당 차 1대)');
  out();
  out(table(['출발 자리', '붙어 있던 시간 (s)', '정식 시도', 'S1 성공', '성공률'], bySlot.map((b, s) => [s + 1, f(mean(b.chase), 2), f(mean(b.tries), 2), f(mean(b.succ), 3), `${f((mean(b.succ) / Math.max(1e-9, mean(b.tries))) * 100, 1)}%`])));
  out();
  const tot = Object.values(outcome).reduce((s, v) => s + v, 0);
  out('## 3. 정식 시도 결과와 실패 원인');
  out();
  out(`시도 ${tot}회. 결과: S1 성공 ${f((outcome.S1 / tot) * 100, 1)}%, 시도 구간 끝(segEnd) 도달 ${f((outcome.segEnd / tot) * 100, 1)}%, 옆 차선 점유로 되돌림(windowBusy) ${f((outcome.abort / tot) * 100, 1)}%, 레이스 끝까지 결과 없음 ${f((outcome.open / tot) * 100, 1)}%.`);
  out();
  out('실패(구간 끝 + 되돌림)한 시도에서 시도 중 있었던 일 (겹칠 수 있음):');
  out();
  out(
    table(
      ['막힘 상한이 걸린 틱이 있음', '시도 시간 중 막힘 상한 비율 (평균)', 'OT-7 양보', '접촉', '셋 다 없음'],
      [[`${f((failFlags.cap / failFlags.n) * 100, 1)}%`, `${f(mean(failFlags.capShare) * 100, 1)}%`, `${f((failFlags.yield / failFlags.n) * 100, 1)}%`, `${f((failFlags.contact / failFlags.n) * 100, 1)}%`, `${f((failFlags.none / failFlags.n) * 100, 1)}%`]],
    ),
  );
  out();
  out('## 4. 1위와 2위 (그리고 2위와 3위)의 간격, 랩 경계를 지난 시간 차 (s)');
  out();
  out(
    table(
      ['지점', '1위 − 2위 평균', '중앙값', '2위 − 3위 평균'],
      gapLap.map((g, lap) => {
        const sorted = [...g].sort((p, q) => p - q);
        return [lap === 0 ? '출발 직후 (40 u)' : `${lap}랩 끝`, f(mean(g), 3), f(sorted[Math.floor(sorted.length / 2)], 3), f(mean(gap23[lap]), 3)];
      }),
    ),
  );
  out(`<!-- 차 길이 ${CAR_LENGTH} u, 줄 간격 ${GRID_ROW_GAP} u -->`);
  printStuck();
}

if (part === 'stage2') {
  const key = a1 ?? 'base';
  const VAR: Record<string, { name: string; opts: Partial<RaceOptions>; laps: number }> = {
    base: { name: '기준 (MOTIF_ALL, 3랩)', opts: FINAL, laps: 3 },
    laps5: { name: '(가) 랩 수 5', opts: FINAL, laps: 5 },
    nocap: { name: '(나) 막힘 상한 끔', opts: { ...FINAL, blockCap: false }, laps: 3 },
    span2: { name: '(다) 시도 구간을 그다음 직선 끝까지', opts: { ...FINAL, otSpanStraights: 2 }, laps: 3 },
  };
  const v = VAR[key];
  const finals: number[][] = Array.from({ length: N }, () => []); // 자리별 최종 순위
  const rho: number[] = [];
  let passes = 0;
  let s1 = 0;
  let contacts = 0;
  let races = 0;
  for (let k = 0; k < N; k++)
    for (const t of LB)
      for (const seed of seeds) {
        const grid = rotate(k);
        const r = tryRace(t, seed, testCar(BASE), v.opts, { grid }, v.laps);
        if (!r) continue;
        races++;
        grid.forEach((carI, slot) => finals[slot].push(r.finishOrder.indexOf(carI) + 1));
        rho.push(spearman(grid, r.finishOrder));
        passes += r.events.filter((e) => e.kind === 3).length;
        s1 += r.carStats.reduce((a, c) => a + c.successes, 0);
        contacts += r.carStats.reduce((a, c) => a + c.contacts, 0) / 2;
      }
  // 출발 자리 몫 = 자리별 평균 최종 순위의 사이 제곱합 / 전체 제곱합 (10대 모두, 순환 설계)
  const all = finals.flat();
  const mu = mean(all);
  const ssTot = all.reduce((s, x) => s + (x - mu) ** 2, 0);
  const ssSlot = finals.reduce((s, g) => s + g.length * (mean(g) - mu) ** 2, 0);
  const win = (slot: number) => mean(finals[slot].map((x) => (x === 1 ? 1 : 0)));
  out(`| ${v.name} | ${SET_KO} | ${races} | ${f(win(0) * 100, 1)}% / ${f(win(1) * 100, 1)}% | **${f([2, 3, 4, 5, 6, 7, 8, 9].reduce((s, sl) => s + win(sl), 0) * 100, 1)}%** | ${f(mean(rho), 3)} | ${f((ssSlot / ssTot) * 100, 1)}% | ${f(passes / races, 2)} / ${f(s1 / races, 2)} | ${f(contacts / races, 2)} |`);
  printStuck();
}

// 3단계: 더티 에어와 부스트 크기 비교 (지시서 2026-11-02, 허용 값만). 부스트 5 · 8 · 12와 조합은 더티 에어 현행 3
const DB: Record<string, { name: string; opts: Partial<RaceOptions> }> = {
  da0: { name: '(가) 더티 에어 0', opts: { ...FINAL, dirtyAir: 0 } },
  da15: { name: '(가) 더티 에어 1.5', opts: { ...FINAL, dirtyAir: 1.5 } },
  da3: { name: `(가) 더티 에어 3 (현행 MOTIF_ALL, 부스트 ${MOTIF_ALL.boost})`, opts: FINAL },
  b5: { name: '(나) 부스트 5', opts: { ...FINAL, boost: 5 } },
  b8: { name: '(나) 부스트 8', opts: { ...FINAL, boost: 8 } },
  b12: { name: '(나) 부스트 12', opts: { ...FINAL, boost: 12 } },
  combo: { name: '(다) 더티 에어 1.5 + 부스트 8', opts: { ...FINAL, dirtyAir: 1.5, boost: 8 } },
};
const car = (id: string) => CAR_DATA.find((c) => c.id === id)!.stats;
const CAR5: [string, CarStats][] = [
  ['base 5/5/5/5', BASE],
  ['X 7/5/4/4', car('X')],
  ['Y 4/4/6/6', car('Y')],
  ['접지 위주 4/4/7/5', { topSpeed: 4, accel: 4, grip: 7, brake: 5 }],
  ['제동 위주 4/4/5/7', { topSpeed: 4, accel: 4, grip: 5, brake: 7 }],
]; // motif.ts share와 같은 5종

// node qa/backfield.ts stage3 <da0|da15|da3|b5|b8|b12|combo> <adjust|confirm>  > JSON 한 줄
if (part === 'stage3') {
  const v = DB[a1];
  const acc = newAcc();
  const finals: number[][] = Array.from({ length: N }, () => []);
  const rho: number[] = [];
  let passes = 0;
  let s1 = 0;
  let contacts = 0;
  let races = 0;
  const carRank = CAR5.map(() => [] as number[]); // 테스트 차(엔트리 0)를 5종으로 바꿔 같은 순환을 돌린 평균 순위
  for (let k = 0; k < N; k++)
    for (const t of LB)
      for (const seed of seeds) {
        const grid = rotate(k);
        const r = tryRace(t, seed, testCar(BASE), v.opts, { grid, trace: true });
        if (r) {
          races++;
          analyze(r, t, grid, acc);
          grid.forEach((carI, slot) => finals[slot].push(r.finishOrder.indexOf(carI) + 1));
          rho.push(spearman(grid, r.finishOrder));
          passes += r.events.filter((e) => e.kind === 3).length;
          s1 += r.carStats.reduce((a, c) => a + c.successes, 0);
          contacts += r.carStats.reduce((a, c) => a + c.contacts, 0) / 2;
          carRank[0].push(r.finishOrder.indexOf(0) + 1);
        }
        CAR5.slice(1).forEach(([, cs], i) => {
          const q = tryRace(t, seed, testCar(cs), v.opts, { grid });
          if (q) carRank[i + 1].push(q.finishOrder.indexOf(0) + 1);
        });
      }
  const all = finals.flat();
  const mu = mean(all);
  const ssTot = all.reduce((s, x) => s + (x - mu) ** 2, 0);
  const ssSlot = finals.reduce((s, g) => s + g.length * (mean(g) - mu) ** 2, 0);
  const win = (slot: number) => mean(finals[slot].map((x) => (x === 1 ? 1 : 0)));
  const { outcome, failFlags, gapLap, gap23 } = acc;
  const tot = Object.values(outcome).reduce((s, x) => s + x, 0);
  process.stdout.write(
    JSON.stringify({
      key: a1, name: v.name, set: SET_KO, races, stuck: STUCK.length,
      win1: win(0), win2: win(1), win3_10: [2, 3, 4, 5, 6, 7, 8, 9].reduce((s, sl) => s + win(sl), 0),
      rho: mean(rho), share: ssSlot / ssTot, passes: passes / races, s1: s1 / races, contacts: contacts / races,
      tries: tot, outcome: Object.fromEntries(Object.entries(outcome).map(([kk, x]) => [kk, x / tot])),
      fail: { n: failFlags.n, cap: failFlags.cap / failFlags.n, capShare: mean(failFlags.capShare), yield: failFlags.yield / failFlags.n, contact: failFlags.contact / failFlags.n, none: failFlags.none / failFlags.n },
      gap12: gapLap.map(mean), gap23: gap23.map(mean),
      carRank: carRank.map((x) => ({ n: x.length, mean: mean(x) })),
    }) + '\n',
  );
}

// node qa/backfield.ts dirtysolo   더티 에어 0일 때 이웃 차 단독 1랩 차와 더티 에어 손해 (1랩 내내 추격 상태일 때, 초)
if (part === 'dirtysolo') {
  out('| 트랙 | 이웃 차 단독 1랩 차: 평균 / 최소 / 최대 (s) | 더티 에어 1.5 손해: 평균 / 최소 / 최대 (s) | 더티 에어 3 손해: 평균 / 최소 / 최대 (s) |');
  out('|---|---|---|---|');
  const mmm = (a: number[]) => `${f(mean(a), 3)} / ${f(Math.min(...a), 3)} / ${f(Math.max(...a), 3)}`;
  for (const t of LB) {
    const lap = (cs: CarStats, d: number) => {
      const p = carParams(cs);
      return measureLap(t, { ...p, vg: p.vg * (1 - d / 100) }, EXIT_LIMIT_RELAX).lapTime;
    };
    const laps = CARS.map((cs) => lap(cs, 0)).sort((p, q) => p - q);
    const loss = (d: number) => CARS.map((cs) => lap(cs, d) - lap(cs, 0));
    out(`| ${t.id} | ${mmm(laps.slice(1).map((x, i) => x - laps[i]))} | ${mmm(loss(1.5))} | ${mmm(loss(3))} |`);
  }
}

// node qa/backfield.ts report3 <json 파일들>   3단계 표
if (part === 'report3') {
  const rs = process.argv.slice(3).map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const pc = (x: number, d = 1) => `${f(x * 100, d)}%`;
  out(table(['설정', '시드', '레이스', '자리 1 / 2의 1위', '자리 3~10 1위 합', '출발 · 최종 순위 상관', '출발 자리 몫', '추월 / S1 성공 (레이스당)', '접촉 (레이스당)'], rs.map((r) => [r.name, r.set, r.races, `${pc(r.win1)} / ${pc(r.win2)}`, `**${pc(r.win3_10)}**`, f(r.rho, 3), pc(r.share), `${f(r.passes, 2)} / ${f(r.s1, 2)}`, f(r.contacts, 2)])));
  out();
  out(table(['설정', '시드', '정식 시도', 'S1 성공', '구간 끝', '되돌림', '결과 없음', '실패 중 막힘 상한 (시간 비율)', '실패 중 OT-7 양보', '실패 중 접촉', '실패 중 셋 다 없음'], rs.map((r) => [r.name, r.set, r.tries, pc(r.outcome.S1), pc(r.outcome.segEnd), pc(r.outcome.abort), pc(r.outcome.open), `${pc(r.fail.cap)} (${pc(r.fail.capShare)})`, pc(r.fail.yield), pc(r.fail.contact), pc(r.fail.none)])));
  out();
  out(table(['설정', '시드', '1위 − 2위: 출발 직후 / 1랩 / 2랩 / 3랩 (s)', '2위 − 3위: 출발 직후 / 1랩 / 2랩 / 3랩 (s)'], rs.map((r) => [r.name, r.set, r.gap12.map((x: number) => f(x, 3)).join(' / '), r.gap23.map((x: number) => f(x, 3)).join(' / ')])));
  out();
  out(table(['설정', '시드', ...CAR5.map(([n]) => n)], rs.map((r) => [r.name, r.set, ...r.carRank.map((c: { mean: number }) => f(c.mean, 2))])));
  const stuck = rs.reduce((s, r) => s + r.stuck, 0);
  out();
  out(`멈춘 레이스: ${stuck}`);
}
