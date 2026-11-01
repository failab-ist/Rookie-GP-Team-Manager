// 추월 5단계 흐름을 하나씩 켜며 잰다 (AG-P036 A, AG-P032 A). 원본 트랙 T1~T3, R0 · SS-1, 확인용 시드.
// 계수는 바꾸지 않는다. 마지막 단계 레이서 비교는 이름 붙인 묶음 OT_FLOW_ALL(부스트 5%, 가안)로 한다.
// node qa/otflow.ts > qa/results/<파일>.md
import { OT_FLOW_ALL, PASS_CAUSE_ORDER, QA_CONFIRM_SEEDS } from '../src/config.ts';
import type { RaceOptions } from '../src/types.ts';
import { BASE, f, layer2, mean, out, race, RACERS, STAT_KO, STATS, table, testCar, TRACKS } from './lib.ts';
import { STAGES } from './otstages.ts';

const COMMON: Partial<RaceOptions> = { reaction: false, slipstream: true };
const SEEDS = QA_CONFIRM_SEEDS;
const CAUSE_KO: Record<string, string> = {
  straight: '직선(최고속도)',
  boost: '부스트',
  brake: '제동 구간',
  corner: '코너(접지)',
  exit: '탈출(가속)',
  mistake: '상대 실수',
  contact: '접촉',
};
const sumRec = (rs: Record<string, number>[]) =>
  rs.reduce<Record<string, number>>((a, r) => {
    for (const [k, v] of Object.entries(r)) a[k] = (a[k] ?? 0) + v;
    return a;
  }, {});

const main: (string | number)[][] = [];
const causeRows: (string | number)[][] = [];
const deltaRows: (string | number)[][] = [];
const contactRows: (string | number)[][] = [];
for (const st of STAGES) {
  const l2 = layer2(TRACKS, SEEDS, { ...COMMON, ...st.opts });
  const o = l2.orig;
  const passes = mean(o.map((r) => r.overtakes));
  main.push([
    st.name,
    f(passes, 2),
    f(mean(o.map((r) => r.overtakesS1)), 2),
    f(mean(o.map((r) => r.s1)), 2),
    f(mean(o.map((r) => r.tries)), 2),
    f(mean(o.map((r) => r.contacts)), 2),
    `${f(mean(o.map((r) => r.blockRatio)) * 100, 1)}%`,
    l2.perStat.map((s) => `${STAT_KO[s.stat]} ${s.verdict}`).join('<br>'),
  ]);
  const causes = sumRec(o.map((r) => r.passCauses));
  const total = Object.values(causes).reduce((a, b) => a + b, 0);
  causeRows.push([st.name, ...PASS_CAUSE_ORDER.map((c) => (total ? `${f(((causes[c] ?? 0) / total) * 100, 1)}%` : '–'))]);
  deltaRows.push([st.name, ...l2.perStat.map((s) => `${f(s.d1, 2)} / ${f(s.d2, 2)}`), f(l2.spread, 2)]);
  const ck = sumRec(o.map((r) => r.contactKinds));
  const per = (k: string) => f((ck[k] ?? 0) / o.length, 2);
  contactRows.push([st.name, f(mean(o.map((r) => r.contacts)), 2), per('rear:직선'), per('rear:코너'), per('side:직선'), per('side:코너')]);
}

out('# 추월 5단계 흐름 하나씩 켜기 (AG-P036 A)');
out();
out(
  `원본 트랙 T1~T3, 반응 지연 R0 · 슬립스트림 SS-1, 3랩, 테스트 기준 차 + F-2 상대 9대, 확인용 시드 ${SEEDS[0]}~${SEEDS.at(-1)} × 3트랙 = 150레이스. ` +
    '값은 레이스당 평균(10대 합). 추월(OT-4) = 앞뒤가 바뀌어 1초 유지된 기록. 그중 S1 시도 = 바뀌는 순간 앞지른 차가 그 상대를 정식 시도 중. S1 성공 = 기존 정식 시도 성공 판정.',
);
out();
out('## 단계별 요약');
out();
out(table(['단계', '추월(OT-4)', '그중 S1 시도 중', 'S1 성공', '추월 시도', '접촉', '막힘 비율', '2층 판정'], main));
out();
out('## 추월 원인 분포 (OT-4, 우선순위: 접촉 > 상대 실수 > 부스트 > 제동 구간 > 코너 > 탈출 > 직선)');
out();
out(table(['단계', ...PASS_CAUSE_ORDER.map((c) => CAUSE_KO[c])], causeRows));
out();
out('## 2층 Δ1 / Δ2 (원본 순위 − +1 / +2 순위, 클수록 앞섬)');
out();
out(table(['단계', ...STATS.map((s) => STAT_KO[s]), '퍼짐 sd'], deltaRows));
out();
out('## 접촉 위치 (레이스당)');
out();
out(table(['단계', '접촉 합', '뒤 추돌 · 직선', '뒤 추돌 · 코너', '옆 · 직선', '옆 · 코너'], contactRows));

// 레이서 비교 (마지막 단계 = OT_FLOW_ALL, 부스트 5%)
const racerRows = RACERS.map((racer) => {
  const runs = TRACKS.flatMap((t) => SEEDS.map((s) => race(t, s, testCar(BASE, racer), { ...COMMON, ...OT_FLOW_ALL })));
  const c = runs.map((r) => r.carStats[0]);
  return [
    racer.id,
    racer.passiveId ?? '없음',
    f(mean(c.map((x) => x.passes)), 2),
    f(mean(c.map((x) => x.passesS1)), 2),
    f(mean(c.map((x) => x.successes)), 2),
    f(mean(c.map((x) => x.tries)), 2),
    f(mean(c.map((x) => x.contacts)), 2),
    f(mean(runs.map((r) => r.finishOrder.indexOf(0) + 1)), 2),
  ];
});
out();
out('## 레이서 A, B, C (마지막 단계: OT_FLOW_ALL, 부스트 5%, 기준 차, 확인용 150레이스, 테스트 차 1대 기준)');
out();
out(table(['레이서', '패시브', '추월(OT-4)', '그중 S1 시도 중', 'S1 성공', '추월 시도', '접촉', '평균 순위'], racerRows));
