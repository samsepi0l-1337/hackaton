# doc-worker

Cloudflare Container 에서 도는 문서 작업 서버입니다. Python 3.12, 표준 라이브러리만 씁니다.
계약: `packages/shared/src/cloudflare.ts` (포트 8080).

## 엔드포인트
| 경로 | 요청 | 응답 |
| --- | --- | --- |
| `GET /health` | | `200 ok` |
| `POST /discover` | `{ pageUrl }` | `{ pageUrl, title, attachments: [{ name, url, kind }] }` 공고 페이지의 hwp/hwpx/docx/pdf 링크와 `fileDownload`·`download` 링크 |
| `POST /download` | `{ url, referer? }` | `{ fileName, kind, bytes, fileBase64 }` Content-Disposition 파일명(RFC 5987, EUC-KR, 퍼센트 인코딩) 처리 |
| `POST /fill` | `{ fileBase64, fileName, values }` | `{ fileName, fileBase64, filled, missing }` DOCX·HWPX 만. 표에서 라벨 칸 다음의 빈 칸에 값을 넣고, 표에 없으면 라벨 문단 뒤에 문단을 넣는다. 이미 값이 있는 칸은 덮어쓰지 않는다 |

오류: `4xx/5xx` + `{ error: { code, message } }`. 코드는 `bad_request`, `unsupported`(HWP·PDF 채우기, 422), `fetch_failed`(502), `too_large`(413), `internal`.

## 한도와 보안
- http/https 만 허용. 호스트를 풀어서 loopback, 사설망(10/8, 172.16/12, 192.168/16), 링크로컬(169.254/16), `::1`, `fc00::/7` 이면 거절. 리다이렉트마다 다시 검사.
- 환경변수 `DOC_WORKER_ALLOW_PRIVATE=1` 은 테스트 전용 (기본 꺼짐).
- 공고 페이지 5MB, 첨부 50MB, 요청 본문 80MB, 원본 서버 응답 10초.
- 정규식으로 XML 을 고치므로 중첩 표는 채우지 못한다. 복잡한 양식은 `missing` 으로 나온다.

## 실행
```sh
python server.py
python3 -I -m unittest discover -s apps/doc-worker/tests

docker build --platform linux/amd64 -t gil-doc-worker apps/doc-worker
docker run -p 8080:8080 gil-doc-worker
curl localhost:8080/health
```
