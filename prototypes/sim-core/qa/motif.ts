// 모티브 트랙 3종 × 축소안 3종 다시 재기와 차 · 레이서 비중 (지시서 2026-11-02).
// 트랙 = PROTO_TRACKS_MOTIF_DRAFT.md §7 × §8.1 ρ, 부스트 구간 = PROTO_TRACKS_DIRECTION_BOOST_DRAFT.md §4 Z1. 계수는 바꾸지 않는다.
// node qa/motif.ts <tracks|race:LA|race:LB|race:LC|yield|share> > <파일>.md (부분마다 따로 돌려 이어 붙인다)
import { EXIT_LIMIT_RELAX, MOTIF_ALL, PASS_CAUSE_ORDER, QA_CONFIRM_SEEDS, YIELD_MIN_COMPARE } from '../src/config.ts';
import { buildCourse, carParams, runSolo, at } from '../src/physics.ts';
import { checkTrack } from '../src/trackCheck.ts';
import type { CarStats, Entry, RaceOptions, Track } from '../src/types.ts';
import { BASE, CARS, f, lapGains, layer2, load, mean, measureLap, origRun, out, printStuck, RACERS, registerTrack, STAT_KO, STATS, STUCK, table, testCar, tryRace } from './lib.ts';

const SCALES = { LA: 'L-A (ρ 1.2)', LB: 'L-B (ρ 1.8)', LC: 'L-C (ρ 2.5)' } as const;
type Scale = keyof typeof SCALES;
const MOTIFS = ['M1', 'M2', 'M3'];
const trackOf = (m: string, sc: Scale): Track => load(`../data/tracks/motif/${m}-${sc}.json`);
const ALL = MOTIFS.flatMap((m) => (Object.keys(SCALES) as Scale[]).map((sc) => trackOf(m, sc)));
ALL.forEach(registerTrack);
const SEEDS = QA_CONFIRM_SEEDS;
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...MOTIF_ALL };
// 손계산 1랩 steady · 3랩 합계 (PROTO_TRACKS_MOTIF_DRAFT.md:470-478, F7 k = 0)
const HAND: Record<string, [number, number]> = {
  'M1-LA': [12.96, 39.82], 'M1-LB': [18.57, 56.63], 'M1-LC': [25.04, 76.07],
  'M2-LA': [13.03, 40.18], 'M2-LB': [18.71, 57.27], 'M2-LC': [25.14, 76.56],
  'M3-LA': [12.1, 37.37], 'M3-LB': [17.48, 53.56], 'M3-LC': [23.75, 72.35],
};
const CAUSE_KO: Record<string, string> = { contact: '접촉', mistake: '상대 실수', boost: '부스트', brake: '제동', corner: '코너', exit: '탈출', straight: '직선' };
const sumRec = (rs: Record<string, number>[]) =>
  rs.reduce<Record<string, number>>((a, r) => {
    for (const [k, v] of Object.entries(r)) a[k] = (a[k] ?? 0) + v;
    return a;
  }, {});
const solo3 = (t: Track, k: number) => {
  const c = buildCourse(t.segments, true);
  return at(runSolo(c, carParams(BASE), k, { x0: 0, v0: 0, xEnd: 3 * c.length + 1 }), 3 * c.length, 't');
};
const part = process.argv[2] ?? 'tracks';

if (part === 'tracks') {
  out('# 모티브 트랙 9개: 코너 검사 · 1바퀴 · 능력치 단축률');
  out();
  out('트랙 = MOTIF 초안 §7 표 × 축소안 ρ (S 1.00), `data/tracks/motif/`. 기준 차 5/5/5/5 단독. 정식 검사는 F7 k = 0(MOTIF R-3), 시뮬레이터는 k = 0.2(`EXIT_LIMIT_RELAX`)로 달린다.');
  out();
  out('## 코너 검사 (CAR §4.3 (a)(b)(c) + 형식, bend 상한은 MOTIF 범위 1.5)');
  out();
  out(table(['트랙', 'k = 0 (정식)', 'k = 0.2 (시뮬레이터)'], ALL.map((t) => [t.id, checkTrack(t, 0).errors.join('; ') || '통과', checkTrack(t, EXIT_LIMIT_RELAX).errors.join('; ') || '통과'])));
  out();
  out('## 1바퀴와 3랩 (기준 차 단독, 초)');
  out();
  out('1바퀴 = 단독 2랩째. 3랩 = 정지 출발 단독 3랩. 손계산 = MOTIF §8.3(k = 0).');
  out();
  out(
    table(
      ['트랙', '손계산 1랩', '실측 1랩 k0', '차이', '실측 1랩 k0.2', '차이', '손계산 3랩', '실측 3랩 k0', '실측 3랩 k0.2'],
      ALL.map((t) => {
        const [h1, h3] = HAND[t.id];
        const l0 = measureLap(t, carParams(BASE), 0).lapTime;
        const l2 = measureLap(t, carParams(BASE), EXIT_LIMIT_RELAX).lapTime;
        const d = (x: number) => `${x - h1 >= 0 ? '+' : ''}${f(x - h1, 3)} (${f(((x - h1) / h1) * 100, 1)}%)`;
        return [t.id, f(h1, 2), f(l0, 3), d(l0), f(l2, 3), d(l2), f(h3, 2), f(solo3(t, 0), 2), f(solo3(t, EXIT_LIMIT_RELAX), 2)];
      }),
    ),
  );
  out();
  out('## 1바퀴 단축률 E(+1)와 가속 R, 제동 R (단독 2랩째, k 0.2)');
  out();
  out('R = E_능력치 / 나머지 세 능력치 E 평균 (INT §4.7 가속 R과 같은 식). 합격 범위 0.75~1.33은 가속 R 기준(`config.ts`), 제동 R은 참고.');
  out();
  const gainRow = (name: string, ts: Track[]) => {
    const g = lapGains(ts);
    return [name, ...STATS.map((s) => `${f(g.E[s] * 100, 3)}%`), f(g.R, 2), f(g.Rbrake, 2)];
  };
  const head = ['트랙', ...STATS.map((s) => `E ${STAT_KO[s]}`), '가속 R', '제동 R'];
  out(table(head, [...(Object.keys(SCALES) as Scale[]).map((sc) => gainRow(`${SCALES[sc]} 3트랙 평균`, MOTIFS.map((m) => trackOf(m, sc)))), ...ALL.map((t) => gainRow(t.id, [t]))]));
}

if (part.startsWith('race:')) {
  const sc = part.slice(5) as Scale;
  const ts = MOTIFS.map((m) => trackOf(m, sc));
  const l2 = layer2(ts, SEEDS, FINAL);
  const o = l2.orig;
  const causes = sumRec(o.map((r) => r.passCauses));
  const passes = Object.values(causes).reduce((a, b) => a + b, 0);
  const g = lapGains(ts);
  out(`# ${SCALES[sc]}: 10대 레이스 (MOTIF_ALL = OT_FLOW_ALL + CT_ALL + 부스트 구간 b 4%, R0, SS-1)`);
  out();
  out(`트랙 ${ts.map((t) => t.id).join(', ')}, 3랩, 테스트 기준 차 + F-2 9대, 확인용 시드 ${SEEDS[0]}~${SEEDS.at(-1)} × 3트랙 = ${o.length}레이스(멈춘 레이스가 있는 시드는 뺌). 값은 레이스당(10대 합).`);
  out();
  out('## 요약');
  out();
  out(
    table(
      ['항목', '값'],
      [
        ['경기 길이 1위 / 마지막 (초)', `${f(mean(o.map((r) => r.firstSeconds)), 2)} / ${f(mean(o.map((r) => r.ticks * 0.05)), 2)}`],
        ...STATS.map((s, i) => [`${STAT_KO[s]} Δ1 / Δ2 · 2층`, `${f(l2.perStat[i].d1, 2)} / ${f(l2.perStat[i].d2, 2)} · ${l2.perStat[i].verdict}`]),
        ['퍼짐 sd', f(l2.spread, 2)],
        ['가속 R / 제동 R (단독)', `${f(g.R, 2)} / ${f(g.Rbrake, 2)}`],
        ['추월(OT-4) / 그중 S1 시도 중 / S1 성공', `${f(mean(o.map((r) => r.overtakes)), 2)} / ${f(mean(o.map((r) => r.overtakesS1)), 2)} / ${f(mean(o.map((r) => r.s1)), 2)}`],
        ['추월 시도', f(mean(o.map((r) => r.tries)), 2)],
        ['원인 분포', PASS_CAUSE_ORDER.map((c) => `${CAUSE_KO[c]} ${passes ? f(((causes[c] ?? 0) / passes) * 100, 1) : '–'}%`).join(', ')],
        ['접촉 / 막힘 비율', `${f(mean(o.map((r) => r.contacts)), 2)} / ${f(mean(o.map((r) => r.blockRatio)) * 100, 1)}%`],
      ],
    ),
  );
  out();
  out('## 직선별 추월 (레이스당, 그 트랙 50레이스 평균)');
  out();
  out('직선 시간 = 기준 차 단독 2랩째 그 직선 통과 시간(k 0.2). S1 성공 = 정식 시도 성공 판정(종류 7)이 난 구간. ★ = 부스트 구간(Z1).');
  out();
  const rows: (string | number)[][] = [];
  for (const t of ts) {
    const runs = SEEDS.map((s) => origRun(FINAL, t, s)).filter((r) => r !== null); // layer2가 돌린 원본 레이스 (캐시)
    const per = (k: 'overtakeSegs' | 'overtakeSegsS1' | 's1Segs', id: string) => f(mean(runs.map((r) => r[k].filter((x) => x === id).length)), 2);
    const m = measureLap(t, carParams(BASE), EXIT_LIMIT_RELAX);
    for (const sg of t.segments.filter((x) => x.kind === 'straight'))
      rows.push([`${sg.id}${t.boostZone === sg.id ? ' ★' : ''}`, t.id, sg.length, f(m.straights.get(sg.id)!.time, 2), per('s1Segs', sg.id), per('overtakeSegs', sg.id), per('overtakeSegsS1', sg.id)]);
    const corners = t.segments.filter((x) => x.kind === 'corner').map((x) => x.id);
    const cnt = (k: 'overtakeSegs' | 's1Segs') => f(mean(runs.map((r) => r[k].filter((x) => corners.includes(x)).length)), 2);
    rows.push(['코너 합', t.id, '–', '–', cnt('s1Segs'), cnt('overtakeSegs'), '–']);
  }
  out(table(['직선', '트랙', '길이 (u)', '직선 시간 (s)', 'S1 성공', '추월(OT-4)', '그중 S1 시도 중'], rows));
  printStuck();
}

if (part === 'yield') {
  out('# 양보 하한별 멈춘 레이스 (L-B 3트랙, MOTIF_ALL, 확인용 시드)');
  out();
  out('테스트 차 = 기준 차 × 레이서 A · B · C · NPC 4가지, 3트랙 × 50시드 = 하한마다 600레이스. 멈춘 레이스는 고치지 않고 기록만 한다.');
  out();
  const ts = MOTIFS.map((m) => trackOf(m, 'LB'));
  const tests = RACERS.map((r) => testCar(BASE, r));
  const rows = YIELD_MIN_COMPARE.map((y) => {
    const before = STUCK.length;
    const rs = ts.flatMap((t) => SEEDS.flatMap((s) => tests.map((e) => tryRace(t, s, e, { ...FINAL, yieldMinRatio: y })))).filter((r) => r !== null);
    return [`${y * 100}%`, rs.length + STUCK.length - before, STUCK.length - before, f(mean(rs.map((r) => r.events.filter((e) => e.kind === 3).length)), 2)];
  });
  out(table(['양보 하한', '레이스', '멈춘 레이스', '추월(OT-4) 평균'], rows));
  printStuck();
}

if (part === 'share') {
  // 차 5종 × 레이서 5명, 각 조합을 테스트 차로 L-B 3트랙 × 확인용 50시드
  const toStats = (a: number[]): CarStats => ({ topSpeed: a[0], accel: a[1], grip: a[2], brake: a[3] });
  const car = (id: string) => CARS.find((c) => c.id === id)!.stats;
  const CAR_SET: [string, CarStats][] = [
    ['base 5/5/5/5', car('base')],
    ['X 7/5/4/4', car('X')],
    ['Y 4/4/6/6', car('Y')],
    ['접지 위주 4/4/7/5', toStats([4, 4, 7, 5])],
    ['제동 위주 4/4/5/7', toStats([4, 4, 5, 7])],
  ];
  // 고른형 5/5/5 + 패시브 없음은 NPC와 같으므로 지시서대로 6/5/4, 패시브 없음
  const RACER_SET: Entry['racer'][] = [...RACERS, { id: '고른형', stats: { overtake: 6, control: 5, focus: 4 }, passiveId: null }];
  const ts = MOTIFS.map((m) => trackOf(m, 'LB'));
  const blocks = ts.flatMap((t) => SEEDS.map((s) => ({ t, s })));
  const rank = RACER_SET.map(() => CAR_SET.map(() => [] as (number | null)[]));
  RACER_SET.forEach((rc, j) =>
    CAR_SET.forEach(([, cs], i) => {
      rank[j][i] = blocks.map(({ t, s }) => {
        const r = tryRace(t, s, testCar(cs, rc), FINAL);
        return r ? r.finishOrder.indexOf(0) + 1 : null;
      });
    }),
  );
  // 하나라도 멈춘 (트랙, 시드)는 모든 조합에서 빼서 균형을 맞춘다
  const keep = blocks.map((_, k) => rank.every((row) => row.every((cell) => cell[k] !== null)));
  const x = (j: number, i: number) => rank[j][i].filter((_, k) => keep[k]) as number[];
  const I = CAR_SET.length;
  const J = RACER_SET.length;
  const n = keep.filter(Boolean).length;
  const cell = RACER_SET.map((_, j) => CAR_SET.map((_, i) => mean(x(j, i))));
  const mu = mean(cell.flat());
  const a = CAR_SET.map((_, i) => mean(cell.map((r) => r[i])));
  const b = cell.map((r) => mean(r));
  const ssCar = n * J * a.reduce((s, v) => s + (v - mu) ** 2, 0);
  const ssRacer = n * I * b.reduce((s, v) => s + (v - mu) ** 2, 0);
  let ssInt = 0;
  let ssTotal = 0;
  for (let j = 0; j < J; j++)
    for (let i = 0; i < I; i++) {
      ssInt += n * (cell[j][i] - a[i] - b[j] + mu) ** 2;
      for (const v of x(j, i)) ssTotal += (v - mu) ** 2;
    }
  // 같은 (트랙, 시드)를 모든 조합이 쓰므로 그 블록 몫도 따로 적는다
  const keptIdx = blocks.map((_, k) => k).filter((k) => keep[k]);
  const blockMean = keptIdx.map((k) => mean(RACER_SET.flatMap((_, j) => CAR_SET.map((_, i) => rank[j][i][k] as number))));
  const ssBlock = I * J * blockMean.reduce((s, v) => s + (v - mu) ** 2, 0);
  const ssErr = ssTotal - ssCar - ssRacer - ssInt - ssBlock;
  const pc = (v: number) => `${f((v / ssTotal) * 100, 2)}%`;

  out('# 차와 레이서 비중 (L-B 3트랙, MOTIF_ALL, 확인용 시드)');
  out();
  out(`차 5종 × 레이서 5명 = 25조합. 조합마다 테스트 차 1대 + F-2 상대 9대, 3트랙 × 50시드 = ${blocks.length}레이스(멈춘 블록을 빼고 조합당 ${n}레이스). 값은 테스트 차의 평균 순위(1이 1위).`);
  out();
  out('## 조합별 평균 순위');
  out();
  out(table(['레이서 \\ 차', ...CAR_SET.map(([nm]) => nm), '레이서 평균'], [...RACER_SET.map((rc, j) => [`${rc.id} ${rc.stats.overtake}/${rc.stats.control}/${rc.stats.focus}${rc.passiveId ? ` (${rc.passiveId})` : ''}`, ...cell[j].map((v) => f(v, 2)), f(b[j], 2)]), ['차 평균', ...a.map((v) => f(v, 2)), f(mu, 2)]]));
  out();
  out('## 순위 분산 나누기 (두 요인 분산 분석, 균형 설계)');
  out();
  out(
    table(
      ['몫', '제곱합', '전체 대비'],
      [
        ['차 주효과', f(ssCar, 1), pc(ssCar)],
        ['레이서 주효과', f(ssRacer, 1), pc(ssRacer)],
        ['차 × 레이서 상호작용', f(ssInt, 1), pc(ssInt)],
        ['(트랙, 시드) 블록', f(ssBlock, 1), pc(ssBlock)],
        ['나머지 (레이스 안 변동)', f(ssErr, 1), pc(ssErr)],
        ['전체', f(ssTotal, 1), '100%'],
      ],
    ),
  );
  out();
  out(`**차 : 레이서 = ${f((ssCar / (ssCar + ssRacer)) * 100, 0)} : ${f((ssRacer / (ssCar + ssRacer)) * 100, 0)}** (주효과 둘만 놓고 나눈 비율. 상호작용은 전체 대비 ${pc(ssInt)}, 주효과 합 대비 ${f((ssInt / (ssCar + ssRacer)) * 100, 1)}%)`);
  printStuck();
}
