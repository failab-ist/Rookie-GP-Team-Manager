// 레이서 능력치 S-A 판단형 (AG-P027 A). RACER = design_ssot/drafts/RACER_STATS_PASSIVES_DRAFT.md
import { LAT_ERR_C, LAT_ERR_E0, RACER_K, RACER_P0, RACER_P_MAX, RACER_P_MIN, RACER_STAT_MAX } from './config.ts';
import type { RacerStats } from './types.ts';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const norm = (v: number) => v / RACER_STAT_MAX; // RACER F2
const mean = (s: RacerStats) => (norm(s.overtake) + norm(s.control) + norm(s.focus)) / 3; // RACER F2 n̄

// RACER F3. 추월: 시도 확률 p_try (INT §4.3), 집중: 혼전에서 실수하지 않을 확률
export const judgeProb = (s: RacerStats, stat: number) => clamp(RACER_P0 + RACER_K * (norm(stat) - mean(s)), RACER_P_MIN, RACER_P_MAX);
export const pTry = (s: RacerStats) => judgeProb(s, s.overtake);
export const pFocus = (s: RacerStats) => judgeProb(s, s.focus);

// RACER F4를 u로 환산한 횡 입력 오차 범위 err (INT §4.4 S-A). ε ~ U(−err, err)
export const lateralErr = (s: RacerStats) => Math.max(0, LAT_ERR_E0 * (1 - LAT_ERR_C * norm(s.control)));

// 고유 패시브 3종 P-C (AG-P028 C). 동작은 sim.ts의 패시브 처리, 수치는 config
export const PASSIVES = ['gap-hunter', 'corner-architect', 'calm-solver'] as const; // 틈새 사냥꾼, 코너 설계자, 침착한 해결사 (이름은 GLOSSARY 미등록)
export type PassiveId = (typeof PASSIVES)[number];
export const isPassive = (id: string | null): id is PassiveId => PASSIVES.includes(id as PassiveId);
