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

// 가속 공식 스위치 (AG-P029 A: 공식은 current 유지. AC1은 비교용, INT §4.7)
// INT = design_ssot/drafts/RACE_INTERACTION_P0_DRAFT.md
export const ACCEL_FORMULA: 'current' | 'AC1' = 'current';

// 능력치 1점 효과 맞추기 실험 (지시서 2026-11-02). 기본 꺼짐 = CAR F3a · F5a 계수 그대로. 최고속도 · 접지 계수는 건드리지 않는다
// P-1: 가속 · 제동의 1점당 비율 p (5점 값 대비). 5점 값(A 50, a_brk 75)은 그대로 두고 K = p / (0.1 − 0.5·p)로 계수를 다시 푼다. 0 = 꺼짐 (지금 4%), p < 0.2
export const ACCEL_POINT = 0;
export const BRAKE_POINT = 0;
// P-2: 가속 · 제동 기본값 A0 · B0 배율 (1점당 비율 4%는 그대로). 1 = 꺼짐. 지시서 예시 단계 1, 0.75, 0.5, 0.35
export const AB_BASE_SCALE = 1;
export const AB_SCALE_STEPS = [1, 0.75, 0.5, 0.35]; // 지시서 예시 (가안)
// 가속 곡선 (AG-P046 A): a(v) = A × (1 − c × (v / V_top)²). 공기저항이 속도 제곱에 비례한다는 근거만 쓴다. 0 = 꺼짐 (지금 일정 가속). 제동은 그대로
export const ACCEL_DRAG = 0;
export const ACCEL_DRAG_STEPS = [0.5, 0.7, 0.9]; // 지시서 허용 값 (이 밖은 시험하지 않는다)
export const AC1_A0 = 30; // 가안, INT §4.7 AC-1 (A = 30(1 + 1.33n))
export const AC1_KA = 1.33; // 가안, INT §4.7 AC-1

// ---------- 차끼리 상호작용 (INT §3, §4, §7. 모두 가안, 근거 없음 표시는 INT를 따름) ----------
export const KAPPA_PX_PER_U = 2; // 가안, 근거 없음. RACER px → u 환산 (INT Q-47)
export const LANE_COUNT = 3; // 가안, INT §3.1 L-A (Q-48)
export const LANE_WIDTH = 4; // 가안, INT §4.1 W_lane (Q-48)
export const LAT_SPEED = 4; // 가안, INT §4.1 v_lat u/s (기본값. 실험은 simulate 옵션 latSpeed로 바꾼다, 초안 범위 2~6)
export const WINDOW_FRONT = 12; // 가안, INT §4.1 W_f u
export const WINDOW_BACK = 8; // 가안, INT §4.1 W_b u
export const CAR_LENGTH = 6; // 가안, INT §4.2 L_car u
export const GAP_MIN = 2; // 가안, INT §4.2 g_min u
export const BLOCK_TAU = 1.0; // 가안, INT §4.2 τ s
export const CAR_WIDTH = 3; // 가안, INT §4.4 w_car u
export const TRY_GAP = 10; // 가안, INT §4.3 g_try u
export const TRY_DV_MIN = 3; // 가안, INT §4.3 Δv_min u/s
export const DECISION_SECONDS = 0.5; // 가안, INT §4.3 T_dec s
export const OVERTAKE_COOLDOWN = 3; // 가안, INT §3.3 R3-6 T_cd s
export const CONTACT_LOSS = 0.12; // 가안, 근거 없음. INT §4.4 loss (두 차 모두, 다중 접촉은 곱. Q-51)
// INT는 틱 0.1 s 기준 틱 수(n_sep 5, T_rc 30, n_force 10)로 적는다. 여기서는 초로 두고 TICK_SECONDS로 환산 (Q-59)
export const CONTACT_SEPARATE_SECONDS = 0.5; // 가안, INT §4.4 n_sep 5틱
export const CONTACT_RELOSS_SECONDS = 3; // 가안, INT §4.4 T_rc 30틱
export const CONTACT_FORCE_SECONDS = 1; // 가안, INT §4.4 n_force 10틱
export const GRID_ROW_GAP = 8; // 가안, INT §4.5 행 간격 u
export const GRID_STAGGER = 4; // 가안, INT §4.5 엇갈림 u
export const GRID_LANES = [0, 2] as const; // 가안, INT §4.5 열 A, B 차선
export const REACTION_MAX = 0.3; // 가안, INT §4.5 r_max s (R1일 때만, Q-52)
export const SLIP_GAP = 10; // 가안, INT §4.6 g_ss u (SS-1일 때만, Q-53)
export const SLIP_RATIO = 0.03; // 가안, INT §4.6 s_ss (기본값. 비교는 simulate 옵션 slipRatio)
export const DEFAULT_REACTION = false; // 가안, R0 (INT Q-52 추천 없음)
export const DEFAULT_SLIPSTREAM = true; // 가안, SS-1 (INT Q-53 추천)
// 추월 시도 조건의 '원하는 속도' 해석 (INT R3-1에 정의 없음, UNRESOLVED). 기본은 3단계와 같은 step
export const DESIRED_SPEED: 'step' | 'target' = 'step';
// 차선 변경 중 원래 차선 앞차에 속도가 묶이는지 (INT R1-1 + R2-1 글자대로 = true, §4.3 S1 예시 = false). 초안 안 충돌, 기본은 현행
export const CAP_WHILE_CHANGING = true;

// ---------- 추월 5단계 흐름 (AG-P036 A). 새 규칙은 모두 기본 꺼짐, 하나씩 켜서 잰다 (AG-P032 A) ----------
export const OT_RELEASE = false; // OT-2
export const OT_SPAN_CORNER = false; // OT-3
export const DIRTY_AIR = 0; // OT-5 접지 한계 감소 %. 켤 때 가안 3 (근거 없음)
export const DIRTY_AIR_ON = 3; // 가안, 근거 없음 (지시서 2026-11-02)
export const BOOST = 0; // OT-6 부스트 최고속도 증가 %. 비교값 3, 5, 8 (가안, 근거 없음)
export const BOOST_COMPARE = [3, 5, 8]; // 가안, 지시서 비교값
export const CORNER_PRIORITY = false; // OT-7
// 진단 비교용 (뒤 출발 차 진단, 2026-11-02). 기본값은 현행 그대로
export const BLOCK_CAP_ON = true; // false = 같은 차선 앞차 막힘 상한(INT §4.2)을 걸지 않음 (OT-7 양보 상한은 그대로)
export const OT_SPAN_STRAIGHTS = 1; // OT-3 시도 구간이 끝나는 직선 수. 1 = 다음 직선 끝(현행), 2 = 그다음 직선 끝
export const YIELD_MIN_RATIO = 0.5; // 가안, 근거 없음. OT-7 양보하는 차는 자기 코너 한계 속도의 이 비율 아래로 줄이지 않는다 (디렉터 2026-11-02)
export const YIELD_MIN_COMPARE = [0.3, 0.5, 0.7]; // 지시서 비교값 (2026-11-02)
export const CHASE_SECONDS = 1.0; // 가안, OT-5 추격 상태 = 앞차(차선 무관)와 시간 간격 1.0 s 이내
export const PASS_HOLD_SECONDS = 1.0; // 가안, OT-4 앞뒤가 바뀐 뒤 이 시간 유지되면 추월로 기록
// OT-4 원인 우선순위 (가안, UNRESOLVED): 접촉 > 상대 실수 > 부스트 > 제동 구간 > 코너(접지) > 탈출(가속) > 직선(최고속도)
export const PASS_CAUSE_ORDER = ['contact', 'mistake', 'boost', 'brake', 'corner', 'exit', 'straight'] as const;
// 모두 켠 설정은 이름 붙인 묶음으로만 쓴다 (기본값 아님). 부스트는 비교값 가운데 5 (가안)
// ---------- 접촉 규칙 정리 (AG-P039 A, AG-P040 A). 새 규칙은 모두 기본 꺼짐 ----------
export const CT_WOBBLE = false; // CT-1
export const LANE_SLACK = (LANE_WIDTH - CAR_WIDTH) / 2; // CT-1 차선 여유 = 0.5 u (계산값)
export const CT_LINE = 0; // CT-2 c_line. 켤 때 가안 0.02 (최대 2%, 근거 없음)
export const CT_LINE_ON = 0.02; // 가안, 근거 없음 (지시서 2026-11-02)
export const CT_CONTACT = false; // CT-3
export const CT_LOSS_MAJOR = 0.12; // 가안, CT-3 차선 변경 중인 차 · 뒤에서 들이받은 차 손실 (INT §4.4 loss와 같은 값)
export const CT_LOSS_MINOR = 0.03; // 가안, 근거 없음. CT-3 옆 접촉 두 차 · 그 밖의 상대 차 손실
// 모두 켠 설정은 이름 붙인 묶음으로만 (기본값 아님)
export const CT_ALL = { ctWobble: true, ctLine: CT_LINE_ON, ctContact: true };
export const OT_FLOW_ALL = { desiredSpeed: 'target' as const, otRelease: true, otSpanCorner: true, dirtyAir: DIRTY_AIR_ON, boost: 5, cornerPriority: true };
export const DEFAULT_INNER_LANE = 0; // 가안, 근거 없음. 코너 방향 데이터가 없어 모든 코너 안쪽 = 0번 (디렉터 2026-11-02)
// 트랙 데이터의 innerLane과 방향 칸 direction은 차선 규약 A(진행 방향 왼쪽 끝 = 0, L 코너 안쪽 0 · R 코너 안쪽 오른쪽 끝 = 2, DIRECTION 초안 R-1, Q-78 가안)로 읽는다.
// 안쪽 차선 = innerLane → 방향 칸(L 0, R 차선 수 − 1) → 둘 다 비면 DEFAULT_INNER_LANE (AG-P045 A)

// ---------- 모티브 트랙 (PROTO_TRACKS_MOTIF_DRAFT.md, PROTO_TRACKS_DIRECTION_BOOST_DRAFT.md). 새 규칙은 기본 꺼짐 ----------
export const BEND_MAX = 1.5; // MOTIF §5.2 bend (0.6, 1.5]. CAR §4.1은 코너 bend (0, 1] → CONFLICT (헤어핀 1.5를 받으려고 MOTIF 범위를 씀)
// OT-6 구간 모드: 트랙 데이터의 부스트 구간(트랙당 1곳 Z1, Q-81 가안), 감지 = 구간 앞 코너 진입점에서 추격 상태(CHASE_SECONDS, Q-82 가안),
// 1랩부터(Q-82 가안), 구간 끝 = E1 고정 끝 L − D_base(Q-87 가안), 슬립스트림과 겹치면 최고속도 보너스는 큰 값만(Q-80 가안)
export const BOOST_ZONE = false;
export const BOOST_ZONE_B = 4; // % (b 0.04, Q-83 가안 범위 0.02~0.06의 가운데)
// 모티브 트랙 측정 설정: OT_FLOW_ALL + CT_ALL + 구간 모드 (부스트 % 는 OT_FLOW_ALL의 5 대신 b 0.04). 이름 붙인 묶음으로만 쓴다
export const MOTIF_ALL = { ...OT_FLOW_ALL, ...CT_ALL, boostZone: true, boost: BOOST_ZONE_B };

// 레이서 능력치 S-A 판단형 (AG-P027 A, RACER F2 · F3 · F4, INT §6.1)
export const RACER_P0 = 0.5; // 가안, RACER_STATS_PASSIVES_DRAFT.md:183
export const RACER_K = 1.0; // 가안, RACER_STATS_PASSIVES_DRAFT.md:184
export const RACER_P_MIN = 0.2; // 가안, RACER_STATS_PASSIVES_DRAFT.md:186
export const RACER_P_MAX = 0.8; // 가안, RACER_STATS_PASSIVES_DRAFT.md:186
export const LAT_ERR_E0 = 4 / KAPPA_PX_PER_U; // 가안, RACER_STATS_PASSIVES_DRAFT.md:201의 4 px (INT §4.4 e0_u = 2 u)
export const LAT_ERR_C = 0.8; // 가안, RACER_STATS_PASSIVES_DRAFT.md:202
export const PACK_RADIUS = 15 / KAPPA_PX_PER_U; // 가안, RACER_STATS_PASSIVES_DRAFT.md:57의 15 px (혼전 반경 7.5 u, INT §6.1)
export const PACK_COUNT = 3; // 가안, RACER:57 (본인 제외 3대 이상)
export const MISTAKE_EPS_MUL = 2; // 가안, INT §6.1 S-A (실수 때 ε 범위 ×2)

// 패시브 P-C (AG-P028 C, INT §6.1 표, RACER §4)
export const PASSIVE_GRACE = 2; // 가안, RACER_STATS_PASSIVES_DRAFT.md:128 출발 유예 s
export const PASSIVE_DURATION = 3; // 가안, RACER_STATS_PASSIVES_DRAFT.md:129 지속 s
export const PASSIVE_COOLDOWN = 8; // 가안, RACER_STATS_PASSIVES_DRAFT.md:130 쿨다운 s
export const GAP_HUNTER_GAP = 20 / KAPPA_PX_PER_U; // 가안, INT §6.1 (20 px = 10 u)
export const GAP_HUNTER_BEND = 0.3; // 가안, INT §6.1
export const GAP_HUNTER_SIDE = 20 / KAPPA_PX_PER_U; // 가안, INT §6.1 옆 차선 빈 거리 (20 px = 10 u)
export const GAP_HUNTER_LAT_MUL = 1.2; // 가안, 근거 없음. INT §6.1 P-C (AP:73의 절반)
export const ARCHITECT_BEND = 0.45; // 가안, INT §6.1
export const ARCHITECT_LEAD = 40 / KAPPA_PX_PER_U; // 가안, INT §6.1 진입 전 (40 px = 20 u)
export const ARCHITECT_A_MUL = 1.06; // 가안, 근거 없음. INT §6.1 P-C
export const ARCHITECT_BLOCKED_SCALE = 0.5; // 가안, RACER_STATS_PASSIVES_DRAFT.md:255 반감
export const ARCHITECT_NO_TRY_SECONDS = 4; // 가안, RACER_STATS_PASSIVES_DRAFT.md:256
export const ARCHITECT_NO_TRY_GAP = 20 / KAPPA_PX_PER_U; // 가안, INT §6.1 (20 px = 10 u)
export const SOLVER_EPS_MUL = 0.5; // 가안, INT §6.1 P-C
export const SOLVER_RISK_RADIUS = 7.5; // 가안, 디렉터 2026-11-02 (목표 차선 위험 반경 u)

// 2층 재정의 (INT §9.2)
// 상대 9대 F-2 고정 목록 (최고속도, 가속, 접지, 제동). INT 표 머리는 '추월'이라 적혀 있으나 차량 능력치로 읽는다 (보고서 CONFLICT)
export const L2_OPPONENTS: [number, number, number, number][] = [
  [4, 4, 6, 6], [6, 6, 4, 4], [4, 6, 4, 6], [5, 5, 5, 5], [4, 5, 5, 6],
  [6, 5, 5, 4], [6, 4, 5, 5], [5, 4, 6, 5], [5, 6, 4, 5],
]; // 가안, INT §9.2 F-2 (Q-54)
export const L2_SPREAD_MIN = 1.5; // 가안, INT §9.2 M-17c
export const L2_SATURATION_TOP = 0.8; // 가안, INT §9.2 M-17d
export const L2_SATURATION_MEAN = 1.5; // 가안, INT §9.2 M-17d
export const M18_BLOCK_RATIO = 0.05; // 가안, INT §9.2 M-18 ①
export const M18_OVERTAKE_RACE_SHARE = 0.5; // 가안, INT §9.2 M-18 ②
export const M18_CONTACTS = 1; // 가안, INT §9.2 M-18 ③
export const ACCEL_R_RANGE = [0.75, 1.33]; // 가안, INT §4.7
