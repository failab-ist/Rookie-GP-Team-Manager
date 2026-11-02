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
node qa/motif.ts <part>       # 모티브 트랙 9개: tracks | race:LA | race:LB | race:LC | yield | share (부분마다 따로 돌려 이어 붙임)
node qa/pointfx.ts <part>     # 능력치 1점 효과 맞추기: solo | race:<off|P1|P2|P3>:<adjust|confirm> | grid (출발 자리 영향)
node qa/gridside.ts <키> <adjust|confirm> # 출발 자리 홀짝 쏠림 조사 (base, mirror, reverse, -OT7, inner1, inner2, allOff …)
node qa/accelcurve.ts          # 가속 곡선 단독 측정 (AG-P046 A, c 0.5 · 0.7 · 0.9)
node qa/backfield.ts stage1 adjust            # 뒤 출발 차 진단 1단계
node qa/backfield.ts stage2 <base|laps5|nocap|span2> <adjust|confirm>  # 2단계 비교
node qa/backfield.ts stage3 <da0|da15|da3|b5|b8|b12|combo> <adjust|confirm> > <파일>.json  # 더티 에어 · 부스트 크기 비교 (JSON 한 줄)
node qa/backfield.ts report3 <파일>.json ...   # 3단계 표, dirtysolo = 이웃 차 단독 1랩 차와 더티 에어 손해
node qa/winpath.ts collect <adjust|confirm> <M1|M2|M3> > <파일>.json  # 우승자가 바뀐 레이스 추적 (report · examples <json...>로 표)
node qa/s1cap.ts run <base|lat6|lat8|gap15|gap20|rel15> <adjust|confirm> > <파일>.json  # S1 막힘 상한 진단 (report <json...> 표, axis 시간축 점검, fingerprint 회귀 해시)
node qa/s1speed.ts collect <adjust|confirm> <M1|M2|M3> > <파일>.json  # S1 실패 순간 두 차 속도 (report <json...>로 표)
node qa/s1split.ts collect <base|car19|lane5|late05|late10|late15|late20> <adjust|confirm> <M1|M2|M3> > <파일>.json  # S1 실패 원인 분리 (차 폭 · 차선 폭, report <json...>)
node qa/carwidth.ts collect <w3|w19> <adjust|confirm> <M1|M2|M3> > <파일>.json  # 차 폭 3 대 1.9 (report <json...>, gains). s1speed collect · motif share는 끝에 [차 폭] 인자
node ../p0-visual/node_modules/typescript/bin/tsc -p tsconfig.json
```

코너 방향표(DIRECTION 초안 R-2)가 채워지면 `data/tracks/motif/*.json`의 코너 `direction` 칸에 L/R을 넣고 아래를 돌려 `qa/results/2026-11-02-direction-baseline.md`, `-gridside.md`, `-motif-share.md`와 비교한다 (AG-P045 A).

```bash
node qa/direction.ts adjust      # 방향 칸 채움 상태, 코너별 안쪽 차선, 코너 설계자 발동 · 반대급부 · 접촉, 0번 차선 비율
node qa/gridside.ts base adjust  # 홀짝 지수, 자리별 1위 비율
node qa/motif.ts share           # 차 : 레이서 비중 (확인용 시드)
```

- 기준: 차량 `design_ssot/drafts/CAR_STATS_TRACKS_PROTO_DRAFT.md`, 상호작용 `design_ssot/drafts/RACE_INTERACTION_P0_DRAFT.md`,
  레이서 `design_ssot/drafts/RACER_STATS_PASSIVES_DRAFT.md`. 결정 AG-P023 C, AG-P024 B, AG-P027 A(S-A), AG-P028 C(P-C), AG-P029 A.
- 가안 수치는 `src/config.ts` 한 곳. 주행 공식 `src/physics.ts`, 트랙 검사 `src/trackCheck.ts`, 레이서 판단 `src/racer.ts`, 레이스 진행 `src/sim.ts`.
- 데이터: 트랙 `data/tracks/T1~T3.json`, 차 시험값 `data/cars.json`(확정 아님), 레이서 `data/racers.json`. `examples/race.json`의 타원 트랙은 예시. `data/tracks/experiment/`는 직선만 늘린 실험용 트랙(설계 트랙 아님). `data/tracks/motif/M{1,2,3}-L{A,B,C}.json`은 `PROTO_TRACKS_MOTIF_DRAFT.md` §7 × 축소안 ρ(가안), 부스트 구간 `boostZone`은 `PROTO_TRACKS_DIRECTION_BOOST_DRAFT.md` §4 Z1.
- `simulate(input, { interaction, reaction, slipstream, k, accelFormula, latSpeed, desiredSpeed, slipRatio, laneCount, capWhileChanging }, qaHooks?)`. 추월 5단계 흐름 스위치 otRelease · otSpanCorner · dirtyAir · boost · cornerPriority(OT-1은 desiredSpeed: 'target')는 기본 꺼짐, 모두 켠 묶음은 config `OT_FLOW_ALL`. 접촉 규칙 스위치 ctWobble · ctLine · ctContact도 기본 꺼짐, 묶음 `CT_ALL`. 부스트 구간 모드 boostZone(트랙 데이터 구간 · 앞 코너 진입 감지 · E1 고정 끝 · 슬립스트림과 큰 값만)도 기본 꺼짐, 모티브 트랙 측정 묶음 `MOTIF_ALL`. 양보 하한 비교는 yieldMinRatio. 능력치 1점 효과 실험 accelPoint · brakePoint(P-1) · abScale(P-2)도 기본 꺼짐. qaHooks.grid는 QA 전용 출발 순서 지정, qaHooks.reverseOrder는 틱 안 처리 순서 뒤집기. 코너 `direction`(L/R, 빈칸 = 기본값)은 차선 규약 A로 안쪽 차선이 된다(innerLane이 있으면 그것이 먼저). 가속 곡선 accelDrag(c)도 기본 꺼짐. 진단 비교용 blockCap(기본 켬) · otSpanStraights(기본 1). 측정용 차 폭 carWidth · 차선 폭 laneWidth(기본 config, 해제 간격은 주지 않으면 차 폭). P-1 늦게 빠지기 lateOut(T_out s, 기본 0 = 꺼짐, 머묾은 판정 기록 종류 10). S1 막힘 상한 진단용 tryGap(시도 시작 거리, 기본 10) · otReleaseWidth(OT-2 상한 해제 옆 간격, 기본 차 폭 3, otRelease가 켜졌을 때만). 기본값은 config. qaHooks(출발 위치 지정, 틱 기록)는 QA 전용. `interaction: false`는 2단계와 같은 단독 주행.
- QA 결과: 2단계 `qa/results/2026-11-02.md`, 3단계 `qa/results/2026-11-02-interaction.md`, 직선 실험 `qa/results/2026-11-02-straights.md`, 추월 0건 원인 확인 `qa/results/2026-11-02-{twocar,rankcheck,onebyone,phases}.md`, 추월 5단계 흐름 `qa/results/2026-11-02-otflow{,-twocar}.md`, 접촉 규칙 `qa/results/2026-11-02-ct{flow,twocar}.md`, 모티브 트랙 `qa/results/2026-11-02-motif{,-share}.md`, 능력치 1점 효과 · 출발 자리 `qa/results/2026-11-02-pointfx.md`, 출발 자리 홀짝 `qa/results/2026-11-02-gridside.md`, 방향 칸 재측정 기준선 `qa/results/2026-11-02-direction-baseline.md`, 가속 곡선 `qa/results/2026-11-02-accelcurve.md`, 뒤 출발 차 진단 `qa/results/2026-11-02-backfield.md`, 더티 에어 · 부스트 크기 `qa/results/2026-11-02-dirtyboost.md`, 우승자가 바뀐 레이스 추적 `qa/results/2026-11-02-winpath.md`, S1 막힘 상한 실험 `qa/results/2026-11-02-s1cap.md`, S1 실패 순간 속도 `qa/results/2026-11-02-s1speed.md`, S1 실패 원인 분리 `qa/results/2026-11-02-s1split.md`, 차 폭 1.9 기준선 재측정 `qa/results/2026-11-02-carwidth.md`, P-1 늦게 빠지기 `qa/results/2026-11-02-lateout.md`.
- 추월 사건(종류 3)은 OT-4 기록(앞뒤가 바뀌어 1초 유지, 원인 코드 `<원인>:<S1|free>:by:<차>`)이다. 정식 시도 S1 성공은 판정 기록 종류 7. 접촉 사건(종류 4) 원인 코드는 `<side|lane|rear>:<mistake|lane|rear|none>:<차|both|->`(종류:책임 기준:원인 제공자).
