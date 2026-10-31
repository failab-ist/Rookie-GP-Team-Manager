# WORK_STATE

DATE: 2026-11-01
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
4. USER 결정 대기: 연말~연초 출시 범위(O-206).
