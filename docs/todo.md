# 할 일 목록 (진행 체크)

PR을 머지할 때마다 이 파일을 같이 고친다. `[x]` 완료, `[ ]` 남음, `[~]` 진행 중, **입력 필요** = 팀원·사용자만 할 수 있는 일.
기능 번호는 현재 `main`의 [기능 명세](features.md) 기준이다. 개정안 PR #7이 머지되면 우선순위 열을 다시 맞춘다.

마지막 갱신: 2026-11-27

## 0. 진행 요약

| 영역 | 상태 |
|---|---|
| 공통 패키지(타입·계약·규칙·테스트 데이터) | 완료 (#5) |
| API (메모리 저장소) | 완료 (#6) |
| 목업 웹 | 완료 (#8) |
| 국내 AI (Upstage Solar·Decide·Document Parse) + AI Gateway | 구현 완료 (#11, #12), 실제 키 확인 남음 |
| Cloudflare Containers doc-worker | 구현·로컬 통합 완료, 실제 공고 확인은 배포 후 |
| 배포 | 시작 전 (아래 5절 선행 조건) |

## 1. 공통·기반

- [x] bun 워크스페이스, `packages/shared`, `apps/api`, `apps/web` 구조 (#5)
- [x] API 계약 `packages/shared/src/api.ts` (#5)
- [x] 테스트 데이터: 실행일 기준 상대 마감일, 가능/확인 필요/불가/마감/상시/부산/전국 (#5)
- [x] Cloudflare 연동 계약 `packages/shared/src/cloudflare.ts` (AI 작업 종류, doc-worker HTTP 계약)
- [ ] 개정안 PR #7 반영 (계정 선택화, 기기 저장 F9, 검수 데이터 F21 등)

## 2. 기능 (F0~F21)

| 상태 | ID | 기능 | 비고 |
|---|---|---|---|
| [x] | F0 | 회원가입·로그인 | PBKDF2, HttpOnly 쿠키 (#6, #8) |
| [x] | F1 | 사전 상담 폼 | 섹션 검사·자동 저장 (#6, #8) |
| [~] | F2 | AI 멘토 되묻기 | 규칙 질문 완료. AI 문장은 Solar Mini (3절) |
| [~] | F3 | 아이디어 요약 | 규칙 요약 완료. AI 요약은 Solar Pro (3절) |
| [x] | F4 | 자격 판정 (규칙) | 경계값 테스트 (#5) |
| [~] | F5 | Top3 | 규칙 점수 (#5). 관련도는 Solar Decide (3절) |
| [~] | F6 | 추천 이유 | 규칙 문장 완료. Solar Mini 문장 + 사실 검사 (3절) |
| [x] | F7 | 마감 정리 | 조회 시 계산. 새벽 배치는 F8과 함께 |
| [ ] | F8 | 새 공고 반영 | K-Startup API 키 **입력 필요**, Cron + doc-worker 내려받기 + Document Parse로 첨부 조건 추출 |
| [x] | F9 | 대화 기억 | 계정별 세션 (메모리) |
| [x] | F10 | 추천 평가 | (#6, #8) |
| [x] | F11 | 찾아갈 기관 | 주소는 팀 확인 **입력 필요** |
| [x] | F12 | 7일 계획 | 규칙 계획. AI 준비 안내는 3절 |
| [~] | F13 | 지원서 초안 | 모의 양식 항목. 실제 양식 항목은 Document Parse (3·4절) |
| [x] | F14 | 팀 통계 | (#6, #8) |
| [ ] | F15 | 대학생 지원 확장 | P2 |
| [~] | F16 | 자동 제출 | 모의 제출만. 양식 채우기는 doc-worker `/fill`, 외부 사이트 실제 제출은 약관 확인 **입력 필요** |
| [x] | F17 | 제출 내역 | (#6, #8) |
| [x] | F18 | 공고 모음·검색 | (#6, #8) |
| [x] | F19 | 창업 유형 테스트 | (#5, #8) |
| [x] | F20 | 메인 | (#8) |
| [ ] | F21 | 부산시·구·대학 자체 공고 | 팀 수동 데이터 **입력 필요** |

## 3. 국내 AI: Upstage (Solar · Solar Decide · Document Parse) + AI Gateway

설계: AI는 문장·확률만 만든다. 질문 수(3개), 자격 판정, Top3 선정은 코드가 한다. AI가 실패하거나 시간을 넘기거나 공고에 없는 사업명·금액·마감일을 쓰면 규칙 결과를 쓴다. 기본 `AI_MODE=off` (과금 0).

| 용도 | 모델 | 가격(할인가) |
|---|---|---|
| 공고 첨부·신청 양식 읽기 (F8·F13·F16·F21) | Document Parse | 쪽당 $0.005, 동기 100쪽·100MB |
| F2 되묻기, F6 이유 (빠른 응답) | Solar Mini 4.5 Preview `solar-mini-4-5-preview` | 12-03까지 90% 할인 |
| F3 요약, F12 7일 계획, F13 초안, 조건 정리 | Solar Pro 4 `solar-pro-4` | 입력 $0.15 / 출력 $0.60 (100만 토큰) |
| F5 관련도 점수 | Solar Decide `solar-decide` (베타, `/v1/systemone`) | 입력 $0.1/100만 토큰, 출력 무료 |

- [x] 계약: `packages/shared/src/cloudflare.ts` (작업별 모델, AI 모드, Decide·Document Parse 상수, doc-worker 계약)
- [x] `recommend()`가 AI 관련도 확률(0..1)을 받음, 후보 26개 이하로 줄이는 `relevanceCandidates()`
- [x] 라우트 정의 `infra/ai-gateway/route.json` (`dynamic/gil`): 사용자별 시간당 40회 → 하루 비용 한도 → mentor·reason은 Solar Mini, 나머지는 Solar Pro → 실패 시 Mini → Workers AI
- [x] `apps/api/src/ai/`: Solar 클라이언트(upstage 직접 / route), 시간 초과, 규칙 폴백, 사실 검사
- [x] 작업별 연결: F2 질문 문장, F3 요약, F6 이유, F12 계획, F13 초안
- [x] Solar Decide 관련도 → Top3 점수 (jev와 같은 형식이라 base URL만 바꿔 비교 가능)
- [ ] 실제 키로 Solar·Decide 응답 확인 (문서 기준으로만 구현됨)
- [x] `apps/api/src/docs/`: Document Parse 클라이언트, 결과에서 양식 항목(글자 수·필수) 뽑기, discover→download→parse 파이프라인
- [x] 테스트: 가짜 fetch로 성공·실패·시간 초과·사실 검사·Decide 응답·Document Parse 응답
- [ ] Upstage API 키 **입력 필요** (`wrangler secret put UPSTAGE_API_KEY`, 로컬은 `.dev.vars`)
- [ ] Solar Decide 베타 약관 동의 (조직 소유자, 2026-12-23 전) **입력 필요**
- [ ] AI Gateway 생성(인증 켜기), 커스텀 프로바이더 `upstage` (base `https://api.upstage.ai`) 등록, 라우트 업로드·배포
- [ ] 라우트 모델 노드의 provider 값(`custom-upstage`?, `workers-ai`?)을 대시보드에서 확인
- [ ] Upstage 콘솔·AI Gateway 대시보드에서 하루 사용량 확인

## 4. Cloudflare Containers: doc-worker

역할: 공고 상세 페이지에서 첨부를 찾아 내려받고(정부 사이트의 세션·리다이렉트 처리), 승인된 값으로 신청 양식(DOCX·HWPX)을 채운다. 문서 해석은 Document Parse가 한다.

- [x] `apps/doc-worker/`: 컨테이너 이미지(linux/amd64), `/health` `/discover` `/download` `/fill`, SSRF 차단
- [x] 합성 DOCX·HWPX로 fill 동작 (팀 모의 양식으로 다시 확인 필요)
- [x] 로컬 Docker로 실행 테스트 (amd64 빌드, /health·/fill)
- [x] API 연결: `DocWorker` Durable Object(`ctx.container`), `lite` 인스턴스, 비활성 2분 후 종료, `enableInternet` (로컬은 `DOC_WORKER_INTERNET=0`)
- [x] 흐름: 지원서 생성 → `/discover` → `/download` → Document Parse → 양식 항목. 실패하면 모의 양식 (30초 제한)
- [x] `wrangler dev`로 Worker → DO → 컨테이너 통합 실행 (로컬은 인터넷 켜기가 403으로 실패해 끄고 확인. 배포 환경에서 인터넷 켠 채로 다시 확인)
- [ ] 실제 공고 1건에서 내려받기 → 항목 추출 (F16 완료 조건)

## 5. 배포 (선행 조건)

- [ ] 저장소를 Durable Object 또는 D1로 옮김 (메모리 저장소는 isolate마다 따로라 로그인이 유지되지 않음)
- [ ] 웹 정적 파일 배포 (Workers Static Assets)
- [ ] 계정이 Workers Paid인지 확인 **입력 필요**
- [ ] 사용량 경보 설정 (Containers·Workers AI) **입력 필요**
- [ ] 첫 배포는 사용자 확인 후 (`wrangler deploy`)

## 6. 발표·검증

- [ ] 실제 사용자 10명 가입
- [ ] 통계 수치 기록 (PRD §5)
- [ ] 백업 영상
- [ ] 오픈소스 라이선스 고지 최신화 (README, `/licenses`)
