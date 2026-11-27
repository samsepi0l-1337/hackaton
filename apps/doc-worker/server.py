"""gil doc-worker: 공고 첨부 찾기·내려받기·양식 채우기. 표준 라이브러리만 사용."""
import base64
import html as htmllib
import io
import ipaddress
import json
import os
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from xml.sax.saxutils import escape as xml_escape

PORT = 8080
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
HTML_MAX = 5 * 1024 * 1024
DOWNLOAD_MAX = 50 * 1024 * 1024
BODY_MAX = 80 * 1024 * 1024  # base64 요청 본문
TIMEOUT = 10
DOC_EXTS = ("hwpx", "hwp", "docx", "pdf")


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


# ---------- SSRF 방어 ----------
def allow_private():
    return os.environ.get("DOC_WORKER_ALLOW_PRIVATE") == "1"


def _blocked_ip(ip):
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return (ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_reserved
            or ip.is_multicast or ip.is_unspecified)


def check_url(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ApiError(400, "bad_request", "http/https URL 만 허용합니다")
    if allow_private():
        return
    try:
        infos = socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise ApiError(502, "fetch_failed", "호스트를 찾을 수 없습니다")
    for info in infos:
        if _blocked_ip(ipaddress.ip_address(info[4][0])):
            raise ApiError(400, "bad_request", "내부 주소는 허용하지 않습니다")


class _Redirect(urllib.request.HTTPRedirectHandler):
    """리다이렉트마다 SSRF 검사를 다시 한다."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        newurl = urllib.parse.urljoin(req.full_url, newurl)
        check_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.build_opener(_Redirect)


def http_get(url, referer=None, limit=HTML_MAX):
    check_url(url)
    headers = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "ko-KR,ko;q=0.9"}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    try:
        with _opener.open(req, timeout=TIMEOUT) as r:
            declared = r.headers.get("Content-Length")
            if declared and declared.isdigit() and int(declared) > limit:
                raise ApiError(413, "too_large", "파일이 너무 큽니다")
            buf = bytearray()
            while True:
                chunk = r.read(65536)
                if not chunk:
                    break
                buf += chunk
                if len(buf) > limit:
                    raise ApiError(413, "too_large", "파일이 너무 큽니다")
            return bytes(buf), r.headers, r.geturl()
    except ApiError:
        raise
    except urllib.error.HTTPError as e:
        raise ApiError(502, "fetch_failed", f"원본 서버 응답 {e.code}")
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as e:
        raise ApiError(502, "fetch_failed", f"가져오지 못했습니다: {e}")


# ---------- 종류·파일명 ----------
def kind_of(name, data=None):
    m = re.search(r"\.([A-Za-z0-9]+)\s*$", name or "")
    ext = m.group(1).lower() if m else ""
    if ext in DOC_EXTS:
        return ext
    if data:
        if data[:4] == b"%PDF":
            return "pdf"
        if data[:4] == b"\xd0\xcf\x11\xe0":
            return "hwp"
        if data[:4] == b"PK\x03\x04":
            try:
                names = zipfile.ZipFile(io.BytesIO(data)).namelist()
                if any(n.startswith("Contents/") for n in names):
                    return "hwpx"
                if "word/document.xml" in names:
                    return "docx"
            except zipfile.BadZipFile:
                pass
    return "unknown"


def _fix_mojibake(s):
    # 헤더가 latin-1 로 읽힌 EUC-KR/UTF-8 이름을 복원
    try:
        raw = s.encode("latin-1")
    except UnicodeEncodeError:
        return s
    if all(b < 0x80 for b in raw):
        return s
    for enc in ("utf-8", "euc-kr", "cp949"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return s


def _pct_decode(s, charset="utf-8"):
    raw = urllib.parse.unquote_to_bytes(s)
    for enc in (charset, "utf-8", "euc-kr", "cp949"):
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("latin-1")


def filename_from_disposition(value):
    if not value:
        return None
    m = re.search(r"filename\*\s*=\s*([\w-]+)'[^']*'([^;]+)", value, re.I)
    if m:
        return _pct_decode(m.group(2).strip().strip('"'), m.group(1))
    m = re.search(r'filename\s*=\s*"((?:[^"\\]|\\.)*)"', value, re.I) or re.search(r"filename\s*=\s*([^;]+)", value, re.I)
    if not m:
        return None
    name = m.group(1).strip()
    if "%" in name:
        return _pct_decode(name)
    return _fix_mojibake(name)


def safe_name(name):
    name = os.path.basename(name.replace("\\", "/")).strip() or "document"
    return re.sub(r'[\x00-\x1f<>:"|?*]', "_", name)


def filename_from_url(url):
    path = urllib.parse.urlsplit(url).path
    last = path.rsplit("/", 1)[-1]
    return _pct_decode(last) if last else ""


# ---------- /discover ----------
class _LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.links = "", []
        self._in_title, self._a = False, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "a" and a.get("href"):
            self._a = {"href": a["href"], "text": [], "title": a.get("title") or ""}
        elif tag == "meta" and not self.title and (a.get("property") == "og:title") and a.get("content"):
            self.title = a["content"].strip()

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._a is not None:
            self._a["text"].append(data)

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "a" and self._a is not None:
            self._a["text"] = re.sub(r"\s+", " ", "".join(self._a["text"])).strip()
            self.links.append(self._a)
            self._a = None


def _decode_html(data, headers):
    cs = headers.get_content_charset() if headers else None
    m = re.search(rb'<meta[^>]+charset=["\']?([\w-]+)', data[:4096], re.I)
    for enc in (cs, m.group(1).decode("ascii") if m else None, "utf-8", "euc-kr", "cp949"):
        if not enc:
            continue
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode("utf-8", "replace")


def find_attachments(html_text, base_url):
    p = _LinkParser()
    p.feed(html_text)
    out, seen = [], set()
    for link in p.links:
        href = htmllib.unescape(link["href"]).strip()
        if href.lower().startswith(("javascript:", "#", "mailto:")):
            continue
        url = urllib.parse.urljoin(base_url, href)
        if urllib.parse.urlsplit(url).scheme not in ("http", "https"):
            continue
        label = link["text"] or link["title"]
        path_name = filename_from_url(url)
        qs = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        qname = next((v[0] for k, v in qs.items() if k.lower() in ("filename", "file_name", "fname", "atchflnm") and v), "")
        name = None
        for cand in (path_name, qname, label):
            if cand and kind_of(cand) != "unknown":
                name = cand
                break
        if name is None:
            low = url.lower()
            if re.search(r"filedownload|/download|download\.do|filedown", low) and label:
                name = label
            else:
                m = re.search(r"([^\s/\\]+\.(?:hwpx|hwp|docx|pdf))", label or "", re.I)
                name = m.group(1) if m else None
        if not name:
            continue
        name = re.sub(r"\s+", " ", name).strip()
        if url in seen:
            continue
        seen.add(url)
        out.append({"name": name, "url": url, "kind": kind_of(name)})
    return (p.title.strip() or None), out


def discover(body):
    url = body.get("pageUrl")
    if not isinstance(url, str) or not url:
        raise ApiError(400, "bad_request", "pageUrl 이 필요합니다")
    data, headers, final = http_get(url, limit=HTML_MAX)
    title, atts = find_attachments(_decode_html(data, headers), final)
    return {"pageUrl": url, "title": title, "attachments": atts}


# ---------- /download ----------
def download(body):
    url = body.get("url")
    if not isinstance(url, str) or not url:
        raise ApiError(400, "bad_request", "url 이 필요합니다")
    referer = body.get("referer") if isinstance(body.get("referer"), str) else None
    data, headers, final = http_get(url, referer=referer, limit=DOWNLOAD_MAX)
    name = filename_from_disposition(headers.get("Content-Disposition")) or filename_from_url(final) or "document"
    name = safe_name(name)
    kind = kind_of(name, data)
    if kind == "unknown" and data[:5].lstrip().lower().startswith((b"<!doc", b"<html")):
        raise ApiError(502, "fetch_failed", "파일 대신 웹 페이지가 내려왔습니다 (세션 또는 접근 제한)")
    return {"fileName": name, "kind": kind, "bytes": len(data), "fileBase64": base64.b64encode(data).decode("ascii")}


# ---------- /fill ----------
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
_CELL_FLAGS = re.S


def norm(s):
    return re.sub(r"[\s:：*()（）\[\]·.]", "", htmllib.unescape(s or "")).lower()


def _open(tag):
    """여는 태그 (자기 닫힘 `<t/>` 는 제외)."""
    return rf"<{tag}(?:\s[^>]*?)?(?<!/)>"


def _text_of(xml, tag_t):
    parts = re.findall(rf"{_open(tag_t)}(.*?)</{tag_t}>", xml, _CELL_FLAGS)
    return "".join(htmllib.unescape(re.sub(r"<[^>]+>", "", t)) for t in parts)


def _table_spans(xml, tbl):
    """최상위 표 구간 목록 (중첩 허용)."""
    spans, depth, start = [], 0, 0
    for m in re.finditer(rf"<{tbl}(?:\s[^>]*?)?(?<!/)>|</{tbl}>", xml):
        if m.group(0).startswith("</"):
            depth -= 1
            if depth == 0:
                spans.append((start, m.end()))
        else:
            if depth == 0:
                start = m.start()
            depth += 1
    return spans


def _in_spans(spans, a, b):
    return any(s <= a and b <= e for s, e in spans)


def _split_cells(row_xml, tc):
    """행 안의 셀 (start, end) 위치. 중첩 표는 지원하지 않는다."""
    return [(m.start(), m.end()) for m in re.finditer(rf"<{tc}(?:\s[^>]*)?>.*?</{tc}>", row_xml, _CELL_FLAGS)]


def _set_cell_text(cell_xml, value, t_tag, p_tag, run_tag, tc):
    """셀의 첫 문단에 값을 넣는다. 빈 <t/> 가 있으면 거기에, 없으면 run 을 만든다."""
    esc = xml_escape(value)
    m = re.search(rf"<{t_tag}((?:\s[^>]*?)?)(?<!/)>(.*?)</{t_tag}>", cell_xml, _CELL_FLAGS)
    if m:
        return cell_xml[:m.start()] + f"<{t_tag}{m.group(1) or ''}>{esc}</{t_tag}>" + cell_xml[m.end():]
    m = re.search(rf"<{t_tag}((?:\s[^>]*?)?)\s*/>", cell_xml)
    if m:
        return cell_xml[:m.start()] + f"<{t_tag}{m.group(1) or ''}>{esc}</{t_tag}>" + cell_xml[m.end():]
    # run 안에 t 가 없는 경우: run 끝 또는 문단 끝에 새로 넣는다
    m = re.search(rf"(<{run_tag}(?:\s[^>]*)?>)(.*?)(</{run_tag}>)", cell_xml, _CELL_FLAGS)
    if m:
        return cell_xml[:m.end(2)] + f"<{t_tag}>{esc}</{t_tag}>" + cell_xml[m.end(2):]
    m = re.search(rf"(<{p_tag}(?:\s[^>]*)?>)(.*?)(</{p_tag}>)", cell_xml, _CELL_FLAGS)
    if m:
        new_run = f"<{run_tag}><{t_tag}>{esc}</{t_tag}></{run_tag}>"
        return cell_xml[:m.end(2)] + new_run + cell_xml[m.end(2):]
    # 문단도 없음: 셀 끝(</tc>) 앞에 문단 생성
    new_p = f"<{p_tag}><{run_tag}><{t_tag}>{esc}</{t_tag}></{run_tag}></{p_tag}>"
    i = cell_xml.rfind(f"</{tc}>")
    return cell_xml[:i] + new_p + cell_xml[i:]


def fill_table_xml(xml, values, spec):
    """spec: dict(tr, tc, t, p, run). 값이 들어간 라벨 목록과 새 xml."""
    pending = {norm(k): k for k in values if str(values[k]).strip()}
    filled = []
    tr, tc = spec["tr"], spec["tc"]
    out, pos = [], 0
    for m in re.finditer(rf"<{tr}(?:\s[^>]*)?>.*?</{tr}>", xml, _CELL_FLAGS):
        row = m.group(0)
        cells = _split_cells(row, tc)
        new_row, rpos = [], 0
        i = 0
        while i < len(cells) - 1:
            s, e = cells[i]
            label_key = norm(_text_of(row[s:e], spec["t"]))
            if label_key in pending:
                ns, ne = cells[i + 1]
                nxt = row[ns:ne]
                if not _text_of(nxt, spec["t"]).strip():
                    orig = pending.pop(label_key)
                    new_row.append(row[rpos:ns])
                    new_row.append(_set_cell_text(nxt, str(values[orig]), spec["t"], spec["p"], spec["run"], tc))
                    rpos = ne
                    filled.append(orig)
                    i += 2
                    continue
            i += 1
        new_row.append(row[rpos:])
        out.append(xml[pos:m.start()])
        out.append("".join(new_row))
        pos = m.end()
    out.append(xml[pos:])
    return "".join(out), filled


DOCX_SPEC = dict(tr="w:tr", tc="w:tc", t="w:t", p="w:p", run="w:r")
HWPX_SPEC = dict(tr="hp:tr", tc="hp:tc", t="hp:t", p="hp:p", run="hp:run")


def fill_paragraphs_docx(xml, values, filled):
    """표에서 못 채운 라벨: 라벨과 같은 문단 뒤에 값 문단을 넣는다."""
    pending = {norm(k): k for k in values if k not in filled and str(values[k]).strip()}
    if not pending:
        return xml
    out, pos = [], 0
    spans = _table_spans(xml, "w:tbl")
    for m in re.finditer(r"<w:p(?:\s[^>]*?)?(?<!/)>.*?</w:p>", xml, _CELL_FLAGS):
        if _in_spans(spans, m.start(), m.end()):
            continue
        key = norm(_text_of(m.group(0), "w:t"))
        if key in pending:
            orig = pending.pop(key)
            out.append(xml[pos:m.end()])
            out.append(f"<w:p><w:r><w:t xml:space=\"preserve\">{xml_escape(str(values[orig]))}</w:t></w:r></w:p>")
            pos = m.end()
            filled.append(orig)
    out.append(xml[pos:])
    return "".join(out)


def fill_paragraphs_hwpx(xml, values, filled):
    pending = {norm(k): k for k in values if k not in filled and str(values[k]).strip()}
    if not pending:
        return xml
    out, pos = [], 0
    spans = _table_spans(xml, "hp:tbl")
    for m in re.finditer(r"<hp:p(?:\s[^>]*?)?(?<!/)>.*?</hp:p>", xml, _CELL_FLAGS):
        para = m.group(0)
        if _in_spans(spans, m.start(), m.end()) or "<hp:tbl" in para or "<hp:tc" in para:
            continue
        key = norm(_text_of(para, "hp:t"))
        if key in pending:
            orig = pending.pop(key)
            open_tag = re.match(r"<hp:p(?:\s[^>]*?)?>", para).group(0)
            run_open = re.search(r"<hp:run(\s[^>]*?)?>", para)
            run_attrs = run_open.group(1) or "" if run_open else ""
            new_p = f"{open_tag}<hp:run{run_attrs}><hp:t>{xml_escape(str(values[orig]))}</hp:t></hp:run></hp:p>"
            out.append(xml[pos:m.end()])
            out.append(new_p)
            pos = m.end()
            filled.append(orig)
    out.append(xml[pos:])
    return "".join(out)


def _rewrite_zip(data, edits):
    src = zipfile.ZipFile(io.BytesIO(data))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as dst:
        for info in src.infolist():
            content = edits.get(info.filename)
            content = src.read(info.filename) if content is None else content
            # mimetype 은 무압축을 유지 (HWPX/ODF 규칙)
            ctype = zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED
            dst.writestr(zipfile.ZipInfo(info.filename, info.date_time), content, compress_type=ctype)
    return buf.getvalue()


def fill_docx(data, values):
    z = zipfile.ZipFile(io.BytesIO(data))
    if "word/document.xml" not in z.namelist():
        raise ApiError(400, "bad_request", "DOCX 구조가 아닙니다")
    xml = z.read("word/document.xml").decode("utf-8")
    xml, filled = fill_table_xml(xml, values, DOCX_SPEC)
    xml = fill_paragraphs_docx(xml, values, filled)
    return _rewrite_zip(data, {"word/document.xml": xml.encode("utf-8")}), filled


def fill_hwpx(data, values):
    z = zipfile.ZipFile(io.BytesIO(data))
    sections = sorted(n for n in z.namelist() if re.fullmatch(r"Contents/section\d+\.xml", n))
    if not sections:
        raise ApiError(400, "bad_request", "HWPX 구조가 아닙니다")
    edits, filled = {}, []
    remaining = dict(values)
    for n in sections:
        xml = z.read(n).decode("utf-8")
        xml, f = fill_table_xml(xml, remaining, HWPX_SPEC)
        xml = fill_paragraphs_hwpx(xml, {k: v for k, v in remaining.items() if k not in f}, f)
        for k in f:
            remaining.pop(k, None)
        filled += f
        edits[n] = xml.encode("utf-8")
    return _rewrite_zip(data, edits), filled


def fill(body):
    name, b64, values = body.get("fileName"), body.get("fileBase64"), body.get("values")
    if not isinstance(name, str) or not isinstance(b64, str) or not isinstance(values, dict):
        raise ApiError(400, "bad_request", "fileName, fileBase64, values 가 필요합니다")
    try:
        data = base64.b64decode(b64, validate=True)
    except ValueError:
        raise ApiError(400, "bad_request", "fileBase64 가 올바르지 않습니다")
    values = {str(k): str(v) for k, v in values.items()}
    kind = kind_of(name, data)
    if kind in ("hwp", "pdf"):
        raise ApiError(422, "unsupported", f"{kind.upper()} 는 채우기를 지원하지 않습니다 (DOCX·HWPX 만)")
    if kind not in ("docx", "hwpx"):
        raise ApiError(400, "bad_request", "알 수 없는 파일 형식입니다")
    try:
        out, filled = (fill_docx if kind == "docx" else fill_hwpx)(data, values)
    except zipfile.BadZipFile:
        raise ApiError(400, "bad_request", "손상된 파일입니다")
    missing = [k for k in values if k not in filled]
    return {"fileName": name, "fileBase64": base64.b64encode(out).decode("ascii"), "filled": filled, "missing": missing}


# ---------- HTTP ----------
ROUTES = {"/discover": discover, "/download": download, "/fill": fill}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def _send(self, status, payload, ctype="application/json; charset=utf-8"):
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, code, message):
        self._send(status, {"error": {"code": code, "message": message}})

    def do_GET(self):
        if self.path == "/health":
            self._send(200, b"ok", "text/plain; charset=utf-8")
        else:
            self._error(404, "bad_request", "없는 경로입니다")

    def do_POST(self):
        fn = ROUTES.get(self.path.split("?")[0])
        try:
            if fn is None:
                raise ApiError(404, "bad_request", "없는 경로입니다")
            n = int(self.headers.get("Content-Length") or 0)
            if n > BODY_MAX:
                raise ApiError(413, "too_large", "요청이 너무 큽니다")
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
            except ValueError:
                raise ApiError(400, "bad_request", "JSON 이 아닙니다")
            if not isinstance(body, dict):
                raise ApiError(400, "bad_request", "JSON 객체가 필요합니다")
            self._send(200, fn(body))
        except ApiError as e:
            self._error(e.status, e.code, e.message)
        except Exception as e:  # noqa: BLE001
            self._error(500, "internal", f"{type(e).__name__}: {e}")


def make_server(port=PORT, host="0.0.0.0"):
    return ThreadingHTTPServer((host, port), Handler)


if __name__ == "__main__":
    srv = make_server(int(os.environ.get("PORT", PORT)))
    print(f"doc-worker listening on {srv.server_address[1]}", flush=True)
    srv.serve_forever()
