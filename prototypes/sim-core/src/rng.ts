// 시드 난수. 같은 시드면 같은 수열 (TECH_STACK.md:30). Math.random 금지.

export type Rng = () => number;

// mulberry32: uint32 시드 → [0, 1)
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates. 원본은 건드리지 않고 새 배열을 돌려준다.
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// (시드, 슬롯, 판정 종류)별 하위 스트림 (INT §3.7 R7-1). 섞는 방법은 가안 (O-001, INT Q-59)
const STREAM_KINDS = { grid: 1, react: 2, try: 3, win: 4, eps: 5, pass: 6 } as const;
export type StreamKind = keyof typeof STREAM_KINDS;

export function subStream(seed: number, slot: number, kind: StreamKind): Rng {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16) ^ Math.imul(slot + 1, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ Math.imul(STREAM_KINDS[kind], 0xc2b2ae35), 0x27d4eb2f);
  return createRng((h ^ (h >>> 16)) >>> 0);
}
