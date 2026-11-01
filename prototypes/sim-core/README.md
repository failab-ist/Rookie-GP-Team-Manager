# sim-core

화면 없는 10대 레이스 시뮬레이터 (AG-P021 A). Node 23.6 이상, 의존성 없음.

```bash
node --test
node src/cli.ts --input examples/race.json --seed 42 --out result.json
node ../p0-visual/node_modules/typescript/bin/tsc -p tsconfig.json
```

- 가안 수치는 `src/config.ts` 한 곳에 있다.
- **UNRESOLVED:** 차량 모델 · 트랙 3종 · 합격 기준 초안(AG-P020)이 없어서 주행은 자리표시다(`src/sim.ts`의 `advance`). 모든 차가 같은 속도로 달리고 능력치는 반영하지 않는다. 그래서 순위는 출발 순서와 같고 추월은 0건이다.
