// 우승자가 바뀐 레이스 추적 (측정만, 기본값 그대로. 지시서 2026-11-02).
// 비교 쌍: 현행(MOTIF_ALL) 대 더티 에어 0, 현행 대 더티 에어 1.5 + 부스트 8. L-B 3트랙, 출발 순서 10가지 순환(backfield.ts와 같은 설계).
// node qa/winpath.ts collect <adjust|confirm> <M1|M2|M3> > <파일>.json   레이스 하나씩 기록 (트랙마다 따로 돌려 병렬)
// node qa/winpath.ts report <json 파일들>                                 1~5 표
import { readFileSync } from 'node:fs';
import { CAR_LENGTH, MOTIF_ALL, QA_ADJUST_SEEDS, QA_CONFIRM_SEEDS, TICK_SECONDS } from '../src/config.ts';
import type { RaceOptions, Track } from '../src/types.ts';
import { BASE, f, load, mean, out, STUCK, table, testCar, tryRace } from './lib.ts';

const N = 10;
const FINAL: Partial<RaceOptions> = { reaction: false, slipstream: true, ...MOTIF_ALL };
const SETS: Record<string, { name: string; opts: Partial<RaceOptions> }> = {
  cur: { name: `현행 (더티 에어 3, 부스트 ${MOTIF_ALL.boost})`, opts: FINAL },
  da0: { name: '더티 에어 0', opts: { ...FINAL, dirtyAir: 0 } },
  combo: { name: '더티 에어 1.5 + 부스트 8', opts: { ...FINAL, dirtyAir: 1.5, boost: 8 } },
};
const PAIRS = [['cur', 'da0'], ['cur', 'combo']] as const;
const rotate = (k: number) => Array.from({ length: N }, (_, slot) => (slot - k + N) % N);
const CAUSE_KO: Record<string, string> = { contact: '접촉', mistake: '상대 실수', boost: '부스트', brake: '제동', corner: '코너', exit: '탈출', straight: '직선', none: 'OT-4 기록 없음 (같은 두 차가 1초 안에 다시 바뀜)', start: '출발부터 1위' };

// 순위 변경 한 건: 앞지른 차 · 앞지른 대상, 그때 랩 · 구간, OT-4 원인, S1 여부, 간격(차 길이 뺀 앞뒤 거리)과 속도 차(앞지른 차 − 대상, u/s)
type Change = { tick: number; by: number; over: number; lap: number; seg: string; cause: string; s1: boolean; gap: number; gap1s: number; dv: number; rank?: [number, number] };
type RaceRec = { winner: number; winnerSlot: number; decisive: Change | null; leads: Change[]; passes: Change[]; path: Change[] };
type CapRec = { dt: number; gap: number; dv: number; gapEnd: number; dvEnd: number };

const [part, set, trackArg] = process.argv.slice(2);

if (part === 'collect') {
  const seeds = set === 'confirm' ? QA_CONFIRM_SEEDS : QA_ADJUST_SEEDS;
  const t: Track = load(`../data/tracks/motif/${trackArg}-LB.json`);
  const races: Record<string, unknown>[] = [];
  const caps: Record<string, CapRec[]> = { cur: [], da0: [], combo: [] };
  const winners: Record<string, number[]> = { cur: [], da0: [], combo: [] };
  for (let k = 0; k < N; k++)
    for (const seed of seeds) {
      const grid = rotate(k);
      const recs: Record<string, RaceRec | null> = {};
      for (const key of Object.keys(SETS)) {
        const r = tryRace(t, seed, testCar(BASE), SETS[key].opts, { grid, trace: true });
        if (!r) {
          recs[key] = null;
          continue;
        }
        const fr = r.frames;
        const v = (tk: number, i: number) => (fr[tk][i] - fr[Math.max(0, tk - 1)][i]) / TICK_SECONDS;
        const gapAt = (tk: number, back: number, front: number) => fr[Math.max(0, tk)][front] - fr[Math.max(0, tk)][back] - CAR_LENGTH;
        const passes = r.events.filter((e) => e.kind === 3);
        const change = (tick: number, by: number, over: number, lap: number, seg: string): Change => {
          const p = passes.find((e) => e.tick === tick && e.cause!.endsWith(`:by:${by}`) && e.cars.includes(over));
          const [cause, mode] = p ? p.cause!.split(':') : ['none', 'free'];
          const back = Math.round(1 / TICK_SECONDS);
          return { tick, by, over, lap, seg, cause, s1: mode === 'S1', gap: gapAt(tick - 1, by, over), gap1s: gapAt(tick - back, by, over), dv: v(tick, by) - v(tick, over) };
        };
        const winner = r.finishOrder[0];
        // 1위 변경(종류 6, cars = [앞 선두, 새 선두] 오름차순, cause by:<새 선두>)
        const leads = r.events
          .filter((e) => e.kind === 6)
          .map((e) => {
            const by = Number(e.cause!.slice(3));
            return change(e.tick, by, e.cars.find((c) => c !== by)!, e.lap, e.segment);
          });
        const lastToWinner = [...leads].reverse().find((c) => c.by === winner) ?? null;
        // 우승자의 순위 변경 경로: 우승자의 종류 2(순위 변화) 하나하나에 같은 틱 추월 기록을 붙인다
        const path = r.events
          .filter((e) => e.kind === 2 && e.cars[0] === winner && e.tick > 0)
          .map((e) => {
            const gained = e.rank![1] < e.rank![0];
            // 이번 틱에 우승자와 앞뒤가 바뀐 차 (위치로 찾는다. 1초 안에 되돌아간 경우도 포함)
            const flipped = (j: number) => j !== winner && Math.sign(fr[e.tick - 1][winner] - fr[e.tick - 1][j]) !== Math.sign(fr[e.tick][winner] - fr[e.tick][j]);
            const other = Array.from({ length: N }, (_, j) => j).find(flipped) ?? -1;
            const c = gained ? change(e.tick, winner, other, e.lap, e.segment) : change(e.tick, other, winner, e.lap, e.segment);
            return { ...c, rank: e.rank! };
          });
        recs[key] = {
          winner,
          winnerSlot: grid.indexOf(winner) + 1,
          decisive: lastToWinner,
          leads,
          passes: passes.map((e) => {
            const [cause, mode, , by] = e.cause!.split(':');
            const b = Number(by);
            const over = e.cars.find((c) => c !== b)!;
            return { ...change(e.tick, b, over, e.lap, e.segment), cause, s1: mode === 'S1' };
          }),
          path,
        };
        winners[key].push(winner);
        // 5. 정식 시도 실패(구간 끝 · 되돌림) 가운데 막힘 상한이 걸린 시도: 처음 상한이 걸린 틱 → 시도 끝 틱
        const tr = r.trace!;
        for (const tj of r.judgements.filter((j) => j.kind === 1)) {
          const [x, y] = tj.cars;
          const trier = fr[tj.tick][x] < fr[tj.tick][y] ? x : y;
          const front = trier === x ? y : x;
          const res = r.judgements.find((j) => j.tick >= tj.tick && j !== tj && (j.kind === 7 || j.kind === 2 || j.kind === 3) && j.cars[0] === x && j.cars[1] === y);
          if (!res || res.kind === 7) continue;
          let first = -1;
          for (let tk = tj.tick; tk < res.tick && tk < tr.length; tk++)
            if (tr[tk][trier][4]) {
              first = tk;
              break;
            }
          if (first < 0) continue;
          caps[key].push({ dt: (res.tick - first) * TICK_SECONDS, gap: gapAt(first, trier, front), dv: v(first, trier) - v(first, front), gapEnd: gapAt(res.tick, trier, front), dvEnd: v(res.tick, trier) - v(res.tick, front) });
        }
      }
      const differs = PAIRS.filter(([a, b]) => recs[a] && recs[b] && recs[a]!.winner !== recs[b]!.winner).map(([a, b]) => `${a}-${b}`);
      if (differs.length) races.push({ track: t.id, seed, k, differs, recs });
    }
  process.stdout.write(JSON.stringify({ set, track: t.id, boostZone: t.boostZone, races, caps, winners, stuck: STUCK.length }) + '\n');
}

if (part === 'report') {
  const data = process.argv.slice(3).filter((a) => a !== '--short').map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const races = data.flatMap((d) => d.races) as { track: string; seed: number; k: number; differs: string[]; recs: Record<string, RaceRec> }[];
  const zones = new Set(data.map((d) => d.boostZone));
  const total = data.reduce((s, d) => s + d.winners.cur.length, 0);
  const pc = (n: number, of: number) => `${n} (${f((n / Math.max(1, of)) * 100, 1)}%)`;
  const dist = (xs: string[], keys?: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return [...(keys ?? [...m.keys()].sort())].filter((kk) => m.has(kk)).map((kk) => `${kk} ${pc(m.get(kk)!, xs.length)}`).join('<br>') || '–';
  };
  const causeKeys = ['start', 'contact', 'mistake', 'boost', 'brake', 'corner', 'exit', 'straight', 'none'];
  const causeOf = (c: Change | null) => CAUSE_KO[c ? c.cause : 'start'];
  const kindOf = (c: Change) => (zones.has(c.seg) ? '부스트 구간 직선' : c.seg.includes('-S') ? '다른 직선' : '코너');
  const KIND_KEYS = ['부스트 구간 직선', '다른 직선', '코너'];
  const short = process.argv.includes('--short');
  const segOf = (c: Change) => `${c.seg}${c.seg.includes('-S') ? ' 직선' : ' 코너'}${zones.has(c.seg) ? ' (부스트 구간)' : ''}`;
  const q = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return s.length ? `${f(mean(s), 2)} · ${f(at(0.1), 2)} / ${f(at(0.25), 2)} / ${f(at(0.5), 2)} / ${f(at(0.75), 2)} / ${f(at(0.9), 2)}` : '–';
  };
  out(`레이스 ${total}개(설정마다, 3트랙 × 50시드 × 출발 순서 10가지), 멈춘 레이스 ${data.reduce((s, d) => s + d.stuck, 0)}.`);
  out();
  for (const [a, b] of PAIRS) {
    const sel = races.filter((r) => r.differs.includes(`${a}-${b}`));
    out(`### ${SETS[a].name} 대 ${SETS[b].name}: 우승자가 다른 레이스 ${pc(sel.length, total)}`);
    out();
    out(
      table(
        ['설정', '우승자 출발 자리 1 / 2 / 3~10', '결정 순간 (우승자가 마지막으로 1위가 된 순간) 원인', 'S1 / 아님', '랩', '구간 종류', ...(short ? [] : ['구간']), '간격 1초 전 · 직전 (u)', '속도 차 (u/s)'],
        [a, b].map((key) => {
          const rs = sel.map((r) => r.recs[key]);
          const dec = rs.map((r) => r.decisive).filter((c): c is Change => !!c);
          return [
            SETS[key].name,
            [1, 2].map((s) => rs.filter((r) => r.winnerSlot === s).length).join(' / ') + ` / ${rs.filter((r) => r.winnerSlot > 2).length}`,
            dist(rs.map((r) => causeOf(r.decisive)), causeKeys.map((kk) => CAUSE_KO[kk])),
            `${dec.filter((c) => c.s1).length} / ${dec.filter((c) => !c.s1).length}`,
            dist(dec.map((c) => `${c.lap}랩`)),
            dist(dec.map(kindOf), KIND_KEYS),
            ...(short ? [] : [dist(dec.map(segOf))]),
            `${f(mean(dec.map((c) => c.gap1s)), 1)} · ${f(mean(dec.map((c) => c.gap)), 1)}`,
            f(mean(dec.map((c) => c.dv)), 2),
          ];
        }),
      ),
    );
    out();
    if (short) continue;
    out('같은 레이스들의 모든 1위 변경 (종류 6) · 모든 순위 변경 (OT-4 추월 기록, 1초 유지):');
    out();
    const group = (key: string, pick: (r: RaceRec) => Change[]) => {
      const cs = sel.flatMap((r) => pick(r.recs[key]));
      return [`${cs.length}`, dist(cs.map((c) => CAUSE_KO[c.cause]), causeKeys.map((kk) => CAUSE_KO[kk])), `${cs.filter((c) => c.s1).length} / ${cs.filter((c) => !c.s1).length}`, dist(cs.map((c) => `${c.lap}랩`)), dist(cs.map(kindOf), KIND_KEYS), dist(cs.map(segOf))];
    };
    out(
      table(
        ['설정', '묶음', '건수', '원인', 'S1 / 아님', '랩', '구간 종류', '구간'],
        [a, b].flatMap((key) => [
          [SETS[key].name, '1위 변경', ...group(key, (r) => r.leads)],
          [SETS[key].name, '모든 순위 변경', ...group(key, (r) => r.passes)],
        ]),
      ),
    );
    out();
  }
  {
    out('### 5. 정식 시도 실패 가운데 막힘 상한이 걸린 시도: 처음 상한이 걸린 틱 → 시도 끝');
    out();
    out('값: 평균 · 10 / 25 / 50 / 75 / 90 백분위. 간격 = 앞차 위치 − 시도한 차 위치 − 차 길이 (u), 속도 차 = 시도한 차 − 앞차 (u/s).');
    out();
    out(
      table(
        ['설정', '시도 수', '상한 → 끝 시간 (s)', '상한 걸린 순간 간격 (u)', '상한 걸린 순간 속도 차', '끝 순간 간격 (u)', '끝 순간 속도 차'],
        Object.keys(SETS).map((key) => {
          const cs = data.flatMap((d) => d.caps[key]) as CapRec[];
          return [SETS[key].name, cs.length, q(cs.map((c) => c.dt)), q(cs.map((c) => c.gap)), q(cs.map((c) => c.dv)), q(cs.map((c) => c.gapEnd)), q(cs.map((c) => c.dvEnd))];
        }),
      ),
    );
  }
}

// node qa/winpath.ts examples <json 파일들>   4. 자리 3~10에서 출발해 이긴 차의 경로 (쌍마다 5레이스)
if (part === 'examples') {
  const races = process.argv.slice(3).flatMap((p) => JSON.parse(readFileSync(p, 'utf8')).races) as { track: string; seed: number; k: number; differs: string[]; recs: Record<string, RaceRec> }[];
  for (const [a, b] of PAIRS) {
    // 같은 (트랙, 출발 순서)는 시드만 달라도 거의 같은 레이스라 하나만, 트랙을 돌아가며 5개
    const seen = new Set<string>();
    const cand = races.filter((r) => r.differs.includes(`${a}-${b}`) && r.recs[b].winnerSlot > 2 && !seen.has(`${r.track}|${r.k}`) && seen.add(`${r.track}|${r.k}`));
    const byTrack = [...new Set(cand.map((r) => r.track))].map((t) => cand.filter((r) => r.track === t));
    const sel = Array.from({ length: Math.max(0, ...byTrack.map((x) => x.length)) }, (_, i) => byTrack.map((x) => x[i]).filter(Boolean)).flat().slice(0, 5);
    for (const r of sel) {
      const w = r.recs[b];
      out(`- **${SETS[b].name}, ${r.track} 시드 ${r.seed} 순서 ${r.k}**: 차 ${w.winner} 출발 자리 ${w.winnerSlot} → 1위 (현행 우승 차 ${r.recs[a].winner}, 자리 ${r.recs[a].winnerSlot})`);
      for (const c of w.path) {
        const t = f(c.tick * TICK_SECONDS, 2);
        const gained = c.rank![1] < c.rank![0];
        const who = gained ? `차 ${c.over} 앞지름` : `차 ${c.by}에게 뒤짐`;
        out(`  - ${t} s, ${c.lap}랩 ${c.seg}: ${c.rank![0]}위 → ${c.rank![1]}위, ${who}, ${CAUSE_KO[c.cause]}${c.cause === 'none' ? '' : c.s1 ? ' · S1' : ' · S1 아님'}, 간격 1초 전 ${f(c.gap1s, 1)} u, 속도 차 ${f(c.dv, 1)} u/s`);
      }
    }
  }
}
