const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;
const base = 'IP2Live_Midterm_Execution_Guide';
const source = fs.readFileSync(path.join(dir, base + '.md'), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = s => esc(s).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
function parse(md) {
  const lines = md.trim().split(/\r?\n/), out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('```')) {
      const code = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      out.push({ type: 'code', text: code.join('\n') }); continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[\s:|\-]+\|$/.test(lines[i])) rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim()));
        i++;
      }
      i--; out.push({ type: 'table', rows }); continue;
    }
    const head = /^(#{1,3})\s+(.*)$/.exec(line);
    if (head) { out.push({ type: 'h' + head[1].length, text: head[2] }); continue; }
    if (/^\d+\. /.test(line)) { out.push({ type: 'number', text: line }); continue; }
    if (line.startsWith('- ')) { out.push({ type: 'bullet', text: line.slice(2) }); continue; }
    out.push({ type: 'p', text: line });
  }
  return out;
}
const pages = source.split('<!-- PAGEBREAK -->').map(parse);
function htmlBlock(b) {
  if (b.type === 'table') return '<table><thead><tr>' + b.rows[0].map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + b.rows.slice(1).map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  if (b.type === 'code') return '<pre>' + esc(b.text) + '</pre>';
  if (b.type === 'bullet') return '<p class="list">• ' + inline(b.text) + '</p>';
  if (b.type === 'number') return '<p class="list">' + inline(b.text) + '</p>';
  return '<' + b.type + '>' + inline(b.text) + '</' + b.type + '>';
}
const html = `<!doctype html><html><head><meta charset="utf-8"><title>IP2Live Midterm Execution Guide</title><style>
@page { size: A4; margin: 13mm 14mm 13mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #172a38; font: 9.5pt/1.3 Arial, sans-serif; }
.page { break-after: page; }
.page:last-child { break-after: auto; }
.running { color: #4c6978; font-size: 8pt; letter-spacing: .8px; border-bottom: 1.5pt solid #0c8088; padding-bottom: 5pt; margin-bottom: 12pt; display: flex; justify-content: space-between; }
h1 { font-size: 25pt; line-height: 1.1; color: #0b5666; margin: 0 0 10pt; }
h2 { font-size: 17pt; line-height: 1.15; color: #0b5666; margin: 0 0 12pt; }
h3 { font-size: 11.5pt; color: #0b5666; margin: 12pt 0 6pt; }
p { margin: 0 0 7pt; orphans: 2; widows: 2; }
.list { padding-left: 9pt; margin-bottom: 5pt; }
strong { color: #123c4b; }
table { width: 100%; table-layout: auto; border-collapse: collapse; margin: 9pt 0; font-size: 8.5pt; line-height: 1.25; }
th { background: #0d5969; color: white; text-align: left; font-weight: bold; }
td, th { border: .5pt solid #cbdbe1; padding: 5pt 6pt; vertical-align: top; }
tr:nth-child(even) td { background: #f1f6f8; }
tr { break-inside: avoid; }
thead { display: table-header-group; }
code { font-family: Consolas, monospace; font-size: 8.3pt; overflow-wrap: anywhere; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 8pt/1.3 Consolas, monospace; background: #f1f6f8; border-left: 2pt solid #0c8088; padding: 8pt; margin: 8pt 0; }
@media screen { body { background: #e9eef1; } .page { background: white; width: 210mm; min-height: 297mm; padding: 13mm 14mm; margin: 8mm auto; box-shadow: 0 3px 15px #0002; } }
</style></head><body>${pages.map((blocks, i) => '<section class="page"><div class="running"><span>IP2LIVE · MIDTERM EXECUTION</span><span>' + (i + 1) + ' / ' + pages.length + '</span></div>' + blocks.map(htmlBlock).join('\n') + '</section>').join('\n')}</body></html>`;
fs.writeFileSync(path.join(dir, base + '.html'), html);

// A dependency-free Open XML document; all ZIP entries use standard stored compression.
const wx = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function runs(text, options = {}) {
  const chunks = text.split(/(\*\*.*?\*\*|`[^`]+`)/g).filter(Boolean);
  return chunks.map(t => {
    const bold = t.startsWith('**'), mono = t.startsWith('`');
    if (bold) t = t.slice(2, -2); else if (mono) t = t.slice(1, -1);
    let props = (bold || options.bold ? '<w:b/>' : '') + (mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : '');
    if (options.size) props += '<w:sz w:val="' + options.size + '"/><w:szCs w:val="' + options.size + '"/>';
    if (options.color) props += '<w:color w:val="' + options.color + '"/>';
    return '<w:r><w:rPr>' + props + '</w:rPr><w:t xml:space="preserve">' + esc(t) + '</w:t></w:r>';
  }).join('');
}
function para(text, style = 'Normal', extra = '', options = {}) {
  return '<w:p><w:pPr><w:pStyle w:val="' + style + '"/>' + extra + '</w:pPr>' + runs(text, options) + '</w:p>';
}
function widthsFor(b) {
  const n = b.rows[0].length;
  if (n === 5) return [850, 2100, 2100, 2100, 3156];
  if (n === 4) return [1900, 2750, 2750, 2906];
  if (n === 3) return [2400, 3350, 4556];
  return [3400, 6906];
}
function wordBlock(b) {
  if (b.type === 'table') {
    const widths = widthsFor(b);
    return '<w:tbl><w:tblPr><w:tblW w:w="10306" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>' + ['top','left','bottom','right','insideH','insideV'].map(side => '<w:' + side + ' w:val="single" w:sz="4" w:color="CBDbe1"/>').join('') + '</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + widths.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' + b.rows.map((row, i) => '<w:tr><w:trPr><w:cantSplit/>' + (i === 0 ? '<w:tblHeader/>' : '') + '</w:trPr>' + row.map((c, ci) => '<w:tc><w:tcPr><w:tcW w:w="' + widths[ci] + '" w:type="dxa"/><w:shd w:fill="' + (i === 0 ? '0D5969' : i % 2 === 0 ? 'F1F6F8' : 'FFFFFF') + '"/></w:tcPr>' + para(c, 'TableText', '', {bold:i === 0, color:i === 0 ? 'FFFFFF' : '172A38', size:17}) + '</w:tc>').join('') + '</w:tr>').join('') + '</w:tbl>' + para('', 'Normal');
  }
  if (b.type === 'code') return b.text.split('\n').map(line => para(line, 'Code')).join('');
  if (b.type === 'h1') return para(b.text, 'Title');
  if (b.type === 'h2') return para(b.text, 'Heading1');
  if (b.type === 'h3') return para(b.text, 'Heading2');
  if (b.type === 'bullet') return para('• ' + b.text, 'ListText');
  if (b.type === 'number') return para(b.text, 'ListText');
  return para(b.text);
}
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${wx}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="19"/><w:color w:val="172A38"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="110" w:line="260" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="180"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/><w:color w:val="0B5666"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="180"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0B5666"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/><w:color w:val="0B5666"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="30" w:line="235" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="17"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="220" w:lineRule="auto"/><w:shd w:fill="F1F6F8"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="16"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListText"><w:name w:val="List Text"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="120"/><w:spacing w:after="70"/></w:pPr></w:style></w:styles>`;
const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${wx}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>` + pages.map((blocks,i) => (i ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '') + blocks.map(wordBlock).join('')).join('') + '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="740" w:right="800" w:bottom="740" w:left="800" w:header="360" w:footer="360"/></w:sectPr></w:body></w:document>';
const entries = {
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml': doc,
  'word/styles.xml': styles,
  'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
  'word/header1.xml': '<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="' + wx + '">' + para('IP2LIVE  |  MIDTERM EXECUTION GUIDE', 'Normal', '<w:pBdr><w:bottom w:val="single" w:sz="10" w:color="0C8088"/></w:pBdr>', {size:16,color:'4C6978'}) + '</w:hdr>',
  'word/footer1.xml': '<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="' + wx + '"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="4C6978"/></w:rPr><w:t>15 October 2026  |  Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>'
};
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
function crc32(buf) { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const locals = [], centrals = []; let offset = 0;
for (const [name, value] of Object.entries(entries)) {
  const filename = Buffer.from(name), data = Buffer.from(value), crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt32LE(crc,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(filename.length,26);
  locals.push(local,filename,data);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50,0); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt32LE(crc,16); central.writeUInt32LE(data.length,20); central.writeUInt32LE(data.length,24); central.writeUInt16LE(filename.length,28); central.writeUInt32LE(offset,42); centrals.push(central,filename);
  offset += local.length + filename.length + data.length;
}
const centralData = Buffer.concat(centrals), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(Object.keys(entries).length,8); end.writeUInt16LE(Object.keys(entries).length,10); end.writeUInt32LE(centralData.length,12); end.writeUInt32LE(offset,16);
fs.writeFileSync(path.join(dir,base + '.docx'), Buffer.concat([...locals,centralData,end]));
console.log(JSON.stringify({sections:pages.length,html:base+'.html',docx:base+'.docx'}));
