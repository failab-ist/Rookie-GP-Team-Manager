// 직선 길이 × 차선 변경 횡 속도 실험 (지시서 2026-11-02, 트랙 초안 AG-P030 참고용).
// 직선 ×1.0 / 1.5 / 2.0 (코너 그대로) × v_lat 4 / 6. 반응 지연 R0, 슬립스트림 SS-1 고정. 확인용 시드만 쓰고 계수는 바꾸지 않는다.
// node qa/straights.ts > qa/results/2026-11-02-straights.md
import { EXIT_LIMIT_RELAX, LANE_WIDTH, QA_CONFIRM_SEEDS, TICK_SECONDS } from '../src/config.ts';
import { carParams } from '../src/physics.ts';
import { checkTrack } from '../src/trackCheck.ts';
import type { Track } from '../src/types.ts';
import { BASE, f, lapGains, layer2, load, mean, measureLap, out, pct, race, RACERS, STAT_KO, STATS, table, testCar, TRACKS } from './lib.ts';

const SCALES = [1.0, 1.5, 2.0];
const LAT_SPEEDS = [4, 6];
const SEEDS = QA_CONFIRM_SEEDS;
const tracksAt = (scale: number): Track[] =>
  scale === 1 ? TRACKS : ['T1', 'T2', 'T3'].map((t) => load(`../data/tracks/experiment/${t}-s${scale.toFixed(1)}.json`));
const name = (scale: number, v: number) => `직선 ×${scale.toFixed(1)} · v_lat ${v}`;

type StraightRow = { combo: string; track: string; id: string; length: number; time: number; tlc: number; succPerRace: number };
const straightRows: StraightRow[] = [];
const summary: (string | number)[][] = [];
const detail: string[] = [];

for (const scale of SCALES) {
  const tracks = tracksAt(scale);
  const gains = lapGains(tracks);
  for (const v of LAT_SPEEDS) {
    const combo = name(scale, v);
    const opts = { reaction: false, slipstream: true, latSpeed: v };
    const tlc = LANE_WIDTH / v;
    const bad = tracks.filter((t) => checkTrack(t, EXIT_LIMIT_RELAX).errors.length);
    if (bad.length) {
      summary.push([combo, `검사 실패 (${bad.map((t) => t.id).join(', ')})`, '–', '–', '–', '–']);
      continue;
    }
    const l2 = layer2(tracks, SEEDS, opts);
    const lines: string[] = [];
    const trackRows: (string | number)[][] = [];
    tracks.forEach((t, ti) => {
      const races = l2.orig.slice(ti * SEEDS.length, (ti + 1) * SEEDS.length);
      const tries = mean(races.map((r) => r.tries));
      const succ = mean(races.map((r) => r.overtakes));
      const lap = measureLap(t, carParams(BASE), EXIT_LIMIT_RELAX);
      trackRows.push([
        t.id,
        f(tries, 2),
        f(succ, 2),
        tries ? f(succ / tries, 3) : '–',
        f(mean(races.map((r) => (r.overtakes > 0 ? 1 : 0))), 2),
        f(mean(races.map((r) => r.contacts)), 2),
        `${f(mean(races.map((r) => r.blockRatio)) * 100, 1)}%`,
        f(lap.lapTime, 3),
        `${f(mean(races.map((r) => r.ticks)), 1)}틱 (${f(mean(races.map((r) => r.ticks)) * TICK_SECONDS, 2)}초)`,
      ]);
      for (const [id, s] of lap.straights) {
        const n = races.reduce((a, r) => a + r.overtakeSegs.filter((x) => x === id).length, 0);
        straightRows.push({ combo, track: t.id, id, length: t.segments.find((x) => x.id === id)!.length, time: s.time, tlc, succPerRace: n / races.length });
      }
    });
    const allRaces = l2.orig;
    const verdicts = l2.perStat.map((s) => `${STAT_KO[s.stat]} ${s.verdict}`).join('<br>');
    summary.push([
      combo,
      f(mean(allRaces.map((r) => r.overtakes)), 2),
      f(mean(allRaces.map((r) => (r.overtakes > 0 ? 1 : 0))), 2),
      f(gains.R, 2),
      verdicts,
      `${f(mean(allRaces.map((r) => r.ticks)) * TICK_SECONDS, 2)}초`,
    ]);

    lines.push(`### ${combo} (차선 변경 시간 t_lc = ${f(tlc, 2)}초)`, '');
    lines.push(table(['트랙', '추월 시도/레이스', '추월 성공/레이스', '성공률', '추월 있는 레이스 비율', '접촉/레이스', '막힘 비율', '기준 차 1바퀴(초)', '3랩 경기 길이'], trackRows), '');
    lines.push(
      `1바퀴 단축률(+1, 단독 2랩째, 트랙 평균): ${STATS.map((s) => `${STAT_KO[s]} ${pct(gains.E[s])}`).join(', ')}. 가속 R ${f(gains.R, 2)}, 제동 R ${f(gains.Rbrake, 2)} (나머지 세 능력치 평균 대비).`,
      '',
    );
    lines.push(
      table(
        ['능력치', '대조군 순위 차 시드', 'Δ1', 'Δ2', '퍼짐 sd', '+1 1위 비율 · 평균 순위', '상호작용 (M-18)', '판정'],
        l2.perStat.map((s) => [
          STAT_KO[s.stat],
          `${l2.controlDiff} / ${l2.n}`,
          f(s.d1, 2),
          f(s.d2, 2),
          f(l2.spread, 2),
          `${f(s.top1, 2)} · ${f(s.meanR1, 2)}`,
          `막힘 ${f(l2.m18.block * 100, 1)}%, 추월 레이스 ${f(l2.m18.overtakeShare, 2)}, 접촉 ${l2.m18.contacts}`,
          s.verdict,
        ]),
      ),
      '',
    );
    if (allRaces.some((r) => r.overtakes > 0)) {
      const rr = RACERS.filter((r) => r.passiveId).map((racer) => {
        const runs = tracks.flatMap((t) => SEEDS.map((s) => race(t, s, testCar(BASE, racer), opts)));
        const c = runs.map((r) => r.carStats[0]);
        return [
          racer.id,
          f(mean(c.map((x) => x.tries)), 2),
          f(mean(c.map((x) => x.successes)), 2),
          `${f((c.reduce((a, x) => a + x.blockedTicks, 0) / c.reduce((a, x) => a + x.racingTicks, 0)) * 100, 1)}%`,
          f(mean(runs.map((r) => r.finishOrder.indexOf(0) + 1)), 2),
        ];
      });
      lines.push(table(['레이서 (기준 차)', '추월 시도', '추월 성공', '막힘 비율', '평균 순위'], rr), '');
    }
    detail.push(...lines);
  }
}

out('# 직선 길이 × 차선 변경 속도 실험');
out();
out(`반응 지연 R0 · 슬립스트림 SS-1 고정, k=${EXIT_LIMIT_RELAX}, 3랩, 테스트 차(기준 차) + F-2 상대 9대, 확인용 시드 ${SEEDS[0]}~${SEEDS.at(-1)} × 트랙 3종 = 150레이스. 직선만 늘리고 코너는 그대로. 계수는 바꾸지 않았다.`);
out();
out('## 요약');
out();
out(table(['조합', '추월 성공/레이스', '추월 있는 레이스 비율', '가속 R', '2층 판정', '3랩 경기 길이(평균)'], summary));
out();
out('## 직선별 통과 시간과 추월 성공 (기준 차 단독 2랩째 통과 시간, 짧은 순)');
out();
const sorted = [...straightRows].sort((a, b) => a.time - b.time);
out(
  table(
    ['조합', '직선', '길이(u)', '통과 시간(초)', '÷ t_lc', '추월 성공/레이스'],
    sorted.map((r) => [r.combo, r.id, r.length, f(r.time, 3), f(r.time / r.tlc, 2), f(r.succPerRace, 3)]),
  ),
);
out();
for (const v of LAT_SPEEDS) {
  const rows = straightRows.filter((r) => r.combo.endsWith(`v_lat ${v}`));
  const withSucc = rows.filter((r) => r.succPerRace > 0).sort((a, b) => a.time - b.time);
  const noneLongest = rows.filter((r) => r.succPerRace === 0).sort((a, b) => b.time - a.time)[0];
  const first = withSucc[0];
  out(
    `- v_lat ${v} (t_lc ${f(LANE_WIDTH / v, 2)}초): 추월이 나온 가장 짧은 직선 ${first ? `${first.combo} ${first.id} ${f(first.time, 3)}초 (t_lc의 ${f(first.time / first.tlc, 2)}배, ${f(first.succPerRace, 3)}/레이스)` : '없음'}, ` +
      `추월이 없던 가장 긴 직선 ${noneLongest ? `${noneLongest.combo} ${noneLongest.id} ${f(noneLongest.time, 3)}초 (t_lc의 ${f(noneLongest.time / noneLongest.tlc, 2)}배)` : '없음'}.`,
  );
}
out();

// 추월 시도 추적: 시도 틱에 뒤차(시도한 차)와 앞차의 간격, 끝난 틱(실패 · 되돌림)까지 좁힌 속도로
// "성공(앞차보다 L_car 앞섬)까지 필요했던 시간"을 추정한다. 결과를 보고 계수를 바꾸지 않는다.
out('## 추월 시도 추적 (추월이 안 나온 이유)');
out();
out('추월 시도 조건의 원하는 속도(INT R3-1, 정의 없음)를 두 가지로 돌렸다. step = 다음 물리 스텝 속도(3단계 구현, 기본값), target = 막히지 않았을 때의 한계 속도. 위 요약과 상세는 step 기준.');
out();
out('필요 거리 = 시도 때 앞차와의 거리 + L_car(6u). 좁힌 속도 = 시도부터 끝날 때까지 줄인 거리 ÷ 걸린 시간. 필요 시간 = 필요 거리 ÷ 좁힌 속도(좁히지 못하면 제외). 값은 중앙값.');
out();
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const diagRows: (string | number)[][] = [];
for (const desiredSpeed of ['step', 'target'] as const)
for (const scale of SCALES)
  for (const v of LAT_SPEEDS) {
    const opts = { reaction: false, slipstream: true, latSpeed: v, desiredSpeed };
    let tries = 0;
    let aborts = 0;
    let ends = 0;
    const d0s: number[] = [];
    const rates: number[] = [];
    const needs: number[] = [];
    const durs: number[] = [];
    const succs: number[] = [];
    for (const t of tracksAt(scale))
      for (const s of SEEDS) {
        const r = race(t, s, testCar(BASE), opts);
        succs.push(r.carStats.reduce((a, c) => a + c.successes, 0));
        for (const j of r.judgements) {
          if (j.kind !== 1) continue;
          tries++;
          const [a, b] = j.cars;
          const fr = r.frames[j.tick];
          const [p, q] = fr[a] < fr[b] ? [a, b] : [b, a]; // p = 시도한 뒤차, q = 앞차
          const end = r.judgements.find((k) => (k.kind === 2 || k.kind === 3) && k.tick > j.tick && k.cars[0] === j.cars[0] && k.cars[1] === j.cars[1]);
          if (!end) continue;
          if (end.kind === 3) aborts++;
          else ends++;
          const d0 = fr[q] - fr[p];
          const d1 = r.frames[end.tick][q] - r.frames[end.tick][p];
          const dt = (end.tick - j.tick) * TICK_SECONDS;
          d0s.push(d0);
          durs.push(dt);
          const rate = (d0 - d1) / dt;
          rates.push(rate);
          if (rate > 0) needs.push((d0 + 6) / rate);
        }
      }
    diagRows.push([
      desiredSpeed === 'step' ? 'step (3단계 구현)' : 'target (막히지 않은 한계 속도)',
      name(scale, v),
      f(mean(succs), 2),
      tries,
      `${aborts} / ${ends}`,
      f(median(d0s), 1),
      f(median(durs), 2),
      f(median(rates), 2),
      `${f(rates.filter((x) => x > 0).length / Math.max(1, rates.length), 2)}`,
      f(median(needs), 1),
      f(needs.length ? Math.min(...needs) : NaN, 1),
    ]);
  }
out(
  table(
    ['원하는 속도 해석', '조합', '추월 성공/레이스', '시도 수', '되돌림 / 구간 끝 실패', '시도 때 앞차 거리(u)', '시도~끝 시간(초)', '좁힌 속도(u/s)', '좁힌 시도 비율', '필요 시간 중앙값(초)', '필요 시간 최소(초)'],
    diagRows,
  ),
);
out();
out('## 조합별 상세');
out();
for (const l of detail) out(l);
