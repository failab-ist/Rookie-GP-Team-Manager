// 하나씩 비교 (원본 트랙 T1~T3, R0 · SS-1, 확인용 시드). 기본값에서 한 가지만 바꾼다. 계수 기본값은 바꾸지 않는다.
// node qa/onebyone.ts > qa/results/<파일>.md
import { QA_CONFIRM_SEEDS, SLIP_RATIO } from '../src/config.ts';
import type { RaceOptions } from '../src/types.ts';
import { f, layer2, mean, out, STAT_KO, table, TRACKS } from './lib.ts';

const BASE_OPTS: Partial<RaceOptions> = { reaction: false, slipstream: true };
const CASES: { name: string; opts: Partial<RaceOptions> }[] = [
  { name: `현행 (슬립 ${SLIP_RATIO * 100}%, 차선 3개)`, opts: {} },
  { name: '슬립스트림 8%', opts: { slipRatio: 0.08 } },
  { name: '슬립스트림 10%', opts: { slipRatio: 0.1 } },
  { name: '차선 4개', opts: { laneCount: 4 } },
  { name: '(추가) 변경 중 원래 차선 상한 끔', opts: { capWhileChanging: false } },
  { name: '(추가) 원하는 속도 target', opts: { desiredSpeed: 'target' } },
];

const rows: (string | number)[][] = [];
for (const c of CASES) {
  const l2 = layer2(TRACKS, QA_CONFIRM_SEEDS, { ...BASE_OPTS, ...c.opts });
  const o = l2.orig;
  rows.push([
    c.name,
    f(mean(o.map((r) => r.tries)), 2),
    f(mean(o.map((r) => r.overtakes)), 2),
    f(mean(o.map((r) => (r.overtakes > 0 ? 1 : 0))), 2),
    f(mean(o.map((r) => r.aborts)), 2),
    f(mean(o.map((r) => r.contacts)), 2),
    `${f(mean(o.map((r) => r.blockRatio)) * 100, 1)}%`,
    l2.perStat.map((s) => `${STAT_KO[s.stat]} ${s.verdict}`).join('<br>'),
  ]);
}

out('# 하나씩 비교 (원본 트랙, 반응 지연 R0 · 슬립스트림 SS-1)');
out();
out(`확인용 시드 ${QA_CONFIRM_SEEDS[0]}~${QA_CONFIRM_SEEDS.at(-1)} × 트랙 3종 = 150레이스(테스트 기준 차 + F-2 9대). 값은 레이스당 평균(10대 합). 되돌아옴 = 목표 차선 창에 차가 들어와 차선 변경을 되돌린 횟수. '(추가)' 두 줄은 지시서 4경우 밖의 참고 비교.`);
out();
out(table(['경우', '추월 시도', '추월 성공', '추월 있는 레이스 비율', '되돌아옴', '접촉', '막힘 비율', '2층 판정'], rows));
