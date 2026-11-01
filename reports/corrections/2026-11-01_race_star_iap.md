# Race Star 인앱 상품 서술 정정 메모

> **작성일:** 2026-11-01
> **상태:** 가안. 디렉터 확인 전까지 확정 아님
> **안건:** AG-L001 "Race Star 인앱 상품 서술 정정", 선택 A(정정 메모 작성)
> **대상 앱:** Race Star – Team Manager Game (Gryphon Games / Cool Cats Games)
>   - App Store `id6782871814`, Google Play `com.coolcatsgames.racestaridle` (출처: `reports/LEKI_COMPETITOR_DEEP_RESEARCH_v0.2.md:73`, `reports/raw/2026-11-01_gpt_racer_manager_core_direction_bm_v0.5.md:747`)
> **원본 처리:** `reports/raw/` 원본은 수정하지 않는다. 정정은 이 메모로 한다(AGENTS.md §4).

---

## 1. 목적과 원칙

- 목적: 2026-11-01 App Store 상위 10개 기록과 딥리서치(DR), 액션 플랜(AP), 기획서(GDD raw)의 Race Star 상품 서술을 대조해 정정 범위를 남긴다.
- 매출, 전환율, 구매 비율, 판매 순위는 추정하거나 해석하지 않는다. 원문 인용은 인용으로만 쓴다.
- 판정은 5가지만 쓴다: **일치**, **상위 10개 미등재 · 판매 여부 미확인**, **기준 기록에 없음**, **보고서에 없음**, **출처 없음**.

---

## 2. 기준 기록

| 항목 | 내용 |
|---|---|
| 기록 내용 | 2026-11-01 App Store 인앱 구매 상위 10개 (**국가 미확인**) |
| 확인 날짜 | 2026-11-01 |
| 출처 등급 | 작업실 기록 인용 |
| 출처 | `reports/AGENDA_2026-11-01.md:10`, `.studio/agenda/inbox/leki-2026-11-01.json:7` (두 곳 모두 요약 문장) |
| 보관 상태 | **스크린샷 · 전체 목록 미보관**. 10개 전체 이름, 순서, 가격도 없음 |

**상위 10개 기록에 있는 항목**

- Sport Pass
- Premium Fund / VIP Fund
- 젬 상품 2종 (이름 미보관)
- 스토어 표기: "Contains Loot Boxes"

**상위 10개 기록에 없는 항목**

- Champion Pass
- Triple Income Booster

  이 둘은 게임 안에서 판매하는지 **미확인**이다.

**기록이 없는 항목**

- No Ads, Welcome Pack, Rookie Pass, Double Income Booster의 상위 10개 포함 여부
- 나머지 칸의 상품명
- 모든 가격

**한계**

1. **국가 미확인.** 기준 기록은 "App Store"라고만 적었다. DR:103과 GDD raw:750의 "US App Store" 서술, DR:344와 GDD raw:747의 US 스토어 링크는 별도 조사다. 기준 기록이 어느 나라 스토어인지 입증하지 못한다. 국가가 다르면 목록도 다를 수 있다.
2. **범위가 다르다.** 기준 기록은 "상위 10개"만 다룬다. DR:103은 "IAP 라인업"을 서술한다. 두 기록 모두 기준일이 2026-11-01이다(DR:3). 날짜로 한쪽을 버리지 않는다. 상위 10개에 없다는 것은 "판매하지 않는다"의 근거가 아니다.
3. **줄 번호 차이.** AGENDA:10은 DR L90 · L91 · L210, AP L184를 가리키지만, 지금 파일에서 해당 서술은 DR L39 · L103 · L104 · L253 · L324, AP L181에 있다. 이 메모는 지금 줄 번호를 쓴다. AGENDA는 고치지 않았다.

---

## 3. 대조표

| # | 문서:줄 | 원문 요지 | 기준 기록과 비교 | 판정 | 인용할 때 쓸 문구 |
|---|---|---|---|---|---|
| 1 | DR:103 | IAP 라인업에 Champion Pass, Triple Income Booster 포함 | 상위 10개 기록에 없음 | 상위 10개 미등재 · 판매 여부 미확인 | "Champion Pass · Triple Income Booster는 2026-11-01 App Store 상위 10개 기록에 없다(국가 미확인). 판매 여부는 미확인." |
| 2 | DR:103 | IAP 라인업에 No Ads, Welcome Pack, Rookie Pass, Double Income Booster 포함 | 상위 10개 포함 여부 기록 없음 | 기준 기록에 없음 | "No Ads · Welcome Pack · Rookie Pass · Double Income Booster: 기준 기록에 없음(대조 불가)." |
| 3 | DR:103 | "Includes Random Items" 표시 | 기준 기록의 "Contains Loot Boxes" 표기 | 일치 | "무작위 상품 포함 표시(스토어 표기 원문: Contains Loot Boxes, 2026-11-01 App Store 기록)." 표기 문구만 다르다. |
| 4 | DR:104 | "유료 수익 부스터(2배/3배)" 중 3배 | 상위 10개 기록에 없음 | 상위 10개 미등재 · 판매 여부 미확인 | "Triple Income Booster: 상위 10개 기록에 없음, 판매 여부 미확인." |
| 5 | DR:104 | "유료 수익 부스터(2배/3배)" 중 2배 | 2배 상품 기록 없음 | 기준 기록에 없음 | "Double Income Booster: 기준 기록에 없음." |
| 6 | DR:253 | Race Star BM "패스" · "랜덤 상자" | Sport Pass, "Contains Loot Boxes" 표기 있음 | 일치 | "패스 상품과 무작위 상품 표시(Sport Pass · Contains Loot Boxes, 2026-11-01 App Store 기록)." |
| 7 | DR:253 | Race Star BM "3x" 부스터 | 상위 10개 기록에 없음 | 상위 10개 미등재 · 판매 여부 미확인 | 4번과 같은 문구 사용 |
| 8 | DR:253 | Race Star BM "광고 제거" · "2x" 부스터 | 상위 10개 기록 없음 | 기준 기록에 없음 | "광고 제거 · 2x 부스터: 기준 기록에 없음." |
| 9 | DR:253 | Race Star BM 항목에 Fund · 젬 상품 서술 없음 | 상위 10개 기록에 Premium/VIP Fund, 젬 2종 있음 | 보고서에 없음 | "Premium/VIP Fund · 젬 2종은 2026-11-01 App Store 상위 10개 기록에만 있다." |
| 10 | DR:81–82 | 보상형 광고로 켜는 2배 부스터, Welcome Pack · Rookie Pass 결제 | 상위 10개 기록 없음 | 기준 기록에 없음 | "보상형 광고 2배 부스터, Welcome Pack · Rookie Pass: 기준 기록에 없음." |
| 11 | DR:87 | 하드 재화 Gems를 인앱 구매로 획득 | 상위 10개 기록에 젬 상품 2종 있음 | 일치 | "젬 상품 존재(2026-11-01 App Store 상위 10개 기록, 이름 미보관)." 획득 경로(패스, 이벤트)는 이 메모에서 확인하지 않는다. |
| 12 | DR:39 | "경쟁작들에서 가장 결제 전환율이 높은 '영구 광고 제거 + 배속/편의 패스'" | 전환율 기록 없음 | 출처 없음 | 인용 금지. 원문을 쓸 때는 "DR:39 서술, 근거 미제시"로 표시한다. |
| 13 | DR:324 | "《Race Star》와 《Pocket Champs》에서 가장 잘 팔리는 '영구 광고 제거 + 3배속/하이라이트 스킵 + 일일 첫 튜닝 머니 면제' 패키지" | 판매 순위 기록 없음 | 출처 없음 | 인용 금지. 원문을 쓸 때는 "DR:324 서술, 근거 미제시"로 표시한다. |
| 14 | AP:181 | "《Race Star》, 《Pocket Champs》 등 모든 하이브리드 캐주얼에서 가장 결제 전환율이 높은 부동의 1위 상품" | 전환율, 순위 기록 없음 | 출처 없음 | 인용 금지. AGENDA:10과 같은 판단이다. |
| 15 | GDD raw:750 · 경쟁작 raw `2026-11-01_gpt_leki_competitor_analysis_top3_v0.1.md:18` | "미국 App Store 공개 상품 목록" 중 Champion Pass, Triple Income Booster | 상위 10개 기록에 없음, 국가 다를 수 있음 | 상위 10개 미등재 · 판매 여부 미확인 | 1번과 같은 문구 사용. raw 원문은 수정하지 않는다. |
| 16 | GDD raw:750 · 경쟁작 raw:18 | "미국 App Store 공개 상품 목록" 중 광고 제거, Welcome Pack, Rookie Pass, Double Income Booster | 상위 10개 포함 여부 기록 없음 | 기준 기록에 없음 | 2번과 같은 문구 사용. raw 원문은 수정하지 않는다. |
| 17 | GDD raw:749 | "공식 스토어에도 무작위 아이템을 포함한 인앱 구매가 표시된다" | "Contains Loot Boxes" 표기 있음 | 일치 | 3번과 같은 문구 사용. |

---

## 4. 범위 밖 참고 (판정 안 함)

이 문장들은 Race Star만의 주장이 아니어서 판정하지 않는다. 출처가 적혀 있지 않다는 점만 적는다.

- Master Guide `reports/LEKI_GAME_DEV_DESIGN_BM_MASTER_GUIDE_v0.1.md:162`: "무과금 유저가 생애 첫 결제를 할 때 가장 많이 사는 상품 1위는 '영구 광고 제거 + 편의성 패키지'". 출처 미표기.
- Master Guide `:223`: "첫 결제 1위는 '광고 제거+편의 팩', 장기 매출 1위는 '시즌 패스'". 출처 미표기.
- Master Guide `:160`: 업계 벤치마크 수치(IAA 29% : IAP 71%, 결제 전환율 1.5~3.5%). 출처 미표기.

---

## 5. 인용 규칙 (가안)

디렉터 확인 전까지는 가안이다.

1. Race Star 상품을 인용할 때는 기록별 날짜와 국가를 붙인다. 국가를 모르면 "국가 미확인"이라고 쓴다.
2. 상위 10개 기록과 전체 라인업 서술(DR:103 등)을 한 문장에 섞지 않는다.
3. 판매 순위, 성과, 구매 비율을 사실로 쓰지 않는다. 원문을 인용할 때는 "보고서 서술" 또는 "출처 없음"으로 표시한다.
4. Champion Pass와 Triple Income Booster는 "상위 10개 미등재 · 판매 여부 미확인"으로만 쓴다.
5. 상품명은 스토어 표기 원문(영문)을 그대로 쓴다. 새 게임 용어를 만들지 않는다.

---

## 6. 열린 질문

미결 목록 ID로 연결한다. 새 OPEN ID는 만들지 않는다.

- **O-204 (광고 제거 상품):** 경쟁작 상품을 근거로 쓸 때 이 메모의 인용 규칙(5장)을 따른다.
- **O-202 (코스메틱 노출):** 같은 규칙을 따른다.
- **디렉터 몫으로 남긴 확인:**
  - (a) 기준 기록의 확인 국가
  - (b) 10개 전체 목록과 순서
  - (c) 가격
  - (d) Champion Pass · Triple Income Booster의 판매 여부
  - 이 항목을 다시 확인해 기록으로 남길지는 디렉터가 정한다.
- **AGENDA:10 줄 번호 차이:** 이 메모에서는 고치지 않았다. AGENDA를 고칠지는 디렉터가 정한다.
