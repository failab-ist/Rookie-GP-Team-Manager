# WORK_STATE

DATE: 2026-11-02
STATE: PLANNING — 코드 없음(시험 코드만). 설계 진입점 `design_ssot/SPEC_INDEX.md`

## Current

- repository: `failab-ist/Rookie-GP-Team-Manager`
- 출시 목표: 2026년 말 ~ 2027년 초, 축소판(범위는 `OPEN.md` O-206). 지금은 혼자 개발, 디자이너는 P0 이후 외주 검토.
- 기획 원본: 기획서 v0.5 · 경쟁작 분석 v0.1(`reports/raw/`). 확정 방향은 `SPEC_INDEX.md` §LOCKED DIRECTION, 제품 방향은 `GAME_VISION.md`.
- 기술: `design_ssot/TECH_STACK.md`. 기본 조합은 WORKING(진행하되 확정 아님, O-008). 앱 포장(Capacitor)은 출시 준비 단계에서 한다.
- P0 비주얼 1차 시험 코드: `prototypes/p0-visual/`(Vite + TS + Phaser, 임시 아트, 가짜 주행). USER가 PC에서 확인했고 프로토타입 용도로 충분하다고 판단(User 2026-11-01). "전체" 카메라는 차가 너무 작아 가독성이 낮음(O-007 근거).
- 문서 구조는 GUILD24(`failab-ist/GUILD24`) 방식을 따른다.

## Next

순서: 오케스트레이터 마무리 → 오케스트레이터로 기획 고도화 → 레이스 시뮬레이터 (User 2026-11-01)

1. **AI 개발팀 오케스트레이터 P0**(`failab-ist/ai-dev-orchestrator`): 문서 작업(메인 작성 → 독립 검수 → 반려 시 복귀)부터 돌아가게 한다.
2. **기획 고도화**: 오케스트레이터로 `OPEN.md` 빈칸을 메운다. 우선 O-004(고유 패시브 3종) · O-003(레이서 3능력치) · O-120(첫날 압축 플레이).
3. **P0 레이스 시뮬레이터**: 10대 · 시드 재현 · 레이서 3명 × 차량 2종 × 트랙 3종(O-001~O-005). 결과를 `prototypes/p0-visual/` 화면으로 재생.
   - 진행 중: `prototypes/sim-core/`(화면 없는 시뮬레이터). 추월 5단계(AG-P036) · 접촉 규칙(AG-P039, AG-P040) · 모티브 트랙 9개(M1~M3 × L-A/L-B/L-C)까지 넣고 쟀다. 최신 결과 `prototypes/sim-core/qa/results/2026-11-02-motif.md`, `2026-11-02-motif-share.md` (2026-11-02).
   - USER 결정 대기 (모티브 트랙 측정 뒤):
     - SOURCE ACCESS ISSUE: `PROTO_TRACKS_DIRECTION_BOOST_DRAFT.md` R-2 코너 방향 표가 비어 있어 안쪽 차선 데이터가 없다(모든 코너 0번). 출처 열람 또는 다른 근거가 필요하다.
     - CONFLICT: 코너 bend 범위. CAR §4.1 (0, 1] 대 MOTIF §5.2 (0.6, 1.5]. 측정은 MOTIF 범위로 했다.
     - CONFLICT: 부스트 크기. `OT_FLOW_ALL` 5% 대 DIRECTION Q-83 b 0.04. 모티브 트랙 측정은 4%로 했다.
     - 차 : 레이서 비중 95 : 5(L-B, 참고 비율 7 : 3). 순위 분산의 71%는 (트랙, 시드) 몫이다. 레이서 능력치 효과를 어떻게 다룰지 정한다.
     - 가속 R 0.09~0.24(합격 범위 0.75~1.33 밖, MOTIF Q-65). 제동 Δ1 0.03~0.14로 약하다.
     - 축소안 선택(MOTIF Q-73), 정식 추월 직선 길이(Q-70: L-B에서 약 2.7초부터 S1 성공), 부스트 감지 범위(Q-82: 레이스당 약 26번 켜짐).
4. USER 결정 대기: 연말~연초 출시 범위(O-206).
