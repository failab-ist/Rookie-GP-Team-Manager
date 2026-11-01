// 가속과 제동 직접 측정 (차 1대, 원본 트랙, 단독 주행 2랩째, k = 가안).
// 코너마다 탈출 뒤 최고속도까지, 제동 시작부터 코너 진입까지의 시간 · 거리와 1바퀴 시간 구성. 기준 차와 가속 +1, 제동 +1.
// node qa/phases.ts > qa/results/<파일>.md
import { EXIT_LIMIT_RELAX } from '../src/config.ts';
import { buildCourse, carParams, runSolo, type CarParams } from '../src/physics.ts';
import type { CarStats, Track } from '../src/types.ts';
import { BASE, EPS, f, out, table, TRACKS } from './lib.ts';

type Phase = 'corner' | 'accel' | 'brake' | 'top';
const PHASE_KO: Record<Phase, string> = { corner: '코너 안', accel: '가속 중(직선)', brake: '제동 중', top: '최고속도 유지' };

function measure(track: Track, p: CarParams) {
  const c = buildCourse(track.segments, true);
  const L = c.length;
  const tr = runSolo(c, p, EXIT_LIMIT_RELAX, { x0: 0, v0: 0, xEnd: 2 * L + 1 });
  const time: Record<Phase, number> = { corner: 0, accel: 0, brake: 0, top: 0 };
  const seg = (x: number) => c.segs.find((s) => x % L >= s.start && x % L < s.end) ?? c.segs[c.segs.length - 1];
  for (let i = 1; i < tr.x.length; i++) {
    if (tr.x[i - 1] < L || tr.x[i - 1] >= 2 * L) continue; // 2랩째만
    const dt = tr.t[i] - tr.t[i - 1];
    const ph: Phase =
      seg(tr.x[i - 1]).kind === 'corner' ? 'corner' : tr.v[i] >= p.vTop - EPS ? 'top' : tr.v[i] > tr.v[i - 1] + 1e-9 ? 'accel' : tr.v[i] < tr.v[i - 1] - 1e-9 ? 'brake' : 'top';
    time[ph] += dt;
  }
  const lap = time.corner + time.accel + time.brake + time.top;
  const corners = c.segs
    .filter((s) => s.kind === 'corner')
    .map((s) => {
      // 탈출: 코너 끝부터 최고속도에 닿거나 제동이 시작될 때까지
      const i0 = tr.x.findIndex((x) => x >= L + s.end);
      let i = i0;
      while (i + 1 < tr.x.length && tr.v[i] < p.vTop - EPS && tr.v[i + 1] >= tr.v[i] - 1e-9 && seg(tr.x[i]).kind === 'straight') i++;
      const reached = tr.v[i] >= p.vTop - EPS;
      // 제동: 코너 앞 직선에서 속도가 줄기 시작한 점부터 코너 시작까지 (묶음 안 코너는 없음)
      const prev = c.segs[(c.segs.indexOf(s) - 1 + c.segs.length) % c.segs.length];
      let brake = { t: 0, d: 0 };
      if (prev.kind === 'straight') {
        const iStart = tr.x.findIndex((x) => x >= L + s.start);
        let j = iStart;
        while (j > 0 && tr.v[j - 1] > tr.v[j] + 1e-9) j--;
        brake = { t: tr.t[iStart] - tr.t[j], d: tr.x[iStart] - tr.x[j] };
      }
      const intoCorner = s.next?.kind === 'corner';
      return { id: s.id, intoCorner, exitT: tr.t[i] - tr.t[i0], exitD: tr.x[i] - tr.x[i0], reached, brakeT: brake.t, brakeD: brake.d };
    });
  return { lap, time, corners };
}

const CARS_: [string, CarStats][] = [
  ['기준 차', BASE],
  ['가속 +1', { ...BASE, accel: BASE.accel + 1 }],
  ['제동 +1', { ...BASE, brake: BASE.brake + 1 }],
];

out(`# 가속과 제동 직접 측정 (단독 주행 2랩째, k=${EXIT_LIMIT_RELAX})`);
out();
out('시간 해상도는 물리 스텝 0.005초(1바퀴 단축 5 ms가 최소 단위). ' +
  '탈출 = 코너 끝부터 최고속도에 닿을 때까지(닿기 전에 제동이 시작되면 거기까지, \'미도달\'). 제동 = 직선에서 속도가 줄기 시작한 점부터 코너 시작까지. 묶음 안 코너(앞이 코너)는 제동 없음.');
for (const track of TRACKS) {
  const res = CARS_.map(([, s]) => measure(track, carParams(s)));
  out();
  out(`## ${track.id}`);
  out();
  out(
    table(
      ['코너', '탈출 시간 (기준 / 가속+1)', '탈출 거리 u (기준 / 가속+1)', '제동 시간 (기준 / 제동+1)', '제동 거리 u (기준 / 제동+1)'],
      res[0].corners.map((c0, i) => {
        const a = res[1].corners[i];
        const b = res[2].corners[i];
        const ex = (c: typeof c0) => (c.intoCorner ? '다음 코너(묶음)' : `${f(c.exitT, 3)}${c.reached ? '' : ' 미도달'}`);
        return [c0.id, `${ex(c0)} / ${ex(a)}`, `${f(c0.exitD, 1)} / ${f(a.exitD, 1)}`, `${f(c0.brakeT, 3)} / ${f(b.brakeT, 3)}`, `${f(c0.brakeD, 1)} / ${f(b.brakeD, 1)}`];
      }),
    ),
  );
  out();
  out(
    table(
      ['차', '1바퀴(초)', ...(Object.keys(PHASE_KO) as Phase[]).map((k) => `${PHASE_KO[k]} 초 (비율)`), '1바퀴 단축'],
      res.map((r, i) => [
        CARS_[i][0],
        f(r.lap, 3),
        ...(Object.keys(PHASE_KO) as Phase[]).map((k) => `${f(r.time[k], 3)} (${f((r.time[k] / r.lap) * 100, 1)}%)`),
        i ? `${f(((res[0].lap - r.lap) / res[0].lap) * 100, 2)}% (${f((res[0].lap - r.lap) * 1000, 1)} ms)` : '–',
      ]),
    ),
  );
}
