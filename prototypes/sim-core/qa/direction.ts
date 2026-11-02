// 코너별 안쪽 차선 적용 뒤 재측정 (AG-P045 A). 방향표(DIRECTION 초안 R-2)가 채워지면 data/tracks/motif/의 corner direction 칸에 L/R을 넣고 돌린다.
// 이 스크립트: 방향 칸 채움 상태, 코너별 안쪽 차선, 코너 설계자(레이서 B) 발동 · 반대급부 · 접촉, 0번 차선 비율. L-B 3트랙, MOTIF_ALL.
// 같이 돌릴 것 (README): node qa/gridside.ts base adjust (홀짝 지수, 자리별 1위 비율), node qa/motif.ts share (차 : 레이서 비중)
// node qa/direction.ts [adjust|confirm] > <파일>.md
import { MOTIF_ALL, QA_ADJUST_SEEDS, QA_CONFIRM_SEEDS } from '../src/config.ts';
import type { RaceOptions, Track } from '../src/types.ts';
import { BASE, f, load, mean, out, printStuck, RACERS, registerTrack, table, testCar, tryRace } from './lib.ts';

const LB: Track[] = ['M1', 'M2', 'M3'].map((m) => load(`../data/tracks/motif/${m}-LB.json`));
LB.forEach(registerTrack);
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...MOTIF_ALL };
const set = process.argv[2] ?? 'adjust';
const seeds = set === 'confirm' ? QA_CONFIRM_SEEDS : QA_ADJUST_SEEDS;
// sim.ts innerOf와 같은 규칙 (차선 수 3)
const inner = (s: Track['segments'][number]) => s.innerLane ?? (s.direction === 'L' ? 0 : s.direction === 'R' ? 2 : 0);

out(`# 코너 방향 칸과 안쪽 차선 재측정 (L-B, MOTIF_ALL, ${set === 'confirm' ? '확인용' : '조정용'} 시드 ${seeds[0]}~${seeds.at(-1)})`);
out();
out('## 방향 칸 채움 상태');
out();
out(
  table(
    ['트랙', '코너 수', 'L', 'R', '빈칸', '코너별 안쪽 차선'],
    LB.map((t) => {
      const cs = t.segments.filter((s) => s.kind === 'corner');
      return [t.id, cs.length, cs.filter((s) => s.direction === 'L').length, cs.filter((s) => s.direction === 'R').length, cs.filter((s) => !s.direction).length, cs.map((s) => `${s.id.split('-')[1]} ${s.direction || '–'}→${inner(s)}`).join(', ')];
    }),
  ),
);
out();
out('## 테스트 차 1대 (기준 차) 레이서별: 패시브 발동, 반대급부, 접촉, 0번 차선 비율');
out();
const rows = RACERS.map((racer) => {
  const runs = LB.flatMap((t) => seeds.map((s) => tryRace(t, s, testCar(BASE, racer), FINAL))).filter((r) => r !== null);
  const c = runs.map((r) => r.carStats[0]);
  const lane0 = mean(c.map((x) => x.laneTicks[0] / Math.max(1, x.laneTicks.reduce((a, b) => a + b, 0))));
  return [
    `${racer.id}${racer.passiveId ? ` (${racer.passiveId})` : ''}`,
    f(mean(c.map((x) => x.passiveActivations)), 2),
    f(mean(c.map((x) => (x.drawbacks['T-B-inner'] ?? 0))), 2),
    f(mean(c.map((x) => (x.drawbacks['T-B-straight'] ?? 0))), 2),
    f(mean(c.map((x) => x.contacts)), 2),
    f(mean(c.map((x) => x.contactsCaused)), 2),
    `${f(lane0 * 100, 1)}%`,
    f(mean(runs.map((r) => r.finishOrder.indexOf(0) + 1)), 2),
    f(mean(runs.map((r) => r.carStats.reduce((a, x) => a + x.contacts, 0) / 2)), 2),
  ];
});
out(table(['레이서', '패시브 발동', 'T-B 안쪽 막힘', 'T-B 직선 미시도', '접촉', '원인 제공 접촉', '0번 차선 비율', '평균 순위', '레이스 전체 접촉'], rows));
printStuck();
