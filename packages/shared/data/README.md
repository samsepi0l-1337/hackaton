# F21 검수 자료

기획·데이터 담당이 고치는 파일이다. **2026-11-27 [테스트] 자료를 모두 지웠다** — 지금은 비어 있고, 화면은 빈 상태와 직접 입력을 보여준다. 공식 지원사업은 K-Startup 실제 공고(자동 수집)로 채워진다. 테스트용 자료는 `packages/shared/test/fixtures/` 에 있다 (서비스에 나가지 않음).

- `problems.json`: 지역 문제 카드. 첫 구현은 조선·해양 한 분야 3개. 다른 분야는 비어 있어 '현재 확인된 문제 자료가 없습니다'가 보인다.
- `contexts.json`: 지역 산업 배경 (공식 URL·근거 문구·확인일). 창업 수요의 증거로 쓰지 않는다.
- `resources.json`: 교육·상담·공간·지원사업 경로.

규칙 (features.md F21)
- 실제로 연 공식 URL 과 확인일(`checkedAt`)이 있을 때만 `test: false` 로 바꾸고 `[테스트]`를 뗀다.
- 모르는 값은 `null` (화면에 '확인 필요'). 비용·상시 여부를 추정하지 않는다.
- `evidenceLevel` 은 '인터뷰에서 확인 / 기사·공식 자료에 보고 / 조사 후보' 중 하나.
- 문제 카드를 바꾸면 `packages/shared/src/explore.ts` 의 `EXPLORE_DATA_VERSION` 을 올린다.
