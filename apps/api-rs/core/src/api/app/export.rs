//! 내려받는 지원서 공통 양식 (공문 형식). 공고 원본 양식을 채울 수 없을 때 쓴다.
//! 같은 문서 모델을 DOCX 와 HWPX 로 그린다.
use super::zip::stored_zip;

/// 공통 양식에 들어갈 내용. `applicant` 는 본인 정보 칸, `body` 는 사업 내용 칸이다.
pub struct ExportDoc<'a> {
    pub program: &'a str,
    pub agency: &'a str,
    /// 예: "2026년 11월 28일"
    pub date: &'a str,
    pub applicant: &'a [(String, String)],
    pub body: &'a [(String, String)],
}

#[derive(Clone, Copy, PartialEq)]
enum Style { Title, Subtitle, Heading, Body, Center, Right, Recipient, Note }
#[derive(Clone, Copy, PartialEq)]
enum CellKind { Label, Value }
enum Block { P(Style, String), Rule, Gap, Table(Vec<(String, String)>) }

pub const DISCLAIMER: &str = "※ 해보까에서 작성한 초안입니다. 제출 전에 공고 원본 양식과 내용을 확인해 주세요.";

fn blocks(d: &ExportDoc) -> Vec<Block> {
    let mut b = vec![
        Block::P(Style::Title, "창업지원사업 지원서".into()),
        Block::P(Style::Subtitle, format!("「{}」", d.program)),
        Block::Rule,
        Block::Table(vec![
            ("사업명".into(), d.program.into()),
            ("주관기관".into(), d.agency.into()),
            ("작성일".into(), d.date.into()),
        ]),
    ];
    let mut n = 1;
    if !d.applicant.is_empty() {
        b.push(Block::P(Style::Heading, format!("{n}. 신청인 정보")));
        b.push(Block::Table(d.applicant.to_vec()));
        n += 1;
    }
    b.push(Block::P(Style::Heading, format!("{n}. 사업 내용")));
    b.push(Block::Table(d.body.to_vec()));
    b.push(Block::Gap);
    b.push(Block::P(Style::Center, format!("위와 같이 「{}」에 지원하며, 작성한 내용이 사실임을 확인합니다.", d.program)));
    b.push(Block::Gap);
    b.push(Block::P(Style::Center, d.date.into()));
    b.push(Block::Gap);
    b.push(Block::P(Style::Right, "신청인                              (서명 또는 인)".into()));
    b.push(Block::Gap);
    b.push(Block::P(Style::Recipient, format!("{} 귀하", if d.agency.is_empty() { "주관기관" } else { d.agency })));
    b.push(Block::Gap);
    b.push(Block::P(Style::Note, DISCLAIMER.into()));
    b
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

// ---------- DOCX ----------
const FONT: &str = "맑은 고딕";
/// (크기 half-pt, 굵게, 색, 정렬, 앞 간격, 뒤 간격) twip
fn docx_style(s: Style) -> (u32, bool, &'static str, &'static str, u32, u32) {
    match s {
        Style::Title => (40, true, "000000", "center", 0, 120),
        Style::Subtitle => (24, false, "333333", "center", 0, 160),
        Style::Heading => (24, true, "000000", "left", 360, 120),
        Style::Body => (20, false, "000000", "both", 0, 0),
        Style::Center => (21, false, "000000", "center", 0, 0),
        Style::Right => (21, false, "000000", "right", 0, 0),
        Style::Recipient => (30, true, "000000", "left", 0, 0),
        Style::Note => (17, false, "666666", "left", 0, 0),
    }
}
fn docx_run(text: &str, size: u32, bold: bool, color: &str) -> String {
    format!(
        "<w:r><w:rPr><w:rFonts w:ascii=\"{FONT}\" w:hAnsi=\"{FONT}\" w:eastAsia=\"{FONT}\"/>{}<w:color w:val=\"{color}\"/><w:sz w:val=\"{size}\"/><w:szCs w:val=\"{size}\"/></w:rPr><w:t xml:space=\"preserve\">{}</w:t></w:r>",
        if bold { "<w:b/>" } else { "" },
        escape(text)
    )
}
fn docx_para(s: Style, text: &str) -> String {
    let (size, bold, color, jc, before, after) = docx_style(s);
    format!("<w:p><w:pPr><w:spacing w:before=\"{before}\" w:after=\"{after}\" w:line=\"300\" w:lineRule=\"auto\"/><w:jc w:val=\"{jc}\"/></w:pPr>{}</w:p>", docx_run(text, size, bold, color))
}
fn docx_cell(kind: CellKind, text: &str, width: u32) -> String {
    let shade = if kind == CellKind::Label { "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"EEF1F5\"/>" } else { "" };
    let jc = if kind == CellKind::Label { "center" } else { "both" };
    let mut out = format!("<w:tc><w:tcPr><w:tcW w:w=\"{width}\" w:type=\"dxa\"/>{shade}<w:vAlign w:val=\"center\"/></w:tcPr>");
    for line in text.split('\n') {
        out.push_str(&format!("<w:p><w:pPr><w:spacing w:before=\"40\" w:after=\"40\" w:line=\"300\" w:lineRule=\"auto\"/><w:jc w:val=\"{jc}\"/></w:pPr>{}</w:p>", docx_run(line, 20, kind == CellKind::Label, "000000")));
    }
    out.push_str("</w:tc>");
    out
}
fn docx_table(rows: &[(String, String)]) -> String {
    let (lw, vw) = (2400, 7238);
    let b = "w:val=\"single\" w:sz=\"6\" w:space=\"0\" w:color=\"7F7F7F\"";
    let mut t = format!("<w:tbl><w:tblPr><w:tblW w:w=\"{}\" w:type=\"dxa\"/><w:tblBorders><w:top {b}/><w:left {b}/><w:bottom {b}/><w:right {b}/><w:insideH {b}/><w:insideV {b}/></w:tblBorders><w:tblLayout w:type=\"fixed\"/><w:tblCellMar><w:top w:w=\"80\" w:type=\"dxa\"/><w:left w:w=\"140\" w:type=\"dxa\"/><w:bottom w:w=\"80\" w:type=\"dxa\"/><w:right w:w=\"140\" w:type=\"dxa\"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w=\"{lw}\"/><w:gridCol w:w=\"{vw}\"/></w:tblGrid>", lw + vw);
    for (label, value) in rows {
        t.push_str(&format!("<w:tr><w:trPr><w:trHeight w:val=\"440\"/></w:trPr>{}{}</w:tr>", docx_cell(CellKind::Label, label, lw), docx_cell(CellKind::Value, value, vw)));
    }
    t.push_str("</w:tbl>");
    t
}
pub fn standard_docx(d: &ExportDoc) -> Vec<u8> {
    let mut body = String::new();
    for b in blocks(d) {
        match b {
            Block::P(s, text) => body.push_str(&docx_para(s, &text)),
            Block::Rule => body.push_str("<w:p><w:pPr><w:pBdr><w:bottom w:val=\"single\" w:sz=\"12\" w:space=\"1\" w:color=\"1F3A6B\"/></w:pBdr><w:spacing w:before=\"0\" w:after=\"200\"/></w:pPr></w:p>"),
            Block::Gap => body.push_str("<w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\"/></w:pPr></w:p>"),
            Block::Table(rows) => body.push_str(&docx_table(&rows)),
        }
    }
    body.push_str("<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1418\" w:right=\"1134\" w:bottom=\"1418\" w:left=\"1134\" w:header=\"851\" w:footer=\"851\" w:gutter=\"0\"/></w:sectPr>");
    let doc = format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>{body}</w:body></w:document>");
    let types = b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>";
    let rels = b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>";
    stored_zip(&[("[Content_Types].xml", types), ("_rels/.rels", rels), ("word/document.xml", doc.as_bytes())])
}

// ---------- HWPX (OWPML 2011) ----------
// charPr id: 0 본문 10pt, 1 굵게 10pt, 2 제목 20pt, 3 부제 12pt, 4 소제목 12pt 굵게, 5 안내 8.5pt 회색, 6 귀하 15pt 굵게, 7 확인 문장 10.5pt
// paraPr id: 0 양쪽, 1 가운데, 2 오른쪽, 3 소제목(앞 간격), 4 표 칸(가운데), 5 표 칸(양쪽), 6 제목 아래 선
// borderFill id: 1 없음, 2 표 선, 3 표 선 + 회색 바탕, 4 아래 굵은 선
fn hwp_style(s: Style) -> (u32, u32) {
    match s {
        Style::Title => (2, 1),
        Style::Subtitle => (3, 1),
        Style::Heading => (4, 3),
        Style::Body => (0, 0),
        Style::Center => (7, 1),
        Style::Right => (7, 2),
        Style::Recipient => (6, 0),
        Style::Note => (5, 0),
    }
}
fn hwp_p(para: u32, chr: u32, text: &str) -> String {
    format!("<hp:p id=\"0\" paraPrIDRef=\"{para}\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"{chr}\"><hp:t>{}</hp:t></hp:run></hp:p>", escape(text))
}
const TABLE_W: u32 = 48188; // A4 59528 - 좌우 여백 5670*2
const LABEL_W: u32 = 11000;
fn hwp_table(id: usize, rows: &[(String, String)]) -> String {
    let row_h = 2200;
    let mut t = format!("<hp:p id=\"0\" paraPrIDRef=\"0\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"0\"><hp:tbl id=\"{id}\" zOrder=\"{id}\" numberingType=\"TABLE\" textWrap=\"TOP_AND_BOTTOM\" textFlow=\"BOTH_SIDES\" lock=\"0\" dropcapstyle=\"None\" pageBreak=\"CELL\" repeatHeader=\"0\" rowCnt=\"{}\" colCnt=\"2\" cellSpacing=\"0\" borderFillIDRef=\"2\" noAdjust=\"0\"><hp:sz width=\"{TABLE_W}\" widthRelTo=\"ABSOLUTE\" height=\"{}\" heightRelTo=\"ABSOLUTE\" protect=\"0\"/><hp:pos treatAsChar=\"1\" affectLSpacing=\"0\" flowWithText=\"1\" allowOverlap=\"0\" holdAnchorAndSO=\"0\" vertRelTo=\"PARA\" horzRelTo=\"COLUMN\" vertAlign=\"TOP\" horzAlign=\"LEFT\" vertOffset=\"0\" horzOffset=\"0\"/><hp:outMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/><hp:inMargin left=\"510\" right=\"510\" top=\"283\" bottom=\"283\"/>", rows.len(), rows.len() as u32 * row_h);
    for (i, (label, value)) in rows.iter().enumerate() {
        t.push_str("<hp:tr>");
        for (col, text) in [label, value].iter().enumerate() {
            let (w, fill, para, chr) = if col == 0 { (LABEL_W, 3, 4, 1) } else { (TABLE_W - LABEL_W, 2, 5, 0) };
            t.push_str(&format!("<hp:tc name=\"\" header=\"0\" hasMargin=\"0\" protect=\"0\" editable=\"0\" dirty=\"0\" borderFillIDRef=\"{fill}\"><hp:subList id=\"\" textDirection=\"HORIZONTAL\" lineWrap=\"BREAK\" vertAlign=\"CENTER\" linkListIDRef=\"0\" linkListNextIDRef=\"0\" textWidth=\"0\" textHeight=\"0\" hasTextRef=\"0\" hasNumRef=\"0\">"));
            for line in text.split('\n') { t.push_str(&hwp_p(para, chr, line)); }
            t.push_str(&format!("</hp:subList><hp:cellAddr colAddr=\"{col}\" rowAddr=\"{i}\"/><hp:cellSpan colSpan=\"1\" rowSpan=\"1\"/><hp:cellSz width=\"{w}\" height=\"{row_h}\"/><hp:cellMargin left=\"510\" right=\"510\" top=\"283\" bottom=\"283\"/></hp:tc>"));
        }
        t.push_str("</hp:tr>");
    }
    t.push_str("</hp:tbl></hp:run></hp:p>");
    t
}
fn hwp_header() -> String {
    let langs = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"];
    let mut fonts = String::new();
    for l in langs { fonts.push_str(&format!("<hh:fontface lang=\"{l}\" fontCnt=\"1\"><hh:font id=\"0\" face=\"{FONT}\" type=\"TTF\" isEmbedded=\"0\"><hh:typeInfo familyType=\"FCAT_GOTHIC\" weight=\"6\" proportion=\"4\" contrast=\"0\" strokeVariation=\"1\" armStyle=\"1\" letterform=\"1\" midline=\"1\" xHeight=\"1\"/></hh:font></hh:fontface>")); }
    let border = |t: &str, w: &str| format!("<hh:leftBorder type=\"{t}\" width=\"{w}\" color=\"#7F7F7F\"/><hh:rightBorder type=\"{t}\" width=\"{w}\" color=\"#7F7F7F\"/><hh:topBorder type=\"{t}\" width=\"{w}\" color=\"#7F7F7F\"/><hh:bottomBorder type=\"{t}\" width=\"{w}\" color=\"#7F7F7F\"/>");
    let bf = |id: u32, inner: String, fill: &str| format!("<hh:borderFill id=\"{id}\" threeD=\"0\" shadow=\"0\" centerLine=\"NONE\" breakCellSeparateLine=\"0\"><hh:slash type=\"NONE\" Crooked=\"0\" isCounter=\"0\"/><hh:backSlash type=\"NONE\" Crooked=\"0\" isCounter=\"0\"/>{inner}<hh:diagonal type=\"SOLID\" width=\"0.1 mm\" color=\"#000000\"/>{fill}</hh:borderFill>");
    let gray = "<hc:fillBrush><hc:winBrush faceColor=\"#EEF1F5\" hatchColor=\"#999999\" alpha=\"0\"/></hc:fillBrush>";
    let rule = "<hh:leftBorder type=\"NONE\" width=\"0.1 mm\" color=\"#000000\"/><hh:rightBorder type=\"NONE\" width=\"0.1 mm\" color=\"#000000\"/><hh:topBorder type=\"NONE\" width=\"0.1 mm\" color=\"#000000\"/><hh:bottomBorder type=\"SOLID\" width=\"0.5 mm\" color=\"#1F3A6B\"/>".to_string();
    let fills = [bf(1, border("NONE", "0.1 mm"), ""), bf(2, border("SOLID", "0.12 mm"), ""), bf(3, border("SOLID", "0.12 mm"), gray), bf(4, rule, "")].concat();
    let ch = |id: u32, h: u32, color: &str, bold: bool| format!("<hh:charPr id=\"{id}\" height=\"{h}\" textColor=\"{color}\" shadeColor=\"none\" useFontSpace=\"0\" useKerning=\"0\" symMark=\"NONE\" borderFillIDRef=\"1\"><hh:fontRef hangul=\"0\" latin=\"0\" hanja=\"0\" japanese=\"0\" other=\"0\" symbol=\"0\" user=\"0\"/><hh:ratio hangul=\"100\" latin=\"100\" hanja=\"100\" japanese=\"100\" other=\"100\" symbol=\"100\" user=\"100\"/><hh:spacing hangul=\"0\" latin=\"0\" hanja=\"0\" japanese=\"0\" other=\"0\" symbol=\"0\" user=\"0\"/><hh:relSz hangul=\"100\" latin=\"100\" hanja=\"100\" japanese=\"100\" other=\"100\" symbol=\"100\" user=\"100\"/><hh:offset hangul=\"0\" latin=\"0\" hanja=\"0\" japanese=\"0\" other=\"0\" symbol=\"0\" user=\"0\"/>{}<hh:underline type=\"NONE\" shape=\"SOLID\" color=\"#000000\"/><hh:strikeout shape=\"NONE\" color=\"#000000\"/><hh:outline type=\"NONE\"/><hh:shadow type=\"NONE\" color=\"#B2B2B2\" offsetX=\"10\" offsetY=\"10\"/></hh:charPr>", if bold { "<hh:bold/>" } else { "" });
    let chars = [ch(0, 1000, "#000000", false), ch(1, 1000, "#000000", true), ch(2, 2000, "#000000", true), ch(3, 1200, "#333333", false), ch(4, 1200, "#000000", true), ch(5, 850, "#666666", false), ch(6, 1500, "#000000", true), ch(7, 1050, "#000000", false)].concat();
    let pp = |id: u32, align: &str, prev: u32, next: u32, line: u32, bfill: u32| format!("<hh:paraPr id=\"{id}\" tabPrIDRef=\"0\" condense=\"0\" fontLineHeight=\"0\" snapToGrid=\"1\" suppressLineNumbers=\"0\" checked=\"0\"><hh:align horizontal=\"{align}\" vertical=\"BASELINE\"/><hh:heading type=\"NONE\" idRef=\"0\" level=\"0\"/><hh:breakSetting breakLatinWord=\"KEEP_WORD\" breakNonLatinWord=\"KEEP_WORD\" widowOrphan=\"0\" keepWithNext=\"0\" keepLines=\"0\" pageBreakBefore=\"0\" lineWrap=\"BREAK\"/><hh:autoSpacing eAsianEng=\"0\" eAsianNum=\"0\"/><hh:margin><hc:intent value=\"0\" unit=\"HWPUNIT\"/><hc:left value=\"0\" unit=\"HWPUNIT\"/><hc:right value=\"0\" unit=\"HWPUNIT\"/><hc:prev value=\"{prev}\" unit=\"HWPUNIT\"/><hc:next value=\"{next}\" unit=\"HWPUNIT\"/></hh:margin><hh:lineSpacing type=\"PERCENT\" value=\"{line}\" unit=\"HWPUNIT\"/><hh:border borderFillIDRef=\"{bfill}\" offsetLeft=\"0\" offsetRight=\"0\" offsetTop=\"0\" offsetBottom=\"0\" connect=\"0\" ignoreMargin=\"0\"/></hh:paraPr>");
    let paras = [pp(0, "JUSTIFY", 0, 0, 160, 1), pp(1, "CENTER", 0, 300, 160, 1), pp(2, "RIGHT", 0, 0, 160, 1), pp(3, "LEFT", 1400, 500, 160, 1), pp(4, "CENTER", 0, 0, 150, 1), pp(5, "JUSTIFY", 0, 0, 150, 1), pp(6, "LEFT", 0, 800, 100, 4)].concat();
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><hh:head xmlns:hh=\"http://www.hancom.co.kr/hwpml/2011/head\" xmlns:hc=\"http://www.hancom.co.kr/hwpml/2011/core\" xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" version=\"1.4\" secCnt=\"1\"><hh:beginNum page=\"1\" footnote=\"1\" endnote=\"1\" pic=\"1\" tbl=\"1\" equation=\"1\"/><hh:refList><hh:fontfaces itemCnt=\"7\">{fonts}</hh:fontfaces><hh:borderFills itemCnt=\"4\">{fills}</hh:borderFills><hh:charProperties itemCnt=\"8\">{chars}</hh:charProperties><hh:tabProperties itemCnt=\"1\"><hh:tabPr id=\"0\" autoTabLeft=\"0\" autoTabRight=\"0\"/></hh:tabProperties><hh:paraProperties itemCnt=\"7\">{paras}</hh:paraProperties><hh:styles itemCnt=\"1\"><hh:style id=\"0\" type=\"PARA\" name=\"바탕글\" engName=\"Normal\" paraPrIDRef=\"0\" charPrIDRef=\"0\" nextStyleIDRef=\"0\" langID=\"1042\" lockForm=\"0\"/></hh:styles></hh:refList><hh:compatibleDocument targetProgram=\"HWP201X\"><hh:layoutCompatibility/></hh:compatibleDocument><hh:docOption><hh:linkinfo path=\"\" pageInherit=\"0\" footnoteInherit=\"0\"/></hh:docOption><hh:trackchageConfig flags=\"56\"/></hh:head>")
}
pub fn standard_hwpx(d: &ExportDoc) -> Vec<u8> {
    let mut sec = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><hs:sec xmlns:hs=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" xmlns:hc=\"http://www.hancom.co.kr/hwpml/2011/core\" xmlns:hh=\"http://www.hancom.co.kr/hwpml/2011/head\">");
    // 첫 문단에 쪽 설정(A4, 여백 상하 25mm·좌우 20mm)을 둔다.
    sec.push_str("<hp:p id=\"0\" paraPrIDRef=\"1\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"2\"><hp:secPr id=\"\" textDirection=\"HORIZONTAL\" spaceColumns=\"1134\" tabStop=\"8000\" tabStopVal=\"4000\" tabStopUnit=\"HWPUNIT\" outlineShapeIDRef=\"0\" memoShapeIDRef=\"0\" textVerticalWidthHead=\"0\" masterPageCnt=\"0\"><hp:grid lineGrid=\"0\" charGrid=\"0\" wonggojiFormat=\"0\"/><hp:startNum pageStartsOn=\"BOTH\" page=\"0\" pic=\"0\" tbl=\"0\" equation=\"0\"/><hp:visibility hideFirstHeader=\"0\" hideFirstFooter=\"0\" hideFirstMasterPage=\"0\" border=\"SHOW_ALL\" fill=\"SHOW_ALL\" hideFirstPageNum=\"0\" hideFirstEmptyLine=\"0\" showLineNumber=\"0\"/><hp:lineNumberShape restartType=\"0\" countBy=\"0\" distance=\"0\" startNumber=\"0\"/><hp:pagePr landscape=\"WIDELY\" width=\"59528\" height=\"84186\" gutterType=\"LEFT_ONLY\"><hp:margin header=\"4252\" footer=\"4252\" gutter=\"0\" left=\"5670\" right=\"5670\" top=\"7087\" bottom=\"4252\"/></hp:pagePr></hp:secPr><hp:t>창업지원사업 지원서</hp:t></hp:run></hp:p>");
    let mut tables = 0;
    for b in blocks(d).into_iter().skip(1) {
        match b {
            Block::P(s, text) => { let (c, p) = hwp_style(s); sec.push_str(&hwp_p(p, c, &text)); }
            Block::Rule => sec.push_str(&hwp_p(6, 0, "")),
            Block::Gap => sec.push_str(&hwp_p(0, 0, "")),
            Block::Table(rows) => { tables += 1; sec.push_str(&hwp_table(tables, &rows)); }
        }
    }
    sec.push_str("</hs:sec>");
    let version = b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><hv:HCFVersion xmlns:hv=\"http://www.hancom.co.kr/hwpml/2011/version\" tagetApplication=\"WORDPROCESSOR\" major=\"5\" minor=\"1\" micro=\"0\" buildNumber=\"1\" os=\"1\" xmlVersion=\"1.4\" application=\"Hancom Office Hangul\" appVersion=\"11, 0, 0, 0\"/>";
    let container = b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><ocf:container xmlns:ocf=\"urn:oasis:names:tc:opendocument:xmlns:container\" xmlns:hpf=\"http://www.hancom.co.kr/schema/2011/hpf\"><ocf:rootfiles><ocf:rootfile full-path=\"Contents/content.hpf\" media-type=\"application/hwpml-package+xml\"/><ocf:rootfile full-path=\"Preview/PrvText.txt\" media-type=\"text/plain\"/></ocf:rootfiles></ocf:container>";
    let manifest = b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><odf:manifest xmlns:odf=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"/>";
    let content = format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><opf:package xmlns:opf=\"http://www.idpf.org/2007/opf/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" version=\"\" unique-identifier=\"\" id=\"\"><opf:metadata><opf:title>{}</opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest><opf:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/><opf:item id=\"section0\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/><opf:item id=\"settings\" href=\"settings.xml\" media-type=\"application/xml\"/></opf:manifest><opf:spine><opf:itemref idref=\"header\" linear=\"yes\"/><opf:itemref idref=\"section0\" linear=\"yes\"/></opf:spine></opf:package>", escape(&format!("{} 지원서", d.program)));
    let settings = b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><ha:HWPApplicationSetting xmlns:ha=\"http://www.hancom.co.kr/hwpml/2011/app\" xmlns:config=\"urn:oasis:names:tc:opendocument:xmlns:config:1.0\"><ha:CaretPosition listIDRef=\"0\" paraIDRef=\"0\" pos=\"0\"/></ha:HWPApplicationSetting>";
    let preview = format!("창업지원사업 지원서\r\n「{}」\r\n{}\r\n", d.program, d.agency);
    let header = hwp_header();
    stored_zip(&[
        ("mimetype", b"application/hwp+zip"),
        ("version.xml", version),
        ("Contents/header.xml", header.as_bytes()),
        ("Contents/section0.xml", sec.as_bytes()),
        ("Preview/PrvText.txt", preview.as_bytes()),
        ("settings.xml", settings),
        ("META-INF/container.xml", container),
        ("META-INF/manifest.xml", manifest),
        ("Contents/content.hpf", content.as_bytes()),
    ])
}


// ---------- PPTX (16:9 슬라이드, 같은 내용) ----------
const EMU_IN: i64 = 914_400;
const SLIDE_W: i64 = 12_192_000;
const SLIDE_H: i64 = 6_858_000;
const BG: &str = "<p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>";
/// 글상자 문단: (글, 크기 pt*100, 굵게, 색, 정렬 l|ctr|r)
type PPara<'a> = (&'a str, u32, bool, &'a str, &'a str);
fn p_run(text: &str, sz: u32, bold: bool, color: &str) -> String {
    format!("<a:r><a:rPr lang=\"ko-KR\" sz=\"{sz}\" b=\"{}\" dirty=\"0\"><a:solidFill><a:srgbClr val=\"{color}\"/></a:solidFill><a:latin typeface=\"{FONT}\"/><a:ea typeface=\"{FONT}\"/></a:rPr><a:t>{}</a:t></a:r>", if bold { 1 } else { 0 }, escape(text))
}
fn p_paras(paras: &[PPara]) -> String {
    let mut out = String::new();
    for (text, sz, bold, color, algn) in paras {
        for line in text.split('\n') {
            out.push_str(&format!("<a:p><a:pPr algn=\"{algn}\"><a:lnSpc><a:spcPct val=\"115000\"/></a:lnSpc></a:pPr>{}</a:p>", p_run(line, *sz, *bold, color)));
        }
    }
    out
}
fn p_box(id: u32, x: i64, y: i64, w: i64, h: i64, paras: &[PPara]) -> String {
    format!("<p:sp><p:nvSpPr><p:cNvPr id=\"{id}\" name=\"Text {id}\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x=\"{x}\" y=\"{y}\"/><a:ext cx=\"{w}\" cy=\"{h}\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap=\"square\" lIns=\"0\" tIns=\"0\" rIns=\"0\" bIns=\"0\"><a:normAutofit/></a:bodyPr><a:lstStyle/>{}</p:txBody></p:sp>", p_paras(paras))
}
fn p_rule(id: u32, y: i64) -> String {
    format!("<p:cxnSp><p:nvCxnSpPr><p:cNvPr id=\"{id}\" name=\"Line {id}\"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x=\"{}\" y=\"{y}\"/><a:ext cx=\"{}\" cy=\"0\"/></a:xfrm><a:prstGeom prst=\"line\"><a:avLst/></a:prstGeom><a:ln w=\"22225\"><a:solidFill><a:srgbClr val=\"1F3A6B\"/></a:solidFill></a:ln></p:spPr></p:cxnSp>", EMU_IN / 2, SLIDE_W - EMU_IN)
}
fn p_cell(text: &str, label: bool) -> String {
    let ln = |tag: &str| format!("<a:{tag} w=\"9525\"><a:solidFill><a:srgbClr val=\"7F7F7F\"/></a:solidFill></a:{tag}>");
    let fill = if label { "<a:solidFill><a:srgbClr val=\"EEF1F5\"/></a:solidFill>" } else { "<a:noFill/>" };
    let paras = p_paras(&[(text, if label { 1300 } else { 1200 }, label, "000000", if label { "ctr" } else { "l" })]);
    format!("<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>{paras}</a:txBody><a:tcPr marL=\"91440\" marR=\"91440\" marT=\"54864\" marB=\"54864\" anchor=\"ctr\">{}{}{}{}{fill}</a:tcPr></a:tc>", ln("lnL"), ln("lnR"), ln("lnT"), ln("lnB"))
}
fn p_table(id: u32, y: i64, rows: &[(String, String)], row_h: i64) -> String {
    let (x, w) = (EMU_IN / 2, SLIDE_W - EMU_IN);
    let lw = 2_286_000;
    let mut t = format!("<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id=\"{id}\" name=\"Table {id}\"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp=\"1\"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x=\"{x}\" y=\"{y}\"/><a:ext cx=\"{w}\" cy=\"{}\"/></p:xfrm><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/table\"><a:tbl><a:tblPr firstRow=\"0\" bandRow=\"0\"/><a:tblGrid><a:gridCol w=\"{lw}\"/><a:gridCol w=\"{}\"/></a:tblGrid>", row_h * rows.len() as i64, w - lw);
    for (label, value) in rows {
        t.push_str(&format!("<a:tr h=\"{row_h}\">{}{}</a:tr>", p_cell(label, true), p_cell(value, false)));
    }
    t.push_str("</a:tbl></a:graphicData></a:graphic></p:graphicFrame>");
    t
}
fn p_slide(shapes: &str) -> String {
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:sld xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>{shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>")
}
fn p_heading(text: &str) -> String {
    p_box(2, EMU_IN / 2, 380_000, SLIDE_W - EMU_IN, 520_000, &[(text, 2200, true, "000000", "l")]) + &p_rule(3, 960_000)
}
/// 사업 내용 칸을 한 장에 넣을 만큼 나눈다 (글자 수 기준).
fn p_chunks(rows: &[(String, String)]) -> Vec<Vec<(String, String)>> {
    let (mut out, mut cur, mut used) = (Vec::new(), Vec::new(), 0usize);
    for r in rows {
        let cost = 80 + r.1.chars().count();
        if !cur.is_empty() && used + cost > 700 { out.push(std::mem::take(&mut cur)); used = 0; }
        used += cost; cur.push(r.clone());
    }
    if !cur.is_empty() { out.push(cur); }
    out
}
pub fn standard_pptx(d: &ExportDoc) -> Vec<u8> {
    let mut slides = Vec::new();
    // 1. 표지
    let mut cover = p_box(2, EMU_IN / 2, 900_000, SLIDE_W - EMU_IN, 900_000, &[("창업지원사업 지원서", 3600, true, "000000", "ctr")]);
    cover.push_str(&p_box(3, EMU_IN / 2, 1_850_000, SLIDE_W - EMU_IN, 500_000, &[(&format!("「{}」", d.program), 2000, false, "333333", "ctr")]));
    cover.push_str(&p_rule(4, 2_500_000));
    cover.push_str(&p_table(5, 2_800_000, &[("사업명".into(), d.program.into()), ("주관기관".into(), d.agency.into()), ("작성일".into(), d.date.into())], 480_000));
    cover.push_str(&p_box(6, EMU_IN / 2, SLIDE_H - 700_000, SLIDE_W - EMU_IN, 300_000, &[(DISCLAIMER, 1000, false, "666666", "l")]));
    slides.push(p_slide(&cover));
    let mut n = 1;
    if !d.applicant.is_empty() {
        slides.push(p_slide(&(p_heading(&format!("{n}. 신청인 정보")) + &p_table(4, 1_200_000, d.applicant, 520_000))));
        n += 1;
    }
    let chunks = p_chunks(d.body);
    let total = chunks.len();
    for (i, rows) in chunks.iter().enumerate() {
        let title = if total > 1 { format!("{n}. 사업 내용 ({}/{total})", i + 1) } else { format!("{n}. 사업 내용") };
        let row_h = ((SLIDE_H - 1_700_000) / rows.len().max(1) as i64).min(1_600_000);
        slides.push(p_slide(&(p_heading(&title) + &p_table(4, 1_200_000, rows, row_h))));
    }
    // 마지막 장: 확인 문장, 날짜, 서명, 귀하
    let agency = if d.agency.is_empty() { "주관기관" } else { d.agency };
    let mut last = p_box(2, EMU_IN, 1_500_000, SLIDE_W - 2 * EMU_IN, 800_000, &[(&format!("위와 같이 「{}」에 지원하며,\n작성한 내용이 사실임을 확인합니다.", d.program), 2000, false, "000000", "ctr")]);
    last.push_str(&p_box(3, EMU_IN, 2_800_000, SLIDE_W - 2 * EMU_IN, 450_000, &[(d.date, 2000, false, "000000", "ctr")]));
    last.push_str(&p_box(4, EMU_IN, 3_600_000, SLIDE_W - 2 * EMU_IN, 450_000, &[("신청인                              (서명 또는 인)", 2000, false, "000000", "r")]));
    last.push_str(&p_box(5, EMU_IN, 4_600_000, SLIDE_W - 2 * EMU_IN, 600_000, &[(&format!("{agency} 귀하"), 2800, true, "000000", "l")]));
    slides.push(p_slide(&last));

    let ns_p = "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"";
    let rel = |id: &str, ty: &str, target: &str| format!("<Relationship Id=\"{id}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/{ty}\" Target=\"{target}\"/>");
    let rels = |inner: String| format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">{inner}</Relationships>");
    let mut types = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/><Override PartName=\"/ppt/slideMasters/slideMaster1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml\"/><Override PartName=\"/ppt/slideLayouts/slideLayout1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml\"/><Override PartName=\"/ppt/theme/theme1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.theme+xml\"/>");
    let mut pres_rels = rel("rId1", "slideMaster", "slideMasters/slideMaster1.xml") + &rel("rId2", "theme", "theme/theme1.xml");
    let mut sld_ids = String::new();
    for i in 0..slides.len() {
        types.push_str(&format!("<Override PartName=\"/ppt/slides/slide{}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>", i + 1));
        pres_rels.push_str(&rel(&format!("rId{}", i + 3), "slide", &format!("slides/slide{}.xml", i + 1)));
        sld_ids.push_str(&format!("<p:sldId id=\"{}\" r:id=\"rId{}\"/>", 256 + i, i + 3));
    }
    types.push_str("</Types>");
    let pres = format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:presentation {ns_p} saveSubsetFonts=\"1\"><p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rId1\"/></p:sldMasterIdLst><p:sldIdLst>{sld_ids}</p:sldIdLst><p:sldSz cx=\"{SLIDE_W}\" cy=\"{SLIDE_H}\"/><p:notesSz cx=\"6858000\" cy=\"9144000\"/></p:presentation>");
    let empty_tree = "<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>";
    let master = format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:sldMaster {ns_p}>{}<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/><p:sldLayoutIdLst><p:sldLayoutId id=\"2147483649\" r:id=\"rId1\"/></p:sldLayoutIdLst></p:sldMaster>", empty_tree.replace("<p:cSld>", &format!("<p:cSld>{BG}")));
    let layout = format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:sldLayout {ns_p} preserve=\"1\">{}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>", empty_tree.replace("<p:cSld>", "<p:cSld name=\"Blank\">"));
    let theme = pptx_theme();
    let master_rels = rels(rel("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml") + &rel("rId2", "theme", "../theme/theme1.xml"));
    let layout_rels = rels(rel("rId1", "slideMaster", "../slideMasters/slideMaster1.xml"));
    let slide_rels = rels(rel("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"));
    let root_rels = rels(rel("rId1", "officeDocument", "ppt/presentation.xml"));
    let pres_rels = rels(pres_rels);
    let mut entries: Vec<(String, Vec<u8>)> = vec![
        ("[Content_Types].xml".into(), types.into_bytes()),
        ("_rels/.rels".into(), root_rels.into_bytes()),
        ("ppt/presentation.xml".into(), pres.into_bytes()),
        ("ppt/_rels/presentation.xml.rels".into(), pres_rels.into_bytes()),
        ("ppt/slideMasters/slideMaster1.xml".into(), master.into_bytes()),
        ("ppt/slideMasters/_rels/slideMaster1.xml.rels".into(), master_rels.into_bytes()),
        ("ppt/slideLayouts/slideLayout1.xml".into(), layout.into_bytes()),
        ("ppt/slideLayouts/_rels/slideLayout1.xml.rels".into(), layout_rels.into_bytes()),
        ("ppt/theme/theme1.xml".into(), theme.into_bytes()),
    ];
    for (i, s) in slides.into_iter().enumerate() {
        entries.push((format!("ppt/slides/slide{}.xml", i + 1), s.into_bytes()));
        entries.push((format!("ppt/slides/_rels/slide{}.xml.rels", i + 1), slide_rels.clone().into_bytes()));
    }
    let refs: Vec<(&str, &[u8])> = entries.iter().map(|(n, b)| (n.as_str(), b.as_slice())).collect();
    stored_zip(&refs)
}
fn pptx_theme() -> String {
    let clr = |name: &str, v: &str| format!("<a:{name}><a:srgbClr val=\"{v}\"/></a:{name}>");
    let colors = [clr("dk1", "000000"), clr("lt1", "FFFFFF"), clr("dk2", "1F3A6B"), clr("lt2", "EEF1F5"), clr("accent1", "2563EB"), clr("accent2", "1F3A6B"), clr("accent3", "7F7F7F"), clr("accent4", "F59E0B"), clr("accent5", "10B981"), clr("accent6", "EF4444"), clr("hlink", "2563EB"), clr("folHlink", "7C3AED")].concat();
    let font = format!("<a:latin typeface=\"{FONT}\"/><a:ea typeface=\"{FONT}\"/><a:cs typeface=\"\"/>");
    let solid = "<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>";
    let ln = |w: u32| format!("<a:ln w=\"{w}\"><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill></a:ln>");
    let eff = "<a:effectStyle><a:effectLst/></a:effectStyle>";
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" name=\"Haeboka\"><a:themeElements><a:clrScheme name=\"Haeboka\">{colors}</a:clrScheme><a:fontScheme name=\"Haeboka\"><a:majorFont>{font}</a:majorFont><a:minorFont>{font}</a:minorFont></a:fontScheme><a:fmtScheme name=\"Haeboka\"><a:fillStyleLst>{solid}{solid}{solid}</a:fillStyleLst><a:lnStyleLst>{}{}{}</a:lnStyleLst><a:effectStyleLst>{eff}{eff}{eff}</a:effectStyleLst><a:bgFillStyleLst>{solid}{solid}{solid}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>", ln(6350), ln(12700), ln(19050))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn doc<'a>(a: &'a [(String, String)], b: &'a [(String, String)]) -> ExportDoc<'a> {
        ExportDoc { program: "부산 <창업> & 공모", agency: "부산경제진흥원", date: "2026년 11월 28일", applicant: a, body: b }
    }
    #[test]
    fn both_formats_have_official_layout_and_escaped_text() {
        let a = vec![("성명".to_string(), String::new())];
        let b = vec![("사업 개요".to_string(), "첫 줄\n둘째 줄 \"인용\"".to_string())];
        for bytes in [standard_docx(&doc(&a, &b)), standard_hwpx(&doc(&a, &b))] {
            let text = String::from_utf8_lossy(&bytes);
            for want in ["창업지원사업 지원서", "1. 신청인 정보", "2. 사업 내용", "부산경제진흥원 귀하", "(서명 또는 인)", "부산 &lt;창업&gt; &amp; 공모", "&quot;인용&quot;", "둘째 줄"] {
                assert!(text.contains(want), "missing {want}");
            }
        }
        let pp = standard_pptx(&doc(&a, &b));
        let text = String::from_utf8_lossy(&pp);
        for want in ["창업지원사업 지원서", "1. 신청인 정보", "2. 사업 내용", "부산경제진흥원 귀하", "ppt/slides/slide4.xml", "&quot;인용&quot;"] { assert!(text.contains(want), "pptx missing {want}"); }
        let h = standard_hwpx(&doc(&a, &b));
        assert_eq!(&h[30..38], b"mimetype", "mimetype is the first entry");
    }
    #[test]
    fn no_applicant_section_when_there_are_no_identity_fields() {
        let b = vec![("사업 개요".to_string(), "내용".to_string())];
        let text = String::from_utf8_lossy(&standard_docx(&doc(&[], &b))).into_owned();
        assert!(!text.contains("신청인 정보") && text.contains("1. 사업 내용"));
    }
}
