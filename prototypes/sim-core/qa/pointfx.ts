// 능력치 1점 효과 맞추기 (측정만, 기본값은 그대로) · 능력치 구간별 1점 효과 · 출발 자리 영향 (지시서 2026-11-02).
// 방법은 모두 스위치(carParams tune, RaceOptions accelPoint · brakePoint · abScale). 최고속도 · 접지 계수, 트랙, 레이서 계수는 그대로.
// 값 고르기는 단독 주행(시드 무관) L-B 3트랙 평균에서만 한다. 10대 레이스는 조정용 시드로 확인, 2층 판정은 확인용 시드.
// node qa/pointfx.ts <solo|race:<off|P1|P2|P3>:<adjust|confirm>|grid> > <파일>.md
import { AB_SCALE_STEPS, CAR_STAT_MAX, EXIT_LIMIT_RELAX, MOTIF_ALL, PASS_CAUSE_ORDER, QA_ADJUST_SEEDS, QA_CONFIRM_SEEDS, TICK_SECONDS } from '../src/config.ts';
import { buildCourse, carParams, NO_TUNE, runSolo, at, type StatTune } from '../src/physics.ts';
import { checkTrack } from '../src/trackCheck.ts';
import type { CarStats, RaceOptions, Track } from '../src/types.ts';
import { BASE, CARS, f, lapGains, layer2, load, mean, measureLap, out, printStuck, registerTrack, STAT_KO, STATS, table, testCar, tryRace } from './lib.ts';

const SC = ['LA', 'LB', 'LC'] as const;
const SC_KO = { LA: 'L-A', LB: 'L-B', LC: 'L-C' };
const MOTIFS = ['M1', 'M2', 'M3'];
const trackOf = (m: string, sc: string): Track => load(`../data/tracks/motif/${m}-${sc}.json`);
const tracksOf = (sc: string) => MOTIFS.map((m) => trackOf(m, sc));
const ALL = SC.flatMap((sc) => tracksOf(sc));
ALL.forEach(registerTrack);
const LB = tracksOf('LB');
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...MOTIF_ALL };
const R_LO = 0.75; // 목표 범위 (INT §4.7 가속 R 합격 범위를 제동 R에도 쓴다, 지시서)
const R_HI = 1.33;
const K = EXIT_LIMIT_RELAX;
const inTarget = (r: number) => r >= R_LO && r <= R_HI;
const tuneOf = (t: Partial<StatTune>): StatTune => ({ ...NO_TUNE, ...t });
const tuneKo = (t: StatTune) =>
  t.accelPoint === 0 && t.brakePoint === 0 && t.abScale === 1
    ? '현행'
    : [t.abScale !== 1 && `A0 · B0 × ${t.abScale}`, t.accelPoint > 0 && `가속 1점 ${f(t.accelPoint * 100, 1)}%`, t.brakePoint > 0 && `제동 1점 ${f(t.brakePoint * 100, 1)}%`].filter(Boolean).join(', ');
const gains = (ts: Track[], t: StatTune) => lapGains(ts, 'current', K, t);
const passCheck = (t: StatTune, k: number, ts: Track[] = ALL) => ts.filter((tr) => checkTrack(tr, k, carParams(BASE, undefined, t)).errors.length);

// 1점당 비율 격자 (P-1, P-3): 4% ~ 19.5%, 0.5% 단위 (p < 20%)
const P_GRID = Array.from({ length: 32 }, (_, i) => Math.round((0.04 + 0.005 * i) * 1000) / 1000);
// A0 · B0 배율 격자 (P-2): 지시서 단계 + 1.00 ~ 0.10, 0.05 단위
const S_GRID = [...new Set([...AB_SCALE_STEPS, ...Array.from({ length: 19 }, (_, i) => Math.round((1 - 0.05 * i) * 100) / 100)])].sort((a, b) => b - a);
// 고르는 규칙 (10대 레이스 결과를 보기 전에 정함): L-B 3트랙 평균에서 가속 R과 제동 R이 모두 목표 안, 코너 검사 L-B 3트랙(k 0.2, 시뮬레이터가 거부하는 기준) 통과,
// 그 가운데 max(|ln 가속 R|, |ln 제동 R|)가 가장 작은 값. 목표에 드는 값이 없으면 같은 기준으로 가장 가까운 값을 '목표 밖'으로 적는다
const fit = (g: { R: number; Rbrake: number }) => Math.max(Math.abs(Math.log(g.R)), Math.abs(Math.log(g.Rbrake)));

// P-1 · P-3: 5점 값이 그대로라 기준 랩 · 최고속도 E · 접지 E는 p와 무관하고, 가속 E는 가속 p만, 제동 E는 제동 p만 바뀐다
function scanPoints(abScale: number) {
  const g0 = gains(LB, tuneOf({ abScale }));
  const eA = P_GRID.map((p) => gains(LB, tuneOf({ abScale, accelPoint: p })).E.accel);
  const eB = P_GRID.map((p) => gains(LB, tuneOf({ abScale, brakePoint: p })).E.brake);
  const R = (ea: number, eb: number) => ({
    R: ea / mean([g0.E.topSpeed, g0.E.grip, eb]),
    Rbrake: eb / mean([g0.E.topSpeed, g0.E.grip, ea]),
  });
  let best: { pA: number; pB: number; R: number; Rbrake: number; ok: boolean } | null = null;
  P_GRID.forEach((pA, i) =>
    P_GRID.forEach((pB, j) => {
      const r = R(eA[i], eB[j]);
      const ok = inTarget(r.R) && inTarget(r.Rbrake);
      if (!best || (ok && !best.ok) || (ok === best.ok && fit(r) < fit(best))) best = { pA, pB, ...r, ok };
    }),
  );
  return { g0, eA, eB, best: best! };
}

function choose() {
  const p1 = scanPoints(1);
  const p2rows = S_GRID.map((s) => {
    const t = tuneOf({ abScale: s });
    return { s, g: gains(LB, t), failLB: passCheck(t, K, LB), fail02: passCheck(t, K), fail0: passCheck(t, 0) };
  });
  const cands = p2rows.filter((r) => !r.failLB.length);
  const okRows = cands.filter((r) => inTarget(r.g.R) && inTarget(r.g.Rbrake));
  const p2 = (okRows.length ? okRows : cands).reduce((a, b) => (fit(b.g) < fit(a.g) ? b : a));
  // P-3: P-2 값의 가운데 = 1과 P-2 고른 값의 중간을 0.05 격자로 반올림 (지시서 'P-2의 가운데 값' 해석, 가안)
  const s3 = Math.round(((1 + p2.s) / 2) * 20) / 20;
  const p3 = scanPoints(s3);
  return {
    p1,
    p2rows,
    p2: { ...p2, ok: okRows.length > 0 },
    s3,
    p3,
    methods: {
      off: tuneOf({}),
      P1: tuneOf({ accelPoint: p1.best.pA, brakePoint: p1.best.pB }),
      P2: tuneOf({ abScale: p2.s }),
      P3: tuneOf({ abScale: s3, accelPoint: p3.best.pA, brakePoint: p3.best.pB }),
    } as Record<string, StatTune>,
  };
}

const part = process.argv[2] ?? 'solo';
const lapOf = (t: Track, tune: StatTune) => measureLap(t, carParams(BASE, undefined, tune), K).lapTime;
const solo3 = (t: Track, tune: StatTune) => {
  const c = buildCourse(t.segments, true);
  return at(runSolo(c, carParams(BASE, undefined, tune), K, { x0: 0, v0: 0, xEnd: 3 * c.length + 1 }), 3 * c.length, 't');
};

if (part === 'solo') {
  const ch = choose();
  const M = ch.methods;
  out('# 능력치 1점 효과 맞추기: 단독 주행 (시드 무관)');
  out();
  out(`목표: 가속 R, 제동 R 모두 ${R_LO}~${R_HI} (R = 그 능력치 E / 나머지 세 E 평균, E = +1의 단독 2랩째 1바퀴 단축률, k ${K}). 기준 L-B 3트랙 평균.`);
  out('고르는 규칙(10대 레이스를 보기 전에 정함): 목표 안이고 코너 검사 L-B 3트랙(k 0.2)을 통과하는 값 중 max(|ln 가속 R|, |ln 제동 R|)가 가장 작은 값. 없으면 같은 기준으로 가장 가까운 값을 "목표 밖"으로 적는다.');
  out();
  out('## 고른 값');
  out();
  out(
    table(
      ['방법', '값', '목표 안', '가속 R', '제동 R'],
      [
        ['현행', tuneKo(M.off), '–', f(gains(LB, M.off).R, 2), f(gains(LB, M.off).Rbrake, 2)],
        ['P-1 1점 효과 키우기', tuneKo(M.P1), ch.p1.best.ok ? '예' : '아니오 (목표 밖)', f(ch.p1.best.R, 2), f(ch.p1.best.Rbrake, 2)],
        ['P-2 기본값 낮추기', tuneKo(M.P2), ch.p2.ok ? '예' : '아니오 (목표 밖)', f(ch.p2.g.R, 2), f(ch.p2.g.Rbrake, 2)],
        [`P-3 섞기 (배율 ${ch.s3} = 1과 P-2 값의 중간)`, tuneKo(M.P3), ch.p3.best.ok ? '예' : '아니오 (목표 밖)', f(ch.p3.best.R, 2), f(ch.p3.best.Rbrake, 2)],
      ],
    ),
  );
  out();
  out('## P-1 훑기: 1점당 비율별 E (L-B 평균, 5점 값 그대로라 최고속도 · 접지 E는 고정)');
  out();
  out(`최고속도 E ${f(ch.p1.g0.E.topSpeed * 100, 3)}%, 접지 E ${f(ch.p1.g0.E.grip * 100, 3)}% (고정).`);
  out();
  const pRows = (sc: ReturnType<typeof scanPoints>) => P_GRID.filter((_, i) => i % 2 === 0 || i === P_GRID.length - 1).map((p) => {
    const i = P_GRID.indexOf(p);
    return [`${f(p * 100, 1)}%`, `${f(sc.eA[i] * 100, 3)}%`, `${f(sc.eB[i] * 100, 3)}%`];
  });
  out(table(['1점당 비율', '가속 E', '제동 E'], pRows(ch.p1)));
  out();
  out('## P-2 훑기: A0 · B0 배율별 (L-B 평균, 1점당 4% 그대로)');
  out();
  out(
    table(
      ['배율', '기준 A / a_brk', ...STATS.map((s) => `E ${STAT_KO[s]}`), '가속 R', '제동 R', '목표', '코너 검사 실패 (k 0.2)', '코너 검사 실패 (k 0, 정식)'],
      ch.p2rows.map((r) => {
        const p = carParams(BASE, undefined, tuneOf({ abScale: r.s }));
        return [r.s, `${f(p.A, 1)} / ${f(p.aBrk, 1)}`, ...STATS.map((s) => `${f(r.g.E[s] * 100, 3)}%`), f(r.g.R, 2), f(r.g.Rbrake, 2), inTarget(r.g.R) && inTarget(r.g.Rbrake) ? '안' : '밖', r.fail02.map((t) => t.id).join(', ') || '없음', r.fail0.map((t) => t.id).join(', ') || '없음'];
      }),
    ),
  );
  out();
  out(`## P-3 훑기: 배율 ${ch.s3}에서 1점당 비율별 E (L-B 평균)`);
  out();
  out(`최고속도 E ${f(ch.p3.g0.E.topSpeed * 100, 3)}%, 접지 E ${f(ch.p3.g0.E.grip * 100, 3)}% (고정).`);
  out();
  out(table(['1점당 비율', '가속 E', '제동 E'], pRows(ch.p3)));
  out();
  out('## 방법별 E 네 개와 R 두 개 (트랙별, 축소안별)');
  out();
  const eRow = (name: string, ts: Track[], t: StatTune) => {
    const g = gains(ts, t);
    return [name, ...STATS.map((s) => `${f(g.E[s] * 100, 3)}%`), f(g.R, 2), f(g.Rbrake, 2), inTarget(g.R) && inTarget(g.Rbrake) ? '안' : '밖'];
  };
  for (const [name, t] of Object.entries(M)) {
    out(`### ${name === 'off' ? '현행' : name} (${tuneKo(t)})`);
    out();
    out(table(['트랙', ...STATS.map((s) => `E ${STAT_KO[s]}`), '가속 R', '제동 R', '목표'], [...SC.map((sc) => eRow(`${SC_KO[sc]} 3트랙 평균`, tracksOf(sc), t)), ...ALL.map((tr) => eRow(tr.id, [tr], t))]));
    out();
  }
  out('## 1바퀴 시간과 3랩 (기준 차 단독, k 0.2, 초)');
  out();
  out(
    table(
      ['트랙', ...Object.keys(M).map((m) => `${m === 'off' ? '현행' : m} 1랩 / 3랩`)],
      ALL.map((tr) => [tr.id, ...Object.values(M).map((t) => {
        const l = lapOf(tr, t);
        const l0 = lapOf(tr, M.off);
        return `${f(l, 2)} / ${f(solo3(tr, t), 2)}${t === M.off ? '' : ` (1랩 ${l - l0 >= 0 ? '+' : ''}${f(((l - l0) / l0) * 100, 1)}%)`}`;
      })]),
    ),
  );
  out();
  out('## 실제 느낌 숫자 (기준 차 5/5/5/5)');
  out();
  out('가속은 일정 가속도 A, 제동은 일정 감속도 a_brk(CAR F3a · F5a). 가장 느린 코너 = 헤어핀 V_c 50 (bend 1.5). 시간 = 속도 차 / 가속도, 거리 = (v1² − v2²) / (2 · 가속도).');
  out();
  out(
    table(
      ['방법', 'A / a_brk (u/s²)', 'A 0점 → 10점', 'a_brk 0점 → 10점', '0 → 100 (s)', '0 → V_top 125 (s, u)', '125 → 50 제동 (s, u)'],
      Object.entries(M).map(([m, t]) => {
        const p = carParams(BASE, undefined, t);
        const at = (v: number) => carParams({ ...BASE, accel: v, brake: v }, undefined, t);
        return [m === 'off' ? '현행' : m, `${f(p.A, 1)} / ${f(p.aBrk, 1)}`, `${f(at(0).A, 1)} → ${f(at(10).A, 1)}`, `${f(at(0).aBrk, 1)} → ${f(at(10).aBrk, 1)}`, f(100 / p.A, 2), `${f(p.vTop / p.A, 2)}, ${f(p.vTop ** 2 / (2 * p.A), 0)}`, `${f((p.vTop - 50) / p.aBrk, 2)}, ${f((p.vTop ** 2 - 50 ** 2) / (2 * p.aBrk), 0)}`];
      }),
    ),
  );
  out();
  out('## 코너 검사 (9트랙, 고른 값)');
  out();
  out(table(['방법', '실패 트랙 (k 0.2, 시뮬레이터)', '실패 트랙 (k 0, 정식)'], Object.entries(M).map(([m, t]) => [m === 'off' ? '현행' : m, passCheck(t, K).map((x) => x.id).join(', ') || '없음', passCheck(t, 0).map((x) => x.id).join(', ') || '없음'])));
  out();
  // 추가 1: 능력치 구간별 1점 효과 (나머지 능력치 5, L-B 3트랙 평균)
  out('## 능력치 구간별 1점 효과 E (나머지 세 능력치 5, L-B 3트랙 평균, 강화 비용 곡선 O-101 참고용)');
  out();
  out('E(a → a+1) = (T(a) − T(a+1)) / T(a). 능력치 상한 10 (CAR §7 F1). 비 = 그 구간 E / 5→6 E.');
  out();
  const STEPS = [3, 5, 7, 9].filter((a) => a + 1 <= CAR_STAT_MAX);
  for (const [m, t] of Object.entries(M)) {
    const lap = (s: CarStats) => mean(LB.map((tr) => measureLap(tr, carParams(s, undefined, t), K).lapTime));
    const rows = STATS.map((stat) => {
      const e = STEPS.map((a) => {
        const lo = lap({ ...BASE, [stat]: a });
        return (lo - lap({ ...BASE, [stat]: a + 1 })) / lo;
      });
      const e56 = e[STEPS.indexOf(5)];
      return [STAT_KO[stat], ...e.map((x) => `${f(x * 100, 3)}% (${f(x / e56, 2)})`)];
    });
    out(`### ${m === 'off' ? '현행' : m} (${tuneKo(t)})`);
    out();
    out(table(['능력치', ...STEPS.map((a) => `${a}→${a + 1} (비)`)], rows));
    out();
  }
}

if (part.startsWith('race:')) {
  const [, m, set] = part.split(':');
  const t = choose().methods[m];
  const seeds = set === 'confirm' ? QA_CONFIRM_SEEDS : QA_ADJUST_SEEDS;
  const opts = { ...FINAL, accelPoint: t.accelPoint, brakePoint: t.brakePoint, abScale: t.abScale };
  const l2 = layer2(LB, seeds, opts);
  const o = l2.orig;
  const sumRec = (rs: Record<string, number>[]) => rs.reduce<Record<string, number>>((a, r) => { for (const [k2, v] of Object.entries(r)) a[k2] = (a[k2] ?? 0) + v; return a; }, {});
  const causes = sumRec(o.map((r) => r.passCauses));
  const passes = Object.values(causes).reduce((a, b) => a + b, 0);
  const KO: Record<string, string> = { contact: '접촉', mistake: '실수', boost: '부스트', brake: '제동', corner: '코너', exit: '탈출', straight: '직선' };
  const toStats = (a: number[]): CarStats => ({ topSpeed: a[0], accel: a[1], grip: a[2], brake: a[3] });
  const car = (id: string) => CARS.find((c) => c.id === id)!.stats;
  const CAR_SET: [string, CarStats][] = [['base', car('base')], ['X', car('X')], ['Y', car('Y')], ['접지 위주', toStats([4, 4, 7, 5])], ['제동 위주', toStats([4, 4, 5, 7])]];
  const carRank = CAR_SET.map(([nm, cs]) => {
    const rs = LB.flatMap((tr) => seeds.map((s) => tryRace(tr, s, testCar(cs), opts))).filter((r) => r !== null);
    return `${nm} ${f(mean(rs.map((r) => r.finishOrder.indexOf(0) + 1)), 2)}`;
  });
  out(`### ${m === 'off' ? '현행' : m} (${tuneKo(t)}), ${set === 'confirm' ? '확인용' : '조정용'} 시드 ${seeds[0]}~${seeds.at(-1)}`);
  out();
  out(
    table(
      ['항목', '값'],
      [
        ['레이스 (L-B 3트랙)', o.length],
        ['경기 길이 1위 / 마지막 (초)', `${f(mean(o.map((r) => r.firstSeconds)), 2)} / ${f(mean(o.map((r) => r.ticks * TICK_SECONDS)), 2)}`],
        ...STATS.map((s, i) => [`${STAT_KO[s]} Δ1 / Δ2 · 2층`, `${f(l2.perStat[i].d1, 2)} / ${f(l2.perStat[i].d2, 2)} · ${l2.perStat[i].verdict}`]),
        ['추월(OT-4) / S1 성공', `${f(mean(o.map((r) => r.overtakes)), 2)} / ${f(mean(o.map((r) => r.s1)), 2)}`],
        ['원인 분포', PASS_CAUSE_ORDER.map((c) => `${KO[c]} ${passes ? f(((causes[c] ?? 0) / passes) * 100, 1) : '–'}%`).join(', ')],
        ['접촉 / 막힘', `${f(mean(o.map((r) => r.contacts)), 2)} / ${f(mean(o.map((r) => r.blockRatio)) * 100, 1)}%`],
        ['차 5종 평균 순위 (레이서 NPC)', carRank.join(', ')],
      ],
    ),
  );
  printStuck();
}

if (part === 'grid') {
  // 추가 2: 출발 자리 영향. 참가 10대는 그대로, 출발 순서만 순환 (자리 0 = 맨 앞). 테스트 차(0번)가 자리 k
  const n = 10;
  const seeds = QA_CONFIRM_SEEDS;
  const perSlot: number[][] = Array.from({ length: n }, () => []);
  const rho: number[] = [];
  const absMove: number[] = [];
  for (let k = 0; k < n; k++)
    for (const tr of LB)
      for (const s of seeds) {
        const grid = Array.from({ length: n }, (_, slot) => (slot - k + n) % n);
        const r = tryRace(tr, s, testCar(BASE), FINAL, { grid });
        if (!r) continue;
        perSlot[k].push(r.finishOrder.indexOf(0) + 1);
        // 순위 상관 (스피어만, 동률 없음): 1 − 6Σd² / (n(n² − 1))
        const d2 = grid.reduce((a, carI, slot) => a + (slot - r.finishOrder.indexOf(carI)) ** 2, 0);
        rho.push(1 - (6 * d2) / (n * (n * n - 1)));
        grid.forEach((carI, slot) => absMove.push(Math.abs(slot - r.finishOrder.indexOf(carI))));
      }
  out('# 출발 자리 영향 (MOTIF_ALL, L-B 3트랙, 확인용 시드)');
  out();
  out('참가 10대(테스트 기준 차 + F-2 9대, 레이서 NPC)는 그대로 두고 출발 순서만 순환한다. 자리 1 = 맨 앞 줄. 자리마다 3트랙 × 50시드 = 150레이스. 예선 없음.');
  out();
  out(
    table(
      ['출발 자리', '평균 최종 순위', '되찾은 자리 (출발 − 최종)', '1위 비율', '레이스'],
      perSlot.map((rs, k) => [k + 1, f(mean(rs), 2), f(k + 1 - mean(rs), 2), `${f((rs.filter((x) => x === 1).length / rs.length) * 100, 1)}%`, rs.length]),
    ),
  );
  out();
  const all = perSlot.flatMap((rs, k) => rs.map((r) => [k + 1, r]));
  const mx = mean(all.map((x) => x[0]));
  const my = mean(all.map((x) => x[1]));
  const cov = mean(all.map(([x, y]) => (x - mx) * (y - my)));
  const corr = cov / Math.sqrt(mean(all.map(([x]) => (x - mx) ** 2)) * mean(all.map(([, y]) => (y - my) ** 2)));
  out(`- 레이스 안 순위 상관 (10대 출발 순위 대 최종 순위, 스피어만, 레이스 평균): **${f(mean(rho), 3)}**`);
  out(`- 테스트 차 출발 자리 대 최종 순위 상관 (${all.length}레이스): ${f(corr, 3)}`);
  out(`- 10대 평균 |출발 − 최종|: ${f(mean(absMove), 2)}자리`);
  printStuck();
}
