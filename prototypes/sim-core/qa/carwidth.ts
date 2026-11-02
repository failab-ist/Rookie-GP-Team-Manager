// 차 폭 1.9u 기준선 재측정 (디렉터 결정 AG-P061 B, 2026-11-02). 차 폭 3(측정용 옵션 carWidth 3)과 1.9(기본값)를 같은 조건으로 나란히 잰다.
// 조건: L-B 3트랙, MOTIF_ALL, 참가 10대(기준 차 + F-2 9대), 출발 순서 10가지 순환 × 50시드 (s1cap.ts 기준 설정과 같음).
// node qa/carwidth.ts collect <w3|w19> <adjust|confirm> <M1|M2|M3> > <파일>.json
// node qa/carwidth.ts report <json 파일들>
// node qa/carwidth.ts gains      능력치 효과 E(+1)와 가속 R (단독 주행, L-B 3트랙)
// s1speed 표는 qa/s1speed.ts collect ... [차 폭], 차와 레이서 몫은 qa/motif.ts share [adjust|confirm] [차 폭]
import { readFileSync } from 'node:fs';
import * as C from '../src/config.ts';
import type { RaceOptions, Track } from '../src/types.ts';
import { BASE, f, lapGains, load, mean, out, STAT_KO, STATS, STUCK, table, testCar, tryRace } from './lib.ts';

const N = 10;
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...C.MOTIF_ALL };
const SETS: Record<string, { name: string; opts: Partial<RaceOptions> }> = {
  w3: { name: '차 폭 3 (이전 기준)', opts: { ...FINAL, carWidth: 3 } },
  w19: { name: `차 폭 ${C.CAR_WIDTH} (새 기본값)`, opts: FINAL },
};
const rotate = (k: number) => Array.from({ length: N }, (_, slot) => (slot - k + N) % N);
const spearman = (grid: number[], order: number[]) => 1 - (6 * grid.reduce((s, carI, slot) => s + (slot - order.indexOf(carI)) ** 2, 0)) / (N * (N * N - 1));
const CAUSE_KO: Record<string, string> = { start: '출발부터 1위', contact: '접촉', mistake: '상대 실수', boost: '부스트', brake: '제동', corner: '코너', exit: '탈출', straight: '직선', none: 'OT-4 기록 없음' };
const [part, key, set, trackArg] = process.argv.slice(2);

if (part === 'collect') {
  const v = SETS[key];
  const W = v.opts.carWidth ?? C.CAR_WIDTH;
  const seeds = set === 'confirm' ? C.QA_CONFIRM_SEEDS : C.QA_ADJUST_SEEDS;
  const t: Track = load(`../data/tracks/motif/${trackArg}-LB.json`);
  const raceLength = 3 * t.segments.reduce((s, x) => s + x.length, 0);
  const acc = {
    races: 0,
    slotWins: new Array(N).fill(0),
    finals: Array.from({ length: N }, () => [] as number[]),
    rho: [] as number[],
    causes: {} as Record<string, number>,
    outcome: { S1: 0, segEnd: 0, abort: 0, open: 0 } as Record<string, number>,
    overlapTicks: 0, // 이동 · 접촉 처리 뒤 몸체가 겹친 (틱, 두 차) 수: |Δs| < 차 길이, |Δy| < 차 폭 (둘 다 주행 중)
    overlapRaces: 0,
    samePlace: 0, // 같은 자리 (|Δs| < 0.01, |Δy| < 0.01)
  };
  for (let k = 0; k < N; k++)
    for (const seed of seeds) {
      const grid = rotate(k);
      const r = tryRace(t, seed, testCar(BASE), v.opts);
      if (!r) continue;
      acc.races++;
      const winner = r.finishOrder[0];
      acc.slotWins[grid.indexOf(winner)]++;
      grid.forEach((carI, slot) => acc.finals[slot].push(r.finishOrder.indexOf(carI) + 1));
      acc.rho.push(spearman(grid, r.finishOrder));
      // 이긴 이유 = 우승자가 마지막으로 1위가 된 순간의 OT-4 원인 (winpath.ts와 같은 정의)
      const lead = [...r.events].reverse().find((e) => e.kind === 6 && e.cause === `by:${winner}`);
      const pass = lead && r.events.find((e) => e.kind === 3 && e.tick === lead.tick && e.cause!.endsWith(`:by:${winner}`));
      const cause = !lead ? 'start' : pass ? pass.cause!.split(':')[0] : 'none';
      acc.causes[cause] = (acc.causes[cause] ?? 0) + 1;
      // 정식 시도 결과 (s1cap.ts와 같은 짝짓기)
      const results = r.judgements.filter((j) => j.kind === 7 || j.kind === 2 || j.kind === 3);
      for (const tj of r.judgements.filter((j) => j.kind === 1)) {
        const res = results.find((j) => j.tick > tj.tick && j.cars[0] === tj.cars[0] && j.cars[1] === tj.cars[1]);
        acc.outcome[!res ? 'open' : res.kind === 7 ? 'S1' : res.kind === 2 ? 'segEnd' : 'abort']++;
      }
      // 겹침: lateral[k] = 틱 k+1 끝 = frames[k+1]
      let any = false;
      r.lateral.forEach((ys, kk) => {
        const xs = r.frames[kk + 1];
        for (let i = 0; i < N; i++)
          for (let j = i + 1; j < N; j++) {
            if (xs[i] >= raceLength || xs[j] >= raceLength) continue;
            const ds = Math.abs(xs[i] - xs[j]);
            const dy = Math.abs(ys[i] - ys[j]);
            if (ds < C.CAR_LENGTH && dy < W) {
              acc.overlapTicks++;
              any = true;
            }
            if (ds < 0.01 && dy < 0.01) acc.samePlace++;
          }
      });
      if (any) acc.overlapRaces++;
    }
  process.stdout.write(JSON.stringify({ key, name: v.name, set, track: t.id, ...acc, stuck: STUCK.length }) + '\n');
}

if (part === 'report') {
  const data = process.argv.slice(3).map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const keys = [...new Set(data.map((d) => d.key as string))];
  const pc = (n: number, of: number, d = 1) => `${f((n / Math.max(1, of)) * 100, d)}%`;
  const agg = (k: string) => {
    const ds = data.filter((d) => d.key === k);
    const sum = (fn: (d: (typeof ds)[number]) => number) => ds.reduce((s, d) => s + fn(d), 0);
    const races = sum((d) => d.races);
    const slotWins = Array.from({ length: N }, (_, i) => sum((d) => d.slotWins[i]));
    const finals = Array.from({ length: N }, (_, i) => ds.flatMap((d) => d.finals[i] as number[]));
    const all = finals.flat();
    const mu = mean(all);
    const share = finals.reduce((s, g) => s + g.length * (mean(g) - mu) ** 2, 0) / all.reduce((s, x) => s + (x - mu) ** 2, 0);
    const causes: Record<string, number> = {};
    for (const d of ds) for (const [c, n] of Object.entries(d.causes as Record<string, number>)) causes[c] = (causes[c] ?? 0) + n;
    const outcome: Record<string, number> = {};
    for (const d of ds) for (const [c, n] of Object.entries(d.outcome as Record<string, number>)) outcome[c] = (outcome[c] ?? 0) + n;
    return { name: ds[0].name, set: ds[0].set, races, slotWins, rho: mean(ds.flatMap((d) => d.rho)), share, causes, outcome, overlapTicks: sum((d) => d.overlapTicks), overlapRaces: sum((d) => d.overlapRaces), samePlace: sum((d) => d.samePlace), stuck: sum((d) => d.stuck) };
  };
  const as = keys.map(agg);
  out('### 1. 출발 칸별 승률 · 순위 상관 · 이긴 이유');
  out();
  out(table(['출발 칸', ...as.map((a) => `${a.name} (${a.set})`)], [...Array.from({ length: N }, (_, i) => [`${i + 1}`, ...as.map((a) => pc(a.slotWins[i], a.races))]), ['폴 (칸 1)', ...as.map((a) => `**${pc(a.slotWins[0], a.races)}**`)], ['뒤쪽 (칸 3~10)', ...as.map((a) => `**${pc(a.slotWins.slice(2).reduce((s, x) => s + x, 0), a.races)}**`)], ['출발 · 최종 순위 상관', ...as.map((a) => f(a.rho, 3))], ['출발 자리 몫', ...as.map((a) => pc(a.share, 1))]]));
  out();
  const order = ['start', 'contact', 'mistake', 'boost', 'brake', 'corner', 'exit', 'straight', 'none'];
  out(table(['이긴 이유 (우승자가 마지막으로 1위가 된 순간)', ...as.map((a) => a.name)], order.filter((c) => as.some((a) => a.causes[c])).map((c) => [CAUSE_KO[c], ...as.map((a) => pc(a.causes[c] ?? 0, a.races))])));
  out();
  out('### 2. 정식 시도');
  out();
  out(table(['설정', '정식 시도', 'S1 성공 (성공률)', '실패: 구간 끝', '실패: 옆 차선 점유 되돌림', '미결'], as.map((a) => {
    const tot = Object.values(a.outcome).reduce((s, x) => s + x, 0);
    return [a.name, tot, `${a.outcome.S1} (${pc(a.outcome.S1, tot, 2)})`, pc(a.outcome.segEnd, tot), pc(a.outcome.abort, tot), pc(a.outcome.open, tot)];
  })));
  out();
  out('### 5. 멈춘 레이스 · 겹침');
  out();
  out('몸체 겹침 = 틱 끝(이동 · 접촉 처리 뒤) 두 차가 앞뒤 차 길이 6 안, 옆으로 차 폭 안 (완주한 차 제외). 같은 자리 = 앞뒤 · 옆 모두 0.01 u 안.');
  out();
  out(table(['설정', '레이스', '멈춘 레이스', '몸체 겹침 (틱 × 두 차)', '겹침이 있었던 레이스', '같은 자리 (틱 × 두 차)'], as.map((a) => [a.name, a.races, a.stuck, a.overlapTicks, a.overlapRaces, a.samePlace])));
}

if (part === 'gains') {
  const LB: Track[] = ['M1', 'M2', 'M3'].map((m) => load(`../data/tracks/motif/${m}-LB.json`));
  const g = lapGains(LB);
  out('단독 주행이라 차 폭을 쓰지 않는다(physics.ts에 차 폭 없음): 차 폭 3과 1.9에서 같은 값.');
  out();
  out(table([...STATS.map((s) => `E(+1) ${STAT_KO[s]}`), '가속 R', '제동 R (참고)'], [[...STATS.map((s) => `${f(g.E[s] * 100, 3)}%`), f(g.R, 2), f(g.Rbrake, 2)]]));
}
