//! Standard downloadable application documents.
use super::zip::stored_zip;

fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}
fn word_para(text: &str) -> String {
    format!("<w:p><w:r><w:rPr><w:rFonts w:ascii=\"맑은 고딕\" w:hAnsi=\"맑은 고딕\" w:eastAsia=\"맑은 고딕\"/></w:rPr><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>", escape(text))
}
pub fn standard_docx(title: &str, agency: &str, rows: &[(String, String)], footer: &str) -> Vec<u8> {
    let mut body = format!("{}{}<w:tbl><w:tblPr><w:tblBorders><w:top w:val=\"single\" w:sz=\"4\"/><w:left w:val=\"single\" w:sz=\"4\"/><w:bottom w:val=\"single\" w:sz=\"4\"/><w:right w:val=\"single\" w:sz=\"4\"/><w:insideH w:val=\"single\" w:sz=\"4\"/><w:insideV w:val=\"single\" w:sz=\"4\"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w=\"2800\"/><w:gridCol w:w=\"6200\"/></w:tblGrid>", word_para(&format!("{title} 지원서")), word_para(agency));
    for (label, value) in rows {
        body.push_str("<w:tr>");
        for cell in [label, value] {
            body.push_str("<w:tc><w:tcPr/>");
            for line in cell.split('\n') { body.push_str(&word_para(line)); }
            body.push_str("</w:tc>");
        }
        body.push_str("</w:tr>");
    }
    body.push_str("</w:tbl>"); body.push_str(&word_para(footer));
    body.push_str("<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/></w:sectPr>");
    let doc = format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>{body}</w:body></w:document>");
    let types = b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>";
    let rels = b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>";
    stored_zip(&[("[Content_Types].xml", types), ("_rels/.rels", rels), ("word/document.xml", doc.as_bytes())])
}

fn hwp_para(text: &str) -> String {
    format!("<hp:p id=\"0\" paraPrIDRef=\"0\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"0\"><hp:t>{}</hp:t></hp:run></hp:p>", escape(text))
}
pub fn standard_hwpx(title: &str, agency: &str, rows: &[(String, String)], footer: &str) -> Vec<u8> {
    let version = b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><hv:HCFVersion xmlns:hv=\"http://www.hancom.co.kr/hwpml/2011/version\" targetApplication=\"WORDPROCESSOR\" major=\"5\" minor=\"1\" micro=\"0\" buildNumber=\"1\"/>";
    let container = b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><container xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\" version=\"1.0\"><rootfiles><rootfile full-path=\"Contents/content.hpf\" media-type=\"application/hwpml-package+xml\"/></rootfiles></container>";
    let manifest = b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><manifest:manifest xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"/>";
    let content = b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><opf:package xmlns:opf=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"bookid\"><opf:metadata/><opf:manifest><opf:item id=\"header\" href=\"header.xml\" media-type=\"application/xml\"/><opf:item id=\"section0\" href=\"section0.xml\" media-type=\"application/xml\"/></opf:manifest><opf:spine><opf:itemref idref=\"header\" linear=\"yes\"/><opf:itemref idref=\"section0\" linear=\"yes\"/></opf:spine></opf:package>";
    let header = b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><hh:head xmlns:hh=\"http://www.hancom.co.kr/hwpml/2011/head\" xmlns:hc=\"http://www.hancom.co.kr/hwpml/2011/core\" version=\"1.5\" secCnt=\"1\"><hh:beginNum page=\"1\" footnote=\"1\" endnote=\"1\" pic=\"1\" tbl=\"1\" equation=\"1\"/><hh:refList><hh:fontfaces itemCnt=\"1\"><hh:fontface lang=\"HANGUL\" fontCnt=\"1\"><hh:font id=\"0\" face=\"\xeb\xa7\x91\xec\x9d\x80 \xea\xb3\xa0\xeb\x94\x95\" type=\"TTF\" isEmbedded=\"0\"/></hh:fontface></hh:fontfaces><hh:borderFills itemCnt=\"1\"><hh:borderFill id=\"1\" threeD=\"0\" shadow=\"0\" centerLine=\"NONE\" breakCellSeparateLine=\"0\"><hh:slash type=\"NONE\"/><hh:backSlash type=\"NONE\"/><hh:leftBorder type=\"SOLID\" width=\"0.1 mm\" color=\"#000000\"/><hh:rightBorder type=\"SOLID\" width=\"0.1 mm\" color=\"#000000\"/><hh:topBorder type=\"SOLID\" width=\"0.1 mm\" color=\"#000000\"/><hh:bottomBorder type=\"SOLID\" width=\"0.1 mm\" color=\"#000000\"/><hh:diagonal type=\"SOLID\" width=\"0.1 mm\" color=\"#000000\"/></hh:borderFill></hh:borderFills><hh:charProperties itemCnt=\"1\"><hh:charPr id=\"0\" height=\"1000\" textColor=\"#000000\" shadeColor=\"none\" useFontSpace=\"0\" useKerning=\"0\" symMark=\"NONE\" borderFillIDRef=\"1\"><hh:fontRef hangul=\"0\" latin=\"0\" hanja=\"0\" japanese=\"0\" other=\"0\" symbol=\"0\" user=\"0\"/><hh:ratio hangul=\"100\" latin=\"100\" hanja=\"100\" japanese=\"100\" other=\"100\" symbol=\"100\" user=\"100\"/><hh:spacing hangul=\"0\" latin=\"0\" hanja=\"0\" japanese=\"0\" other=\"0\" symbol=\"0\" user=\"0\"/><hh:relSz hangul=\"100\" latin=\"100\" hanja=\"100\" japanese=\"100\" other=\"100\" symbol=\"100\" user=\"100\"/><hh:offset hangul=\"0\" latin=\"0\" hanja=\"0\" japanese=\"0\" other=\"0\" symbol=\"0\" user=\"0\"/></hh:charPr></hh:charProperties><hh:paraProperties itemCnt=\"1\"><hh:paraPr id=\"0\" tabPrIDRef=\"0\" condense=\"0\" fontLineHeight=\"0\" snapToGrid=\"1\" suppressLineNumbers=\"0\" checked=\"0\"><hh:align horizontal=\"LEFT\" vertical=\"BASELINE\"/><hh:breakSetting breakLatinWord=\"KEEP_WORD\" breakNonLatinWord=\"KEEP_WORD\" widowOrphan=\"0\" keepWithNext=\"0\" keepLines=\"0\" pageBreakBefore=\"0\" lineWrap=\"BREAK\"/></hh:paraPr></hh:paraProperties><hh:styles itemCnt=\"1\"><hh:style id=\"0\" type=\"PARA\" name=\"Normal\" engName=\"Normal\" paraPrIDRef=\"0\" charPrIDRef=\"0\" nextStyleIDRef=\"0\" langID=\"1042\" lockForm=\"0\"/></hh:styles></hh:refList></hh:head>";
    let mut section = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?><hs:sec xmlns:hs=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" xmlns:hc=\"http://www.hancom.co.kr/hwpml/2011/core\"><hp:p id=\"0\" paraPrIDRef=\"0\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"0\"><hp:secPr id=\"0\" textDirection=\"HORIZONTAL\" spaceColumns=\"1134\" tabStop=\"8000\" outlineShapeIDRef=\"0\" memoShapeIDRef=\"0\" textVerticalWidthHead=\"0\"><hp:pagePr landscape=\"WIDELY\" width=\"59528\" height=\"84188\" gutterType=\"LEFT_ONLY\"><hp:margin header=\"4252\" footer=\"4252\" gutter=\"0\" left=\"8504\" right=\"8504\" top=\"5668\" bottom=\"4252\"/></hp:pagePr></hp:secPr></hp:run></hp:p>");
    section.push_str(&hwp_para(&format!("{title} 지원서"))); section.push_str(&hwp_para(agency));
    section.push_str(&format!("<hp:p id=\"0\" paraPrIDRef=\"0\" styleIDRef=\"0\"><hp:run charPrIDRef=\"0\"><hp:tbl id=\"1\" zOrder=\"0\" numberingType=\"TABLE\" textWrap=\"TOP_AND_BOTTOM\" textFlow=\"BOTH_SIDES\" lock=\"0\" dropcapstyle=\"None\" pageBreak=\"CELL\" repeatHeader=\"0\" rowCnt=\"{}\" colCnt=\"2\" cellSpacing=\"0\" borderFillIDRef=\"1\" noAdjust=\"0\"><hp:sz width=\"42000\" widthRelTo=\"ABSOLUTE\" height=\"{}\" heightRelTo=\"ABSOLUTE\" protect=\"0\"/><hp:pos treatAsChar=\"1\" affectLSpacing=\"0\" flowWithText=\"1\" allowOverlap=\"0\" holdAnchorAndSO=\"0\" vertRelTo=\"PARA\" horzRelTo=\"COLUMN\" vertAlign=\"TOP\" horzAlign=\"LEFT\" vertOffset=\"0\" horzOffset=\"0\"/><hp:outMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/><hp:inMargin left=\"200\" right=\"200\" top=\"100\" bottom=\"100\"/>", rows.len(), rows.len()*2000));
    for (i, (label, value)) in rows.iter().enumerate() {
        section.push_str("<hp:tr>");
        for (col, text) in [label, value].iter().enumerate() {
            let width = if col == 0 { 12000 } else { 30000 };
            section.push_str(&format!("<hp:tc name=\"\" header=\"0\" hasMargin=\"0\" protect=\"0\" editable=\"0\" dirty=\"0\" borderFillIDRef=\"1\"><hp:subList id=\"0\" textDirection=\"HORIZONTAL\" lineWrap=\"BREAK\" vertAlign=\"CENTER\" linkListIDRef=\"0\" linkListNextIDRef=\"0\" textWidth=\"0\" textHeight=\"0\" hasTextRef=\"0\" hasNumRef=\"0\">"));
            for line in text.split('\n') { section.push_str(&hwp_para(line)); }
            section.push_str(&format!("</hp:subList><hp:cellAddr colAddr=\"{col}\" rowAddr=\"{i}\"/><hp:cellSpan colSpan=\"1\" rowSpan=\"1\"/><hp:cellSz width=\"{width}\" height=\"2000\"/><hp:cellMargin left=\"200\" right=\"200\" top=\"100\" bottom=\"100\"/></hp:tc>"));
        }
        section.push_str("</hp:tr>");
    }
    section.push_str("</hp:tbl></hp:run></hp:p>"); section.push_str(&hwp_para(footer)); section.push_str("</hs:sec>");
    stored_zip(&[("mimetype", b"application/hwp+zip"), ("version.xml", version), ("META-INF/container.xml", container), ("META-INF/manifest.xml", manifest), ("Contents/content.hpf", content), ("Contents/header.xml", header), ("Contents/section0.xml", section.as_bytes())])
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn packages_include_escaped_text() {
        let rows = vec![("A<&".into(), "B\"'".into())];
        for bytes in [standard_docx("title", "agency", &rows, "footer"), standard_hwpx("title", "agency", &rows, "footer")] {
            let text = String::from_utf8_lossy(&bytes);
            assert!(text.contains("A&lt;&amp;")); assert!(text.contains("B&quot;&apos;"));
        }
    }
}
