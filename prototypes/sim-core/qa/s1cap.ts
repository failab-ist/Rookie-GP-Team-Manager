// 정식 추월(S1)이 시도 중 막힘 상한에 묶여 실패하는지 확인 (측정만, 기본값 그대로. 지시서 2026-11-02).
// 설정은 FINAL(MOTIF_ALL) 위에 하나씩만 바꾼다: (가) 옆 이동 속도 v_lat, (나) 시도 시작 거리 TRY_GAP, (다) 상한 해제 옆 간격 폭. 조합 없음.
// 참가 10대(기준 차 + F-2 9대, 레이서 NPC), L-B 3트랙 × 시드 50 × 출발 순서 10가지 순환 = 1500레이스 (backfield.ts stage3과 같은 설계).
// node qa/s1cap.ts fingerprint                          회귀용 해시 (기본 옵션 T1~T3 × 조정용 시드, FINAL L-B 순환). src를 고치기 전후에 돌려 같은지 본다
// node qa/s1cap.ts run <base|lat6|lat8|gap15|gap20|rel15> <adjust|confirm> > <파일>.json   JSON 한 줄
// node qa/s1cap.ts report <json 파일들>                  표
// node qa/s1cap.ts axis [M1|M2|M3] [시드] [설정 키]        시간축 점검: 상한이 걸린 틱을 틱 단위로 다시 계산해 sim의 막힘 상한과 맞는지 (순환 10가지)
//
// 시도 시간축 정의 (sim.ts 기준)
// - frames[k] = 틱 k 이동이 끝난 뒤. trace[i] = 틱 i+1 (trace[T-1]이 틱 T). 판정 기록의 tick = 그 틱 (4)단계, 곧 이동 전 상태 frames[tick-1]을 보고 내린 판정.
//   막힘 상한(2)도 이동 전 상태로 계산하고, trace[T-1][차][4]는 틱 T의 상한 여부.
// - 판정 기록 cars는 번호 오름차순으로 정렬된다(events.ts makeEvent). 시도한 차는 이동 전 상태 frames[T0-1]에서 뒤에 있는 차다
//   (sim은 d.s > c.s인 차만 앞차로 삼으므로 같은 위치일 수 없다. 추정이 아니라 sim 조건 그대로).
// - 시도 시작 틱 T0 = 종류 1 판정의 tick. 결과 틱 T1 = 같은 두 차의 T0 이후 첫 종류 7(성공) · 2(구간 끝) · 3(되돌림) 판정의 tick(T1 > T0). 없으면 미결.
// - 시도 중 이동 틱 = T0 ≤ T ≤ T1-1. 첫 상한 틱 Tc = 그 범위에서 trace[T-1][시도 차][4]가 처음 1인 틱.
// - 상한 걸린 순간의 상태 = 그 상한을 계산한 이동 전 상태: 위치 frames[Tc-1], 속도 trace[Tc-2][·][0](직전 틱 이동 직후 c.v).
//   끝 순간의 상태 = 결과를 판정한 상태: 위치 frames[T1-1], 속도 trace[T1-2][·][0]. 상한 → 끝 시간 = (T1 − Tc) × 0.05 s.
// - 간격 = 앞차 위치 − 시도 차 위치 − 차 길이 6 (앞차 = 시도 대상 차), 속도 차 = 시도 차 − 앞차.
// - 단서: trace 속도는 (5)접촉 처리 전 값. 직전 틱에 접촉이 시작됐거나(사건 종류 4, 속도 손실 + 위치 처리) 위치만 끌려 간 표본(이동 거리가 속도로 설명되지 않음, 휴리스틱) 수를 따로 센다.
import { readFileSync } from 'node:fs';
import * as C from '../src/config.ts';
import type { RaceOptions, Track, TraceRow } from '../src/types.ts';
import { BASE, CARS as CAR_DATA, f, listHash, load, mean, out, registerTrack, STUCK, table, testCar, tryRace, TRACKS } from './lib.ts';
import type { CarStats } from '../src/types.ts';

const N = 10;
const LB: Track[] = ['M1', 'M2', 'M3'].map((m) => load(`../data/tracks/motif/${m}-LB.json`));
LB.forEach(registerTrack);
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...C.MOTIF_ALL };
const [part, a1, a2, a3] = process.argv.slice(2);
const set = (part === 'run' ? a2 : undefined) ?? 'adjust';
const seeds = set === 'confirm' ? C.QA_CONFIRM_SEEDS : C.QA_ADJUST_SEEDS;
const SET_KO = set === 'confirm' ? '확인용' : '조정용';
const rotate = (k: number) => Array.from({ length: N }, (_, slot) => (slot - k + N) % N);

// 설정 여섯 줄: 모두 FINAL 위에 값 하나만 바꾼다 (config 비교값은 run · report에서만 읽는다)
const configs = (): Record<string, { name: string; opts: Partial<RaceOptions> }> => ({
  base: { name: `기준 (현행: v_lat ${C.LAT_SPEED}, TRY_GAP ${C.TRY_GAP}, 해제 간격 차 폭 ${C.CAR_WIDTH})`, opts: FINAL },
  lat6: { name: '(가) v_lat 6', opts: { ...FINAL, latSpeed: 6 } },
  lat8: { name: '(가) v_lat 8', opts: { ...FINAL, latSpeed: 8 } },
  gap15: { name: `(나) TRY_GAP ${C.TRY_GAP_COMPARE[0]} (1.5배)`, opts: { ...FINAL, tryGap: C.TRY_GAP_COMPARE[0] } },
  gap20: { name: `(나) TRY_GAP ${C.TRY_GAP_COMPARE[1]} (2배)`, opts: { ...FINAL, tryGap: C.TRY_GAP_COMPARE[1] } },
  rel15: { name: `(다) 상한 해제 간격 ${C.OT_RELEASE_WIDTH_COMPARE[0]} (차 폭 절반)`, opts: { ...FINAL, otReleaseWidth: C.OT_RELEASE_WIDTH_COMPARE[0] } },
});

const car = (id: string) => CAR_DATA.find((c) => c.id === id)!.stats;
const CAR5: [string, CarStats][] = [
  ['base 5/5/5/5', BASE],
  ['X 7/5/4/4', car('X')],
  ['Y 4/4/6/6', car('Y')],
  ['접지 위주 4/4/7/5', { topSpeed: 4, accel: 4, grip: 7, brake: 5 }],
  ['제동 위주 4/4/5/7', { topSpeed: 4, accel: 4, grip: 5, brake: 7 }],
]; // backfield.ts · motif.ts share와 같은 5종

// 레이스 안 순위 상관 (스피어만, 동률 없음)
const spearman = (grid: number[], order: number[]) => 1 - (6 * grid.reduce((s, carI, slot) => s + (slot - order.indexOf(carI)) ** 2, 0)) / (N * (N * N - 1));
// 평균 · 10/25/50/75/90 백분위 (winpath.ts와 같은 방식)
const summ = (xs: number[]) => {
  const s = [...xs].sort((p, q) => p - q);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: mean(s), p: [0.1, 0.25, 0.5, 0.75, 0.9].map(at) };
};
const FIX_TOL = 0.05; // u. 이동 거리가 속도 범위보다 이만큼 짧으면 위치가 끌려 간 것으로 본다 (휴리스틱)

type Touch = { n: number; start: number; fix: number };
const newAcc = () => ({
  outcome: { S1: 0, segEnd: 0, abort: 0, open: 0 } as Record<string, number>,
  fail: 0,
  capFail: 0,
  guard: 0, // 방어 검사에 걸린 시도(T0 < 10, 같은 위치, 다음 같은 쌍 시도 뒤의 결과). 0이어야 한다
  dt: [] as number[],
  gap: [] as number[],
  dv: [] as number[],
  gapEnd: [] as number[],
  dvEnd: [] as number[],
  touchCap: { n: 0, start: 0, fix: 0 } as Touch,
  touchEnd: { n: 0, start: 0, fix: 0 } as Touch,
  mismatch: 0, // 레이스의 판정 기록 수와 carStats 합이 다른 레이스
});

// 직전 틱 P에 접촉 처리가 차 i의 속도 · 위치를 바꿨는지. start = 접촉 시작 사건(속도 손실 + 위치 처리), fix = 위치만 끌려 간 의심
function touchedAt(r: NonNullable<ReturnType<typeof tryRace>>, contactAt: Set<string>, P: number, i: number): 'start' | 'fix' | null {
  if (contactAt.has(`${P}|${i}`)) return 'start';
  const d = r.frames[P][i] - r.frames[P - 1][i];
  const va = r.trace![P - 1][i][0];
  const vb = r.trace![P - 2][i][0];
  return d < Math.min(va, vb) * C.TICK_SECONDS - FIX_TOL ? 'fix' : null;
}

function analyze(r: NonNullable<ReturnType<typeof tryRace>>, acc: ReturnType<typeof newAcc>) {
  const fr = r.frames;
  const tr = r.trace!;
  const contactAt = new Set(r.events.filter((e) => e.kind === 4).flatMap((e) => e.cars.map((c) => `${e.tick}|${c}`)));
  const tries = r.judgements.filter((j) => j.kind === 1);
  const results = r.judgements.filter((j) => j.kind === 7 || j.kind === 2 || j.kind === 3);
  if (tries.length !== r.carStats.reduce((a, c) => a + c.tries, 0) || results.filter((j) => j.kind === 7).length !== r.carStats.reduce((a, c) => a + c.successes, 0)) acc.mismatch++;
  const gapAt = (k: number, back: number, front: number) => fr[k][front] - fr[k][back] - C.CAR_LENGTH;
  const tally = (t: Touch, P: number, a: number, b: number) => {
    const ta = touchedAt(r, contactAt, P, a);
    const tb = touchedAt(r, contactAt, P, b);
    t.n++;
    if (ta === 'start' || tb === 'start') t.start++;
    else if (ta || tb) t.fix++;
  };
  for (const tj of tries) {
    const T0 = tj.tick;
    const [x, y] = tj.cars;
    if (T0 < 10 || fr[T0 - 1][x] === fr[T0 - 1][y]) {
      acc.guard++;
      continue;
    }
    const trier = fr[T0 - 1][x] < fr[T0 - 1][y] ? x : y;
    const front = trier === x ? y : x;
    const nextTry = tries.find((j) => j.tick > T0 && j.cars[0] === x && j.cars[1] === y);
    const res = results.find((j) => j.tick > T0 && j.cars[0] === x && j.cars[1] === y);
    if (res && nextTry && res.tick > nextTry.tick) {
      acc.guard++;
      acc.outcome.open++;
      continue;
    }
    if (!res) {
      acc.outcome.open++;
      continue;
    }
    acc.outcome[res.kind === 7 ? 'S1' : res.kind === 2 ? 'segEnd' : 'abort']++;
    if (res.kind === 7) continue;
    acc.fail++;
    const T1 = res.tick;
    let Tc = -1;
    for (let T = T0; T <= T1 - 1; T++)
      if (tr[T - 1][trier][4]) {
        Tc = T;
        break;
      }
    if (Tc < 0) continue;
    acc.capFail++;
    acc.dt.push((T1 - Tc) * C.TICK_SECONDS);
    acc.gap.push(gapAt(Tc - 1, trier, front));
    acc.dv.push(tr[Tc - 2][trier][0] - tr[Tc - 2][front][0]);
    acc.gapEnd.push(gapAt(T1 - 1, trier, front));
    acc.dvEnd.push(tr[T1 - 2][trier][0] - tr[T1 - 2][front][0]);
    tally(acc.touchCap, Tc - 1, trier, front);
    tally(acc.touchEnd, T1 - 1, trier, front);
  }
}

// ---------- fingerprint ----------
// node qa/s1cap.ts fingerprint   두 묶음의 listHash. 헤더(옵션 사본)는 제외하고 finishOrder, events, judgements, carStats, frames, trace를 해시한다
if (part === 'fingerprint') {
  const hs = (r: ReturnType<typeof tryRace>) => (r ? listHash([r.finishOrder, r.events, r.judgements, r.carStats, r.frames, r.trace]) : 'stuck');
  const a: string[] = [];
  for (const t of TRACKS) for (const seed of C.QA_ADJUST_SEEDS) a.push(hs(tryRace(t, seed, testCar(BASE), {}, { trace: true })));
  const stuckA = STUCK.length;
  const b: string[] = [];
  for (let k = 0; k < N; k++) for (const t of LB) for (const seed of C.QA_ADJUST_SEEDS) b.push(hs(tryRace(t, seed, testCar(BASE), FINAL, { grid: rotate(k), trace: true })));
  out(JSON.stringify({ default: { races: a.length, stuck: stuckA, hash: listHash(a) }, final: { races: b.length, stuck: STUCK.length - stuckA, hash: listHash(b) } }));
}

// ---------- run ----------
// node qa/s1cap.ts run <키> <adjust|confirm> > JSON 한 줄
if (part === 'run') {
  const v = configs()[a1];
  if (!v) throw new Error(`알 수 없는 설정 ${a1}`);
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
          analyze(r, acc);
          grid.forEach((carI, slot) => finals[slot].push(r.finishOrder.indexOf(carI) + 1));
          rho.push(spearman(grid, r.finishOrder));
          passes += r.events.filter((e) => e.kind === 3).length;
          s1 += r.carStats.reduce((s, c) => s + c.successes, 0);
          contacts += r.carStats.reduce((s, c) => s + c.contacts, 0) / 2;
          carRank[0].push(r.finishOrder.indexOf(0) + 1);
        }
        CAR5.slice(1).forEach(([, cs], i) => {
          const q = tryRace(t, seed, testCar(cs), v.opts, { grid });
          if (q) carRank[i + 1].push(q.finishOrder.indexOf(0) + 1);
        });
      }
  // 출발 자리 몫 = 자리별 평균 최종 순위의 사이 제곱합 / 전체 제곱합 (10대 모두, 순환 설계)
  const all = finals.flat();
  const mu = mean(all);
  const ssTot = all.reduce((s, x) => s + (x - mu) ** 2, 0);
  const ssSlot = finals.reduce((s, g) => s + g.length * (mean(g) - mu) ** 2, 0);
  const win = (slot: number) => mean(finals[slot].map((x) => (x === 1 ? 1 : 0)));
  const tot = Object.values(acc.outcome).reduce((s, x) => s + x, 0);
  process.stdout.write(
    JSON.stringify({
      key: a1, name: v.name, set: SET_KO, races, stuck: STUCK.length, guard: acc.guard, mismatch: acc.mismatch,
      win1: win(0), win2: win(1), win3_10: [2, 3, 4, 5, 6, 7, 8, 9].reduce((s, sl) => s + win(sl), 0),
      rho: mean(rho), share: ssSlot / ssTot, passes: passes / races, s1: s1 / races, contacts: contacts / races,
      tries: tot, outcomeN: acc.outcome, outcome: Object.fromEntries(Object.entries(acc.outcome).map(([kk, x]) => [kk, x / tot])),
      fail: acc.fail, capFail: acc.capFail,
      cap: { dt: summ(acc.dt), gap: summ(acc.gap), dv: summ(acc.dv), gapEnd: summ(acc.gapEnd), dvEnd: summ(acc.dvEnd) },
      touchCap: acc.touchCap, touchEnd: acc.touchEnd,
      carRank: carRank.map((x) => ({ n: x.length, mean: mean(x) })),
    }) + '\n',
  );
}

// ---------- axis ----------
// node qa/s1cap.ts axis [M1|M2|M3] [시드] [설정 키]
// 상한이 걸린 틱 T(trace[T-1][차][4] = 1)마다 sim의 막힘 상한을 밖에서 다시 계산한다:
//   v_cap = 앞차 속도 + max(0, g − g_min) / τ, g = 이동 전 상태 frames[T-1]의 간격, 앞차 속도 = trace[T-2][앞차][0].
// 직전 틱 속도가 v_cap보다 빠르면 sim의 step이 첫 물리 스텝에서 v를 v_cap으로 자르므로 틱 끝 속도 trace[T-1][차][0]가 v_cap 이하여야 한다(다른 한계가 더 낮으면 그보다 낮다).
// 대조: 같은 계산을 한 틱 뒤 상태(frames[T], trace[T-1])로 하면 맞는 비율이 떨어져야 한다.
if (part === 'axis') {
  const track = LB.find((t) => t.id === `${a1 ?? 'M1'}-LB`)!;
  const seed = Number(a2 ?? 1);
  const v = configs()[a3 ?? 'base'];
  const L = track.segments.reduce((s, x) => s + x.length, 0);
  const raceLength = 3 * L;
  const exact = 1e-6;
  const cnt = { flagged: 0, changing: 0, noFront: 0, touched: 0, notClip: 0, used: 0, eq: 0, le: 0, ctlEq: 0, ctlLe: 0 };
  let example = '';
  for (let k = 0; k < N; k++) {
    const r = tryRace(track, seed, testCar(BASE), v.opts, { grid: rotate(k), trace: true });
    if (!r) continue;
    const fr = r.frames;
    const tr = r.trace!;
    const contactAt = new Set(r.events.filter((e) => e.kind === 4).flatMap((e) => e.cars.map((c) => `${e.tick}|${c}`)));
    const vcap = (fv: number, g: number) => fv + Math.max(0, g - C.GAP_MIN) / C.BLOCK_TAU;
    for (let T = 12; T <= r.ticks; T++)
      for (let i = 0; i < N; i++) {
        if (!tr[T - 1][i][4]) continue;
        cnt.flagged++;
        const pre: TraceRow[] = tr[T - 2]; // 틱 T (2)단계의 차선 상태 = 직전 틱 기록
        if (pre[i][1] !== pre[i][2]) {
          cnt.changing++;
          continue;
        }
        let fi = -1;
        for (let j = 0; j < N; j++) {
          if (j === i || fr[T - 1][j] >= raceLength || fr[T - 1][j] <= fr[T - 1][i]) continue;
          if (pre[j][1] !== pre[i][1] && pre[j][2] !== pre[i][1]) continue;
          if (fi < 0 || fr[T - 1][j] < fr[T - 1][fi]) fi = j;
        }
        if (fi < 0) {
          cnt.noFront++;
          continue;
        }
        if (touchedAt(r, contactAt, T - 1, i) || touchedAt(r, contactAt, T - 1, fi)) {
          cnt.touched++;
          continue;
        }
        const g = fr[T - 1][fi] - fr[T - 1][i] - C.CAR_LENGTH;
        const cap = vcap(tr[T - 2][fi][0], g);
        if (tr[T - 2][i][0] <= cap) {
          cnt.notClip++;
          continue;
        }
        const after = tr[T - 1][i][0];
        const capLate = vcap(tr[T - 1][fi][0], fr[T][fi] - fr[T][i] - C.CAR_LENGTH);
        cnt.used++;
        if (Math.abs(after - cap) < exact) cnt.eq++;
        if (after <= cap + exact) cnt.le++;
        if (Math.abs(after - capLate) < exact) cnt.ctlEq++;
        if (after <= capLate + exact) cnt.ctlLe++;
        if (!example && Math.abs(after - cap) < exact)
          example = `${track.id} 시드 ${seed} 순서 ${k} 틱 ${T}: 차 ${i} 뒤 / 차 ${fi} 앞. frames[${T - 1}] 간격 ${f(g, 3)} u, 앞차 속도 trace[${T - 2}] ${f(tr[T - 2][fi][0], 3)}, 시도 차 직전 속도 ${f(tr[T - 2][i][0], 3)} → 계산한 v_cap ${f(cap, 4)}, trace[${T - 1}] 틱 끝 속도 ${f(after, 4)}, 상한 플래그 ${tr[T - 1][i][4]} (한 틱 뒤 상태로 계산하면 ${f(capLate, 4)})`;
      }
  }
  out(`설정 ${v.name}, ${track.id} 시드 ${seed}, 출발 순서 10가지`);
  out();
  out(`상한 플래그 ${cnt.flagged}틱 → 변경 중인 차 ${cnt.changing}, 같은 차선 앞차 없음(양보 상한 등) ${cnt.noFront}, 직전 틱 접촉 처리 ${cnt.touched}, 직전 속도가 v_cap 이하 ${cnt.notClip}을 빼고 ${cnt.used}틱 비교.`);
  out();
  out(
    table(
      ['계산에 쓴 상태', '틱 끝 속도 = v_cap (오차 1e-6 이내)', '틱 끝 속도 ≤ v_cap'],
      [
        ['이동 전 상태 frames[T-1], trace[T-2] (정의)', `${cnt.eq} (${f((cnt.eq / Math.max(1, cnt.used)) * 100, 1)}%)`, `${cnt.le} (${f((cnt.le / Math.max(1, cnt.used)) * 100, 1)}%)`],
        ['대조: 한 틱 뒤 상태 frames[T], trace[T-1]', `${cnt.ctlEq} (${f((cnt.ctlEq / Math.max(1, cnt.used)) * 100, 1)}%)`, `${cnt.ctlLe} (${f((cnt.ctlLe / Math.max(1, cnt.used)) * 100, 1)}%)`],
      ],
    ),
  );
  out();
  out(`예시 한 건: ${example || '–'}`);
}

// ---------- report ----------
// node qa/s1cap.ts report <json 파일들>
if (part === 'report') {
  const rs = process.argv.slice(3).map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const pc = (x: number, d = 1) => `${f(x * 100, d)}%`;
  const q = (s: { n: number; mean: number; p: number[] }, d = 2) => (s.n ? `${f(s.mean, d)} · ${s.p.map((x) => f(x, d)).join(' / ')}` : '–');
  out('① 승리 · 상관 · 출발 자리 몫 · 접촉 · 추월 / S1');
  out();
  out(table(['설정', '시드', '레이스', '자리 1 우승', '자리 3~10 우승 합', '출발 · 최종 순위 상관', '출발 자리 몫', '추월(OT-4) / S1 성공 (레이스당)', '접촉 (레이스당)'], rs.map((r) => [r.name, r.set, r.races, pc(r.win1), `**${pc(r.win3_10)}**`, f(r.rho, 3), pc(r.share), `${f(r.passes, 2)} / ${f(r.s1, 2)}`, f(r.contacts, 2)])));
  out();
  out('② 정식 시도 결과 분포와 S1 성공률 (분모 = 정식 시도 수, 미결 포함)');
  out();
  out(table(['설정', '시드', '정식 시도', 'S1 성공 (성공률)', '구간 끝', '옆 차선 점유 되돌림', '미결', '실패 시도 (구간 끝 + 되돌림)', '실패 중 첫 상한 있음'], rs.map((r) => [r.name, r.set, r.tries, `${r.outcomeN.S1} (${pc(r.outcome.S1, 2)})`, pc(r.outcome.segEnd), pc(r.outcome.abort), pc(r.outcome.open), r.fail, `${r.capFail} (${pc(r.capFail / r.fail)})`])));
  out();
  out('③ 상한이 걸린 실패 시도: 처음 상한이 걸린 순간과 시도 끝 순간. 값은 평균 · 10 / 25 / 50 / 75 / 90 백분위. 간격 = 앞차 위치 − 시도 차 위치 − 차 길이 (u), 속도 차 = 시도 차 − 앞차 (u/s)');
  out();
  out(table(['설정', '시드', '시도 수', '상한 → 끝 시간 (s)', '상한 순간 간격 (u)', '상한 순간 속도 차', '끝 순간 간격 (u)', '끝 순간 속도 차'], rs.map((r) => [r.name, r.set, r.cap.dt.n, q(r.cap.dt), q(r.cap.gap), q(r.cap.dv), q(r.cap.gapEnd), q(r.cap.dvEnd)])));
  out();
  out('③-1 위 표본 가운데 직전 틱에 접촉 처리가 있어 trace 속도가 처리 전 값인 표본 (접촉 시작 사건 / 위치만 끌려 간 의심)');
  out();
  out(table(['설정', '시드', '상한 순간 표본', '접촉 시작', '위치 의심', '끝 순간 표본', '접촉 시작', '위치 의심'], rs.map((r) => [r.name, r.set, r.touchCap.n, r.touchCap.start, r.touchCap.fix, r.touchEnd.n, r.touchEnd.start, r.touchEnd.fix])));
  out();
  out('④ 차 5종 평균 순위 (테스트 차를 5종으로 바꿔 같은 순환을 돌린 평균, 1 = 1위)');
  out();
  out(table(['설정', '시드', ...CAR5.map(([n]) => n)], rs.map((r) => [r.name, r.set, ...r.carRank.map((c: { mean: number }) => f(c.mean, 2))])));
  out();
  out(`멈춘 레이스: ${rs.map((r) => `${r.key} ${r.stuck}`).join(', ')} (합 ${rs.reduce((s, r) => s + r.stuck, 0)})`);
  out(`방어 검사에 걸린 시도: ${rs.reduce((s, r) => s + r.guard, 0)}, 판정 기록과 carStats 합이 다른 레이스: ${rs.reduce((s, r) => s + r.mismatch, 0)}`);
}
