// "Download PowerPoint": exports the tab on screen (with its filters) as a .pptx.
// Tables become real PowerPoint tables, bar lists become tables, charts and maps become pictures.
// Self-contained: writes the OOXML parts and a stored (uncompressed) zip itself; no libraries.
(function () {
  const EMU = 12700;                       // EMU per point
  const SW = 12192000, SH = 6858000;      // 16:9 slide
  const M = 457200;                        // 0.5" margin
  const C = { navy: '1F2A37', teal: '16514D', tealLt: '1F9E96', grey: '4A5563', muted: '6B7480', band: 'F4F6F8', line: 'D5DBE1', white: 'FFFFFF' };
  const FONT = 'Arial';
  const MAXROWS = 40;                      // longer lists stay in the dashboard (drill-downs have CSV export)

  // ---------- tiny zip (store) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = new TextEncoder();
  function zip(files) {   // files: [{name, data: Uint8Array}]
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), d = f.data, crc = crc32(d);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, d);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + d.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }

  // ---------- OOXML helpers ----------
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const XH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const esc = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').replace(/↗/g, '').trim();
  // drop the how-to-use-the-dashboard sentences ("Click a store to…")
  const noHow = (s) => clean(s).split(/(?<=\.)\s+/).filter((t) => !/\b(click|hover|tap)\b/i.test(t)).join(' ');
  const run = (t, { sz = 12, b = false, color = C.navy } = {}) => `<a:r><a:rPr lang="en-ZA" sz="${Math.round(sz * 100)}"${b ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${FONT}"/><a:cs typeface="${FONT}"/></a:rPr><a:t>${esc(t)}</a:t></a:r>`;
  const para = (runs, algn) => `<a:p>${algn ? `<a:pPr algn="${algn}"/>` : ''}${runs || ''}<a:endParaRPr lang="en-ZA" sz="1000"/></a:p>`;
  const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const xfrm = (x, y, w, h) => `<a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm>`;

  class Slide {
    constructor() { this.shapes = []; this.images = []; this.id = 2; }
    text(x, y, w, h, paras, { fill, line, inset = 45720, anchor = 't' } = {}) {
      const id = this.id++;
      this.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>'}${line ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>` : ''}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${inset}" tIns="${inset}" rIns="${inset}" bIns="${inset}" anchor="${anchor}" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras.join('')}</p:txBody></p:sp>`);
    }
    rect(x, y, w, h, fill) {
      const id = this.id++;
      this.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`);
    }
    picture(x, y, w, h, png) {
      const id = this.id++, rid = 'rId' + (this.images.length + 2);
      this.images.push(png);
      this.shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Chart ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
    }
    table(x, y, w, rows, { rowH = 280000, heights, sz = 9.5, widths, numeric } = {}) {
      const id = this.id++, n = rows[0].length;
      const ws = widths || Array(n).fill(1), tot = ws.reduce((s, v) => s + v, 0), cols = ws.map((v) => Math.round(w * v / tot));
      const cell = (t, ri, ci) => {
        const head = ri === 0, fill = head ? C.teal : ri % 2 === 0 ? C.band : C.white;
        const al = numeric && numeric[ci] ? 'r' : null;
        return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para(run(t, { sz, b: head, color: head ? C.white : C.navy }), al)}</a:txBody><a:tcPr marL="64008" marR="64008" marT="27432" marB="27432" anchor="ctr"><a:lnL><a:noFill/></a:lnL><a:lnR><a:noFill/></a:lnR><a:lnT w="6350"><a:solidFill><a:srgbClr val="${C.line}"/></a:solidFill></a:lnT><a:lnB w="6350"><a:solidFill><a:srgbClr val="${C.line}"/></a:solidFill></a:lnB><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:tcPr></a:tc>`;
      };
      const hs = heights || rows.map(() => rowH);
      const trs = rows.map((r, ri) => `<a:tr h="${hs[ri]}">${r.map((t, ci) => cell(t, ri, ci)).join('')}</a:tr>`).join('');
      this.shapes.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${hs.reduce((s, v) => s + v, 0)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${cols.map((c) => `<a:gridCol w="${c}"/>`).join('')}</a:tblGrid>${trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
    }
    xml() { return `${XH}<p:sld ${NS}><p:cSld><p:spTree>${grp}${this.shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`; }
    rels() {
      return `${XH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${this.images.map((im, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${im.name}"/>`).join('')}</Relationships>`;
    }
  }

  function buildPackage(slides, title) {
    const files = [], add = (name, s) => files.push({ name, data: typeof s === 'string' ? enc.encode(s) : s });
    let img = 0; for (const s of slides) for (const im of s.images) im.name = 'image' + (++img) + '.png';
    add('[Content_Types].xml', `${XH}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((s, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
    add('_rels/.rels', `${XH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    add('docProps/core.xml', `${XH}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>HQ stock dashboard</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`);
    add('docProps/app.xml', `${XH}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>HQ stock dashboard</Application><Slides>${slides.length}</Slides></Properties>`);
    add('ppt/presentation.xml', `${XH}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
    add('ppt/_rels/presentation.xml.rels', `${XH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>${slides.map((s, i) => `<Relationship Id="rId${i + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`);
    add('ppt/slideMasters/slideMaster1.xml', `${XH}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${grp}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
    add('ppt/slideMasters/_rels/slideMaster1.xml.rels', `${XH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
    add('ppt/slideLayouts/slideLayout1.xml', `${XH}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `${XH}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
    const sf = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    add('ppt/theme/theme1.xml', `${XH}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="HQ"><a:themeElements><a:clrScheme name="HQ"><a:dk1><a:srgbClr val="${C.navy}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${C.teal}"/></a:dk2><a:lt2><a:srgbClr val="${C.band}"/></a:lt2><a:accent1><a:srgbClr val="1F9E96"/></a:accent1><a:accent2><a:srgbClr val="7D63C9"/></a:accent2><a:accent3><a:srgbClr val="F2A93B"/></a:accent3><a:accent4><a:srgbClr val="3EACFF"/></a:accent4><a:accent5><a:srgbClr val="E47297"/></a:accent5><a:accent6><a:srgbClr val="8BBF4A"/></a:accent6><a:hlink><a:srgbClr val="1F9E96"/></a:hlink><a:folHlink><a:srgbClr val="7D63C9"/></a:folHlink></a:clrScheme><a:fontScheme name="HQ"><a:majorFont><a:latin typeface="${FONT}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${FONT}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="HQ"><a:fillStyleLst>${sf}${sf}${sf}</a:fillStyleLst><a:lnStyleLst><a:ln w="6350">${sf}</a:ln><a:ln w="12700">${sf}</a:ln><a:ln w="19050">${sf}</a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${sf}${sf}${sf}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);
    slides.forEach((s, i) => { add(`ppt/slides/slide${i + 1}.xml`, s.xml()); add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, s.rels()); for (const im of s.images) add('ppt/media/' + im.name, im.bytes); });
    return zip(files);
  }

  // ---------- reading the dashboard ----------
  async function svgToPng(svg) {
    // draw at the chart's own viewBox size (not its on-screen size), so a narrow window still gives a sharp picture
    const vb = svg.viewBox && svg.viewBox.baseVal, r = svg.getBoundingClientRect();
    const w = Math.max(10, Math.round(vb && vb.width ? vb.width : r.width)), h = Math.max(10, Math.round(vb && vb.height ? vb.height : r.height));
    const clone = svg.cloneNode(true), src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
    const P = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'fill-opacity', 'opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity', 'display', 'visibility'];
    src.forEach((el, i) => { if (!dst[i]) return; const cs = getComputedStyle(el); dst[i].setAttribute('style', P.map((p) => p + ':' + cs.getPropertyValue(p)).join(';')); });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', w); clone.setAttribute('height', h);
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)); });
    const k = Math.min(4, Math.max(2, 1800 / w)), cv = document.createElement('canvas'); cv.width = w * k; cv.height = h * k;
    const g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); g.scale(k, k); g.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
  }
  const visible = (el) => !!(el && el.offsetParent !== null && !el.closest('[hidden]'));
  function tableRows(t) {
    const head = [...t.querySelectorAll('thead tr')].pop() || t.querySelector('tr');
    const hdr = head ? [...head.children].map((c) => clean(c.textContent)) : [];
    const body = [...t.querySelectorAll('tbody tr')].filter((tr) => !tr.querySelector('.fm-empty')).map((tr) => [...tr.children].map((c) => clean(c.innerText || c.textContent)));
    const n = Math.max(hdr.length, ...body.map((r) => r.length), 1);
    const pad = (r) => { const a = r.slice(0, n); while (a.length < n) a.push(''); return a; };
    return { hdr: pad(hdr), body: body.map(pad) };
  }
  const numericCols = (rows) => rows[0].map((_, ci) => { const vals = rows.slice(1).map((r) => r[ci]).filter(Boolean); return vals.length > 0 && vals.filter((v) => /^[−+\-]?R?\s?[\d.,]+[km%]?(\s|$)/.test(v) || v === '—').length >= vals.length * 0.7; });
  function blocksOf(card) {
    const out = [];
    for (const el of card.querySelectorAll('.fm-stat, .fm-kpis, .fm-chart > svg, .fm-map > svg, .fm-cal > svg, table, .fm-bars, .fm-abc, .fm-map2 .huge')) {
      if (!visible(el)) continue;
      if (el.matches('.fm-stat, .fm-kpis')) {
        const items = [...el.children].map((d) => ({ v: clean((d.querySelector('b') || {}).textContent), l: clean([...d.querySelectorAll('span, em')].map((x) => x.textContent).join(' · ')) })).filter((x) => x.v || x.l);
        if (items.length) out.push({ kind: 'kpi', items });
      } else if (el.matches('.huge')) out.push({ kind: 'kpi', items: [{ v: clean(el.textContent), l: noHow((el.nextElementSibling || {}).textContent) }] });
      else if (el.tagName === 'svg' || el.tagName === 'SVG') out.push({ kind: 'svg', el });
      else if (el.tagName === 'TABLE') { const t = tableRows(el); if (t.body.length) out.push({ kind: 'table', ...t }); }
      else if (el.matches('.fm-bars')) {
        const rows = [...el.querySelectorAll('.fm-bar')].map((b) => [clean((b.querySelector('.l') || {}).textContent), clean((b.querySelector('.v') || {}).textContent)]);
        if (rows.length) out.push({ kind: 'table', hdr: ['Item', 'Value'], body: rows, widths: [3, 4] });
      } else if (el.matches('.fm-abc')) {
        const btns = [...el.querySelectorAll('button')].map((b) => clean(b.innerText));
        const rows = []; for (let i = 0; i < 9 && i < btns.length; i += 3) rows.push([['A', 'B', 'C'][i / 3], btns[i] || '', btns[i + 1] || '', btns[i + 2] || '']);
        if (btns[9]) rows.push(['No sales', btns[9], '', '']);
        out.push({ kind: 'table', hdr: ['', 'X · steady', 'Y · variable', 'Z · erratic'], body: rows, widths: [1, 4, 4, 4], rowH: 520000 });
      }
    }
    return out;
  }

  // ---------- composing the deck ----------
  const tabLabel = (t) => clean((document.querySelector(`.fm-tabs button[data-tab="${t}"]`) || {}).textContent) || t;
  const chipText = (sel) => [...document.querySelectorAll(sel + ' .fm-chip')].map((c) => clean(c.textContent).replace(/ ×$/, ''));
  // wait for a tab to draw; a plain timer, because animation frames stop while the browser tab is in the background
  const settle = () => new Promise((ok) => setTimeout(ok, 800));

  // all = every tab except Courier costs, in sidebar order (with contents and section slides); otherwise the tab on screen
  async function build({ all = false, progress } = {}) {
    const F = window.fm || {}, ui = F.ui || {}, start = ui.tab || 'overview';
    // the full report leaves out Courier costs; that tab can still be exported on its own with "This tab only"
    const tabs = all ? [...document.querySelectorAll('.fm-tabs button[data-tab]')].map((b) => b.dataset.tab).filter((t) => t !== 'courier') : [start];
    const maxRows = all ? 16 : MAXROWS;      // the full report keeps each table to one slide
    const reportName = all ? 'Full report' : tabLabel(start);
    const fresh = clean((document.getElementById('fresh') || {}).textContent);
    const filters = [...chipText('#chips'), ...(start === 'courier' && !all ? chipText('#cr-chips') : [])].join(' · ') || 'No filters';
    const take = clean((document.getElementById('takeaway') || {}).textContent);
    const stamp = new Date().toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
    // the From/To dates on the dashboard, e.g. "26–30 Oct 2026" or "1 Jan – 30 Oct 2026"
    const period = (() => {
      const [a, b] = ['f-from', 'f-to'].map((id) => { const v = (document.getElementById(id) || {}).value; return v ? new Date(v + 'T00:00') : null; });
      if (!a || !b || isNaN(a) || isNaN(b)) return '';
      const d = (x, o) => x.toLocaleDateString('en-GB', o);
      if (a.getFullYear() !== b.getFullYear()) return d(a, { day: 'numeric', month: 'short', year: 'numeric' }) + ' – ' + d(b, { day: 'numeric', month: 'short', year: 'numeric' });
      if (a.getMonth() !== b.getMonth()) return d(a, { day: 'numeric', month: 'short' }) + ' – ' + d(b, { day: 'numeric', month: 'short', year: 'numeric' });
      return (a.getDate() === b.getDate() ? '' : a.getDate() + '–') + d(b, { day: 'numeric', month: 'short', year: 'numeric' });
    })();
    const slides = [];
    let cur = reportName;
    const frame = (s, eyebrow, title, note) => {
      s.rect(0, 0, SW, 91440, C.teal);
      s.text(M, 230000, SW - 2 * M, 300000, [para(run(eyebrow.toUpperCase(), { sz: 10, b: true, color: '1A6F69' }))]);
      s.text(M, 500000, SW - 2 * M, 520000, [para(run(title, { sz: 22, b: true }))]);
      let y = 1030000;
      if (note) { s.text(M, y, SW - 2 * M, 420000, [para(run(note, { sz: 10.5, color: C.grey }))]); y += 440000; }
      const foot = 'HQ Stock Movements · ' + (all && cur !== reportName ? 'Full report · ' + cur : cur) + (period ? ' · ' + period : '') + ' · exported ' + stamp;
      s.text(M, SH - 420000, SW - 2 * M - 900000, 280000, [para(run(foot, { sz: 8.5, color: C.muted }))]);
      s.text(SW - M - 900000, SH - 420000, 900000, 280000, [para(run(String(slides.length + 1), { sz: 8.5, color: C.muted }), 'r')]);
      return y;
    };
    // title slide
    {
      const s = new Slide();
      s.rect(0, 0, 640080, SH, C.teal); s.rect(640080, 0, 91440, SH, '59C4BC');
      s.text(1100000, 1500000, SW - 1600000, 380000, [para(run('SOFIA AND SPIRITZ · HQ DISTRIBUTION CENTRE', { sz: 12, b: true, color: '1A6F69' }))]);
      s.text(1100000, 1950000, SW - 1600000, 1100000, [para(run('HQ Stock Movements', { sz: 40, b: true })), para(run(all ? 'Full report · every tab except Courier costs' : reportName, { sz: 26, color: C.grey }))]);
      s.text(1100000, 3400000, SW - 1600000, 1800000, [para(run(fresh, { sz: 13 })), para(run('Filters: ' + filters, { sz: 13, color: C.grey })), para(run('Exported ' + stamp + ' from the HQ stock dashboard', { sz: 11, color: C.muted }))]);
      if (take && (all || (start !== 'courier' && start !== 'peak'))) s.text(1100000, 5200000, SW - 1600000, 900000, [para(run(take, { sz: 12, color: C.navy }))], { fill: C.band, inset: 91440 });
      slides.push(s);
    }
    // contents (filled in once the section page numbers are known)
    const contents = all ? new Slide() : null, sections = [];
    if (contents) { frame(contents, 'Contents', 'What this report covers', 'One section per dashboard tab, using the dates and filters on the title slide. Long lists show their top rows; the full lists are in the dashboard.'); slides.push(contents); }
    // headline figures (tiles and today strip), once
    if (all && start !== 'overview') { document.querySelector('.fm-tabs button[data-tab="overview"]').click(); await settle(); }
    const tiles = [...document.querySelectorAll('#today button, #tiles .fm-tile')].filter(visible);
    if (tiles.length) {
      const s = new Slide(), y0 = frame(s, 'Headline figures', 'Where things stand', 'Figures for the dates and filters on the dashboard; the first row is what needs attention today.');
      const cols = 5, gw = (SW - 2 * M - (cols - 1) * 120000) / cols, gh = 1150000;
      tiles.slice(0, 15).forEach((t, i) => {
        const r = Math.floor(i / cols), c = i % cols, x = M + c * (gw + 120000), y = y0 + 80000 + r * (gh + 120000);
        const lab = clean((t.querySelector('.lab') || {}).textContent), big = clean((t.querySelector('.big, b') || {}).textContent), sub = clean((t.querySelector('.sub') || {}).textContent);
        s.text(x, y, gw, gh, [para(run(lab, { sz: 9.5, b: true, color: C.grey })), para(run(big, { sz: 20, color: t.classList.contains('bad') || (t.querySelector('.big') || {}).className?.includes('fm-bad') ? 'B0283F' : C.navy })), para(run(sub, { sz: 8.5, color: C.muted }))], { fill: 'F7F9FA', line: C.line, inset: 91440 });
      });
      slides.push(s);
    }
    try {
      for (const [ti, tab] of tabs.entries()) {
        cur = tabLabel(tab);
        if (progress) progress(ti + 1, tabs.length, cur);
        if (all) { document.querySelector(`.fm-tabs button[data-tab="${tab}"]`).click(); await settle(); }
        // section divider
        if (all) {
          const s = new Slide(), num = String(ti + 1).padStart(2, '0');
          s.rect(0, 0, SW, SH, C.teal); s.rect(0, SH - 91440, SW, 91440, '59C4BC');
          s.text(M * 2, 2300000, SW - 4 * M, 600000, [para(run('SECTION ' + num, { sz: 14, b: true, color: '9FDCD7' }))]);
          s.text(M * 2, 2800000, SW - 4 * M, 900000, [para(run(cur, { sz: 40, b: true, color: C.white }))]);
          const cr = tab === 'courier' ? chipText('#cr-chips').join(' · ') : '';
          if (cr) s.text(M * 2, 3800000, SW - 4 * M, 500000, [para(run('Courier filters: ' + cr, { sz: 13, color: 'D9EFEC' }))]);
          s.text(SW - M - 900000, SH - 420000, 900000, 280000, [para(run(String(slides.length + 1), { sz: 8.5, color: '9FDCD7' }), 'r')]);
          sections.push({ num, name: cur, page: slides.length + 1, from: slides.length });
          slides.push(s);
        }
        // one or more slides per card on the tab
        const page = document.querySelector('[data-page]:not([hidden])');
        const cards = page ? [...page.querySelectorAll('.fm-card')].filter((c) => visible(c) && !c.querySelector('.fm-card')) : [];
        let n = 0, carry = [];   // a card with only KPI tiles goes on top of the next card's slide
        for (const card of cards) {
          const title = clean((card.querySelector('h2') || {}).textContent); if (!title && !card.querySelector('table, svg')) continue;
          // the card's note, minus the how-to-use-the-dashboard sentences
          const note = noHow((card.querySelector('.fm-note') || {}).textContent).slice(0, 400);
          const order = { kpi: 0, svg: 1, table: 2 };
          const own = blocksOf(card); if (!own.length) continue;
          if (own.every((b) => b.kind === 'kpi') && card !== cards[cards.length - 1]) { carry.push(...own); continue; }
          const blocks = [...carry, ...own].sort((a, b) => order[a.kind] - order[b.kind]); carry = [];
          n++;
          const eyebrow = (all ? sections[sections.length - 1].num + '.' + n : String(n).padStart(2, '0')) + ' · ' + cur;
          let s = new Slide(), y = frame(s, eyebrow, title || cur, note);
          const BOTTOM = SH - 560000, W = SW - 2 * M;
          const next = () => { slides.push(s); s = new Slide(); y = frame(s, eyebrow, (title || cur) + ' (continued)', null); };
          // one chart and one short table: chart on the left, table on the right
          const svgs = blocks.filter((b) => b.kind === 'svg'), tbls = blocks.filter((b) => b.kind === 'table');
          if (svgs.length === 1 && tbls.length >= 1 && tbls[0].body.length <= 14 && tbls[0].hdr.length <= 4) {
            const k = blocks.filter((b) => b.kind === 'kpi'), side = tbls.shift();
            let png = null; try { png = await svgToPng(svgs[0].el); } catch (e) { console.error(e); }
            if (png) blocks.splice(0, blocks.length, ...k, { kind: 'pair', png, t: side }, ...tbls);
          }
          for (const b of blocks) {
            if (b.kind === 'pair') {
              const gap = 300000, lw = W * 0.56, rw = W - lw - gap, avail = BOTTOM - y;
              let w = lw, h = w * b.png.h / b.png.w; if (h > avail) { h = avail; w = h * b.png.w / b.png.h; }
              s.picture(M + (lw - w) / 2, y, w, h, b.png);
              const rowH = Math.min(300000, Math.floor(avail / (b.t.body.length + 1)));
              s.table(M + lw + gap, y, rw, [b.t.hdr, ...b.t.body], { rowH, widths: b.t.widths || b.t.hdr.map((_, ci) => ci === 0 ? 3 : 2), numeric: numericCols([b.t.hdr, ...b.t.body]), sz: 9 });
              y += Math.max(h, rowH * (b.t.body.length + 1)) + 120000;
            } else if (b.kind === 'kpi') {
              const items = b.items.slice(0, 6), gw = (W - (items.length - 1) * 100000) / items.length, h = 720000;
              if (y + h > BOTTOM) next();
              items.forEach((it, i) => s.text(M + i * (gw + 100000), y, gw, h, [para(run(it.v, { sz: 18 })), para(run(it.l, { sz: 8.5, color: C.muted }))], { fill: 'F7F9FA', line: C.line, inset: 73152 }));
              y += h + 120000;
            } else if (b.kind === 'svg') {
              let png = null; try { png = await svgToPng(b.el); } catch (e) { console.error(e); }
              if (!png) { s.text(M, y, W, 300000, [para(run('This chart could not be exported; see the dashboard.', { sz: 10, color: C.muted }))]); y += 320000; continue; }
              let avail = BOTTOM - y; if (avail < 1800000) { next(); avail = BOTTOM - y; }
              let w = W, h = w * png.h / png.w; if (h > avail) { h = avail; w = h * png.w / png.h; }
              s.picture(M + (W - w) / 2, y, w, h, png); y += h + 120000;
            } else if (b.kind === 'table') {
              const rowH = b.rowH || 280000, numeric = numericCols([b.hdr, ...b.body]), sz = b.hdr.length > 8 ? 8.5 : 9.5;
              let rows = b.body.slice(0, maxRows);
              // column widths in EMU: numbers and short codes get what they need so they never wrap, long text shares the rest
              const cw = sz * 0.56 * 12700, pad = 150000, lineH = sz * 1.2 * 12700;
              const need = b.hdr.map((h, ci) => Math.max(...[b.hdr, ...rows].map((r) => String(r[ci] || '').length)) * cw + pad);
              const total = need.reduce((s, v) => s + v, 0);
              let widths;
              if (b.widths) { const t = b.widths.reduce((s, v) => s + v, 0); widths = b.widths.map((v) => W * v / t); }
              else {
                const fixed = need.map((n, ci) => numeric[ci] || n <= 14 * cw + pad), fixedSum = need.reduce((s, n, ci) => s + (fixed[ci] ? n : 0), 0);
                if (total <= W || fixedSum > W * 0.75) widths = need.map((n) => n * W / total);
                else {
                  // shorter text columns get their full width first; the longest ones share what's left and wrap
                  widths = need.map((n, ci) => fixed[ci] ? n : 0);
                  let open = need.map((n, ci) => fixed[ci] ? -1 : ci).filter((ci) => ci >= 0), rest = W - fixedSum;
                  for (let done = false; !done && open.length;) {
                    const share = rest / open.length; done = true;
                    for (const ci of open) if (need[ci] <= share) { widths[ci] = need[ci]; rest -= need[ci]; done = false; }
                    open = open.filter((ci) => !widths[ci]);
                    if (done) open.forEach((ci) => { widths[ci] = share; });
                  }
                }
              }
              // row heights allow for wrapped lines, so the table can't run past the bottom of the slide
              const hOf = (r) => { const lines = Math.max(1, ...r.map((t, ci) => Math.ceil(String(t || '').length * cw * 1.1 / Math.max(1, widths[ci] - pad)))); return Math.round(Math.max(rowH, lines * lineH + 70000)); };
              const hh = hOf(b.hdr);
              const fits = () => { let h = y + hh, k = 0; while (k < rows.length && h + hOf(rows[k]) <= BOTTOM) h += hOf(rows[k++]); return k; };
              while (rows.length) {
                let fit = fits();
                if (fit < Math.min(3, rows.length)) { next(); fit = Math.max(1, fits()); }
                const chunk = rows.slice(0, fit), heights = [hh, ...chunk.map(hOf)]; rows = rows.slice(fit);
                s.table(M, y, W, [b.hdr, ...chunk], { heights, widths, numeric, sz });
                y += heights.reduce((s, v) => s + v, 0) + 120000;
                if (rows.length) next();
              }
              // the "first N rows" note goes in the footer line, where a tall table can't run into it
              if (b.body.length > maxRows) s.text(SW / 2 - 600000, SH - 420000, SW / 2 - M - 300000, 280000, [para(run('Table shows the first ' + maxRows + ' of ' + b.body.length + ' rows; the full list is in the dashboard.', { sz: 8.5, color: C.muted }), 'r')]);
            }
          }
          slides.push(s);
        }
        if (all) sections[sections.length - 1].count = slides.length - sections[sections.length - 1].from - 1;
      }
    } finally {
      // put the dashboard back on the tab the viewer was looking at
      if (all) { document.querySelector(`.fm-tabs button[data-tab="${start}"]`).click(); }
    }
    if (contents) {
      const rows = sections.map((x) => [x.num, x.name, String(x.page), String(x.count)]);
      contents.table(M, 1600000, SW - 2 * M, [['Section', 'Tab', 'Starts on slide', 'Slides'], ...rows], { rowH: 340000, widths: [2, 8, 3, 2], numeric: [false, false, true, true], sz: 11 });
    }
    if (slides.length === (all ? 2 : 1)) { const s = new Slide(); frame(s, cur, 'Nothing to export', 'This tab has no figures for the current filters.'); slides.push(s); }
    return { blob: buildPackage(slides, 'HQ Stock Movements – ' + reportName), name: 'HQ dashboard - ' + reportName.replace(/[^\w &-]+/g, '') + ' - ' + new Date().toISOString().slice(0, 10) + '.pptx', count: slides.length };
  }

  async function save(blob, filename) {
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    if (dl) { await dl.save({ filename, data: blob }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  // "Download PowerPoint" = every tab except Courier costs; "This tab only" = the tab on screen
  function addButton() {
    if (document.getElementById('dl-pptx')) return;
    const reset = document.getElementById('reset'); if (!reset) return;
    const mk = (id, cls, text, title) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = cls; b.textContent = text; b.title = title; return b; };
    const allBtn = mk('dl-pptx', 'fm-drillbtn fm-pptbtn', 'Download PowerPoint', 'Download every tab except Courier costs, with the current filters, as one PowerPoint report');
    const oneBtn = mk('dl-pptx-tab', 'fm-reset', 'This tab only', 'Download just the tab on screen as a PowerPoint deck');
    const go = async (all) => {
      if (allBtn.disabled) return;
      allBtn.disabled = oneBtn.disabled = true; const label = allBtn.textContent; allBtn.textContent = 'Building…';
      try {
        const r = await build({ all, progress: (i, n, name) => { allBtn.textContent = all ? 'Building ' + i + '/' + n + ' · ' + name + '…' : 'Building…'; } });
        allBtn.textContent = 'Saving ' + r.count + ' slides…'; await save(r.blob, r.name);
      } catch (e) { console.error(e); if (!e || e.code !== 'declined') alert('The PowerPoint could not be created: ' + ((e && (e.message || e.code)) || e)); }
      finally { allBtn.disabled = oneBtn.disabled = false; allBtn.textContent = label; }
    };
    allBtn.addEventListener('click', () => go(true));
    oneBtn.addEventListener('click', () => go(false));
    reset.before(allBtn, oneBtn);
  }
  window.fmHooks = (window.fmHooks || []).concat([function pptxButton() { addButton(); }]);
  window.fmPptx = { build };
  addButton();
})();
