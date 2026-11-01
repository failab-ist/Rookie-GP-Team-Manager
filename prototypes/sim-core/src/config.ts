// 가안 수치 모음. 확정 값이 아니다. 같은 수치를 다른 파일에 쓰지 않는다.

export const ENTRY_COUNT = 10; // LOCKED, design_ssot/SPEC_INDEX.md:35 (10대 동시)

export const RACER_STAT_TOTAL = 15; // 가안, design_ssot/drafts/RACER_STATS_PASSIVES_DRAFT.md:34 (GDD:211)
export const RACER_STAT_MAX = 10; // 가안, design_ssot/drafts/RACER_STATS_PASSIVES_DRAFT.md:163

// NPC 9대 프로필: 패시브 없는 균형형 (가안, design_ssot/drafts/RACER_STATS_PASSIVES_DRAFT.md:269). O-001 미정
export const NPC_STATS = { overtake: 5, control: 5, focus: 5 }; // 가안

export const DEFAULT_LAPS = 3; // 가안, design_ssot/drafts/RACE_UNIT_LENGTH_CAMERA_P0_DRAFT.md:90 (계산 예시 N_lap). O-001 미정

export const TICK_SECONDS = 0.05; // 가안, 근거 없음. 틱 길이는 O-001 미정 (design_ssot/drafts/RACE_DIRECTING_P0_DRAFT.md:128)

// 자리표시 주행: 모든 차가 한 랩을 이 시간에 돈다. 능력치 미반영. UNRESOLVED O-002 / AG-P020
export const PLACEHOLDER_LAP_SECONDS = 20; // 가안, design_ssot/drafts/RACE_UNIT_LENGTH_CAMERA_P0_DRAFT.md:231 (가짜 주행 기준)
