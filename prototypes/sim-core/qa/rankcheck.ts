// 기록 검증: 10대 레이스에서 위치로 본 앞뒤 바뀜 수와 추월 사건(종류 3) 기록 수를 비교한다.
// 앞뒤 바뀜 = 두 차(둘 다 주행 중)의 앞뒤가 틱 사이에 뒤집힘. 1초(20틱) 안에 되돌아가지 않은 것만 '유지'로 센다.
// node qa/rankcheck.ts > qa/results/<파일>.md
import { EXIT_LIMIT_RELAX, QA_CONFIRM_SEEDS, TICK_SECONDS } from '../src/config.ts';
import { buildCourse, segAt } from '../src/physics.ts';
import type { RaceOptions, Track } from '../src/types.ts';
import { BASE, f, load, out, race, table, testCar, TRACKS } from './lib.ts';

const HOLD = Math.round(1 / TICK_SECONDS);
const SETS: { name: string; tracks: Track[]; opts: Partial<RaceOptions> }[] = [
  { name: '3단계 (원본 트랙, R0 · SS-1)', tracks: TRACKS, opts: { reaction: false, slipstream: true } },
  ...[1.5, 2.0].map((k) => ({
    name: `직선 ×${k.toFixed(1)} · v_lat 4 (R0 · SS-1)`,
    tracks: ['T1', 'T2', 'T3'].map((t) => load(`../data/tracks/experiment/${t}-s${k.toFixed(1)}.json`) as Track),
    opts: { reaction: false, slipstream: true },
  })),
];

const rows: (string | number)[][] = [];
for (const set of SETS) {
  const acc = { races: 0, swaps: 0, kept: 0, straight: 0, corner: 0, sameLane: 0, contactTick: 0, overtakes: 0 };
  for (const track of set.tracks) {
    const course = buildCourse(track.segments, true);
    for (const seed of QA_CONFIRM_SEEDS) {
      const r = race(track, seed, testCar(BASE), { k: EXIT_LIMIT_RELAX, ...set.opts });
      acc.races++;
      acc.overtakes += r.events.filter((e) => e.kind === 3).length;
      const finish = new Map(r.events.filter((e) => e.kind === 9).map((e) => [e.cars[0], e.tick]));
      const contactAt = new Set(r.events.filter((e) => e.kind === 4).map((e) => `${e.tick}:${e.cars.join(',')}`));
      const F = r.frames;
      const n = F[0].length;
      for (let k = 1; k < F.length; k++) {
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            if ((finish.get(i) ?? Infinity) <= k || (finish.get(j) ?? Infinity) <= k) continue;
            const before = Math.sign(F[k - 1][i] - F[k - 1][j]);
            const now = Math.sign(F[k][i] - F[k][j]);
            if (!before || !now || before === now) continue;
            acc.swaps++;
            const kEnd = Math.min(F.length - 1, k + HOLD);
            const kept = Math.sign(F[kEnd][i] - F[kEnd][j]) === now;
            if (!kept) continue;
            acc.kept++;
            const ahead = now > 0 ? i : j;
            if (segAt(course, F[k][ahead]).kind === 'straight') acc.straight++;
            else acc.corner++;
            if (Math.abs(r.lateral[k - 1][i] - r.lateral[k - 1][j]) < 2) acc.sameLane++;
            if (contactAt.has(`${k}:${i},${j}`)) acc.contactTick++;
          }
      }
    }
  }
  const per = (v: number) => f(v / acc.races, 2);
  rows.push([set.name, acc.races, per(acc.swaps), per(acc.kept), per(acc.straight), per(acc.corner), per(acc.sameLane), per(acc.contactTick), per(acc.overtakes)]);
}

out('# 기록 검증: 위치로 본 앞뒤 바뀜 대 추월 사건 기록');
out();
out(`확인용 시드 ${QA_CONFIRM_SEEDS[0]}~${QA_CONFIRM_SEEDS.at(-1)} × 트랙 3종, 테스트 기준 차 + F-2 상대 9대. 값은 레이스당 평균. 유지 = 1초 안에 되돌아가지 않은 바뀜. 같은 차선대 = 바뀌는 순간 횡 거리 2u 미만.`);
out();
out(table(['레이스 묶음', '레이스 수', '앞뒤 바뀜(전부)', '유지된 바뀜', '그중 직선', '그중 코너', '그중 같은 차선대', '그중 접촉 시작 틱', '추월 기록(종류 3)'], rows));
