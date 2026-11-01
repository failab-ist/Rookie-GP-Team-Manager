# sim-core

화면 없는 10대 레이스 시뮬레이터 (AG-P021 A). Node 23.6 이상, 의존성 없음.

```bash
node --test
node src/cli.ts --input examples/race.json --track data/tracks/T1.json --seed 42 --out result.json
node qa/run.ts all            # handcalc | layer1 | layer2 | racers | accel | length
node qa/straights.ts          # 직선 길이 × 차선 변경 속도 실험
node ../p0-visual/node_modules/typescript/bin/tsc -p tsconfig.json
```

- 기준: 차량 `design_ssot/drafts/CAR_STATS_TRACKS_PROTO_DRAFT.md`, 상호작용 `design_ssot/drafts/RACE_INTERACTION_P0_DRAFT.md`,
  레이서 `design_ssot/drafts/RACER_STATS_PASSIVES_DRAFT.md`. 결정 AG-P023 C, AG-P024 B, AG-P027 A(S-A), AG-P028 C(P-C), AG-P029 A.
- 가안 수치는 `src/config.ts` 한 곳. 주행 공식 `src/physics.ts`, 트랙 검사 `src/trackCheck.ts`, 레이서 판단 `src/racer.ts`, 레이스 진행 `src/sim.ts`.
- 데이터: 트랙 `data/tracks/T1~T3.json`, 차 시험값 `data/cars.json`(확정 아님), 레이서 `data/racers.json`. `examples/race.json`의 타원 트랙은 예시. `data/tracks/experiment/`는 직선만 늘린 실험용 트랙(설계 트랙 아님).
- `simulate(input, { interaction, reaction, slipstream, k, accelFormula, latSpeed })`. `interaction: false`는 2단계와 같은 단독 주행.
- QA 결과: 2단계 `qa/results/2026-11-02.md`, 3단계 `qa/results/2026-11-02-interaction.md`, 직선 실험 `qa/results/2026-11-02-straights.md`.
