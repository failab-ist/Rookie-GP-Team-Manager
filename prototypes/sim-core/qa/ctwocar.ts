// 접촉 규칙 2대 시험 (AG-P039 A). T1에서 옆 차선에 나란히 3랩, 차선 변경 없음. 제어 4 / 5 / 7.
// 2대만으로는 혼전(반경 7.5u 안 3대 이상)이 안 생겨 실수가 없으므로, 실수를 보려고 6대 무리(3차선 × 2줄)도 같이 돌린다.
// node qa/ctwocar.ts > qa/results/<파일>.md
import { CAR_LENGTH, CAR_WIDTH, TICK_SECONDS } from '../src/config.ts';
import { simulate } from '../src/sim.ts';
import type { Entry, RaceOptions } from '../src/types.ts';
import { BASE, f, mean, out, table, TRACKS } from './lib.ts';
import { CT_STAGES } from './ctstages.ts';

const T1 = TRACKS[0];
const CONTROLS: [string, { overtake: number; control: number; focus: number }][] = [
  ['제어 4', { overtake: 6, control: 4, focus: 5 }],
  ['제어 5', { overtake: 5, control: 5, focus: 5 }],
  ['제어 7', { overtake: 4, control: 7, focus: 4 }],
];

const LAYOUTS = {
  '2대 나란히 (0번 · 1번 차선)': [
    { s: 20, lane: 0, v: 0 },
    { s: 20, lane: 1, v: 0 },
  ],
  '6대 무리 (3차선 × 2줄, 줄 간격 6.5u)': [0, 1, 2].flatMap((lane) => [
    { s: 26.5, lane, v: 0 },
    { s: 20, lane, v: 0 },
  ]),
};

function run(start: { s: number; lane: number; v: number }[], stats: Entry['racer']['stats'], opts: Partial<RaceOptions>, seed: number) {
  const entries: Entry[] = start.map((_, i) => ({ racer: { id: `r${i}`, stats, passiveId: null }, car: { id: `c${i}`, stats: BASE } }));
  const r = simulate({ seed, track: T1, laps: 3, entries }, opts, { start, trace: true });
  const tr = r.trace!;
  // 평소(실수 아님) |ε| 최대, 앞뒤로 겹친 다른 차선 쌍의 최소 옆 간격
  let maxEps = 0;
  let minGap = Infinity;
  for (let k = 0; k < tr.length; k++) {
    tr[k].forEach((row) => {
      if (!row[7]) maxEps = Math.max(maxEps, Math.abs(row[6]));
    });
    for (let a = 0; a < start.length; a++)
      for (let b = a + 1; b < start.length; b++) {
        if (tr[k][a][1] === tr[k][b][1] || Math.abs(r.frames[k + 1][a] - r.frames[k + 1][b]) >= CAR_LENGTH) continue;
        minGap = Math.min(minGap, Math.abs(r.lateral[k][a] - r.lateral[k][b]));
      }
  }
  const contacts = r.events.filter((e) => e.kind === 4).map((e) => e.cause!.split(':'));
  const swapsAfterContact = r.events.filter((e) => e.kind === 3 && e.cause!.startsWith('contact')).length;
  const lap2 = (i: number) => {
    const L = 1000;
    const at = (x: number) => r.frames.findIndex((p) => p[i] >= x) * TICK_SECONDS;
    return at(start[i].s + 2 * L) - at(start[i].s + L);
  };
  return {
    contacts: contacts.length,
    byMistake: contacts.filter((c) => c[1] === 'mistake').length,
    side: contacts.filter((c) => c[0] === 'side').length,
    lane: contacts.filter((c) => c[0] === 'lane').length,
    rear: contacts.filter((c) => c[0] === 'rear').length,
    mistakes: r.carStats.reduce((a, c) => a + c.mistakes, 0),
    maxEps,
    minGap,
    swapsAfterContact,
    lap2: mean(start.map((_, i) => lap2(i))),
  };
}

out('# 접촉 규칙 2대 시험 (T1, 3랩, 차선 변경 없음)');
out();
out('바탕 설정 OT_FLOW_ALL(부스트 5%), R0 · SS-1. 시드 1~5 평균. 레이서는 모두 같은 능력치, 차는 기준 차.');
out('- 접촉 = 접촉 시작 수(레이스당). 실수 원인 = 원인 제공 기준이 실수인 접촉. 옆/변경/뒤 = 접촉 종류.');
out(`- 평소 |ε| 최대 = 실수가 아닐 때 횡 오차 크기의 최댓값(u). 최소 옆 간격 = 앞뒤로 겹친 다른 차선 두 차의 횡 거리 최솟값(차 폭 ${CAR_WIDTH}u 미만이면 접촉).`);
out('- 접촉 뒤 순서 바뀜 = 원인이 접촉인 추월(OT-4) 수. 2랩째 시간 = 차들의 2랩째 평균(초).');
for (const st of CT_STAGES) {
  out();
  out(`## ${st.name}`);
  for (const [layout, start] of Object.entries(LAYOUTS)) {
    out();
    out(`### ${layout}`);
    out();
    const rows = CONTROLS.map(([name, stats]) => {
      const rs = [1, 2, 3, 4, 5].map((seed) => run(start, stats, st.opts, seed));
      const m = (k: keyof (typeof rs)[number]) => mean(rs.map((x) => x[k]));
      return [
        name,
        f(m('contacts'), 1),
        f(m('byMistake'), 1),
        `${f(m('side'), 1)} / ${f(m('lane'), 1)} / ${f(m('rear'), 1)}`,
        f(m('mistakes'), 1),
        f(Math.max(...rs.map((x) => x.maxEps)), 2),
        f(Math.min(...rs.map((x) => x.minGap)), 2),
        f(m('swapsAfterContact'), 1),
        f(m('lap2'), 3),
      ];
    });
    out(table(['제어', '접촉', '실수 원인', '옆 / 변경 / 뒤', '실수 수', '평소 |ε| 최대', '최소 옆 간격', '접촉 뒤 순서 바뀜', '2랩째 시간'], rows));
  }
}
