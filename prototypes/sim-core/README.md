# sim-core

화면 없는 10대 레이스 시뮬레이터 (AG-P021 A). Node 23.6 이상, 의존성 없음.

```bash
node --test
node src/cli.ts --input examples/race.json --track data/tracks/T1.json --seed 42 --out result.json
node qa/run.ts all            # handcalc | layer1 | layer2 | ksweep | length
node ../p0-visual/node_modules/typescript/bin/tsc -p tsconfig.json
```

- 기준: `design_ssot/drafts/CAR_STATS_TRACKS_PROTO_DRAFT.md` F1~F7, AG-P023 C(정점 이후 가속), AG-P024 B(정점 뒤 한계가 점점 풀림).
- 가안 수치는 `src/config.ts` 한 곳. 주행 공식은 `src/physics.ts`, 트랙 검사는 `src/trackCheck.ts`.
- 트랙 `data/tracks/T1~T3.json`, 차 시험값 `data/cars.json`(확정 아님). `examples/race.json`의 타원 트랙은 예시.
- 마지막 QA 결과: `qa/results/2026-11-02.md`.
- 아직 없는 것: 차끼리 충돌 · 추월 판단, 레이서 능력치와 패시브의 주행 반영(O-001, O-003, O-004). 지금 레이스는 서로 통과하는 단독 주행 10대다.
