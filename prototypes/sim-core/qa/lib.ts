// QA 공용 함수 (qa/run.ts, qa/straights.ts가 같이 쓴다)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  BASE_CAR_STAT,
  EXIT_LIMIT_RELAX,
  L2_OPPONENTS,
  L2_SATURATION_MEAN,
  L2_SATURATION_TOP,
  L2_SPREAD_MIN,
  M18_BLOCK_RATIO,
  M18_CONTACTS,
  M18_OVERTAKE_RACE_SHARE,
  QA_DELTA,
} from '../src/config.ts';
import { at, buildCourse, carParams, runSolo, type CarParams } from '../src/physics.ts';
import { simulate } from '../src/sim.ts';
import type { CarStats, Entry, RaceOptions, Track } from '../src/types.ts';

export const load = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
export const TRACKS: Track[] = ['T1', 'T2', 'T3'].map((t) => load(`../data/tracks/${t}.json`));
export const CARS: { id: string; stats: CarStats }[] = load('../data/cars.json').cars;
export const RACERS: Entry['racer'][] = load('../data/racers.json').racers;
export const STATS: (keyof CarStats)[] = ['topSpeed', 'accel', 'grip', 'brake'];
export const STAT_KO: Record<keyof CarStats, string> = { topSpeed: '최고속도', accel: '가속력', grip: '접지력', brake: '제동력' };
export const BASE: CarStats = { topSpeed: BASE_CAR_STAT, accel: BASE_CAR_STAT, grip: BASE_CAR_STAT, brake: BASE_CAR_STAT };
export const EPS = 1e-6;

export const f = (v: number | null | undefined, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v.toFixed(d));
export const pct = (v: number | null) => (v === null ? '해당 없음' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`);
export const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
export const out = (s = '') => process.stdout.write(s + '\n');
export const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
export const sd = (a: number[]) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
export const listHash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

// ---------- 기준 차 단독 2랩 실측 (M-16) ----------

export type Measured = {
  corners: Map<string, { vEntry: number; vApex: number; vExit: number; vMax: number }>;
  straights: Map<string, { vStart: number; vS: number; D: number; reachTop: boolean; time: number }>;
  lapTime: number;
};

export function measureLap(track: Track, p: CarParams, k: number): Measured {
  const c = buildCourse(track.segments, true);
  const L = c.length;
  const tr = runSolo(c, p, k, { x0: 0, v0: 0, xEnd: 2 * L + 1 });
  const corners: Measured['corners'] = new Map();
  const straights: Measured['straights'] = new Map();
  for (const s of c.segs) {
    const idx = tr.x.map((x, i) => i).filter((i) => tr.x[i] >= L + s.start && tr.x[i] < L + s.end);
    const vMax = Math.max(...idx.map((i) => tr.v[i]));
    if (s.kind === 'corner') {
      corners.set(s.id, { vEntry: at(tr, L + s.start, 'v'), vApex: at(tr, L + s.apex, 'v'), vExit: at(tr, L + s.end, 'v'), vMax });
    } else {
      // 제동 시작점 = 최고 속도의 마지막 지점. 그 뒤로 속도가 줄어야 제동으로 본다
      let iMax = idx[0];
      for (const i of idx) if (tr.v[i] >= vMax - EPS) iMax = i;
      const braked = tr.v[idx[idx.length - 1]] < vMax - EPS;
      const D = braked ? L + s.end - tr.x[iMax] : 0;
      const time = at(tr, L + s.end, 't') - at(tr, L + s.start, 't');
      straights.set(s.id, { vStart: at(tr, L + s.start, 'v'), vS: vMax, D, reachTop: vMax >= p.vTop - EPS, time });
    }
  }
  return { corners, straights, lapTime: at(tr, 2 * L, 't') - at(tr, L, 't') };
}

// 능력치 +Δ의 1바퀴 단축률 E (트랙 평균)와 가속 R (INT §4.7, AG-P029 A)
export function lapGains(tracks: Track[], formula: 'current' | 'AC1' = 'current', k = EXIT_LIMIT_RELAX) {
  const lap = (stats: CarStats) => tracks.map((t) => measureLap(t, carParams(stats, formula), k).lapTime);
  const base = lap(BASE);
  const E = Object.fromEntries(
    STATS.map((s) => {
      const plus = lap({ ...BASE, [s]: BASE[s] + QA_DELTA });
      return [s, mean(base.map((b, i) => (b - plus[i]) / b))];
    }),
  ) as Record<keyof CarStats, number>;
  const others = (s: keyof CarStats) => mean(STATS.filter((x) => x !== s).map((x) => E[x]));
  const ratio = (s: keyof CarStats) => (others(s) > 0 ? E[s] / others(s) : NaN);
  return { base, E, R: ratio('accel'), Rbrake: ratio('brake') };
}

// ---------- 10대 레이스 (테스트 차 1대 + F-2 상대 9대, INT §9.2) ----------

// 사건 구간 id → 직선/코너 (OT-4 원인, 접촉 위치 분류)
const segKinds = new Map<string, string>();
const segKind = (trackId: string, id: string) => segKinds.get(`${trackId}|${id}`) ?? '?';
export const registerTrack = (t: Track) => t.segments.forEach((sg) => segKinds.set(`${t.id}|${sg.id}`, sg.kind === 'corner' ? '코너' : '직선'));
TRACKS.forEach(registerTrack);

export const NPC = { overtake: 5, control: 5, focus: 5 }; // 상대 레이서 고정 프로필 (RACER_STATS_PASSIVES_DRAFT.md:269 가안, 패시브 없음)
const toStats = (a: number[]): CarStats => ({ topSpeed: a[0], accel: a[1], grip: a[2], brake: a[3] });
const opponents = (): Entry[] =>
  L2_OPPONENTS.map((o, i) => ({ racer: { id: `npc-${i + 1}`, stats: NPC, passiveId: null }, car: { id: `O${i + 1}`, stats: toStats(o) } }));
export const race = (track: Track, seed: number, test: Entry, opts: Partial<RaceOptions>) =>
  simulate({ seed, track, laps: 3, entries: [test, ...opponents()] }, { k: EXIT_LIMIT_RELAX, ...opts });
export const testCar = (stats: CarStats, racer: Entry['racer'] = { id: 'test', stats: NPC, passiveId: null }): Entry => ({
  racer,
  car: { id: 'test', stats },
});

// overtakes = 추월 사건(종류 3) 수. OT-4 이후 종류 3은 '앞뒤가 바뀌어 1초 유지'된 기록이고, 정식 시도 S1 성공은 s1에 따로 센다
export type RaceSummary = {
  rank: number;
  blockRatio: number;
  overtakes: number;
  overtakesS1: number;
  s1: number;
  tries: number;
  aborts: number;
  contacts: number;
  contactKinds: Record<string, number>;
  contactBasis: Record<string, number>; // CT-4 원인 기준 (mistake · lane · rear · none)
  passCauses: Record<string, number>;
  ticks: number;
  overtakeSegs: string[];
};
const countBy = (keys: string[]) => keys.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {});
export const summarize = (r: ReturnType<typeof simulate>): RaceSummary => ({
  rank: r.finishOrder.indexOf(0) + 1,
  blockRatio: r.carStats.reduce((a, c) => a + c.blockedTicks, 0) / r.carStats.reduce((a, c) => a + c.racingTicks, 0),
  overtakes: r.events.filter((e) => e.kind === 3).length,
  overtakesS1: r.events.filter((e) => e.kind === 3 && e.cause?.includes(':S1:')).length,
  s1: r.carStats.reduce((a, c) => a + c.successes, 0),
  passCauses: countBy(r.events.filter((e) => e.kind === 3).map((e) => e.cause!.split(':')[0])),
  contactBasis: countBy(r.events.filter((e) => e.kind === 4).map((e) => e.cause!.split(':')[1] ?? '?')),
  contactKinds: countBy(r.events.filter((e) => e.kind === 4).map((e) => `${e.cause!.split(':')[0]}:${segKind(r.header.trackId, e.segment)}`)),
  tries: r.carStats.reduce((a, c) => a + c.tries, 0),
  aborts: r.judgements.filter((j) => j.kind === 3).length, // 목표 차선 창에 차가 들어와 되돌아옴
  contacts: r.carStats.reduce((a, c) => a + c.contacts, 0) / 2,
  ticks: r.ticks,
  overtakeSegs: r.events.filter((e) => e.kind === 3).map((e) => e.segment),
});
const origCache = new Map<string, RaceSummary>();
export const origRun = (opts: Partial<RaceOptions>, track: Track, seed: number) => {
  const key = `${JSON.stringify(opts)}|${track.id}|${seed}`;
  if (!origCache.has(key)) origCache.set(key, summarize(race(track, seed, testCar(BASE), opts)));
  return origCache.get(key)!;
};

// 2층 재정의 다섯 지표 (INT §9.2, M-17 · M-18)
export function layer2(tracks: Track[], seeds: number[], opts: Partial<RaceOptions>) {
  const orig: RaceSummary[] = [];
  let controlDiff = 0;
  for (const t of tracks)
    for (const s of seeds) {
      const o = origRun(opts, t, s);
      orig.push(o);
      if (summarize(race(t, s, testCar(BASE), opts)).rank !== o.rank) controlDiff++; // 대조군: 원본을 한 번 더
    }
  const m18 = {
    block: mean(orig.map((r) => r.blockRatio)),
    overtakeShare: mean(orig.map((r) => (r.overtakes > 0 ? 1 : 0))),
    contacts: orig.reduce((a, r) => a + r.contacts, 0),
  };
  const m18Fails = [
    m18.block < M18_BLOCK_RATIO && '막힘',
    m18.overtakeShare < M18_OVERTAKE_RACE_SHARE && '추월',
    m18.contacts < M18_CONTACTS && '접촉',
  ].filter(Boolean);
  const spread = sd(orig.map((r) => r.rank));
  const perStat = STATS.map((stat) => {
    const ranks = (d: number) =>
      tracks.flatMap((t) => seeds.map((s) => summarize(race(t, s, testCar({ ...BASE, [stat]: BASE[stat] + d }), opts)).rank));
    const r1 = ranks(1);
    const r2 = ranks(2);
    const d1 = mean(orig.map((o, i) => o.rank - r1[i]));
    const d2 = mean(orig.map((o, i) => o.rank - r2[i]));
    const top1 = mean(r1.map((r) => (r === 1 ? 1 : 0)));
    const fails = [
      !(d2 >= d1 && d1 > 0) && '단조성',
      spread < L2_SPREAD_MIN && '퍼짐',
      !(top1 <= L2_SATURATION_TOP && mean(r1) >= L2_SATURATION_MEAN) && '포화',
      m18Fails.length && `상호작용(${m18Fails.join('·')})`,
    ].filter(Boolean);
    const verdict = controlDiff ? '무효(대조군)' : fails.length ? `판별 불가: ${fails.join(', ')}` : '통과';
    return { stat, d1, d2, top1, meanR1: mean(r1), verdict };
  });
  return { controlDiff, n: orig.length, spread, m18, perStat, orig };
}
