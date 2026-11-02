# sim-core

화면 없는 10대 레이스 시뮬레이터 (AG-P021 A). Node 23.6 이상, 의존성 없음.

```bash
node --test
node src/cli.ts --input examples/race.json --track data/tracks/T1.json --seed 42 --out result.json
node qa/run.ts all            # handcalc | layer1 | layer2 | racers | accel | length
node qa/straights.ts          # 직선 길이 × 차선 변경 속도 실험
node qa/twocar.ts             # 2대 시험 (긴 직선)
node qa/rankcheck.ts          # 위치로 본 앞뒤 바뀜 대 추월 기록
node qa/onebyone.ts           # 슬립스트림 비율 · 차선 수 하나씩 비교
node qa/phases.ts             # 가속 · 제동 직접 측정
node qa/otflow2.ts            # 추월 5단계 흐름 2대 시험 (단계별, 규칙별 직접 확인)
node qa/otflow.ts             # 추월 5단계 흐름 하나씩 켜기 (10대, 2층)
node qa/ctwocar.ts            # 접촉 규칙 2대(와 6대 무리) 시험
node qa/ctflow.ts             # 접촉 규칙 하나씩 켜기 (10대, 2층, 레이서 능력치 확인)
node ../p0-visual/node_modules/typescript/bin/tsc -p tsconfig.json
```

- 기준: 차량 `design_ssot/drafts/CAR_STATS_TRACKS_PROTO_DRAFT.md`, 상호작용 `design_ssot/drafts/RACE_INTERACTION_P0_DRAFT.md`,
  레이서 `design_ssot/drafts/RACER_STATS_PASSIVES_DRAFT.md`. 결정 AG-P023 C, AG-P024 B, AG-P027 A(S-A), AG-P028 C(P-C), AG-P029 A.
- 가안 수치는 `src/config.ts` 한 곳. 주행 공식 `src/physics.ts`, 트랙 검사 `src/trackCheck.ts`, 레이서 판단 `src/racer.ts`, 레이스 진행 `src/sim.ts`.
- 데이터: 트랙 `data/tracks/T1~T3.json`, 차 시험값 `data/cars.json`(확정 아님), 레이서 `data/racers.json`. `examples/race.json`의 타원 트랙은 예시. `data/tracks/experiment/`는 직선만 늘린 실험용 트랙(설계 트랙 아님).
- `simulate(input, { interaction, reaction, slipstream, k, accelFormula, latSpeed, desiredSpeed, slipRatio, laneCount, capWhileChanging }, qaHooks?)`. 추월 5단계 흐름 스위치 otRelease · otSpanCorner · dirtyAir · boost · cornerPriority(OT-1은 desiredSpeed: 'target')는 기본 꺼짐, 모두 켠 묶음은 config `OT_FLOW_ALL`. 접촉 규칙 스위치 ctWobble · ctLine · ctContact도 기본 꺼짐, 묶음 `CT_ALL`. 기본값은 config. qaHooks(출발 위치 지정, 틱 기록)는 QA 전용. `interaction: false`는 2단계와 같은 단독 주행.
- QA 결과: 2단계 `qa/results/2026-11-02.md`, 3단계 `qa/results/2026-11-02-interaction.md`, 직선 실험 `qa/results/2026-11-02-straights.md`, 추월 0건 원인 확인 `qa/results/2026-11-02-{twocar,rankcheck,onebyone,phases}.md`, 추월 5단계 흐름 `qa/results/2026-11-02-otflow{,-twocar}.md`, 접촉 규칙 `qa/results/2026-11-02-ct{flow,twocar}.md`.
- 추월 사건(종류 3)은 OT-4 기록(앞뒤가 바뀌어 1초 유지, 원인 코드 `<원인>:<S1|free>:by:<차>`)이다. 정식 시도 S1 성공은 판정 기록 종류 7. 접촉 사건(종류 4) 원인 코드는 `<side|lane|rear>:<mistake|lane|rear|none>:<차|both|->`(종류:책임 기준:원인 제공자).
