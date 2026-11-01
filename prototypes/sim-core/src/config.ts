// 가안 수치 모음. 확정 값이 아니다. 같은 수치를 다른 파일에 쓰지 않는다.
// CAR = design_ssot/drafts/CAR_STATS_TRACKS_PROTO_DRAFT.md

export const ENTRY_COUNT = 10; // LOCKED, design_ssot/SPEC_INDEX.md:35 (10대 동시)

export const RACER_STAT_TOTAL = 15; // 가안, design_ssot/drafts/RACER_STATS_PASSIVES_DRAFT.md:34 (GDD:211)
export const RACER_STAT_MAX = 10; // 가안, design_ssot/drafts/RACER_STATS_PASSIVES_DRAFT.md:163

export const DEFAULT_LAPS = 3; // 가안, design_ssot/drafts/RACE_UNIT_LENGTH_CAMERA_P0_DRAFT.md:90 (계산 예시 N_lap). O-001 미정

export const TICK_SECONDS = 0.05; // 가안, 근거 없음. 틱 길이는 O-001 미정 (design_ssot/drafts/RACE_DIRECTING_P0_DRAFT.md:128)
export const SUBSTEPS = 10; // 가안, 근거 없음. 틱 하나를 물리 계산에서 나누는 횟수 (기록은 틱 단위)

// 차량 4능력치 (CAR §6, §7 F1)
export const CAR_STAT_MAX = 10; // 가안, CAR §7 F1
export const CAR_TOTAL = 20; // 가안, CAR §6 (시험차 X, Y 합계). 데이터 로드 때만 검사한다
export const BASE_CAR_STAT = 5; // 가안, CAR §4.2 (기준 차 = 4능력치 모두 5). 코너 검사와 QA 기준

// 계수 (CAR §7.0, 가안, 근거 없음. 계산 예시용 값)
export const V0 = 100; // 최고속도 기본값 u/s, CAR §7 F2
export const KV = 0.5; // CAR §7 F2
export const A0 = 40; // 가속 기본값 u/s², CAR §7 F3a
export const KA = 0.5; // CAR §7 F3a
export const G0 = 60; // 접지 기준값 u/s, CAR §7 F4
export const KG = 0.5; // CAR §7 F4
export const B0 = 60; // 제동 기본값 u/s², CAR §7 F5a
export const KB = 0.5; // CAR §7 F5a

export const P_APEX = 0.5; // 가안, CAR §7 F7 (정점 위치 = 코너 길이 비율)

// 정점 뒤 한계가 코너 끝으로 갈수록 풀리는 정도 k (AG-P024 B, 디렉터 2026-11-02).
// 한계 = min(V_top, Vg / (bend · (1 − k·s))), s는 정점 0 → 코너 끝 1. 0이면 CAR F7의 한계 일정과 같다.
export const EXIT_LIMIT_RELAX = 0.2; // 가안, 근거 없는 시험값

// 자동 QA (CAR §10, §12)
export const QA_DELTA = 1; // 가안, CAR §10 (능력치 변화량 Δ)
export const QA_THETA1 = 0.02; // 가안, CAR §12.1 (직접 장면 개선 합격선)
export const QA_THETA0 = 0.005; // 가안, CAR §12.1 (간접 장면 변화 허용선)
export const QA_L_EXIT = 30; // 가안, CAR §12.1 (탈출 시험 길이 u). 가속 직선 장면 길이로도 쓴다 (CAR §7 F6a 예시)
export const QA_Q_RANK = 0.6; // 가안, CAR §12.2 (순위 바뀐 시드 비율 q)
export const QA_ADVANCE_SHARE = 0.5; // 가안, CAR §12.2 (바뀐 시드 중 +Δ가 앞선 비율)
export const QA_R_REPRO = 3; // 가안, CAR §12.5 (재현 반복 횟수)
// 조정용 · 확인용 시드는 겹치지 않는다 (CAR §12.4, 각 50개 가안). 확인용 결과로 계수를 고치지 않는다
export const QA_ADJUST_SEEDS = Array.from({ length: 50 }, (_, i) => 1 + i);
export const QA_CONFIRM_SEEDS = Array.from({ length: 50 }, (_, i) => 10001 + i);
