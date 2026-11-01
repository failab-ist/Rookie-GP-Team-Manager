# AGENTS.md — 레이서키우기 작업 규칙

> 사람과 AI(Claude, Codex, Antigravity 등)가 함께 따르는 작업 절차 규칙이다. 설계 SSOT가 아니다.
> 게임 규칙·밸런스 수치·화면 문구를 여기에 쓰지 않는다.

---

# 1. 기준 정보 우선순위

```text
1. USER의 최신 확정 결정
2. design_ssot/SPEC_INDEX.md가 가리키는 현행 Design SSOT
3. 현행 Source (아직 없음)
4. 지난 대화 · 옛 문서 · reports/raw/ 원본 자료
```

이름과 용어(무엇을 뭐라고 부르는지, 무엇이라고 부르면 안 되는지)는 `design_ssot/GLOSSARY.md`를 따른다.

---

# 2. 문서 찾기

```text
SPEC_INDEX → 해당 owner 문서 → 필요한 부분만 읽기
```

저장소 전체를 이유 없이 훑지 않는다.
찾는 문서가 없으면 기억이나 옛 대화로 메우지 않고 `SOURCE ACCESS ISSUE`로 보고한다.

---

# 3. 설계 변경 통제

- 정해지지 않은 규칙을 만들어 내지 않는다. `UNRESOLVED`로 보고하고 `design_ssot/OPEN.md`에 둔다.
- 기획 초안은 선택지와 근거로 쓴다. 결정은 USER가 한다.
- 이름 · 수치 · 문구는 적용 전에 초안을 보이고 컨펌받는다.
- 기존 결정과 충돌하면 조용히 한쪽을 고르지 않는다. `CONFLICT`로 표시하고 묻는다.
- 여러 AI가 동의했다는 사실은 결정의 근거가 아니다.
- USER가 승인하면:
  1. 새 용어는 `GLOSSARY.md`에 먼저 넣는다.
  2. 해당 owner 문서에 반영하고 끝에 `(User YYYY-MM-DD)`를 붙인다.
  3. `OPEN.md`의 항목 상태를 바꾼다.
  4. `CHANGELOG.md`에 기록한다.

---

# 4. 원본 자료

`reports/raw/`는 받은 그대로 보관한다. 수정 · 삭제하지 않는다.
설계 문서에서 원본을 근거로 쓸 때는 파일 경로를 적는다.

---

# 5. 범위 · 커밋

- 요청받은 것만 한다. 관계없는 문서 정리, 미래 아이디어 선반영을 하지 않는다.
- 한 논리 작업 = 한 커밋. 커밋 전에 diff를 확인한다.
- push · 머지는 USER 컨펌 뒤에만 한다.

---

# 6. 보고 · 핸드오프

- USER에게 가는 보고와 핸드오프는 한글로 쓴다. 상태 라벨(`UNRESOLVED`, `CONFLICT` 등) · 파일 경로 · 명령어는 그대로 둔다.
- 다음 할 일은 `WORK_STATE.md` §Next에 남긴다.

---

# 7. 파일 이름

설계 문서 파일 이름에 버전을 붙이지 않는다(이력은 git과 CHANGELOG로 본다).
게임 버전이 생기면 GUILD24 AGENTS §10-A 방식(앞부분 고정 + 끝 버전) 도입을 USER가 결정한다.

---

# 8. 설계 문서 작성 규칙

- 시스템 문서는 `design_ssot/templates/SYSTEM_TEMPLATE.md`의 순서를 따른다.
- 공식은 이름 · 변수표 · 값의 범위 · 계산 예시 1개 이상을 함께 쓴다. 0 나누기 · 음수 같은 퇴화 결과도 적는다.
- edge case는 "적절히 처리" 대신 구체적인 결과로 쓴다.
- "재미있게 · 느낌 좋게" 같은 표현을 기준으로 쓰지 않는다. 완료 기준은 확인 가능한 문장으로 쓴다.
- 수치를 쓰면 출처(문서:줄)를 달거나 `가안`이라고 쓴다. 같은 수치는 한 문서만 정본으로 두고 나머지는 그 문서를 가리킨다.
- 초안은 `design_ssot/drafts/`에 쓴다. 확정 문서로 옮기는 것은 USER 결정 뒤다.
- 열린 질문은 `OPEN.md`의 ID로 연결한다. 문서 안에 새 미결 항목을 숨기지 않는다.

<!-- 이 절과 시스템 템플릿은 Claude Code Game Studios(MIT, Copyright (c) 2026 Donchitos)의 design-docs 규칙 · GDD 템플릿을 참고해 다시 썼다. -->

---

# 9. 이 저장소에서 일하는 AI 직원

이 저장소의 작업은 솔브리 작업실(오케스트레이터 `failab-ist/ai-dev-orchestrator`)이 나눠 맡긴다. 디렉터(USER)는 회의 → 안건 → 작업 탭에서 안건 카드 버튼으로만 결정한다.
- 기본 담당: 기획은 Claude Opus, 코드 작성은 Claude Sonnet, 문서 작성은 Claude Haiku, 검수는 주로 GPT(한글 문구 검수만 Claude). 작업 탭의 단계 설정에서 단계마다 바꿀 수 있다.
- 실행: 저장소 루트의 `start_studio.cmd` 더블클릭. 엔진은 `.studio/engine`에 받아 두며 GitHub에 올리지 않는다(`.studio/.gitignore`). 스튜디오 설정 · 안건 · 결정 기록(`.studio/studio.json` · `agenda/` · `decisions.jsonl`)은 커밋한다.
- 결과를 재현해야 하는 코드(레이스 시뮬레이터)에는 `Math.random` · `Date.now` · 렌더러(Phaser · React) import를 쓰지 않는다. 시드 난수만 쓴다(`design_ssot/TECH_STACK.md` 시뮬레이터 경계).
- 직원은 지시받은 허용 경로만 고친다. 다른 직원을 부르거나 결정을 대신하지 않는다.
- 검수자는 고치지 않고 판정(JSON)만 한다. 근거 없는 반려는 무효다.
