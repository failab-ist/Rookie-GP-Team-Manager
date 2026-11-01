// 추월 5단계 흐름 2대 시험 (AG-P036 A). 단계마다 새 규칙이 의도대로 움직이는지 긴 직선(LONG-1000)과 T1에서 본다.
// node qa/otflow2.ts > qa/results/<파일>.md
import { CAR_LENGTH, CAR_WIDTH, LANE_WIDTH, TICK_SECONDS } from '../src/config.ts';
import { buildCourse, carParams, segAt } from '../src/physics.ts';
import { simulate } from '../src/sim.ts';
import type { Entry, RaceOptions, Track } from '../src/types.ts';
import { BASE, f, load, NPC, out, table, TRACKS } from './lib.ts';
import { STAGES } from './otstages.ts';

const V0 = carParams(BASE).vTop;
const entry = (top: number, id: string): Entry => ({ racer: { id, stats: NPC, passiveId: null }, car: { id, stats: { ...BASE, topSpeed: top } } });
const TRACK_CASES: { track: Track; laps: number }[] = [
  { track: load('../data/tracks/experiment/LONG-1000.json'), laps: 2 },
  { track: TRACKS[0], laps: 2 },
];

function run(track: Track, laps: number, dTop: number, opts: Partial<RaceOptions>) {
  const r = simulate(
    { seed: 1, track, laps, entries: [entry(5, 'front'), entry(5 + dTop, 'rear')] },
    { reaction: false, slipstream: true, ...opts },
    { start: [{ s: 10 + CAR_LENGTH + 5, lane: 1, v: V0 }, { s: 10, lane: 1, v: V0 }], trace: true },
  );
  const course = buildCourse(track.segments, true);
  const tr = r.trace!;
  let lcStartCorner = 0;
  let lcStarts = 0;
  let cappedAfterClear = 0;
  let releasedTicks = 0;
  for (let k = 1; k < tr.length; k++) {
    const [, from, to, prog, capped] = tr[k][1];
    const startedNow = from !== to && tr[k - 1][1][1] === tr[k - 1][1][2];
    if (startedNow) {
      lcStarts++;
      if (segAt(course, r.frames[k][1]).kind === 'corner') lcStartCorner++;
    }
    if (from !== to && Math.abs(to - from) * LANE_WIDTH * prog >= CAR_WIDTH) {
      if (capped) cappedAfterClear++;
      else releasedTicks++;
    }
  }
  const passes = r.events.filter((e) => e.kind === 3).map((e) => `${e.cause!.split(':by:')[0]}@${e.segment}`);
  const j = (k: number) => r.judgements.filter((x) => x.kind === k);
  return [
    `+${dTop}`,
    j(1).length,
    j(7).length,
    passes.join(', ') || '없음',
    `${lcStarts} (코너 ${lcStartCorner})`,
    `${releasedTicks} / ${cappedAfterClear}`,
    r.events.filter((e) => e.kind === 4).map((e) => `${e.cause}@${e.segment}`).join(', ') || '–',
    j(9).length,
    j(8).map((x) => x.cause).join(', ') || '–',
    r.finishOrder[0] === 1 ? '뒤차' : '앞차',
  ];
}

out('# 추월 5단계 흐름 2대 시험');
out();
out(`두 차 모두 ${V0} u/s, 1번 차선, 간격 5u, 슬립스트림 SS-1, 반응 지연 R0, 시드 1. 뒤차 최고속도 +0 / +1 / +2. 두 트랙 모두 2랩(부스트 구간 시작점은 2랩째에 지난다).`);
out('- 차선 변경 시작 (코너) = 변경을 시작한 횟수, 괄호는 코너 안에서 시작한 횟수 (OT-3이면 0이어야 함).');
out(`- 해제 / 상한 = 옆 간격이 차 폭(${CAR_WIDTH}u) 이상 벌어진 뒤 상한이 풀린 틱 / 계속 걸린 틱 (OT-2이면 상한 0이어야 함).`);
out('- 추월(OT-4) = 원인:S1|free@구간. 1등 = 결승 순서 1위.');
for (const st of STAGES) {
  out();
  out(`## ${st.name}`);
  for (const { track, laps } of TRACK_CASES) {
    out();
    out(`### ${track.id}`);
    out();
    out(
      table(
        ['뒤차', '시도', 'S1 성공', '추월(OT-4)', '차선 변경 시작 (코너)', '해제 / 상한', '접촉', '부스트', '코너 우선권', '1등'],
        [0, 1, 2].map((d) => run(track, laps, d, st.opts)),
      ),
    );
  }
}

// ---------- 규칙별 직접 확인 ----------
out();
out('## 규칙별 직접 확인');
const long: Track = load('../data/tracks/experiment/LONG-1000.json');
const L1000 = long.segments.reduce((a, x) => a + x.length, 0);
const two = (track: Track, opts: Partial<RaceOptions>, start: { s: number; lane: number; v: number }[], tops = [5, 5], laps = 1) =>
  simulate({ seed: 1, track, laps, entries: [entry(tops[0], 'a'), entry(tops[1], 'b')] }, { reaction: false, slipstream: true, ...opts }, { start, trace: true });

// OT-5: 같은 차 2대, 뒤차가 1초 안(간격 5u). 코너 T1-02 안 최저 속도
const t1 = TRACKS[0];
const c02 = t1.segments[1];
const cornerMin = (r: ReturnType<typeof simulate>, i: number) =>
  Math.min(...r.trace!.map((row, k) => (r.frames[k + 1][i] >= 150 && r.frames[k + 1][i] < 150 + c02.length ? row[i][0] : Infinity)));
const dirty = [0, 3].map((x) => two(t1, { dirtyAir: x }, [{ s: 21, lane: 1, v: 125 }, { s: 10, lane: 1, v: 125 }]));
out();
out(table(['OT-5 더티 에어', '앞차 T1-02 최저 속도', '뒤차(추격) T1-02 최저 속도'], dirty.map((r, i) => [i ? '3%' : '꺼짐', f(cornerMin(r, 0), 2), f(cornerMin(r, 1), 2)])));

// OT-6: LONG-1000 2랩, 앞차가 1초 안에 있는 뒤차가 부스트 구간 시작점을 지나면 그 직선 동안 최고속도 +y%
const lap2Max = (r: ReturnType<typeof simulate>, i: number) =>
  Math.max(...r.trace!.map((row, k) => (r.frames[k + 1][i] >= L1000 && r.frames[k + 1][i] < L1000 + 1000 ? row[i][0] : 0)));
const boostRows = [0, 3, 5, 8].map((y) => {
  const r = two(long, { boost: y }, [{ s: 21, lane: 0, v: 125 }, { s: 10, lane: 2, v: 125 }], [5, 5], 2);
  return [y ? `${y}%` : '꺼짐', r.judgements.filter((x) => x.kind === 9).map((x) => `차 ${x.cars[0]}`).join(', ') || '없음', f(lap2Max(r, 0), 1), f(lap2Max(r, 1), 1)];
});
out();
out(table(['OT-6 부스트 (차선 0 · 2로 막힘 없음)', '부스트 받은 차', '앞차 2랩 직선 최고 속도', '뒤차 2랩 직선 최고 속도'], boostRows));

// OT-7: 직선 끝(코너 L-02 시작 1000u) 앞에서 두 차가 나란히. 간격 3u(둘 다 상대 중심보다 앞 → 안쪽 차선), 5u(앞 범퍼 기준)
const prioRows: (string | number)[][] = [];
for (const [gap, lanes] of [[3, [1, 0]], [5, [1, 0]], [5, [0, 1]]] as [number, number[]][])
  for (const on of [false, true]) {
    const r = two(long, { cornerPriority: on }, [{ s: 950 + gap, lane: lanes[0], v: 110 }, { s: 950, lane: lanes[1], v: 110 }], [5, 5]);
    const j = r.judgements.find((x) => x.kind === 8);
    const kEnd = r.frames.findIndex((p) => Math.min(p[0], p[1]) >= 1100);
    prioRows.push([`${gap}u, 앞차 ${lanes[0]}번 · 뒤차 ${lanes[1]}번`, on ? '켬' : '꺼짐', j?.cause ?? '–', f(r.frames[kEnd][0] - r.frames[kEnd][1], 1), r.events.filter((e) => e.kind === 4).length]);
  }
out();
out(table(['OT-7 나란히 진입 (안쪽 = 0번)', '코너 우선권', '판정 (winner:차:근거)', '코너 끝에서 앞차 − 뒤차 (u)', '접촉'], prioRows));
