// 출발 자리 홀짝 쏠림 조사 (측정만, 튜닝 금지. 지시서 2026-11-02).
// 참가 10대(기준 차 + F-2 9대, 레이서 NPC)는 그대로 두고 출발 순서만 순환한다(qa.grid). 차마다 모든 자리를 한 번씩 거치므로
// 자리별 값은 10대 전체를 모아 낸다(차 구성 효과가 자리마다 같게 섞인다). 자리는 1부터 (1 = 맨 앞 줄 B열).
// 비교 줄: (가) 그리드 좌우 뒤집기(qa.start), (나) 처리 순서 뒤집기(qa.reverseOrder), 그 밖에 스위치 끄기 · 안쪽 차선을 메모리에서만 바꾼 트랙(데이터 파일은 그대로).
// node qa/gridside.ts <설정 키> <adjust|confirm> > <파일>.md   (키: base, mirror, reverse, -OT1 … -OT7, -CT, -SS, allOff, inner1, inner2, flat)
import { CAR_LENGTH, GRID_LANES, GRID_ROW_GAP, GRID_STAGGER, MOTIF_ALL, QA_ADJUST_SEEDS, QA_CONFIRM_SEEDS, TICK_SECONDS } from '../src/config.ts';
import { buildCourse } from '../src/physics.ts';
import type { QaHooks, RaceOptions, Track } from '../src/types.ts';
import { BASE, f, load, mean, out, printStuck, registerTrack, table, testCar, tryRace } from './lib.ts';

const N = 10;
const LB: Track[] = ['M1', 'M2', 'M3'].map((m) => load(`../data/tracks/motif/${m}-LB.json`));
LB.forEach(registerTrack);
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...MOTIF_ALL };
const withInner = (t: Track, lane: number): Track => ({ ...t, segments: t.segments.map((s) => (s.kind === 'corner' ? { ...s, innerLane: lane } : s)) });
// 그리드 배치 (sim.ts와 같은 식): 자리 pos → 줄, 열. 0-based 짝수 자리 = B열(차선 2, 엇갈림 +4 u), 홀수 = A열(차선 0)
const slotPos = (pos: number, layout: 'normal' | 'mirror' | 'flat') => {
  const row = N / 2 - 1 - Math.floor(pos / 2);
  const colB = pos % 2 === 0;
  const lane = layout === 'mirror' ? (colB ? GRID_LANES[0] : GRID_LANES[1]) : colB ? GRID_LANES[1] : GRID_LANES[0];
  return { s: GRID_ROW_GAP * row + (colB && layout !== 'flat' ? GRID_STAGGER : 0), lane, v: 0 };
};
type Setting = { name: string; opts: Partial<RaceOptions>; track?: (t: Track) => Track; layout?: 'mirror' | 'flat'; reverse?: boolean };
const SETTINGS: Record<string, Setting> = {
  base: { name: '기준 (MOTIF_ALL)', opts: FINAL },
  '-OT1': { name: 'OT-1 끔 (원하는 속도 step)', opts: { ...FINAL, desiredSpeed: 'step' } },
  '-OT2': { name: 'OT-2 끔', opts: { ...FINAL, otRelease: false } },
  '-OT3': { name: 'OT-3 끔', opts: { ...FINAL, otSpanCorner: false } },
  '-OT5': { name: 'OT-5 끔 (더티 에어)', opts: { ...FINAL, dirtyAir: 0 } },
  '-OT6': { name: 'OT-6 끔 (부스트)', opts: { ...FINAL, boost: 0 } },
  '-OT7': { name: 'OT-7 끔 (코너 우선권)', opts: { ...FINAL, cornerPriority: false } },
  '-CT': { name: 'CT-1~3 끔', opts: { ...FINAL, ctWobble: false, ctLine: 0, ctContact: false } },
  '-SS': { name: '슬립스트림 끔', opts: { ...FINAL, slipstream: false } },
  allOff: { name: '전부 끔 (OT · CT · 부스트 구간 · 슬립스트림)', opts: { reaction: false, slipstream: false } },
  allOffFlat: { name: '전부 끔 + 그리드 엇갈림 없음', opts: { reaction: false, slipstream: false }, layout: 'flat' },
  allOffMirror: { name: '전부 끔 + 그리드 좌우 뒤집기', opts: { reaction: false, slipstream: false }, layout: 'mirror' },
  inner1: { name: '안쪽 차선 모두 1번 (메모리에서만)', opts: FINAL, track: (t) => withInner(t, 1) },
  inner2: { name: '안쪽 차선 모두 2번 (메모리에서만)', opts: FINAL, track: (t) => withInner(t, 2) },
  mirror: { name: '(가) 그리드 좌우 뒤집기 (B열 0번, A열 2번 차선)', opts: FINAL, layout: 'mirror' },
  reverse: { name: '(나) 틱 안 처리 순서 뒤집기', opts: FINAL, reverse: true },
  flat: { name: '그리드 엇갈림 없음 (두 열 같은 줄 위치)', opts: FINAL, layout: 'flat' },
};
const key = process.argv[2] ?? 'base';
const set = process.argv[3] ?? 'adjust';
const st = SETTINGS[key];
if (!st) throw new Error(`설정 키: ${Object.keys(SETTINGS).join(', ')}`);
const seeds = set === 'confirm' ? QA_CONFIRM_SEEDS : QA_ADJUST_SEEDS;

// 자리(0-based)별 누적
const acc = Array.from({ length: N }, () => ({ final: [] as number[], fc: [] as number[], lc: [] as number[], tries: [] as number[], blocked: [] as number[], yields: [] as number[], wins: [] as number[] }));
for (let k = 0; k < N; k++)
  for (const t0 of LB) {
    const t = st.track ? st.track(t0) : t0;
    const course = buildCourse(t.segments, true);
    const fc = course.segs.find((s) => s.kind === 'corner')!;
    for (const seed of seeds) {
      const grid = Array.from({ length: N }, (_, slot) => (slot - k + N) % N);
      const qa: QaHooks = { grid, trace: true, reverseOrder: st.reverse };
      if (st.layout) qa.start = Array.from({ length: N }, (_, carI) => slotPos(grid.indexOf(carI), st.layout!));
      const r = tryRace(t, seed, testCar(BASE), st.opts, qa);
      if (!r) continue;
      const tr = r.trace!;
      // 첫 코너 끝을 지난 순서
      const crossTick = (i: number, x: number) => r.frames.findIndex((p) => p[i] >= x);
      const fcOrder = [...Array(N).keys()].sort((a, b) => crossTick(a, fc.end) - crossTick(b, fc.end) || r.frames[0][b] - r.frames[0][a]);
      for (let pos = 0; pos < N; pos++) {
        const i = grid[pos];
        const until = crossTick(i, fc.start); // 첫 코너 시작에 닿는 틱
        let lc = 0;
        let blocked = 0;
        for (let k2 = 0; k2 < until && k2 < tr.length; k2++) {
          const row = tr[k2][i];
          if (row[4]) blocked++;
          const prev = k2 ? tr[k2 - 1][i] : null;
          if (row[1] !== row[2] && (!prev || prev[1] === prev[2] || prev[2] !== row[2])) lc++;
        }
        // 정식 시도 (종류 1): 두 차 중 그 틱에 뒤에 있던 차가 시도한 차
        const tries = r.judgements.filter((j) => j.kind === 1 && j.tick < until && j.cars.includes(i) && r.frames[j.tick][i] < r.frames[j.tick][j.cars.find((x) => x !== i)!]).length;
        // OT-7 양보 (종류 8, cause winner:<차>): 첫 코너에서 진 횟수
        const yields = r.judgements.filter((j) => j.kind === 8 && j.segment === fc.id && j.lap === 1 && j.cars.includes(i) && j.cause !== `winner:${i}:front` && j.cause !== `winner:${i}:inner`).length;
        const fin = r.finishOrder.indexOf(i) + 1;
        acc[pos].final.push(pos + 1 - fin);
        acc[pos].fc.push(pos + 1 - (fcOrder.indexOf(i) + 1));
        acc[pos].lc.push(lc);
        acc[pos].tries.push(tries);
        acc[pos].blocked.push(blocked * TICK_SECONDS);
        acc[pos].yields.push(yields);
        acc[pos].wins.push(fin === 1 ? 1 : 0);
      }
    }
  }

out(`## ${st.name} — ${set === 'confirm' ? '확인용' : '조정용'} 시드 ${seeds[0]}~${seeds.at(-1)}`);
out();
out(`L-B 3트랙 × ${seeds.length}시드 × 순환 10가지, 자리마다 ${acc[0].final.length}대분(10대 모두). 되찾음 = 출발 자리 − 순위 (+ = 앞으로).`);
out();
const lane0 = (pos: number) => (st.layout ? slotPos(pos, st.layout) : slotPos(pos, 'normal'));
out(
  table(
    ['자리', '열 · 차선 · s (u)', '첫 코너 끝까지 되찾음', '최종 되찾음', '1위 비율', '첫 코너 전 차선 변경', '첫 코너 전 정식 시도', '첫 코너 전 막힘 (s)', '첫 코너 OT-7 양보'],
    acc.map((a, pos) => {
      const p = lane0(pos);
      return [pos + 1, `${pos % 2 === 0 ? 'B' : 'A'} · ${p.lane} · ${p.s}`, f(mean(a.fc), 2), f(mean(a.final), 2), `${f(mean(a.wins) * 100, 1)}%`, f(mean(a.lc), 2), f(mean(a.tries), 3), f(mean(a.blocked), 2), f(mean(a.yields), 3)];
    }),
  ),
);
out();
const odd = (pick: (a: (typeof acc)[number]) => number[]) => mean(acc.filter((_, pos) => pos % 2 === 0 && pos > 1).flatMap(pick));
const even = (pick: (a: (typeof acc)[number]) => number[]) => mean(acc.filter((_, pos) => pos % 2 === 1 && pos > 1).flatMap(pick));
// 홀짝 지수: 뒤 자리일수록 되찾음이 커지는 추세를 빼려고, 짝수 자리 4 · 6 · 8의 값에서 양옆 홀수 자리 평균을 뺀 값의 평균 (+ = 짝수 자리가 유리)
const parity = (pick: (a: (typeof acc)[number]) => number[]) => mean([3, 5, 7].map((pos) => mean(pick(acc[pos])) - (mean(pick(acc[pos - 1])) + mean(pick(acc[pos + 1]))) / 2));
out(`**홀짝 지수** (짝수 자리 4·6·8 − 양옆 홀수 자리 평균): 최종 되찾음 **${f(parity((a) => a.final), 2)}**, 첫 코너까지 ${f(parity((a) => a.fc), 2)}, 첫 코너 OT-7 양보 ${f(parity((a) => a.yields), 3)}, 1위 비율(자리 1 − 자리 2) ${f((mean(acc[0].wins) - mean(acc[1].wins)) * 100, 1)}%p`);
out();
out(
  `요약 (자리 3~10 단순 평균, 짝수 자리가 평균 1자리 뒤라 추세가 섞임): 최종 되찾음 홀수 ${f(odd((a) => a.final), 2)} / 짝수 ${f(even((a) => a.final), 2)} (차 ${f(even((a) => a.final) - odd((a) => a.final), 2)}), ` +
    `첫 코너까지 홀수 ${f(odd((a) => a.fc), 2)} / 짝수 ${f(even((a) => a.fc), 2)}, ` +
    `OT-7 양보 홀수 ${f(odd((a) => a.yields), 3)} / 짝수 ${f(even((a) => a.yields), 3)}, 막힘 홀수 ${f(odd((a) => a.blocked), 2)} / 짝수 ${f(even((a) => a.blocked), 2)} s`,
);
out();
out(`<!-- 줄 간격 참고: 같은 열 앞뒤 간격 = ${GRID_ROW_GAP} − 차 길이 ${CAR_LENGTH} = ${GRID_ROW_GAP - CAR_LENGTH} u -->`);
printStuck();
