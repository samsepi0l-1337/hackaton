import base64
import io
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from xml.dom import minidom
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ["DOC_WORKER_ALLOW_PRIVATE"] = "1"
import server  # noqa: E402

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def docx_bytes():
    doc = (
        f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="{W}"><w:body>'
        "<w:tbl>"
        '<w:tr><w:tc><w:p><w:r><w:t>성명</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr>'
        '<w:tr><w:tc><w:p><w:r><w:t>창업 아이템명 *</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc></w:tr>'
        '<w:tr><w:tc><w:p><w:r><w:t>생년월일</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1990-01-01</w:t></w:r></w:p></w:tc></w:tr>'
        "</w:tbl>"
        '<w:p><w:r><w:t>창업 아이템 개요</w:t></w:r></w:p>'
        "</w:body></w:document>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", doc)
    return buf.getvalue()


def hwpx_bytes():
    sec = (
        '<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="s" xmlns:hp="p">'
        '<hp:p><hp:run><hp:tbl>'
        '<hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>대표자명</hp:t></hp:run></hp:p></hp:subList></hp:tc>'
        '<hp:tc><hp:subList><hp:p><hp:run><hp:t/></hp:run></hp:p></hp:subList></hp:tc></hp:tr>'
        '<hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>연락처</hp:t></hp:run></hp:p></hp:subList></hp:tc>'
        '<hp:tc><hp:subList><hp:p><hp:run/></hp:p></hp:subList></hp:tc></hp:tr>'
        '</hp:tbl></hp:run></hp:p>'
        '<hp:p><hp:run><hp:t>사업 개요</hp:t></hp:run></hp:p>'
        "</hs:sec>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/hwp+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("Contents/section0.xml", sec)
    return buf.getvalue()


def read_entry(data, name):
    return zipfile.ZipFile(io.BytesIO(data)).read(name).decode("utf-8")


class Origin(BaseHTTPRequestHandler):
    docx = docx_bytes()

    def log_message(self, *a):
        pass

    def do_GET(self):
        h = {"/page": self.page, "/files/plan.docx": self.file, "/dl": self.dl, "/dl2": self.dl2,
             "/redir": self.redir, "/htmlfile": self.htmlfile}.get(self.path.split("?")[0])
        (h or self.nf)()

    def nf(self):
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _ok(self, body, ctype, extra=()):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def page(self):
        html = """<html><head><title>2026 예비창업패키지 모집</title></head><body>
        <a href="/files/plan.docx">사업계획서 양식</a>
        <a href="/files/plan.docx">중복</a>
        <a href="/dl?id=7" title="x">공고문.hwp</a>
        <a href="/dl?id=8">그냥 링크</a>
        <a href="javascript:void(0)">js</a>
        <a href="/files/notes.txt">메모.txt</a>
        <a href="/fileDownload.do?no=3">신청서 서식.hwpx</a>
        </body></html>""".encode("utf-8")
        self._ok(html, "text/html; charset=utf-8")

    def file(self):
        self._ok(self.docx, "application/octet-stream")

    def dl(self):
        name = "사업계획서.docx".encode("euc-kr").decode("latin-1")
        self._ok(self.docx, "application/octet-stream", [("Content-Disposition", f'attachment; filename="{name}"')])

    def dl2(self):
        from urllib.parse import quote
        self._ok(self.docx, "application/octet-stream",
                 [("Content-Disposition", "attachment; filename=\"fallback.docx\"; filename*=UTF-8''" + quote("신청서 양식.docx"))])

    def redir(self):
        self.send_response(302)
        self.send_header("Location", "/files/plan.docx")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def htmlfile(self):
        self._ok(b"<!DOCTYPE html><html>login</html>", "text/html")


def post(base, path, body):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.origin = ThreadingHTTPServer(("127.0.0.1", 0), Origin)
        cls.worker = server.make_server(0, "127.0.0.1")
        for s in (cls.origin, cls.worker):
            threading.Thread(target=s.serve_forever, daemon=True).start()
        cls.o = f"http://127.0.0.1:{cls.origin.server_address[1]}"
        cls.w = f"http://127.0.0.1:{cls.worker.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        for s in (cls.origin, cls.worker):
            s.shutdown()
            s.server_close()


class FilenameTests(unittest.TestCase):
    def test_rfc5987(self):
        self.assertEqual(server.filename_from_disposition("attachment; filename*=UTF-8''%EC%8B%A0%EC%B2%AD%EC%84%9C.hwpx"), "신청서.hwpx")

    def test_rfc5987_preferred_over_plain(self):
        v = "attachment; filename=\"a.docx\"; filename*=UTF-8''%EC%96%91%EC%8B%9D.docx"
        self.assertEqual(server.filename_from_disposition(v), "양식.docx")

    def test_euckr_header_mojibake(self):
        raw = "사업계획서.hwp".encode("euc-kr").decode("latin-1")
        self.assertEqual(server.filename_from_disposition(f'attachment; filename="{raw}"'), "사업계획서.hwp")

    def test_utf8_header_mojibake(self):
        raw = "양식.pdf".encode("utf-8").decode("latin-1")
        self.assertEqual(server.filename_from_disposition(f"attachment; filename={raw}"), "양식.pdf")

    def test_percent_encoded_euckr(self):
        from urllib.parse import quote
        v = 'attachment; filename="%s"' % quote("서식.hwp".encode("euc-kr"))
        self.assertEqual(server.filename_from_disposition(v), "서식.hwp")

    def test_none_and_url(self):
        self.assertIsNone(server.filename_from_disposition(None))
        self.assertEqual(server.filename_from_url("http://x/a/%EC%96%91%EC%8B%9D.hwpx?x=1"), "양식.hwpx")
        self.assertEqual(server.safe_name("../../etc/pass:wd"), "pass_wd")

    def test_kind_of(self):
        self.assertEqual(server.kind_of("a.HWPX"), "hwpx")
        self.assertEqual(server.kind_of("x", docx_bytes()), "docx")
        self.assertEqual(server.kind_of("x", hwpx_bytes()), "hwpx")
        self.assertEqual(server.kind_of("x", b"%PDF-1.4"), "pdf")


class SsrfTests(unittest.TestCase):
    def setUp(self):
        self.prev = os.environ.pop("DOC_WORKER_ALLOW_PRIVATE", None)

    def tearDown(self):
        if self.prev is not None:
            os.environ["DOC_WORKER_ALLOW_PRIVATE"] = self.prev

    def test_blocked(self):
        for u in ("http://127.0.0.1/x", "http://10.1.2.3/", "http://172.16.0.1/", "http://192.168.1.1/",
                  "http://169.254.169.254/latest", "http://[::1]/", "http://[fc00::1]/", "http://localhost/",
                  "http://[::ffff:127.0.0.1]/"):
            with self.assertRaises(server.ApiError, msg=u) as c:
                server.check_url(u)
            self.assertEqual(c.exception.status, 400)

    def test_scheme(self):
        for u in ("file:///etc/passwd", "ftp://example.com/x", "gopher://x"):
            with self.assertRaises(server.ApiError):
                server.check_url(u)

    def test_public_ip_allowed(self):
        server.check_url("http://93.184.216.34/")


class EndpointTests(Base):
    def test_health(self):
        with urllib.request.urlopen(self.w + "/health") as r:
            self.assertEqual((r.status, r.read()), (200, b"ok"))

    def test_discover(self):
        st, body = post(self.w, "/discover", {"pageUrl": self.o + "/page"})
        self.assertEqual(st, 200)
        self.assertEqual(body["title"], "2026 예비창업패키지 모집")
        urls = [a["url"] for a in body["attachments"]]
        self.assertEqual(urls.count(self.o + "/files/plan.docx"), 1)
        self.assertIn(self.o + "/dl?id=7", urls)
        self.assertIn(self.o + "/fileDownload.do?no=3", urls)
        self.assertNotIn(self.o + "/dl?id=8", urls)
        self.assertFalse(any("notes" in u for u in urls))
        kinds = {a["url"]: a["kind"] for a in body["attachments"]}
        self.assertEqual(kinds[self.o + "/files/plan.docx"], "docx")
        self.assertEqual(kinds[self.o + "/dl?id=7"], "hwp")
        self.assertEqual(kinds[self.o + "/fileDownload.do?no=3"], "hwpx")

    def test_discover_errors(self):
        self.assertEqual(post(self.w, "/discover", {})[0], 400)
        st, body = post(self.w, "/discover", {"pageUrl": self.o + "/nope"})
        self.assertEqual((st, body["error"]["code"]), (502, "fetch_failed"))
        self.assertEqual(post(self.w, "/discover", {"pageUrl": "file:///etc/passwd"})[1]["error"]["code"], "bad_request")

    def test_download_variants(self):
        for path, name in (("/files/plan.docx", "plan.docx"), ("/dl", "사업계획서.docx"), ("/dl2", "신청서 양식.docx"), ("/redir", "plan.docx")):
            st, body = post(self.w, "/download", {"url": self.o + path, "referer": self.o + "/page"})
            self.assertEqual(st, 200, path)
            self.assertEqual(body["fileName"], name)
            self.assertEqual(body["kind"], "docx")
            data = base64.b64decode(body["fileBase64"])
            self.assertEqual(body["bytes"], len(data))

    def test_download_html_and_limits(self):
        st, body = post(self.w, "/download", {"url": self.o + "/htmlfile"})
        self.assertEqual((st, body["error"]["code"]), (502, "fetch_failed"))
        prev = server.DOWNLOAD_MAX
        server.DOWNLOAD_MAX = 100
        try:
            st, body = post(self.w, "/download", {"url": self.o + "/files/plan.docx"})
        finally:
            server.DOWNLOAD_MAX = prev
        self.assertEqual((st, body["error"]["code"]), (413, "too_large"))

    def test_unknown_route_and_bad_json(self):
        self.assertEqual(post(self.w, "/nope", {})[0], 404)
        req = urllib.request.Request(self.w + "/fill", data=b"not json")
        with self.assertRaises(urllib.error.HTTPError) as c:
            urllib.request.urlopen(req)
        self.assertEqual(c.exception.code, 400)


class FillTests(Base):
    def fill(self, data, name, values):
        return post(self.w, "/fill", {"fileBase64": base64.b64encode(data).decode(), "fileName": name, "values": values})

    def test_docx(self):
        st, body = self.fill(docx_bytes(), "a.docx", {
            "성명": "홍길동", "창업 아이템명": "AI & <길>", "생년월일": "2000-02-02", "창업 아이템 개요": "개요 본문", "없는항목": "x", "빈값": ""})
        self.assertEqual(st, 200)
        self.assertEqual(sorted(body["filled"]), sorted(["성명", "창업 아이템명", "창업 아이템 개요"]))
        self.assertEqual(sorted(body["missing"]), sorted(["생년월일", "없는항목", "빈값"]))
        xml = read_entry(base64.b64decode(body["fileBase64"]), "word/document.xml")
        self.assertIn("홍길동", xml)
        self.assertIn("AI &amp; &lt;길&gt;", xml)
        self.assertIn("1990-01-01", xml)  # 이미 값이 있는 셀은 덮어쓰지 않음
        self.assertIn("개요 본문", xml)
        minidom.parseString(xml.encode())

    def test_hwpx(self):
        st, body = self.fill(hwpx_bytes(), "a.hwpx", {"대표자명": "김철수", "연락처": "010-1234-5678", "사업 개요": "설명"})
        self.assertEqual(st, 200)
        self.assertEqual(sorted(body["filled"]), sorted(["대표자명", "연락처", "사업 개요"]))
        self.assertEqual(body["missing"], [])
        out = base64.b64decode(body["fileBase64"])
        xml = read_entry(out, "Contents/section0.xml")
        self.assertIn("<hp:t>김철수</hp:t>", xml)
        self.assertIn("010-1234-5678", xml)
        self.assertIn("설명", xml)
        minidom.parseString(xml.encode())
        zi = zipfile.ZipFile(io.BytesIO(out)).infolist()
        self.assertEqual(zi[0].filename, "mimetype")
        self.assertEqual(zi[0].compress_type, zipfile.ZIP_STORED)

    def test_unsupported_and_bad(self):
        st, body = self.fill(b"\xd0\xcf\x11\xe0abcd", "a.hwp", {"a": "b"})
        self.assertEqual((st, body["error"]["code"]), (422, "unsupported"))
        st, body = self.fill(b"%PDF-1.4 x", "a.pdf", {"a": "b"})
        self.assertEqual((st, body["error"]["code"]), (422, "unsupported"))
        self.assertEqual(self.fill(b"not a zip", "a.docx", {"a": "b"})[0], 400)
        self.assertEqual(post(self.w, "/fill", {"fileName": "a.docx"})[0], 400)



class KStartupAttachmentNameTest(unittest.TestCase):
    def test_name_from_sibling_text(self):
        html = (
            '<ul><li><a class="file_bg" title="[첨부파일] 신청서.hwpx">신청서.hwpx</a>'
            '<a href="javascript:void(0)" onclick="fnPdfView(1)"><span>바로보기</span></a>'
            '<a href="/afile/fileDownload/abc"><span>다운로드</span></a></li>'
            '<li><a class="file_bg">공고문.pdf</a><a href="/afile/fileDownload/def"><span>다운로드</span></a></li></ul>'
        )
        _, atts = server.find_attachments(html, "https://www.k-startup.go.kr/web/view")
        self.assertEqual([(a["name"], a["kind"]) for a in atts], [("신청서.hwpx", "hwpx"), ("공고문.pdf", "pdf")])
        self.assertEqual(atts[0]["url"], "https://www.k-startup.go.kr/afile/fileDownload/abc")

if __name__ == "__main__":
    unittest.main()
