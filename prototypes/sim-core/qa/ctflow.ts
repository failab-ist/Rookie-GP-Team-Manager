// 접촉 규칙 하나씩 켜기 (AG-P039 A, AG-P040 A). 바탕 OT_FLOW_ALL(부스트 5%), 원본 T1~T3, R0 · SS-1, 확인용 시드.
// 계수는 바꾸지 않는다 (c_line, 손실 값은 가안 그대로).
// node qa/ctflow.ts [stages|racers|all] > qa/results/<파일>.md
import { CT_ALL, OT_FLOW_ALL, PASS_CAUSE_ORDER, QA_CONFIRM_SEEDS, TICK_SECONDS } from '../src/config.ts';
import { simulate } from '../src/sim.ts';
import type { Entry, RaceOptions, RacerStats } from '../src/types.ts';
import { BASE, f, layer2, mean, out, race, RACERS, STAT_KO, STATS, table, testCar, TRACKS } from './lib.ts';
import { CT_STAGES } from './ctstages.ts';

const SEEDS = QA_CONFIRM_SEEDS;
const ROWS: { name: string; opts: Partial<RaceOptions> }[] = [{ name: '참고: 모든 스위치 끔 (현행)', opts: { reaction: false, slipstream: true } }, ...CT_STAGES];
const CAUSE_KO: Record<string, string> = { contact: '접촉', mistake: '상대 실수', boost: '부스트', brake: '제동', corner: '코너', exit: '탈출', straight: '직선' };
const sumRec = (rs: Record<string, number>[]) =>
  rs.reduce<Record<string, number>>((a, r) => {
    for (const [k, v] of Object.entries(r)) a[k] = (a[k] ?? 0) + v;
    return a;
  }, {});

const PART = process.argv[2] ?? 'all';
const main: (string | number)[][] = [];
const causeRows: (string | number)[][] = [];
const deltaRows: (string | number)[][] = [];
for (const row of PART === 'racers' ? [] : ROWS) {
  const l2 = layer2(TRACKS, SEEDS, row.opts);
  const o = l2.orig;
  const n = o.length;
  const kinds = sumRec(o.map((r) => r.contactKinds));
  const byType = (t: string) => ((kinds[`${t}:직선`] ?? 0) + (kinds[`${t}:코너`] ?? 0)) / n;
  const basis = sumRec(o.map((r) => r.contactBasis));
  const totalContacts = Object.values(basis).reduce((a, b) => a + b, 0);
  const share = (k: string) => (totalContacts ? `${f(((basis[k] ?? 0) / totalContacts) * 100, 0)}%` : '–');
  const causes = sumRec(o.map((r) => r.passCauses));
  const passes = Object.values(causes).reduce((a, b) => a + b, 0);
  main.push([
    row.name,
    f(mean(o.map((r) => r.contacts)), 2),
    `${f(byType('side'), 2)} / ${f(byType('lane'), 2)} / ${f(byType('rear'), 2)}`,
    `${share('mistake')} / ${share('lane')} / ${share('rear')} / ${share('none')}`,
    f(mean(o.map((r) => r.overtakes)), 2),
    passes ? `${f(((causes.contact ?? 0) / passes) * 100, 1)}%` : '–',
    `${f(mean(o.map((r) => r.blockRatio)) * 100, 1)}%`,
    l2.perStat.map((s) => `${STAT_KO[s.stat]} ${s.verdict}`).join('<br>'),
  ]);
  causeRows.push([row.name, ...PASS_CAUSE_ORDER.map((c) => (passes ? `${f(((causes[c] ?? 0) / passes) * 100, 1)}%` : '–'))]);
  deltaRows.push([row.name, ...l2.perStat.map((s) => `${f(s.d1, 2)} / ${f(s.d2, 2)}`), f(l2.spread, 2)]);
}

if (PART !== 'racers') {
out('# 접촉 규칙 하나씩 켜기 (AG-P039 A, AG-P040 A)');
out();
out(`바탕 OT_FLOW_ALL(부스트 5%), 원본 T1~T3, R0 · SS-1, 3랩, 테스트 기준 차 + F-2 9대, 확인용 시드 ${SEEDS[0]}~${SEEDS.at(-1)} × 3트랙 = 150레이스. 값은 레이스당(10대 합).`);
out('- 접촉 종류: 옆(다른 차선, 둘 다 변경 중 아님) / 변경(하나라도 차선 변경 중) / 뒤(같은 차선). 3단계 전에도 같은 기준으로 분류만 한다.');
out('- 책임: 실수한 차 / 차선을 바꾸던 차 / 뒤에서 들이받은 차 / 레이싱 사고(책임 없음). 우선순위 순서대로 먼저 걸리는 기준.');
out();
out('## 단계별 요약');
out();
out(table(['단계', '접촉', '옆 / 변경 / 뒤', '책임: 실수 / 변경 / 뒤 / 없음', '추월(OT-4)', '그중 접촉 원인', '막힘 비율', '2층 판정'], main));
out();
out('## 추월 원인 분포');
out();
out(table(['단계', ...PASS_CAUSE_ORDER.map((c) => CAUSE_KO[c])], causeRows));
out();
out('## 2층 Δ1 / Δ2');
out();
out(table(['단계', ...STATS.map((s) => STAT_KO[s]), '퍼짐 sd'], deltaRows));
}
if (PART !== 'stages') {

// ---------- 레이서 능력치 확인 (마지막 단계) ----------
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...OT_FLOW_ALL, ...CT_ALL };
const NPC_STATS: RacerStats = { overtake: 5, control: 5, focus: 5 };

// 1) 제어 +1, +2: 차 1대 단독 3랩, 2랩째 시간. CT-2를 끈 경우와 비교 (횡 오차는 시드마다 달라 50시드 평균)
const soloLap = (stats: RacerStats, opts: Partial<RaceOptions>) =>
  mean(
    TRACKS.flatMap((t) =>
      SEEDS.map((seed) => {
        const L = t.segments.reduce((a, x) => a + x.length, 0);
        const entries: Entry[] = [{ racer: { id: 'solo', stats, passiveId: null }, car: { id: 'solo', stats: BASE } }];
        const r = simulate({ seed, track: t, laps: 3, entries }, opts, { start: [{ s: 0, lane: 1, v: 0 }] });
        // 틱 사이를 선형 보간한 통과 시각 (틱 0.05 s 단위로 자르면 제어 효과보다 오차가 크다)
        const at = (x: number) => {
          const k = r.frames.findIndex((p) => p[0] >= x);
          const a = r.frames[k - 1][0];
          return (k - 1 + (x - a) / (r.frames[k][0] - a)) * TICK_SECONDS;
        };
        return at(2 * L) - at(L);
      }),
    ),
  );
const controlRows = (
  [
    ['제어 5 (5/5/5)', NPC_STATS],
    ['제어 6 (4/6/5)', { overtake: 4, control: 6, focus: 5 }],
    ['제어 7 (3/7/5)', { overtake: 3, control: 7, focus: 5 }],
  ] as [string, RacerStats][]
).map(([name, st], _i, all) => {
  const on = soloLap(st, FINAL);
  const off = soloLap(st, { ...FINAL, ctLine: 0 });
  const noClip = soloLap(st, { ...FINAL, ctWobble: false });
  const base = soloLap(all[0][1], FINAL);
  const baseNoClip = soloLap(all[0][1], { ...FINAL, ctWobble: false });
  return [name, f(on, 4), `${f(((base - on) / base) * 100, 3)}%`, f(off, 4), `${f(noClip, 4)} (${f(((baseNoClip - noClip) / baseNoClip) * 100, 3)}%)`];
});
out();
out('# 레이서 능력치 확인 (접촉 규칙 마지막 단계: OT_FLOW_ALL + CT_ALL)');
out();
out('### 제어: 차 1대 단독 3랩의 2랩째 시간 (트랙 3종 × 50시드 평균, 초)');
out();
out(table(['레이서', 'CT-2 켬', '제어 5 대비 단축', 'CT-2 끔(참고)', 'CT-2 켬 · CT-1 끔(참고, 제어 5 대비)'], controlRows));

// 2) 집중 +1, +2: 10대 레이스에서 테스트 차(기준 차)의 실수 수와 원인 제공 접촉
const focusRows = (
  [
    ['집중 5 (5/5/5)', NPC_STATS],
    ['집중 6 (4/5/6)', { overtake: 4, control: 5, focus: 6 }],
    ['집중 7 (3/5/7)', { overtake: 3, control: 5, focus: 7 }],
  ] as [string, RacerStats][]
).map(([name, st]) => {
  const runs = TRACKS.flatMap((t) => SEEDS.map((s) => race(t, s, testCar(BASE, { id: 'test', stats: st, passiveId: null }), FINAL)));
  const c = runs.map((r) => r.carStats[0]);
  return [name, f(mean(c.map((x) => x.mistakes)), 2), f(mean(c.map((x) => x.contactsCaused)), 2), f(mean(c.map((x) => x.contactsSuffered)), 2), f(mean(runs.map((r) => r.finishOrder.indexOf(0) + 1)), 2)];
});
out();
out('### 집중: 10대 레이스에서 테스트 차(기준 차)의 레이스당 값');
out();
out(table(['레이서', '혼전 실수', '원인 제공 접촉', '당한 접촉', '평균 순위'], focusRows));

// 3) 레이서 A, B, C
const racerRows = RACERS.map((racer) => {
  const runs = TRACKS.flatMap((t) => SEEDS.map((s) => race(t, s, testCar(BASE, racer), FINAL)));
  const c = runs.map((r) => r.carStats[0]);
  return [
    racer.id,
    racer.passiveId ?? '없음',
    f(mean(c.map((x) => x.passes)), 2),
    f(mean(c.map((x) => x.contactsCaused)), 2),
    f(mean(c.map((x) => x.contactsSuffered)), 2),
    f(mean(c.map((x) => x.mistakes)), 2),
    f(mean(runs.map((r) => r.finishOrder.indexOf(0) + 1)), 2),
  ];
});
out();
out('### 레이서 A, B, C (기준 차, 테스트 차 1대 기준)');
out();
out(table(['레이서', '패시브', '추월(OT-4)', '원인 제공 접촉', '당한 접촉', '혼전 실수', '평균 순위'], racerRows));
}
