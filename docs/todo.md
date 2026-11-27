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
| 국내 AI (Upstage) + AI Gateway | 운영 중, 모든 호출 게이트웨이 경유. 동적 라우트 전환은 보류 |
| Cloudflare Containers doc-worker | 구현·로컬 통합 완료, 실제 공고 확인은 배포 후 |
| DB (Durable Object SQLite + Zod) | 완료 |
| 배포 | 완료: https://gil-api.samsepi0l1337.workers.dev |

## 1. 공통·기반

- [x] bun 워크스페이스, `packages/shared`, `apps/api`, `apps/web` 구조 (#5)
- [x] API 계약 `packages/shared/src/api.ts` (#5)
- [x] 테스트 데이터: 실행일 기준 상대 마감일, 가능/확인 필요/불가/마감/상시/부산/전국 (#5)
- [x] Cloudflare 연동 계약 `packages/shared/src/cloudflare.ts` (AI 작업 종류, doc-worker HTTP 계약)
- [x] 개정안 PR #7 머지 (최종 d6eb693)
- [~] 개정안 PR #7 반영
  - [x] 계약 `packages/shared/src/explore.ts`, API 경로 `/api/explore/*`, F21 테스트 자료 `packages/shared/data/`
  - [x] API (#19): 비회원 게스트 세션(F9), F1 시작 정보, 문제 카드 선택(F21), F2 질문(모르겠어요·예시 요청·일찍 정리), F3 출처 표시 요약 + 지역 검토 카드, F4 조건 3단계, F5 경로 추천(억지로 채우지 않음), F12 우선 1개 + 후속 2개, F10 피드백·이벤트
  - [x] 웹: 메인 문구, /mentor 3단계(관심·상황 → 구상 정리 → 준비 안내), 문제 카드, 요약 출처 배지, 지역 카드, 준비사항, 경로 카드, 조건 확인, 피드백, 기기 저장·초기화. /test·/apply 화면 삭제 (API·컨테이너는 P2로 유지)
  - [x] 로컬 통합 확인 (390px): 시작 → 문제 카드 선택 → 질문 3개(답변·모르겠어요·건너뛰기) → 출처 표시 요약 → 지역 카드·우선 준비사항·경로 3개·조건 상태·피드백
  - [x] 지역 카드 '검토할 근거 있음'은 검수된 자료(공식 URL·확인일)가 있을 때만
  - [ ] F21 실제 자료로 교체 (기획·데이터 담당) **입력 필요**
  - [x] F12 선택 보완: 현장에 확인할 질문 최대 3개 (수정·복사, '현장 확인 전') — PR #7 d6eb693
- [x] 상담 횟수 1인당 7일 3회 (첫 질문 = 1회, 계정 id 기준)
- [x] 기기 저장 범위 확대 (시작 정보·문제·대화·요약·결과·준비 표시·현장 질문·피드백 초안)
- [x] Chrome 내장 AI(Prompt API): 한국어가 available 일 때만 질문 말투·추천 이유·현장 질문 다듬기, 아니면 서버 Solar. 2026-11 기준 Prompt API 언어는 en·ja·es·de·fr (한국어 개발 중)

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

## 2-1. 계정 필수·유형 테스트·실제 공고 (2026-11-27 결정)

- [x] 문서 반영 (prd §6·§16, features F0·F8·F9·F19, web-pages /signup·/verify·/forgot·/me·/test)
- [x] 창업 준비 로그인 필수 (미인증 계정은 창업 준비 불가) (#28, #30)
- [x] 회원가입: 비밀번호 2회 입력·규칙 검사 (화면·서버)
- [x] 이메일 인증 (링크 + 6자리 코드, 24시간, 다시 보내기 1분 1회)
- [x] 비밀번호 찾기: 복구 비밀번호 메일 (30분, 1회용, 로그인 후 새 비밀번호 설정)
- [x] 내 정보: 비밀번호 변경 (다른 세션 종료), 기본 정보(나이·거주지·사업자·직군)
- [x] 비밀번호 저장 bcrypt(cost 10) + pepper (secret PASSWORD_PEPPER)
- [x] /bufs 관리자 의견 화면 (secret ADMIN_PASSWORD_HASH, 5회 실패 10분 잠금)
- [x] 운영 DB 테스트 기록 삭제 (@test.local 계정·기록, 예전 비회원 기록). 운영은 테스트 계정을 만들지 않음. 관리자 기능(공고 수집·통계)은 /bufs 로그인으로
- [x] 이메일 인증 운영 확인 (2026-11-27)
- [x] 게이트웨이 설정용 토큰 폐기
- [x] [테스트] 지역 자료 삭제 (문제 카드·지역 배경·경로). 서비스 데이터는 비어 있고, 테스트 자료는 packages/shared/test/fixtures 로 이동. 공식 지원사업은 K-Startup 실제 공고
- [x] 부산 교육·상담 기관 실제 자료 7건 (공식 페이지 확인, 2026-11-27, #36). 부산경제진흥원·부산테크노파크는 서비스 페이지를 찾지 못해 보류
- [x] 공모 정렬: 최근 공모·많이 본 공모(조회 수, 6시간 중복 제외)·마감 임박 (#37)
- [x] K-Startup 유형 분류 수정: 시설·공간·보육 → 공간, 멘토링·컨설팅 → 상담, 교육 → 교육 (#37)
- [x] 조건 대조 수정: 내 정보 값 사용(대화 입력과 칸별 병합), 나이 제한 없음(ageAny), 전국·지원 지역 비교, 상세에 항목별 결과
- [x] 관심 표시(하트) + '나에게 맞는 순' 정렬, 창업 준비 추천 순서에 반영
- [x] Solar 독립 평가 (#39, `docs/ai-eval.md`)
- [x] 창업 준비 추천 순위에 Solar Decide 연결 (규칙은 거르기·대체). 재평가 1위 정답 0.91 (규칙 0.09)
- [x] 질문: 규칙 질문 원문 + AI 반응 한 문장 (원문 유지 11/11). Chrome 로컬 AI 질문 다시 쓰기 끔
- [x] 메일 발송: Cloudflare Email Service, noreply@dreamp.org (dreamp.org 등록 완료, 하루 1,000통)
- [x] 창업 유형 테스트(/test) 복구, 재미·참고용 표시
- [x] 실제 공고: K-Startup getAnnouncementInformation02 수집 (매일 03:00 KST + 운영자 요청, #29). 서비스 키 secret 등록 (개발계정, 2028-11-27까지)

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
- [x] 실제 키로 Solar·Decide 응답 확인 (Decide ~1초, Solar Mini ~1.5초, Solar Pro 요약 ~11초)
- [x] Decide 는 `solar-decide-flash`, 3초 제한 + 1회 재시도 (로컬 workerd 에서 연결이 가끔 멈춤)
- [x] Solar Pro 작업 시간 제한 15초, 요약 JSON 키 이름 흔들림 대응
- [x] `apps/api/src/docs/`: Document Parse 클라이언트, 결과에서 양식 항목(글자 수·필수) 뽑기, discover→download→parse 파이프라인
- [x] 테스트: 가짜 fetch로 성공·실패·시간 초과·사실 검사·Decide 응답·Document Parse 응답
- [x] Upstage API 키 `gil-hackathon` 발급, 로컬 `apps/api/.dev.vars` (git 제외)
- [ ] Solar Decide 베타 약관 동의 (조직 소유자, 2026-12-23 전) **입력 필요** — 지금은 동의 없이도 호출됨
- [x] AI Gateway `gil-gateway` 생성(인증·로그·분당 120회), 커스텀 provider `upstage`, Upstage 키 BYOK, 동적 라우트 `dynamic/gil` 생성·배포 (`infra/ai-gateway/`)
- [x] 운영: Solar·Decide·Document Parse 모두 게이트웨이 경유 (`UPSTAGE_BASE_URL`=custom-upstage, secret `CF_AIG_TOKEN` Run 권한). Worker 의 Upstage 키 secret 삭제
- [ ] 동적 라우트 `dynamic/gil` 로 전환 (`AI_MODE=route`): 커스텀 provider 노드가 동작하지 않아 보류 — `infra/ai-gateway/README.md`
- [ ] Upstage 콘솔·AI Gateway 대시보드에서 하루 사용량 확인

## 4. Cloudflare Containers: doc-worker

역할: 공고 상세 페이지에서 첨부를 찾아 내려받고(정부 사이트의 세션·리다이렉트 처리), 승인된 값으로 신청 양식(DOCX·HWPX)을 채운다. 문서 해석은 Document Parse가 한다.

- [x] `apps/doc-worker/`: 컨테이너 이미지(linux/amd64), `/health` `/discover` `/download` `/fill`, SSRF 차단
- [x] 합성 DOCX·HWPX로 fill 동작 (팀 모의 양식으로 다시 확인 필요)
- [x] 로컬 Docker로 실행 테스트 (amd64 빌드, /health·/fill)
- [x] API 연결: `DocWorker` Durable Object(`ctx.container`), `lite` 인스턴스, 비활성 2분 후 종료, `enableInternet` (로컬은 `DOC_WORKER_INTERNET=0`)
- [x] 흐름: 지원서 생성 → `/discover` → `/download` → Document Parse → 양식 항목. 실패하면 모의 양식 (30초 제한)
- [x] `wrangler dev`로 Worker → DO → 컨테이너 통합 실행 (로컬은 인터넷 켜기가 403으로 실패해 끄고 확인. 배포 환경에서 인터넷 켠 채로 다시 확인)
- [x] 팀 점검 API `POST /api/admin/form-probe {pageUrl}` (팀 계정): 실제 공고로 discover → download → Document Parse 결과 확인
- [x] K-Startup 첨부 이름 찾기 ('다운로드' 링크 옆 파일 이름)
- [x] 실제 공고 1건(2026 팁스, pbancSn=176076)에서 운영 환경 확인: 첨부 6개 찾기 → HWPX 내려받기 → Document Parse 본문 (~20초)
- [ ] 신청서 양식(사업계획서 서식)이 붙은 공고로 항목 추출·fill 확인 (팁스 공고는 공고문만 있어 절 제목이 항목으로 잡힘)
- [x] 배포마다 컨테이너 인스턴스 이름을 바꿔 새 이미지로 시작 (`CF_VERSION_METADATA`)

## 5. 배포 (선행 조건)

- [x] DB: `GilApp` Durable Object 의 SQLite KV + Zod 스키마 검사 (`apps/api/src/db/schema.ts`, `store.ts`). 재시작해도 데이터 유지
- [x] 웹 정적 파일을 같은 Worker 에서 제공 (Workers Static Assets, `/api/*` 만 Worker 가 먼저 받음)
- [x] 계정: Workers Paid $5 (확인됨)
- [ ] 사용량 경보 설정 (Cloudflare 알림: Containers·Workers AI, Upstage 콘솔 사용량) **입력 필요**
- [x] 배포: https://gil-api.samsepi0l1337.workers.dev (Worker + GilApp DO + DocWorker 컨테이너 + 웹)
- [x] 배포 환경 secret `UPSTAGE_API_KEY`, `AI_MODE=upstage`, `DECIDE_ENABLED=1`
- [x] 운영 확인: 로그인 → 상담(Solar Mini 질문 ~1.4초) → 요약(Solar Pro ~7.5초) → 결과(Decide 관련도 반영)

## 6. 발표·검증

- [ ] 실제 사용자 10명 가입
- [ ] 통계 수치 기록 (PRD §5)
- [ ] 백업 영상
- [ ] 오픈소스 라이선스 고지 최신화 (README, `/licenses`)
