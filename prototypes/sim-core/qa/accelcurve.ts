// 가속 곡선 단독 측정 (AG-P046 A, 스위치 기본 끔). a(v) = A × (1 − c × (v / V_top)²), c = 0.5 · 0.7 · 0.9만 (지시서 허용 값).
// 능력치 1점 비율 4%, 제동 공식은 그대로. 단독 주행만 (시드 무관). 기준 L-B 3트랙, L-A · L-C는 참고. c는 고르지 않는다.
// node qa/accelcurve.ts > qa/results/<파일>.md
import { ACCEL_DRAG_STEPS, CAR_STAT_MAX, EXIT_LIMIT_RELAX } from '../src/config.ts';
import { accelAt, at, buildCourse, carParams, DT, NO_TUNE, runSolo, type StatTune } from '../src/physics.ts';
import { checkTrack } from '../src/trackCheck.ts';
import type { CarStats, Track } from '../src/types.ts';
import { BASE, f, lapGains, load, mean, measureLap, out, STAT_KO, STATS, table } from './lib.ts';

const K = EXIT_LIMIT_RELAX;
const SC = ['LA', 'LB', 'LC'] as const;
const SC_KO = { LA: 'L-A', LB: 'L-B', LC: 'L-C' };
const tracksOf = (sc: string): Track[] => ['M1', 'M2', 'M3'].map((m) => load(`../data/tracks/motif/${m}-${sc}.json`));
const ALL = SC.flatMap((sc) => tracksOf(sc));
const LB = tracksOf('LB');
const ROWS: [string, StatTune][] = [['현행 (c 0)', NO_TUNE], ...ACCEL_DRAG_STEPS.map((c): [string, StatTune] => [`c ${c}`, { ...NO_TUNE, accelDrag: c }])];
const inR = (r: number) => r >= 0.75 && r <= 1.33;

out('# 가속 곡선 단독 측정 (AG-P046 A)');
out();
out(`a(v) = A × (1 − c × (v / V_top)²), c = ${ACCEL_DRAG_STEPS.join(' · ')} (허용 값만). 1점 비율 4%, 제동 그대로. 기준 차 단독, k ${K}. 가속 R = E 가속 / 나머지 세 E 평균 (목표 0.75~1.33, 맞추려고 c를 더 바꾸지 않는다).`);
out();
out('## E(+1)와 가속 R');
out();
const eRow = (name: string, ts: Track[], t: StatTune) => {
  const g = lapGains(ts, 'current', K, t);
  return [name, ...STATS.map((s) => `${f(g.E[s] * 100, 3)}%`), f(g.R, 2), inR(g.R) ? '안' : '밖', f(g.Rbrake, 2)];
};
const eHead = ['트랙', ...STATS.map((s) => `E ${STAT_KO[s]}`), '가속 R', '목표', '제동 R (참고)'];
out(table(['설정', ...eHead.slice(1)], ROWS.map(([n, t]) => eRow(`${n} · L-B 평균`, LB, t))));
out();
for (const [n, t] of ROWS) {
  out(`### ${n}: 트랙별 · 축소안별`);
  out();
  out(table(eHead, [...SC.map((sc) => eRow(`${SC_KO[sc]} 3트랙 평균`, tracksOf(sc), t)), ...ALL.map((tr) => eRow(tr.id, [tr], t))]));
  out();
}

out('## 실제 느낌 숫자: 가속 0점 · 5점 · 10점 차의 0 → V_top (나머지 능력치 5)');
out();
out(`시뮬레이터와 같은 적분(물리 스텝 ${DT} s). V_top 125. 가속 곡선은 V_top 근처에서 A × (1 − c)까지 줄어든다.`);
out();
const reach = (p: ReturnType<typeof carParams>, target: number) => {
  let v = 0;
  let x = 0;
  let t = 0;
  while (v < target - 1e-9) {
    v = Math.min(p.vTop, v + accelAt(p, v) * DT);
    x += v * DT;
    t += DT;
  }
  return { t, x };
};
out(
  table(
    ['설정', ...[0, 5, 10].map((a) => `가속 ${a}점: A / V_top 근처 a · 0→100 s · 0→125 s, u`)],
    ROWS.map(([n, t]) => [
      n,
      ...[0, 5, 10].map((a) => {
        const p = carParams({ ...BASE, accel: a }, 'current', t);
        const r100 = reach(p, 100);
        const rTop = reach(p, p.vTop);
        return `${f(p.A, 1)} / ${f(accelAt(p, p.vTop), 1)} · ${f(r100.t, 2)} · ${f(rTop.t, 2)}, ${f(rTop.x, 0)}`;
      }),
    ]),
  ),
);
out();
out('제동(현행 그대로): a_brk 75, 125 → 50 1.00 s · 88 u.');
out();

out('## 1랩과 3랩 (기준 차 단독, 초)');
out();
const solo3 = (tr: Track, t: StatTune) => {
  const c = buildCourse(tr.segments, true);
  return at(runSolo(c, carParams(BASE, 'current', t), K, { x0: 0, v0: 0, xEnd: 3 * c.length + 1 }), 3 * c.length, 't');
};
const lap = (tr: Track, t: StatTune) => measureLap(tr, carParams(BASE, 'current', t), K).lapTime;
out(
  table(
    ['트랙', ...ROWS.map(([n]) => `${n} 1랩 / 3랩`)],
    ALL.map((tr) => [
      tr.id,
      ...ROWS.map(([, t]) => {
        const l = lap(tr, t);
        const l0 = lap(tr, NO_TUNE);
        return `${f(l, 2)} / ${f(solo3(tr, t), 2)}${t === NO_TUNE ? '' : ` (1랩 +${f(((l - l0) / l0) * 100, 1)}%)`}`;
      }),
    ]),
  ),
);
out();

out('## 코너 검사 9트랙');
out();
out(
  table(
    ['설정', '실패 (k 0.2, 시뮬레이터)', '실패 (k 0, 정식)'],
    ROWS.map(([n, t]) => {
      const p = carParams(BASE, 'current', t);
      const fail = (k: number) => ALL.map((tr) => [tr.id, checkTrack(tr, k, p).errors] as const).filter(([, e]) => e.length).map(([id, e]) => `${id}: ${e.join('; ')}`).join('<br>') || '없음';
      return [n, fail(K), fail(0)];
    }),
  ),
);
out();

out('## 능력치 구간별 1점 효과 E (나머지 세 능력치 5, L-B 3트랙 평균, 괄호 = 5→6 대비)');
out();
const STEPS = [3, 5, 7, 9].filter((a) => a + 1 <= CAR_STAT_MAX);
for (const [n, t] of ROWS) {
  const lapAvg = (s: CarStats) => mean(LB.map((tr) => measureLap(tr, carParams(s, 'current', t), K).lapTime));
  out(`### ${n}`);
  out();
  out(
    table(
      ['능력치', ...STEPS.map((a) => `${a}→${a + 1}`)],
      STATS.map((stat) => {
        const e = STEPS.map((a) => {
          const lo = lapAvg({ ...BASE, [stat]: a });
          return (lo - lapAvg({ ...BASE, [stat]: a + 1 })) / lo;
        });
        const e56 = e[STEPS.indexOf(5)];
        return [STAT_KO[stat], ...e.map((x) => `${f(x * 100, 3)}% (${f(x / e56, 2)})`)];
      }),
    ),
  );
  out();
}
