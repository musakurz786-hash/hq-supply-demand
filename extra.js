// HQ dashboard extras: the drill-down drawer and the newer reports (stock age, ABC–XYZ, count accuracy,
// Aramex invoice check, peak forecast, courier cost per online order).
// Each dashboard script runs in its own scope, so this one reads helpers from window.fm and registers a renderer in window.fmHooks.
(function () {
  const F = window.fm;
  if (!F) return;
  const { el, td, setRows, clickRow, stat, bars, P, ui, PAL, RED, REASON, fmtInt, fmtR, fmtRS, fmtRC, pct, dayDate, fmtDay, monday } = F;
  const fmtR2 = (n) => 'R ' + d3.format(',.2f')(n);
  const pct1 = d3.format('.1%');
  const fmtFull = (d) => d3.utcFormat('%-d %b %Y')(dayDate(d));
  const OUTS = new Set(['TRs-', 'TRn-', 'TRp-', 'SO-']);
  const X = () => F.ctx;
  const TYPE = {
    'PO+': 'Received on PO', 'SO-': 'Sales order shipped', 'SO+': 'Customer return', 'ST+': 'Adjusted up', 'ST-': 'Adjusted down', 'FG+': 'Assembled', 'FG-': 'Used in assembly',
    'TRs-': 'Sent to store', 'TRn-': 'Sent to 3PL, production or other', 'TRp-': 'Sent, still in transit', 'TRs+': 'Returned from store', 'TRn+': 'In from 3PL, production or other', 'TR0+': 'IBT in (sent before 2026)',
  };
  const typeLabel = (t) => (TYPE[t] || (TYPE[t.replace(/c$/, '')] ? TYPE[t.replace(/c$/, '')] + ' (value only)' : t));

  // ---------- drill-down drawer ----------
  let host = null, stack = [];
  function ensureHost() {
    if (host && host.isConnected) return host;
    host = el('div', 'fm-drill'); host.hidden = true;
    (document.querySelector('.fm') || document.body).append(host);
    return host;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && host && !host.hidden) closeDrill(); });
  function closeDrill() { stack = []; if (host) { host.hidden = true; host.replaceChildren(); } }
  // spec: { title, sub, kpis: [[value, label]], cols: [{ k, label, n, f, sum, wrap, v }], rows, sort: { k, dir }, onRow(row) -> spec, note }
  function openDrill(spec) { stack = [spec]; render(); }
  const cellVal = (r, c) => (typeof c.v === 'function' ? c.v(r) : r[c.k]);
  function render() {
    const h = ensureHost(), spec = stack[stack.length - 1];
    spec.state = spec.state || { q: '', sort: spec.sort || null };
    const bk = el('div', 'bk'); bk.addEventListener('click', closeDrill);
    const pn = el('div', 'pn'); pn.setAttribute('role', 'dialog'); pn.setAttribute('aria-modal', 'true'); pn.setAttribute('aria-label', spec.title);
    const hd = el('header');
    if (stack.length > 1) {
      const cr = el('div', 'crumb');
      stack.forEach((s, i) => {
        if (i === stack.length - 1) { cr.append(el('span', null, s.title)); return; }
        const b = el('button', null, s.title); b.type = 'button'; b.addEventListener('click', () => { stack = stack.slice(0, i + 1); render(); });
        cr.append(b, el('span', null, '›'));
      });
      hd.append(cr);
    }
    hd.append(el('h3', null, spec.title));
    if (spec.sub) hd.append(el('p', 'sub', spec.sub));
    const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', closeDrill); hd.append(x);
    const tools = el('div', 'tools');
    const q = el('input'); q.type = 'search'; q.placeholder = 'Search these rows'; q.value = spec.state.q; q.setAttribute('aria-label', 'Search these rows');
    const cnt = el('span', 'cnt'), csv = el('button', null, 'Download CSV'); csv.type = 'button';
    tools.append(q, cnt, csv);
    const body = el('div', 'body');
    if (spec.kpis && spec.kpis.length) {
      const kp = el('div', 'kp');
      kp.append(...spec.kpis.map(([v, l]) => { const d = el('div'); d.append(el('b', null, v), el('span', null, l)); return d; }));
      body.append(kp);
    }
    const tbl = el('table'), thead = el('thead'), tbody = el('tbody'), tfoot = el('tfoot'); tbl.append(thead, tbody, tfoot); body.append(tbl);
    const ft = el('footer', null, spec.note || (spec.onRow ? 'Click a row to drill further. Esc closes.' : 'Esc closes.'));
    const shown = () => {
      const ql = spec.state.q.trim().toLowerCase();
      const rs = ql ? spec.rows.filter((r) => spec.cols.some((c) => String(cellVal(r, c) ?? '').toLowerCase().includes(ql))) : spec.rows.slice();
      const s = spec.state.sort;
      if (s) {
        const c = spec.cols.find((cc) => cc.k === s.k);
        if (c) rs.sort((a, b) => { const p = cellVal(a, c), q2 = cellVal(b, c); return (typeof p === 'number' && typeof q2 === 'number' ? p - q2 : String(p ?? '').localeCompare(String(q2 ?? ''))) * s.dir; });
      }
      return rs;
    };
    const fmtCell = (c, v, r) => (c.f ? c.f(v, r) : v == null || v === '' ? '—' : typeof v === 'number' ? fmtInt(v) : String(v));
    const fill = () => {
      const rs = shown(), CAPD = 1000, s = spec.state.sort;
      const htr = el('tr');
      for (const c of spec.cols) {
        const th = el('th', c.n ? 'n' : null), b = el('button', null, c.label);
        b.addEventListener('click', () => { spec.state.sort = { k: c.k, dir: s && s.k === c.k ? -s.dir : c.n ? -1 : 1 }; fill(); });
        th.append(b);
        if (s && s.k === c.k) { th.classList.add('on'); if (s.dir > 0) th.classList.add('up'); }
        htr.append(th);
      }
      thead.replaceChildren(htr);
      if (!rs.length) { const tr = el('tr'), c = td('Nothing to show.', 'fm-empty'); c.colSpan = spec.cols.length; tr.append(c); tbody.replaceChildren(tr); }
      else tbody.replaceChildren(...rs.slice(0, CAPD).map((r) => {
        const tr = el('tr');
        for (const c of spec.cols) tr.append(td(fmtCell(c, cellVal(r, c), r), [c.n ? 'n' : '', c.wrap ? 'wrap' : '', c.mono ? 'fm-mono' : ''].filter(Boolean).join(' ') || null));
        if (spec.onRow) clickRow(tr, () => { const nx = spec.onRow(r); if (nx) { stack.push(nx); render(); } });
        return tr;
      }));
      if (spec.cols.some((c) => c.sum) && rs.length) {
        const tr = el('tr');
        spec.cols.forEach((c, i) => tr.append(td(i === 0 ? 'Total' : c.sum ? fmtCell(c, d3.sum(rs, (r) => cellVal(r, c)), null) : '', c.n ? 'n' : null)));
        tfoot.replaceChildren(tr);
      } else tfoot.replaceChildren();
      cnt.textContent = fmtInt(rs.length) + (rs.length === spec.rows.length ? ' rows' : ' of ' + fmtInt(spec.rows.length) + ' rows') + (rs.length > CAPD ? ' · showing the first ' + fmtInt(CAPD) : '');
    };
    q.addEventListener('input', () => { spec.state.q = q.value; fill(); });
    csv.addEventListener('click', () => downloadCsv(spec, shown()));
    fill();
    pn.append(hd, tools, body, ft);
    h.replaceChildren(bk, pn); h.hidden = false;
    x.focus();
  }
  function downloadCsv(spec, rows) {
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const out = [spec.cols.map((c) => esc(c.label)).join(',')].concat(rows.map((r) => spec.cols.map((c) => {
      const v = cellVal(r, c); return esc(typeof v === 'number' ? Math.round(v * 100) / 100 : c.csv ? c.csv(v, r) : v);
    }).join(',')));
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      a.download = (spec.title || 'export').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.csv';
      document.body.append(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) { console.error(e); }
  }

  // ---------- drill builders ----------
  const range = () => fmtDay(X().rg.from) + ' – ' + fmtDay(X().rg.to);
  const filt = () => { const p = P(), parts = []; for (const k of ['divs', 'deps', 'stys', 'seas']) if (p[k].length) parts.push(p[k].join(', ')); return parts.length ? ' · ' + parts.join(' · ') : ''; };
  const skuInfo = (s) => ({ s: s.i, sku: s.sku, p: s.p, dep: s.dep, sty: s.sty, sea: s.sea, size: s.size, oh: s.oh, val: s.val, av: s.av, oo: s.oo, vel: F.velOf(s), lpo: s.lpo, ldis: s.ldis });
  const C_SKU = [{ k: 'sku', label: 'SKU', mono: true }, { k: 'p', label: 'Product', wrap: true }, { k: 'dep', label: 'Department' }, { k: 'sea', label: 'Season' }];
  const C_OH = { k: 'oh', label: 'On hand now', n: true, f: (v) => (v == null ? '—' : fmtInt(v)) };
  const dayOrNever = (none) => (v, r) => (r == null ? '' : v >= 0 ? fmtDay(v) : none);

  function skuCard(si) {
    const x = X(), s = x.skus[si];
    const rows = x.D.moves.data.filter((r) => r.s === si).map((r) => { const sg = r.t.includes('-') ? -1 : 1; return { d: r.d, t: typeLabel(r.t), u: sg * r.u, c: sg * r.c }; });
    return {
      title: s.sku, sub: [s.p, s.dep, s.sea, s.size ? 'size ' + s.size : ''].filter(Boolean).join(' · '),
      kpis: [[fmtInt(s.oh || 0), 'on hand'], [fmtInt(s.av || 0), 'available'], [fmtInt(s.oo || 0), 'on order'], [s.uc ? fmtR2(s.uc) : '—', 'unit cost'],
        [s.lpo >= 0 ? fmtDay(s.lpo) : 'Before 2026', 'last PO receipt'], [s.ldis >= 0 ? fmtDay(s.ldis) : 'Never', 'last dispatch'], [F.velOf(s) || '—', 'movement'],
        ...(() => { const ss = dash.data('store_stock'); if (ss.status !== 'ok') return []; const sset = storeNames(x), here = ss.data.filter((r) => r.s === si && r.q > 0 && sset.has(r.l));
          return [[fmtInt(d3.sum(here, (r) => r.q)), 'in stores now (' + here.length + ' stores)']]; })()],
      cols: [{ k: 'd', label: 'Date', f: dayOrNever('') }, { k: 't', label: 'Movement' }, { k: 'u', label: 'Units', n: true, sum: true, f: (v) => F.fmtSigned(v) }, { k: 'c', label: 'Value at cost', n: true, sum: true, f: (v) => fmtRS(v) }],
      rows, sort: { k: 'd', dir: -1 }, note: 'Every 2026 movement of this SKU at HQ.',
    };
  }
  const toSku = (r) => skuCard(r.s);

  // SKUs behind movements that pass a test (date and product filters applied)
  function movesDrill(title, test, extraKpi) {
    const x = X(), m = new Map();
    for (const r of x.D.moves.data) {
      if (!x.skuOk[r.s] || !x.inR(r.d) || !test(r)) continue;
      let o = m.get(r.s); if (!o) { o = { u: 0, c: 0, days: new Set() }; m.set(r.s, o); }
      o.u += r.u; o.c += r.c; o.days.add(r.d);
    }
    const rows = [...m].map(([s, o]) => ({ ...skuInfo(x.skus[s]), u: o.u, c: o.c, nd: o.days.size }));
    return {
      title, sub: range() + filt(), kpis: [[fmtInt(rows.length), 'SKUs'], [fmtInt(d3.sum(rows, (r) => r.u)), 'units'], [fmtRC(d3.sum(rows, (r) => r.c)), 'at cost'], ...(extraKpi || [])],
      cols: [...C_SKU, { k: 'u', label: 'Units', n: true, sum: true }, { k: 'c', label: 'Value at cost', n: true, sum: true, f: (v) => fmtR(v) }, { k: 'nd', label: 'Days', n: true }, C_OH],
      rows, sort: { k: 'u', dir: -1 }, onRow: toSku,
    };
  }
  // stock on hand list
  function stockList(title, list, sub) {
    const rows = list.map((s) => skuInfo(s));
    return {
      title, sub: sub || 'Stock on hand now' + filt(), kpis: [[fmtInt(rows.length), 'SKUs'], [fmtInt(d3.sum(rows, (r) => r.oh || 0)), 'units'], [fmtRC(d3.sum(rows, (r) => Math.max(0, r.val || 0))), 'at cost']],
      cols: [...C_SKU, { k: 'oh', label: 'On hand', n: true, sum: true }, { k: 'val', label: 'Value', n: true, sum: true, f: (v) => fmtR(v || 0) }, { k: 'av', label: 'Available', n: true, f: (v) => fmtInt(v || 0) },
        { k: 'oo', label: 'On order', n: true, f: (v) => (v ? fmtInt(v) : '—') }, { k: 'lpo', label: 'Last receipt', f: dayOrNever('Before 2026') }, { k: 'ldis', label: 'Last dispatch', f: dayOrNever('Never') }, { k: 'vel', label: 'Movement' }],
      rows, sort: { k: 'val', dir: -1 }, onRow: toSku,
    };
  }
  const stockWhere = (title, test) => { const x = X(); return stockList(title, x.skus.filter((s, i) => x.skuOk[i] && (s.oh || 0) > 0 && test(s))); };
  // adjustment lines (date, product and reversal filters applied)
  function adjDrill(title, test) {
    const x = X(), rows = x.adjL.filter((l) => test(l, x.docById.get(l.ref))).map((l) => {
      const s = x.skus[l.s], d = x.docById.get(l.ref);
      return { s: l.s, d: l.d, ref: l.ref, why: REASON[d.bucket] || d.bucket, note: d.text, sku: s.sku, p: s.p, dep: s.dep, ui: l.ui, uo: l.uo, v: l.ci - l.co };
    });
    return {
      title, sub: range() + filt(), kpis: [[fmtInt(new Set(rows.map((r) => r.ref)).size), 'adjustments'], [fmtInt(new Set(rows.map((r) => r.s)).size), 'SKUs'], [fmtRS(d3.sum(rows, (r) => r.v)), 'net value'], [fmtR(-d3.sum(rows.filter((r) => r.v < 0), (r) => r.v)), 'lost']],
      cols: [{ k: 'd', label: 'Date', f: dayOrNever('') }, { k: 'ref', label: 'Adjustment', mono: true }, { k: 'why', label: 'Reason' }, { k: 'sku', label: 'SKU', mono: true }, { k: 'p', label: 'Product', wrap: true },
        { k: 'ui', label: 'Up', n: true, sum: true }, { k: 'uo', label: 'Down', n: true, sum: true }, { k: 'v', label: 'Value', n: true, sum: true, f: (v) => fmtRS(v) }, { k: 'note', label: 'Note', wrap: true }],
      rows, sort: { k: 'v', dir: 1 }, onRow: toSku,
    };
  }
  // style-colours on IBTs (the Cin7 report gives IBT lines by style-colour, not size)
  function scRows(refSet) {
    const x = X(), m = new Map();
    for (const r of x.D.ibt_sc.data) {
      if (!refSet.has(r.r) || !x.scOk[r.k] || !x.seaOk(r.sea)) continue;
      let o = m.get(r.k); if (!o) { o = { u: 0, c: 0 }; m.set(r.k, o); } o.u += r.u; o.c += r.c;
    }
    return [...m].map(([k, o]) => { const sc = x.scs[k]; return { k, sc: sc.sc, sty: sc.sty, dep: sc.dep, sea: sc.sea, u: o.u, c: o.c }; });
  }
  const C_SC = [{ k: 'sc', label: 'Style-colour', wrap: true }, { k: 'sty', label: 'Style' }, { k: 'dep', label: 'Department' }, { k: 'sea', label: 'Season' },
    { k: 'u', label: 'Units', n: true, sum: true }, { k: 'c', label: 'Value at cost', n: true, sum: true, f: (v) => fmtR(v) }];
  const scSkus = (r) => { const x = X(); return stockList(r.sc, x.skus.filter((s, i) => s.sc === r.k && x.skuOk[i]), 'All sizes of this style-colour at HQ now'); };
  function ibtCard(i) {
    const rows = scRows(new Set([i.r]));
    return {
      title: i.ref, sub: (i.dir === 'out' ? 'Sent to ' : 'Returned from ') + (i.partner || i.inf || 'unknown') + ' · ' + (i.note || ''),
      kpis: [[i.status, 'status'], [i.od >= 0 ? fmtDay(i.od) : 'Before 2026', 'sent'], [i.id >= 0 ? fmtDay(i.id) : '—', 'received'], [i.lead >= 0 ? i.lead + ' days' : '—', 'to receive'],
        [fmtInt(d3.sum(rows, (r) => r.u)), 'units'], [fmtRC(d3.sum(rows, (r) => r.c)), 'at cost'], [i.purpose || '—', 'purpose']],
      cols: C_SC, rows, sort: { k: 'u', dir: -1 }, onRow: scSkus, note: 'Cin7 lists IBT lines by style-colour; click one to see its sizes at HQ.',
    };
  }
  const C_IBT = [{ k: 'ref', label: 'IBT', mono: true }, { k: 'dirl', label: 'Direction' }, { k: 'partner', label: 'Store or location' }, { k: 'od', label: 'Sent', f: dayOrNever('Before 2026') },
    { k: 'id', label: 'Received', f: dayOrNever('—') }, { k: 'lead', label: 'Days', n: true, f: (v) => (v >= 0 ? String(v) : '—') }, { k: 'purpose', label: 'Purpose' },
    { k: 'u', label: 'Units', n: true, sum: true }, { k: 'c', label: 'Value', n: true, sum: true, f: (v) => fmtR(v) }];
  function ibtList(title, list, sub) {
    const x = X(), rows = list.map((i) => ({ ...i, dirl: i.dir === 'out' ? 'Sent' : 'Returned', partner: i.partner || (i.inf ? i.inf + ' (from note)' : '—'), u: x.refU(i).u, c: x.refU(i).c, _i: i }));
    return {
      title, sub: sub || range(), kpis: [[fmtInt(rows.length), 'IBTs'], [fmtInt(d3.sum(rows, (r) => r.u)), 'units'], [fmtRC(d3.sum(rows, (r) => r.c)), 'at cost']],
      cols: C_IBT, rows, sort: { k: 'od', dir: -1 }, onRow: (r) => ibtCard(r._i),
    };
  }
  function storeCard(store) {
    const x = X(), list = x.ibtIn.filter((i) => i.partner === store);
    const sc = scRows(new Set(list.filter((i) => i.dir === 'out').map((i) => i.r)));
    const spec = ibtList(store, list, range() + ' · IBTs to and from this store');
    spec.kpis.push([fmtInt(sc.length), 'style-colours sent']);
    spec.note = 'Click an IBT to see its style-colours.';
    return spec;
  }
  function poCard(po) {
    const x = X(), rows = x.D.po_rec.data.filter((r) => r.ref === po.ref && x.skuOk[r.s]).map((r) => ({ ...skuInfo(x.skus[r.s]), d: r.d, u: r.u, c: r.c }));
    return {
      title: po.ref, sub: 'Supplier invoice ' + (po.inv || '—') + ' · ' + (po.pat || ''),
      kpis: [[fmtDay(po.first), 'first receipt'], [fmtDay(po.last), 'last receipt'], [fmtInt(d3.sum(rows, (r) => r.u)), 'units'], [fmtRC(d3.sum(rows, (r) => r.c)), 'at cost'], [fmtInt(rows.length), 'SKU lines']],
      cols: [{ k: 'd', label: 'Received', f: dayOrNever('') }, ...C_SKU, { k: 'u', label: 'Units', n: true, sum: true }, { k: 'c', label: 'Value at cost', n: true, sum: true, f: (v) => fmtR(v) }, C_OH],
      rows, sort: { k: 'u', dir: -1 }, onRow: toSku,
    };
  }
  function channelCard(ch) {
    const x = X(), m = new Map();
    for (const r of x.D.so.data) {
      if (r.ch !== ch || !x.inR(r.d) || !x.skuOk[r.s]) continue;
      let o = m.get(r.s); if (!o) { o = { u: 0, ret: 0, c: 0 }; m.set(r.s, o); } o.u += r.out; o.ret += r.ret; o.c += r.c;
    }
    const rows = [...m].map(([s, o]) => ({ ...skuInfo(x.skus[s]), ...o }));
    return {
      title: 'Sales orders: ' + ch, sub: range() + filt(), kpis: [[fmtInt(rows.length), 'SKUs'], [fmtInt(d3.sum(rows, (r) => r.u)), 'units shipped'], [fmtInt(d3.sum(rows, (r) => r.ret)), 'units returned']],
      cols: [...C_SKU, { k: 'u', label: 'Shipped', n: true, sum: true }, { k: 'ret', label: 'Returned', n: true, sum: true }, { k: 'c', label: 'Value at cost', n: true, sum: true, f: (v) => fmtR(v) }, C_OH],
      rows, sort: { k: 'u', dir: -1 }, onRow: toSku,
    };
  }
  // everything behind the current filters, per SKU
  function filterCard() {
    const x = X(), m = new Map(), z = () => ({ rec: 0, out: 0, so: 0, ret: 0, adj: 0, c: 0 });
    for (const r of x.D.moves.data) {
      if (!x.skuOk[r.s] || !x.inR(r.d)) continue;
      let o = m.get(r.s); if (!o) { o = z(); m.set(r.s, o); }
      if (r.t === 'PO+') o.rec += r.u; else if (r.t === 'TRs-' || r.t === 'TRp-' || r.t === 'TRn-') o.out += r.u; else if (r.t === 'SO-') o.so += r.u;
      else if (r.t === 'TRs+' || r.t === 'TR0+' || r.t === 'TRn+' || r.t === 'SO+') o.ret += r.u; else if (r.t === 'ST+') o.adj += r.u; else if (r.t === 'ST-') o.adj -= r.u;
    }
    const rows = [...m].map(([s, o]) => ({ ...skuInfo(x.skus[s]), ...o })).filter((r) => r.rec || r.out || r.so || r.ret || r.adj);
    return {
      title: 'SKUs behind these filters', sub: range() + filt(),
      kpis: [[fmtInt(rows.length), 'SKUs moved'], [fmtInt(d3.sum(rows, (r) => r.rec)), 'received'], [fmtInt(d3.sum(rows, (r) => r.out)), 'sent on IBTs'], [fmtInt(d3.sum(rows, (r) => r.so)), 'shipped on sales orders']],
      cols: [...C_SKU, { k: 'rec', label: 'Received', n: true, sum: true }, { k: 'out', label: 'IBTs out', n: true, sum: true }, { k: 'so', label: 'Sales orders', n: true, sum: true },
        { k: 'ret', label: 'Back in', n: true, sum: true }, { k: 'adj', label: 'Adjusted', n: true, sum: true, f: (v) => F.fmtSigned(v) }, C_OH],
      rows, sort: { k: 'out', dir: -1 }, onRow: toSku,
    };
  }

  const go = (fn) => (...a) => { try { const spec = fn(...a); if (spec) openDrill(spec); } catch (e) { console.error(e); } };
  window.fmDrill = {
    open: openDrill,
    reason: go((r) => adjDrill('Adjustments: ' + r.label, (l, d) => d.bucket === r.key)),
    adjDept: go((r) => adjDrill('Adjustments in ' + r.key, (l) => X().skus[l.s].dep === r.key)),
    deptOut: go((r) => movesDrill('Sent out: ' + r.key, (m) => OUTS.has(m.t) && X().skus[m.s].dep === r.key)),
    store: go((r) => storeCard(r.key)),
    purpose: go((r) => ibtList('IBTs for ' + r.key, X().ibtIn.filter((i) => i.dir === 'out' && i.purpose === r.key))),
    styleSent: go((r) => {
      const x = X(), refs = new Set(x.ibtIn.filter((i) => i.dir === 'out' && i.pclass === 'store').map((i) => i.r));
      return { title: 'Sent to stores: ' + r.key, sub: range(), cols: C_SC, rows: scRows(refs).filter((o) => o.sty === r.key), sort: { k: 'u', dir: -1 }, onRow: scSkus };
    }),
    channel: go((r) => channelCard(r.key)),
    stockDept: go((r) => stockWhere('Stock on hand: ' + r.key, (s) => !s.svc && s.dep === r.key)),
    vel: go((r) => stockWhere(r.key, (s) => !s.svc && F.velOf(s) === r.key)),
    season: go((r) => stockWhere('Season ' + r.key, (s) => !s.svc && !s.cmp && s.sea === r.key)),
    ibt: go((i) => ibtCard(i)),
    po: go((po) => poCard(po)),
    sku: go((si) => skuCard(si)),
  };
  const TILE = {
    soh: () => stockWhere('Stock on hand', (s) => !s.svc),
    rec: () => movesDrill('Received on POs', (m) => m.t === 'PO+'),
    out: () => movesDrill('Sent to stores', (m) => m.t === 'TRs-' || m.t === 'TRp-'),
    so: () => movesDrill('Sales orders shipped', (m) => m.t === 'SO-'),
    ret: () => movesDrill('Returned to HQ', (m) => m.t === 'TRs+' || m.t === 'TR0+'),
    adj: () => adjDrill('All adjustments', () => true),
    loss: () => adjDrill('Stock lost on adjustments', (l) => l.co > 0),
    rate: () => adjDrill('Stock lost on adjustments', (l) => l.co > 0),
    transit: () => ibtList('In transit now', X().transit, 'IBTs sent but not yet received'),
    dead: () => stockWhere('Dead stock', (s) => !s.svc && !s.cmp && F.isDeadVel(s.vel)),
  };

  // tile links and the "behind these filters" button, added once
  function decorate() {
    document.querySelectorAll('#tiles .fm-tile').forEach((t) => {
      if (t.querySelector('.drl') || !TILE[t.dataset.focus]) return;
      const a = el('span', 'drl', 'See the list ↗'); a.setAttribute('role', 'button'); a.tabIndex = 0;
      const open = (e) => { e.stopPropagation(); e.preventDefault(); go(TILE[t.dataset.focus])(); };
      a.addEventListener('click', open); a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
      t.append(a);
    });
    const reset = document.getElementById('reset');
    if (reset && !document.getElementById('drill-all')) {
      const b = el('button', 'fm-drillbtn', 'SKUs behind these filters ↗'); b.type = 'button'; b.id = 'drill-all';
      b.addEventListener('click', go(filterCard)); reset.before(b);
    }
  }

  // ---------- Stock age ----------
  const AGE = [['0–30 days', 0, 30], ['31–90 days', 31, 90], ['91–180 days', 91, 180], ['Over 180 days', 181, 1e9], ['No PO receipt in 2026', -1, -1]];
  const AGE_COL = [PAL[2], PAL[0], 'var(--wait)', RED, PAL[3]];
  function drawAged(x) {
    const ageOf = (s) => (s.lpo >= 0 ? AGE.findIndex((b, i) => i < 4 && x.END - s.lpo >= b[1] && x.END - s.lpo <= b[2]) : 4);
    const items = x.skus.filter((s, i) => x.skuOk[i] && !s.svc && !s.cmp && (s.oh || 0) > 0);
    const by = AGE.map((b) => ({ key: b[0], n: 0, u: 0, v: 0, list: [] }));
    const dep = new Map();
    for (const s of items) {
      const a = ageOf(s), o = by[a], v = Math.max(0, s.val || 0); o.n++; o.u += s.oh; o.v += v; o.list.push(s);
      let d = dep.get(s.dep); if (!d) { d = AGE.map(() => ({ v: 0, list: [] })); d.tot = 0; dep.set(s.dep, d); } d[a].v += v; d[a].list.push(s); d.tot += v;
    }
    const tot = d3.sum(by, (o) => o.v) || 1;
    stat(document.getElementById('aged-stats'), [[fmtRC(tot), 'on hand at cost (excl. components)'], [pct(by[0].v / tot), 'received in the last 30 days'],
      [fmtRC(by[2].v + by[3].v), 'over 90 days since last receipt', by[3].v > 0 ? 'fm-bad' : null], [fmtRC(by[4].v), 'not received on a PO in 2026']]);
    bars('aged-bars', by.map((o) => ({ key: o.key, label: o.key, value: o.v, text: fmtRC(o.v) + ' · ' + fmtInt(o.u) + ' units · ' + fmtInt(o.n) + ' SKUs' })),
      { color: (r) => AGE_COL[AGE.findIndex((a) => a[0] === r.key)], drill: (r) => openDrill(stockList('Stock age: ' + r.key, by.find((o) => o.key === r.key).list)) });
    const deps = [...dep].sort((a, b) => b[1].tot - a[1].tot).slice(0, 16), vmax = d3.max(deps, ([, d]) => d3.max(d, (c) => c.v)) || 1;
    const hh = el('tr'); hh.append(el('th', null, 'Department'), ...AGE.map((a) => el('th', 'n', a[0])), el('th', 'n', 'Total'));
    document.querySelector('#aged-dept thead').replaceChildren(hh);
    setRows('aged-dept', deps.map(([k, d]) => {
      const tr = el('tr'); tr.append(td(k));
      d.forEach((c, i) => {
        const cell = td(c.v ? fmtRC(c.v) : '·', 'n');
        if (c.v) {
          cell.style.background = 'color-mix(in srgb, ' + (i >= 2 && i <= 3 ? 'var(--bad)' : 'var(--accent)') + ' ' + Math.round(6 + 50 * Math.sqrt(c.v / vmax)) + '%, transparent)';
          cell.style.cursor = 'pointer'; cell.title = 'See the SKUs';
          cell.addEventListener('click', () => openDrill(stockList(k + ' · ' + AGE[i][0], c.list)));
        }
        tr.append(cell);
      });
      tr.append(td(fmtRC(d.tot), 'n'));
      return tr;
    }), 'No stock on hand matches these filters.');
  }

  // ---------- ABC–XYZ ----------
  function drawAbc(x) {
    const W = 26, start = monday(x.END) - (W - 1) * 7, wk = new Map(), val = new Map();
    for (const r of x.D.moves.data) {
      if (r.d < start || r.d > x.END || !OUTS.has(r.t) || !x.skuOk[r.s]) continue;
      let a = wk.get(r.s); if (!a) { a = new Float64Array(W); wk.set(r.s, a); }
      a[Math.min(W - 1, Math.floor((r.d - start) / 7))] += r.u; val.set(r.s, (val.get(r.s) || 0) + r.c);
    }
    const items = x.skus.filter((s, i) => x.skuOk[i] && !s.svc && !s.cmp && ((s.oh || 0) > 0 || val.has(i))).map((s) => {
      const a = wk.get(s.i), tot = a ? d3.sum(a) : 0, mean = tot / W, sd = a ? Math.sqrt(d3.sum(a, (v) => (v - mean) ** 2) / W) : 0;
      return { s, out: tot, v: val.get(s.i) || 0, mean, cv: mean ? sd / mean : null };
    });
    const sold = items.filter((o) => o.v > 0).sort((a, b) => b.v - a.v), vt = d3.sum(sold, (o) => o.v) || 1;
    let cum = 0;
    for (const o of sold) { cum += o.v; o.abc = cum / vt <= 0.8 || o === sold[0] ? 'A' : cum / vt <= 0.95 ? 'B' : 'C'; o.xyz = o.cv <= 0.5 ? 'X' : o.cv <= 1 ? 'Y' : 'Z'; }
    const none = items.filter((o) => !(o.v > 0));
    const cell = (a, z) => sold.filter((o) => o.abc === a && o.xyz === z);
    const ohv = (l) => d3.sum(l, (o) => Math.max(0, o.s.val || 0));
    const A = sold.filter((o) => o.abc === 'A');
    stat(document.getElementById('abc-stats'), [[fmtInt(A.length) + ' SKUs', 'make up 80% of outbound value (A)'], [pct(A.length / (sold.length || 1)), 'of the SKUs that moved'],
      [fmtInt(cell('C', 'Z').length), 'CZ SKUs (low value, erratic)'], [fmtInt(none.length) + ' · ' + fmtRC(ohv(none)), 'SKUs on hand that didn’t move in 26 weeks', none.length ? 'fm-bad' : null]]);
    const DESC = { AX: 'Steady best-sellers', AY: 'Big but variable', AZ: 'Big, unpredictable', BX: 'Steady middle', BY: 'Variable middle', BZ: 'Erratic middle', CX: 'Steady slow', CY: 'Variable slow', CZ: 'Cut candidates' };
    const grid = document.getElementById('abc-grid'), kids = [el('span', 'hd', '')];
    for (const z of ['X', 'Y', 'Z']) kids.push(el('span', 'hd', z + (z === 'X' ? ' · steady' : z === 'Y' ? ' · variable' : ' · erratic')));
    const share = (l) => d3.sum(l, (o) => o.v) / vt, smax = d3.max(['A', 'B', 'C'].flatMap((a) => ['X', 'Y', 'Z'].map((z) => share(cell(a, z))))) || 1;
    const rowsFor = (l) => l.map((o) => ({ ...skuInfo(o.s), abc: o.abc || '—', xyz: o.xyz || '—', out: o.out, v: o.v, wk: o.mean, cv: o.cv, cover: o.mean ? (o.s.oh || 0) / o.mean : null }));
    const spec = (title, l) => ({
      title, sub: 'Last 26 weeks to ' + fmtDay(x.END) + filt(), kpis: [[fmtInt(l.length), 'SKUs'], [fmtRC(d3.sum(l, (o) => o.v)), 'outbound value'], [fmtRC(ohv(l)), 'on hand now']],
      cols: [...C_SKU, { k: 'abc', label: 'ABC' }, { k: 'xyz', label: 'XYZ' }, { k: 'out', label: 'Units out', n: true, sum: true }, { k: 'v', label: 'Value out', n: true, sum: true, f: (v) => fmtR(v) },
        { k: 'wk', label: 'Per week', n: true, f: (v) => d3.format('.1f')(v || 0) }, { k: 'cv', label: 'Variability (CV)', n: true, f: (v) => (v == null ? '—' : d3.format('.2f')(v)) },
        { k: 'oh', label: 'On hand', n: true, f: (v) => fmtInt(v || 0) }, { k: 'cover', label: 'Weeks cover', n: true, f: (v) => (v == null ? '—' : v >= 99 ? '99+' : d3.format('.1f')(v)) }],
      rows: rowsFor(l), sort: { k: 'v', dir: -1 }, onRow: toSku,
    });
    for (const a of ['A', 'B', 'C']) {
      kids.push(el('span', 'hd', a === 'A' ? 'A · top 80%' : a === 'B' ? 'B · next 15%' : 'C · last 5%'));
      for (const z of ['X', 'Y', 'Z']) {
        const l = cell(a, z), sh = share(l), b = el('button'); b.type = 'button';
        const strength = Math.round(8 + 72 * Math.sqrt(sh / smax));
        b.style.background = 'color-mix(in srgb, ' + (a + z === 'CZ' ? 'var(--bad)' : 'var(--accent)') + ' ' + strength + '%, var(--surface))';
        if (strength > 50) b.classList.add('hot');
        b.append(el('b', null, a + z + ' · ' + fmtInt(l.length) + ' SKUs'), el('span', null, DESC[a + z]), el('span', null, pct(sh) + ' of value out · ' + fmtRC(ohv(l)) + ' on hand'));
        b.addEventListener('click', () => openDrill(spec(a + z + ': ' + DESC[a + z], l)));
        kids.push(b);
      }
    }
    const nb = el('button'); nb.type = 'button'; nb.style.gridColumn = '2 / -1';
    nb.append(el('b', null, 'No outbound in 26 weeks · ' + fmtInt(none.length) + ' SKUs'), el('span', null, fmtRC(ohv(none)) + ' on hand. Click to see them.'));
    nb.addEventListener('click', () => openDrill(spec('No outbound in 26 weeks', none)));
    kids.push(el('span', 'hd', 'No sales'), nb);
    grid.replaceChildren(...kids);
  }

  // ---------- Count accuracy ----------
  function drawCount(x) {
    const lines = x.adjL.filter((l) => x.docById.get(l.ref).bucket === 'STOCK_COUNT');
    const m = new Map();
    for (const l of lines) {
      let o = m.get(l.s); if (!o) { o = { docs: new Set(), ui: 0, uo: 0, ci: 0, co: 0, lines: [] }; m.set(l.s, o); }
      o.docs.add(l.ref); o.ui += l.ui; o.uo += l.uo; o.ci += l.ci; o.co += l.co; o.lines.push(l);
    }
    const sohV = d3.sum(x.sohRows, (s) => Math.max(0, s.val || 0)) || 1;
    const gross = d3.sum(lines, (l) => l.ci + l.co), net = d3.sum(lines, (l) => l.ci - l.co), rep = [...m.values()].filter((o) => o.docs.size >= 3).length;
    stat(document.getElementById('count-stats'), [[fmtInt(new Set(lines.map((l) => l.ref)).size), 'stock-count adjustments'], [fmtInt(m.size), 'SKUs corrected'],
      [fmtR(gross), 'gross value corrected'], [fmtRS(net), 'net result', net < 0 ? 'fm-bad' : null], [pct1(1 - gross / sohV), 'value accuracy (1 − gross ÷ stock value)'],
      [fmtInt(rep), 'SKUs corrected 3 times or more', rep ? 'fm-bad' : null]]);
    const rows = [...m].map(([s, o]) => ({ s, sk: x.skus[s], ...o, n: o.docs.size, g: o.ci + o.co, v: o.ci - o.co })).sort((a, b) => b.n - a.n || b.g - a.g);
    setRows('count-skus', rows.slice(0, 200).map((r) => {
      const tr = el('tr'), n = td(fmtInt(r.n), 'n'); if (r.n >= 3) n.classList.add('fm-bad');
      const dn = td(r.uo ? '−' + fmtInt(r.uo) : '—', 'n'); if (r.uo) dn.classList.add('fm-bad');
      tr.append(td(r.sk.sku, 'fm-mono'), td(r.sk.p, 'wrap'), td(r.sk.dep), n, td(r.ui ? '+' + fmtInt(r.ui) : '—', 'n'), dn, td(fmtR(r.g), 'n'), td(fmtRS(r.v), 'n'), td(fmtInt(r.sk.oh || 0), 'n'));
      return clickRow(tr, () => openDrill(adjDrill('Count lines: ' + r.sk.sku, (l, d) => l.s === r.s && d.bucket === 'STOCK_COUNT')));
    }), 'No stock-count adjustments in these dates.');
  }

  // ---------- Aramex invoice check ----------
  const moOf = (d) => { const t = dayDate(d); return (t.getUTCFullYear() - 2022) * 12 + t.getUTCMonth(); };
  function drawInvoices() {
    const ds = dash.data('courier_invoices');
    if (ds.status !== 'ok') { stat(document.getElementById('cr-inv-stats'), [['—', ds.status === 'error' ? 'The invoice data failed to load.' : 'Loading invoices…']]); return; }
    const cm = ui.cm || null, rows = ds.data.filter((r) => !cm || (moOf(r.d) >= Math.min(cm.from, cm.to) && moOf(r.d) <= Math.max(cm.from, cm.to)))
      .map((r) => ({ ...r, diff: r.inv - r.amt })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const off = rows.filter((r) => Math.abs(r.diff) > 1);
    stat(document.getElementById('cr-inv-stats'), [[fmtInt(rows.length), 'invoices in the period'], [fmtRC(d3.sum(rows, (r) => r.inv)), 'invoiced (excl. VAT)'],
      [fmtRC(d3.sum(rows, (r) => r.amt)), 'listed on waybills'], [fmtRS(d3.sum(rows, (r) => r.diff)), 'not itemised in the export', d3.sum(rows, (r) => r.diff) > 1 ? 'fm-bad' : null],
      [fmtInt(off.length), 'invoices that don’t match', off.length ? 'fm-bad' : null]]);
    setRows('cr-inv', rows.slice(0, 300).map((r) => {
      const tr = el('tr'), df = td(Math.abs(r.diff) > 1 ? fmtRS(r.diff) : 'Matches', 'n'); if (Math.abs(r.diff) > 1) df.classList.add('fm-bad');
      tr.append(td(fmtFull(r.d)), td(r.doc, 'fm-mono'), td(r.acct), td(fmtInt(r.awbs), 'n'), td(fmtR(r.amt), 'n'), td(fmtR(r.inv), 'n'), df, td(fmtR(r.tax), 'n'));
      return clickRow(tr, () => openDrill({
        title: 'Invoice ' + r.doc, sub: r.acct + ' · ' + fmtFull(r.d),
        kpis: [[fmtR(r.inv), 'invoiced (excl. VAT)'], [fmtR(r.tax), 'VAT'], [fmtR(r.amt), 'waybills listed'], [fmtInt(r.awbs), 'waybills'], [fmtRS(r.diff), 'difference'], [r.awbs ? fmtR(r.amt / r.awbs) : '—', 'per waybill']],
        cols: [{ k: 'k', label: 'Check' }, { k: 'v', label: 'Result' }],
        rows: [{ k: 'Invoice vs waybills listed', v: Math.abs(r.diff) > 1 ? 'Invoice is ' + fmtR(Math.abs(r.diff)) + (r.diff > 0 ? ' higher' : ' lower') + ' than its waybills' : 'Matches' },
          { k: 'VAT rate', v: r.inv ? pct1(r.tax / r.inv) : '—' }, { k: 'What to ask Aramex', v: Math.abs(r.diff) > 1 ? 'The waybill listing for invoice ' + r.doc + ' so it can be matched in full.' : 'Nothing.' }],
        note: 'The export doesn’t carry invoice numbers per online parcel, so this shows the totals only.',
      }));
    }), 'No invoices in this period.');
  }

  // ---------- Peak forecast and courier cost per online order ----------
  const BF = { 2023: '2023-11-20', 2024: '2024-11-25', 2025: '2025-11-24', 2026: '2026-11-23' };   // Mondays of Black Friday week
  const dIso = (s) => Math.round((Date.parse(s + 'T00:00:00Z') - Date.UTC(2026, 0, 1)) / 864e5);
  function peakModel(x) {
    const sh = dash.data('shopify_online'), cd = dash.data('courier_daily');
    if (sh.status !== 'ok' || cd.status !== 'ok') return null;
    const wk = new Map(sh.data.filter((r) => r.k === 'w').map((r) => [dIso(r.p), r.orders]));
    const series = {};
    for (const y of [2023, 2024, 2025, 2026]) { const b = dIso(BF[y]); series[y] = d3.range(-10, 7).map((w) => wk.get(b + w * 7) ?? null); }
    const base = (y) => d3.mean(series[y].slice(0, 6).filter((v) => v != null));   // weeks −10 to −5
    const shapes = [2024, 2025].map((y) => series[y].map((v) => (v == null ? null : v / base(y))));
    const shape = d3.range(17).map((i) => d3.mean(shapes, (s) => s[i]));
    const b26 = base(2026), f26 = shape.map((s) => (s == null ? null : b26 * s));
    // couriers and picking from history
    const mon = sh.data.filter((r) => r.k === 'm'), om = new Map(mon.map((r) => [r.p, r]));
    const ar = new Map();
    for (const r of cd.data) if (r.cat === 'Online orders') { const k = d3.utcFormat('%Y-%m')(dayDate(r.d)); const o = ar.get(k) || { n: 0, amt: 0 }; o.n += r.n; o.amt += r.amt; ar.set(k, o); }
    const both = [...ar.keys()].filter((k) => om.has(k) && k >= '2026-01');
    const ppo = d3.sum(both, (k) => ar.get(k).n) / (d3.sum(both, (k) => om.get(k).orders) || 1);
    const last3 = [...ar.keys()].sort().slice(-3), cpp = d3.sum(last3, (k) => ar.get(k).amt) / (d3.sum(last3, (k) => ar.get(k).n) || 1);
    const so = x.D.so.data.filter((r) => r.ch === 'Online' && r.d > x.END - 56), oo = x.D.so_orders.data.filter((r) => r.ch === 'Online' && r.d > x.END - 56);
    const upo = d3.sum(so, (r) => r.out) / (d3.sum(oo, (r) => r.orders) || 1);
    const lastActual = d3.max([...wk.keys()]);
    return { series, f26, b26, base, ppo, cpp, upo, last3, lastActual, ar, om, mon };
  }
  function drawPeak(x) {
    const m = peakModel(x), note = document.getElementById('pk-note');
    if (!m) { note.textContent = 'Loading Shopify and Aramex data…'; return; }
    const b26 = dIso(BF[2026]), weekStart = (i) => b26 + (i - 10) * 7;
    const isFc = (i) => weekStart(i) > m.lastActual;
    const o26 = (i) => (isFc(i) ? m.f26[i] : m.series[2026][i]);
    const idxBF = 10, inMonth = (i, mo) => dayDate(weekStart(i) + 3).getUTCMonth() === mo;
    const nov = d3.sum(d3.range(17).filter((i) => inMonth(i, 10)), o26), dec = d3.sum(d3.range(17).filter((i) => inMonth(i, 11)), o26);
    const nov25 = d3.sum(d3.range(17).filter((i) => inMonth(i, 10)), (i) => m.series[2025][i] || 0);
    note.textContent = 'Built from Shopify online-store orders (to the week of ' + fmtDay(m.lastActual) + ') and the shape of the last two Black Fridays, scaled to how busy the weeks before them were. Currently ' +
      fmtInt(m.b26) + ' orders a week vs ' + fmtInt(m.base(2025)) + ' at this point last year. Courier spend uses ' + d3.format('.2f')(m.ppo) + ' Aramex parcels per order and ' + fmtR2(m.cpp) + ' per parcel (' +
      m.last3[0] + ' to ' + m.last3[m.last3.length - 1] + '); picking uses ' + d3.format('.1f')(m.upo) + ' units per online order from Cin7.';
    const kp = [
      [fmtInt(o26(idxBF)), 'Black Friday week orders', 'last year ' + fmtInt(m.series[2025][idxBF]) + ' (' + d3.format('+.0%')(o26(idxBF) / m.series[2025][idxBF] - 1) + ')'],
      [fmtInt(nov), 'November orders (forecast)', 'last year ' + fmtInt(nov25)],
      [fmtInt(dec), 'December orders, first weeks', 'weeks starting in December'],
      [fmtInt(o26(idxBF) * m.ppo), 'Aramex parcels in BF week', fmtInt(o26(idxBF) * m.ppo / 6) + ' a day over 6 days'],
      [fmtRC((nov + dec) * m.ppo * m.cpp), 'courier spend Nov–Dec', 'online parcels only, excl. VAT'],
      [fmtInt(o26(idxBF) * m.upo), 'units to pick in BF week', fmtInt(o26(idxBF) * m.upo / 6) + ' a day'],
    ];
    document.getElementById('pk-kpis').replaceChildren(...kp.map(([v, l, s]) => { const d = el('div'); d.append(el('span', null, l), el('b', null, v), el('em', null, s)); return d; }));
    drawPeakChart(m, isFc, o26);
    setRows('pk-weeks', d3.range(17).map((i) => {
      const tr = el('tr'); if (i === idxBF) tr.classList.add('sel');
      const f = isFc(i), o = o26(i), c26 = td(o == null ? '—' : fmtInt(o) + (f ? ' (forecast)' : ''), 'n'); if (f) c26.style.fontStyle = 'italic';
      tr.append(td(fmtDay(weekStart(i))), td(i === idxBF ? 'Black Friday week' : (i < idxBF ? '−' : '+') + Math.abs(i - idxBF), 'n'), td(m.series[2024][i] == null ? '—' : fmtInt(m.series[2024][i]), 'n'),
        td(m.series[2025][i] == null ? '—' : fmtInt(m.series[2025][i]), 'n'), c26, td(o == null ? '—' : fmtInt(o * m.ppo), 'n'), td(o == null ? '—' : fmtR(o * m.ppo * m.cpp), 'n'), td(o == null ? '—' : fmtInt(o * m.upo), 'n'));
      return tr;
    }), 'No weekly data.');
    drawCpo(m);
  }
  function drawPeakChart(m, isFc, o26) {
    const box = document.getElementById('pk-chart'); ui.pkHide = ui.pkHide || {};
    const S = [{ k: 2023, label: '2023', color: '#9aa39e' }, { k: 2024, label: '2024', color: PAL[3] }, { k: 2025, label: '2025', color: PAL[4] }, { k: 2026, label: '2026 (dashed = forecast)', color: PAL[0] }];
    document.getElementById('pk-legend').replaceChildren(...S.map((s) => {
      const b = el('button', 'fm-leg'); b.type = 'button'; b.setAttribute('aria-pressed', String(!ui.pkHide[s.k]));
      const i = el('i'); i.style.background = s.color; i.classList.add('ln'); b.append(i, s.label);
      b.addEventListener('click', () => { ui.pkHide[s.k] = !ui.pkHide[s.k]; F.drawAll(); }); return b;
    }));
    const on = S.filter((s) => !ui.pkHide[s.k]);
    const val = (s, i) => (s.k === 2026 ? o26(i) : m.series[s.k][i]);
    const W = Math.max(300, box.clientWidth), H = 280, mg = { t: 14, r: 14, b: 30, l: 50 };
    const xs = d3.scaleLinear([0, 16], [mg.l, W - mg.r]), ymax = d3.max(on, (s) => d3.max(d3.range(17), (i) => val(s, i) || 0)) || 1;
    const y = d3.scaleLinear([0, ymax], [H - mg.b, mg.t]).nice();
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Weekly online orders around Black Friday, 2023 to 2026 with forecast');
    const defs = svg.append('defs'), uid = 'pk' + Math.round(W);
    defs.append('filter').attr('id', uid + 'g').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%').append('feDropShadow').attr('dx', 0).attr('dy', 0).attr('stdDeviation', 2.5).style('flood-color', PAL[0]).style('flood-opacity', .5);
    const gr = defs.append('linearGradient').attr('id', uid + 'a').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    gr.append('stop').attr('offset', '0%').style('stop-color', PAL[0]).style('stop-opacity', .28); gr.append('stop').attr('offset', '100%').style('stop-color', PAL[0]).style('stop-opacity', 0);
    svg.append('rect').attr('x', xs(9.5)).attr('width', xs(10.5) - xs(9.5)).attr('y', mg.t).attr('height', H - mg.t - mg.b).attr('rx', 6).attr('fill', 'var(--color-bg)');
    const ticks = y.ticks(5);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', mg.l).attr('x2', W - mg.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)').attr('stroke-dasharray', (t) => (t ? '3 4' : null));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', mg.l - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((t) => d3.format('~s')(t));
    svg.append('g').selectAll('text').data(d3.range(0, 17, 2)).join('text').attr('x', xs).attr('y', H - 8).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11)
      .text((i) => (i === 10 ? 'BF week' : (i < 10 ? '−' : '+') + Math.abs(i - 10)));
    const line = (fn) => d3.line().defined((i) => fn(i) != null).x(xs).y((i) => y(fn(i))).curve(d3.curveMonotoneX);
    for (const s of on) {
      if (s.k !== 2026) { svg.append('path').attr('d', line((i) => val(s, i))(d3.range(17))).attr('fill', 'none').style('stroke', s.color).attr('stroke-width', 1.8).attr('stroke-opacity', .85); continue; }
      const act = (i) => (isFc(i) ? null : val(s, i)), lastA = d3.max(d3.range(17).filter((i) => !isFc(i))), fc = (i) => (i >= lastA ? val(s, i) : null);
      svg.append('path').attr('d', d3.area().defined((i) => val(s, i) != null).x(xs).y0(y(0)).y1((i) => y(val(s, i))).curve(d3.curveMonotoneX)(d3.range(17))).attr('fill', `url(#${uid}a)`);
      svg.append('path').attr('d', line(act)(d3.range(17))).attr('fill', 'none').style('stroke', s.color).attr('stroke-width', 2.6).attr('filter', `url(#${uid}g)`);
      svg.append('path').attr('d', line(fc)(d3.range(17))).attr('fill', 'none').style('stroke', s.color).attr('stroke-width', 2.6).attr('stroke-dasharray', '6 5');
      svg.append('g').selectAll('circle').data(d3.range(17).filter((i) => val(s, i) != null)).join('circle').attr('cx', xs).attr('cy', (i) => y(val(s, i))).attr('r', 3).style('fill', 'var(--color-panel)').style('stroke', s.color).attr('stroke-width', 2);
    }
    const cursor = svg.append('line').attr('y1', mg.t).attr('y2', H - mg.b).attr('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '3 3').attr('opacity', 0);
    const tip = el('div', 'fm-tip'); tip.hidden = true;
    svg.append('g').selectAll('rect').data(d3.range(17)).join('rect').attr('x', (i) => xs(i - 0.5)).attr('width', xs(1) - xs(0)).attr('y', mg.t).attr('height', H - mg.t - mg.b).attr('fill', 'transparent')
      .on('mouseenter mousemove', (ev, i) => {
        cursor.attr('x1', xs(i)).attr('x2', xs(i)).attr('opacity', 1);
        const ln = (s) => { const l = el('div'), c = el('i'); c.style.background = s.color; const v = val(s, i); l.append(c, s.label.split(' ')[0] + ': ' + (v == null ? '—' : fmtInt(v)) + (s.k === 2026 && isFc(i) ? ' (forecast)' : '')); return l; };
        tip.replaceChildren(el('span', 'd', (i === 10 ? 'Black Friday week' : (i < 10 ? i - 10 : '+' + (i - 10)) + ' weeks') + ' · 2026 week of ' + fmtDay(dIso(BF[2026]) + (i - 10) * 7)), ...S.map(ln));
        tip.hidden = false; const bx = xs(i) / W * box.clientWidth;
        tip.style.top = '8px'; tip.style.left = Math.min(Math.max(0, bx + 12), box.clientWidth - tip.offsetWidth) + 'px';
      })
      .on('mouseleave', () => { tip.hidden = true; cursor.attr('opacity', 0); });
    box.replaceChildren(svg.node(), tip);
  }
  function drawCpo(m) {
    const months = [...m.ar.keys()].filter((k) => m.om.has(k)).sort();
    const rows = months.map((k) => { const a = m.ar.get(k), o = m.om.get(k); return { k, orders: o.orders, net: o.net, ship: o.ship, n: a.n, amt: a.amt, per: a.amt / o.orders, share: a.amt / o.net, netc: a.amt - o.ship }; });
    const l12 = rows.slice(-12), S = (f) => d3.sum(l12, f);
    stat(document.getElementById('cpo-stats'), [[fmtR2(S((r) => r.amt) / S((r) => r.orders)), 'courier cost per online order (last 12 months of Aramex data)'],
      [pct1(S((r) => r.amt) / S((r) => r.net)), 'of online sales'], [pct(S((r) => r.ship) / S((r) => r.amt)), 'recovered from shipping charged'], [d3.format('.2f')(S((r) => r.n) / S((r) => r.orders)), 'Aramex parcels per order']]);
    const mo = (k) => d3.utcFormat('%b %Y')(new Date(k + '-01T00:00:00Z'));
    const card = (r) => ({
      title: 'Online orders: ' + mo(r.k), sub: 'Shopify online store and Aramex online parcels',
      kpis: [[fmtInt(r.orders), 'online orders'], [fmtRC(r.net), 'online net sales'], [fmtR(r.net / r.orders), 'average order'], [fmtInt(r.n), 'Aramex parcels'], [fmtR(r.amt), 'courier spend'], [fmtR(r.ship), 'shipping charged'], [fmtR2(r.per), 'courier per order'], [pct1(r.share), 'of sales']],
      cols: [{ k: 'k', label: 'Measure' }, { k: 'v', label: 'Value', n: true }],
      rows: [{ k: 'Net courier cost after shipping charged', v: fmtR(r.netc) }, { k: 'Parcels per order', v: d3.format('.2f')(r.n / r.orders) }, { k: 'Cost per parcel', v: fmtR2(r.amt / (r.n || 1)) }],
    });
    bars('cpo-bars', rows.slice(-18).reverse().map((r) => ({ key: r.k, label: mo(r.k), value: r.per, text: fmtR2(r.per) + ' per order · ' + pct1(r.share) + ' of sales', r })),
      { color: (b) => (b.r.share > 0.06 ? RED : PAL[0]), drill: (b) => openDrill(card(b.r)) });
    setRows('cpo', rows.slice().reverse().map((r) => {
      const tr = el('tr');
      tr.append(td(mo(r.k)), td(fmtInt(r.orders), 'n'), td(fmtInt(r.n), 'n'), td(d3.format('.2f')(r.n / r.orders), 'n'), td(fmtR(r.amt), 'n'), td(fmtR2(r.per), 'n'), td(fmtR(r.ship), 'n'), td(fmtR(r.netc), 'n'), td(pct1(r.share), 'n'));
      return clickRow(tr, () => openDrill(card(r)));
    }), 'No months with both Shopify and Aramex data.');
  }

  // ---------- Maps ----------
  // Province outlines come from the geo_za dataset (a TopoJSON file); decoded here because the page can't load map libraries.
  let GEO = null, GEO_SRC = null;
  function geo() {
    const ds = dash.data('geo_za');
    if (ds.status !== 'ok' || !ds.data.length) return null;
    if (GEO_SRC === ds.data) return GEO;
    let topo = ds.data[0].topology; if (typeof topo === 'string') topo = JSON.parse(topo);
    const tf = topo.transform;
    const arcs = topo.arcs.map((arc) => {
      if (!tf) return arc;
      let x = 0, y = 0;
      return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]; });
    });
    const arcAt = (i) => (i < 0 ? arcs[~i].slice().reverse() : arcs[i]);
    const ring = (ids) => { const pts = []; ids.forEach((i, j) => { const a = arcAt(i); pts.push(...(j ? a.slice(1) : a)); }); return pts; };
    const obj = topo.objects[Object.keys(topo.objects)[0]];
    const mainland = (poly) => poly[0].every(([lon, lat]) => lon > 15 && lon < 34 && lat > -36 && lat < -21);   // drops the Prince Edward Islands
    const feats = obj.geometries.map((g) => {
      const poly = g.type === 'Polygon';
      const f = { type: 'Feature', id: g.id, properties: { name: g.properties.name === 'Orange Free State' ? 'Free State' : g.properties.name },
        geometry: { type: g.type, coordinates: poly ? g.arcs.map(ring) : g.arcs.map((p) => p.map(ring)).filter(mainland) } };
      if (d3.geoArea(f) > 2 * Math.PI) {   // rings wound the other way for d3: flip them
        const flip = (r) => r.slice().reverse();
        f.geometry.coordinates = poly ? f.geometry.coordinates.map(flip) : f.geometry.coordinates.map((p) => p.map(flip));
      }
      return f;
    });
    GEO = { type: 'FeatureCollection', features: feats }; GEO_SRC = ds.data;
    return GEO;
  }
  // approximate store locations (centre of the mall's suburb), [lon, lat]; matched on the start of the Cin7 store name
  const HQ_LL = [18.53, -33.88];
  const STORE_LL = [['Sandton', 28.053, -26.108], ['Hazelwood', 28.256, -25.771], ['Menlyn', 28.276, -25.783], ['Castle Gate', 28.24, -25.8], ['Mall of Africa', 28.106, -26.015],
    ['Walmer Park', 25.565, -33.985], ['Mooi Rivier', 27.098, -26.716], ['Garden Route', 22.457, -33.968], ['Rosebank', 28.042, -26.146], ['Ballito', 31.214, -29.533],
    ['Clearwater', 27.904, -26.128], ['Gateway', 31.067, -29.727], ['Bloemfontein', 26.215, -29.08], ['Cresta', 27.973, -26.13], ['Ilanga', 30.985, -25.465],
    ['Fourways', 28.006, -26.018], ['Morningside', 28.058, -26.075], ['Mall of the North', 29.506, -23.88], ['FOM Pavilion', 30.936, -29.849], ['Hermanus', 19.235, -34.418],
    ['Dorp Street', 18.861, -33.938], ['Canal Walk', 18.512, -33.893], ['V&A', 18.42, -33.903], ['Somerset', 18.85, -34.073], ['Laborie', 18.958, -33.761],
    ['Tygervalley', 18.633, -33.874], ['Kloof', 18.41, -33.932], ['Cavendish', 18.465, -33.981], ['Atterbury', 28.315, -25.783], ['Woodlands', 28.297, -25.817],
    ['Hydepark', 28.035, -26.125], ['Hyde Park', 28.035, -26.125], ['Nicolway', 28.026, -26.058]];
  const storeLL = (name) => { const s = STORE_LL.find(([k]) => (name || '').startsWith(k)); return s ? [s[1], s[2]] : null; };
  const VIEWS = { za: null, gp: [[27.55, -26.5], [28.6, -25.45]], wc: [[18.25, -34.5], [19.35, -33.6]], kzn: [[30.75, -30.0], [31.4, -29.4]] };
  const short = (s) => s.replace(/\s+-\s+\w+$/, '').replace(' (New)', '');
  function segSync(id, attr, val, on) {
    const g = document.getElementById(id); if (!g) return;
    g.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset[attr] === val));
      if (!b.dataset.wired) { b.dataset.wired = '1'; b.addEventListener('click', () => on(b.dataset[attr])); }
    });
  }
  function tipAt(box, tip, ev, nodes) {
    tip.replaceChildren(...nodes); tip.hidden = false;
    const [mx, my] = d3.pointer(ev, box);
    tip.style.left = Math.min(Math.max(0, mx + 14), box.clientWidth - tip.offsetWidth - 4) + 'px';
    tip.style.top = Math.max(0, Math.min(my - 10, box.clientHeight - tip.offsetHeight - 4)) + 'px';
  }
  const tline = (txt) => el('div', null, txt);

  function drawStoreMap(x) {
    const box = document.getElementById('store-map'); if (!box) return;
    ui.smView = ui.smView || 'za'; ui.smMetric = ui.smMetric || 'u';
    segSync('sm-view', 'v', ui.smView, (v) => { ui.smView = v; F.drawAll(); });
    segSync('sm-metric', 'm', ui.smMetric, (v) => { ui.smMetric = v; F.drawAll(); });
    const M = ui.smMetric, st = new Map();
    for (const i of x.ibtIn) {
      if (i.dir !== 'out' || i.pclass !== 'store' || !i.partner) continue;
      const o = st.get(i.partner) || { store: i.partner, u: 0, c: 0, n: 0, leads: [] }, ru = x.refU(i);
      o.u += ru.u; o.c += ru.c; o.n++; if (i.lead >= 0) o.leads.push(i.lead); st.set(i.partner, o);
    }
    let rows;
    if (M === 'q') {   // stock on hand in each store now (store stock data)
      const ss = dash.data('store_stock'), m = new Map(), sset = storeNames(x);
      if (ss.status === 'ok') for (const r of ss.data) {
        if (!sset.has(r.l) || r.q <= 0 || !x.skuOk[r.s] || (x.p.stores.length && !x.p.stores.includes(r.l))) continue;
        const o = m.get(r.l) || { store: r.l, q: 0, c: 0, u: 0, n: 0, leads: [] }; o.q += r.q; o.c += Math.max(0, r.v); m.set(r.l, o);
      }
      rows = [...m.values()].sort((a, b) => b.q - a.q);
    } else rows = [...st.values()].filter((o) => o.u > 0).sort((a, b) => b[M] - a[M]);
    const fmtM = (v) => (M === 'c' ? fmtRC(v) : fmtInt(v)), tot = d3.sum(rows, (o) => o[M]);
    document.getElementById('sm-total').textContent = fmtM(tot);
    document.getElementById('sm-sub').textContent = M === 'q' ? 'Units on hand in ' + fmtInt(rows.length) + ' stores now (from Cin7’s daily movement summary). Click a store for its SKUs.'
      : (M === 'u' ? 'Units' : M === 'c' ? 'Stock value at cost' : 'IBTs') + ' sent from HQ to ' + fmtInt(rows.length) + ' stores, ' + range() + '. Click a store for its IBTs.';
    const openStore = (name) => (M === 'q' ? go(() => storeStockCard(name))() : window.fmDrill.store({ key: name }));
    bars('sm-list', rows.slice(0, 10).map((o) => ({ key: o.store, label: short(o.store), value: o[M], text: fmtM(o[M]) + ' · ' + pct(o[M] / (tot || 1)) })),
      { color: PAL[1], drill: (r) => openStore(r.key), empty: M === 'q' ? 'No store stock for these filters.' : 'No IBTs to stores in these dates.' });
    const G = geo();
    if (!G) { box.replaceChildren(el('p', 'fm-note', 'Loading the map…')); return; }
    const W = Math.max(320, box.clientWidth), H = Math.round(Math.max(360, Math.min(520, W * 0.7)));
    const proj = d3.geoMercator(), v = VIEWS[ui.smView];
    proj.fitExtent([[18, 18], [W - 18, H - 18]], v ? { type: 'MultiPoint', coordinates: v } : G);
    const path = d3.geoPath(proj);
    const pv = new Map();
    for (const o of rows) { o.ll = storeLL(o.store); if (!o.ll) continue; const f = G.features.find((ft) => d3.geoContains(ft, o.ll)); o.prov = f ? f.properties.name : null; if (o.prov) pv.set(o.prov, (pv.get(o.prov) || 0) + o[M]); }
    const shade = d3.scaleSequential([0, d3.max([...pv.values()]) || 1], d3.interpolateRgb('#dff3f1', '#59c4bc'));
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Map of South Africa with stores sized by stock sent from HQ');
    const tip = el('div', 'fm-tip'); tip.hidden = true;
    const zoom = el('div', 'zoom');
    for (const [k, lbl] of [['za', '–'], [ui.smView === 'za' ? 'gp' : ui.smView, '+']]) { const b = el('button', null, lbl); b.type = 'button'; b.title = k === 'za' ? 'All of South Africa' : 'Zoom in'; b.addEventListener('click', () => { ui.smView = k; F.drawAll(); }); zoom.append(b); }
    box.replaceChildren(svg.node(), zoom, tip);
    svg.append('g').selectAll('path').data(G.features).join('path').attr('class', 'prov').attr('d', path)
      .attr('fill', (f) => (pv.get(f.properties.name) ? shade(pv.get(f.properties.name)) : '#dde2e8'))
      .on('mousemove', (ev, f) => tipAt(box, tip, ev, [el('span', 'd', f.properties.name), tline(fmtM(pv.get(f.properties.name) || 0) + (M === 'u' ? ' units' : M === 'n' ? ' IBTs' : '') + ' to stores here')]))
      .on('mouseleave', () => { tip.hidden = true; });
    const placed = rows.filter((o) => o.ll), mx = d3.max(placed, (o) => o[M]) || 1;
    const rad = d3.scaleSqrt([0, mx], [3, ui.smView === 'za' ? 15 : 22]), wid = d3.scaleLinear([0, mx], [0.6, 4]);
    const hq = proj(HQ_LL), animate = !box.dataset.drawn && !matchMedia('(prefers-reduced-motion: reduce)').matches; box.dataset.drawn = '1';
    const flows = svg.append('g').attr('fill', 'none');
    for (const o of placed) {
      const p = proj(o.ll), cx = (hq[0] + p[0]) / 2, cy = (hq[1] + p[1]) / 2 - Math.hypot(p[0] - hq[0], p[1] - hq[1]) * 0.22;
      const a = flows.append('path').attr('d', `M${hq[0]},${hq[1]}Q${cx},${cy} ${p[0]},${p[1]}`).attr('stroke', PAL[3]).attr('stroke-opacity', .32).attr('stroke-width', wid(o[M])).attr('stroke-linecap', 'round');
      if (animate) { const L = a.node().getTotalLength(); a.attr('stroke-dasharray', L + ' ' + L).attr('stroke-dashoffset', L).transition().duration(1000).delay(150).attr('stroke-dashoffset', 0).on('end', () => a.attr('stroke-dasharray', null)); }
    }
    const dots = svg.append('g').selectAll('circle').data(placed).join('circle').attr('class', 'store')
      .attr('cx', (o) => proj(o.ll)[0]).attr('cy', (o) => proj(o.ll)[1]).attr('r', (o) => rad(o[M]))
      .attr('fill', PAL[3]).attr('fill-opacity', .82).attr('stroke', '#fff').attr('stroke-width', 1.6)
      .on('mousemove', (ev, o) => {
        if (M === 'q') { tipAt(box, tip, ev, [el('span', 'd', o.store), tline(fmtInt(o.q) + ' units on hand now'), tline(fmtR(o.c) + ' at cost'), tline('Click to see its SKUs')]); return; }
        const ld = o.leads.slice().sort((a, b) => a - b);
        tipAt(box, tip, ev, [el('span', 'd', o.store), tline(fmtInt(o.n) + ' IBTs · ' + fmtInt(o.u) + ' units'), tline(fmtR(o.c) + ' at cost'), tline(ld.length ? 'Median ' + ld[Math.floor((ld.length - 1) / 2)] + ' days to receive' : 'Not received yet'), tline('Click to see its IBTs')]);
      })
      .on('mouseleave', () => { tip.hidden = true; })
      .on('click', (ev, o) => openStore(o.store));
    if (animate) dots.attr('r', 0).transition().duration(600).delay((o, i) => 300 + i * 25).attr('r', (o) => rad(o[M]));
    const lbl = ui.smView === 'za' ? placed.slice(0, 6) : placed;
    svg.append('g').selectAll('text').data(lbl).join('text').attr('class', 'lbl').attr('x', (o) => proj(o.ll)[0] + rad(o[M]) + 4).attr('y', (o) => proj(o.ll)[1] + 3).text((o) => short(o.store));
    const hqg = svg.append('g').attr('transform', `translate(${hq[0]},${hq[1]})`);
    hqg.append('rect').attr('x', -7).attr('y', -7).attr('width', 14).attr('height', 14).attr('rx', 3).attr('transform', 'rotate(45)').attr('fill', PAL[0]).attr('stroke', '#fff').attr('stroke-width', 2);
    hqg.append('text').attr('class', 'lbl').attr('x', 12).attr('y', 4).style('font-weight', 600).style('fill', PAL[0]).text('HQ');
    const missing = rows.filter((o) => !o.ll).map((o) => o.store);
    if (missing.length) document.getElementById('sm-sub').textContent += ' Not on the map (no location yet): ' + missing.join(', ') + '.';
  }

  // Courier province map: shaded by province, with zoom and pan, store dots (HQ-to-store Aramex dispatches), a detail panel for the
  // selected provinces, and a month-by-month animation. State that must survive a redraw lives in PM and ui (pmMetric, pmDots, pmMonth).
  const PM = { t: d3.zoomIdentity, target: null, W: 0, focus: false, timer: null, months: [], prev: new Map(), prevR: new Map() };
  const monthName = (m) => d3.utcFormat('%b %Y')(new Date(Date.UTC(2022, m, 1)));
  function pmStop() { if (PM.timer) { clearInterval(PM.timer); PM.timer = null; } }
  function pmWireControls() {
    const play = document.getElementById('pm-play'), sl = document.getElementById('pm-slider'), whole = document.getElementById('pm-whole');
    if (!play || play.dataset.wired) return;
    play.dataset.wired = '1';
    const step = () => {
      const box = document.getElementById('prov-map');
      if (!box || !box.offsetParent) { pmStop(); drawProvMap(); return; }   // tab hidden: stop
      const i = PM.months.indexOf(ui.pmMonth);
      if (i < 0 || i >= PM.months.length - 1) { pmStop(); drawProvMap(true); return; }
      ui.pmMonth = PM.months[i + 1]; drawProvMap(true);
    };
    play.addEventListener('click', () => {
      if (PM.timer) { pmStop(); drawProvMap(); return; }
      if (!PM.months.length) return;
      const i = PM.months.indexOf(ui.pmMonth);
      if (i < 0 || i >= PM.months.length - 1) ui.pmMonth = PM.months[0];
      PM.timer = setInterval(step, 1100); drawProvMap(true);
    });
    sl.addEventListener('input', () => { pmStop(); ui.pmMonth = PM.months[+sl.value]; drawProvMap(true); });
    whole.addEventListener('click', () => { pmStop(); ui.pmMonth = null; drawProvMap(true); });
  }

  function drawProvMap(anim) {
    const box = document.getElementById('prov-map'); if (!box) return;
    ui.pmMetric = ui.pmMetric || 'amt'; if (ui.pmDots == null) ui.pmDots = true;
    segSync('pm-metric', 'm', ui.pmMetric, (v) => { ui.pmMetric = v; F.drawAll(); });
    const cd = dash.data('courier_daily');
    if (cd.status !== 'ok') return;
    const cm = ui.cm, cats = ui.ccat || [], provs = ui.cprov || [], M = ui.pmMetric;
    const inP = (m) => !cm || (m >= Math.min(cm.from, cm.to) && m <= Math.max(cm.from, cm.to));
    const base = cd.data.filter((r) => !cats.length || cats.includes(r.cat));
    const zero = () => ({ amt: 0, n: 0, on: 0, late: 0 }), add = (a, b) => ({ amt: a.amt + b.amt, n: a.n + b.n, on: a.on + b.on, late: a.late + b.late });
    const byMonth = d3.rollup(base, (v) => ({ amt: d3.sum(v, (r) => r.amt), n: d3.sum(v, (r) => r.n), on: d3.sum(v, (r) => r.on), late: d3.sum(v, (r) => r.late) }), (r) => moOf(r.d), (r) => r.prov);
    const months = [...new Set(cd.data.map((r) => moOf(r.d)))].filter(inP).sort((a, b) => a - b);
    PM.months = months;
    if (ui.pmMonth != null && !months.includes(ui.pmMonth)) { ui.pmMonth = null; pmStop(); }
    const curMonths = ui.pmMonth != null ? [ui.pmMonth] : months, curSet = new Set(curMonths);
    const provAgg = (ms) => { const out = new Map(); for (const m of ms) for (const [p, o] of (byMonth.get(m) || [])) out.set(p, add(out.get(p) || zero(), o)); return out; };
    const cur = provAgg(curMonths);
    const val = (o) => (M === 'on' ? (o.on + o.late ? o.on / (o.on + o.late) : null) : M === 'per' ? (o.n ? o.amt / o.n : 0) : o[M]);
    const by = [...cur].map(([k, o]) => ({ prov: k, ...o, per: o.n ? o.amt / o.n : 0, onr: o.on + o.late ? o.on / (o.on + o.late) : null }));
    const fmtV = (v) => (v == null ? '—' : M === 'amt' ? fmtRC(v) : M === 'per' ? fmtR(v) : M === 'on' ? pct1(v) : fmtInt(v));
    const tA = d3.sum(by, (o) => o.amt), tN = d3.sum(by, (o) => o.n), tOn = d3.sum(by, (o) => o.on), tL = d3.sum(by, (o) => o.late);
    const when = ui.pmMonth != null ? monthName(ui.pmMonth) : 'the period above';
    document.getElementById('pm-total').textContent = M === 'amt' ? fmtRC(tA) : M === 'n' ? fmtInt(tN) : M === 'per' ? fmtR(tN ? tA / tN : 0) : tOn + tL ? pct1(tOn / (tOn + tL)) : '—';
    document.getElementById('pm-sub').textContent = (M === 'amt' ? 'Aramex spend' : M === 'n' ? 'Waybills' : M === 'per' ? 'Average cost per waybill' : 'Delivered on time') +
      ' by destination province, ' + (ui.pmMonth != null ? 'for ' + when : 'for the period and shipment types above') + '. Click a province to select it and filter the tab.';
    const listed = by.filter((o) => val(o) != null).sort((a, b) => (val(b) || 0) - (val(a) || 0));
    const toggleProv = (k) => { ui.cprov = (ui.cprov || []).includes(k) ? ui.cprov.filter((p) => p !== k) : [...(ui.cprov || []), k]; PM.focus = true; F.drawAll(); };
    bars('pm-list', listed.slice(0, 10).map((o) => ({ key: o.prov, label: o.prov, value: val(o) || 0, text: fmtV(val(o)) + (M === 'amt' || M === 'n' ? ' · ' + pct((M === 'amt' ? o.amt / (tA || 1) : o.n / (tN || 1))) : '') })),
      { selected: provs, color: M === 'per' ? PAL[3] : PAL[1], onClick: (r) => toggleProv(r.key) });

    // animation controls (outside the map so a drag on the slider isn't interrupted by a redraw)
    pmWireControls();
    const sl = document.getElementById('pm-slider'), pl = document.getElementById('pm-play'), ml = document.getElementById('pm-mlabel'), wh = document.getElementById('pm-whole'), anEl = document.getElementById('pm-anim');
    if (sl) {
      anEl.hidden = months.length < 2;
      sl.max = String(Math.max(0, months.length - 1)); sl.value = String(ui.pmMonth != null ? months.indexOf(ui.pmMonth) : months.length - 1);
      anEl.classList.toggle('idle', ui.pmMonth == null);
      pl.textContent = PM.timer ? '❚❚' : '▶'; pl.title = PM.timer ? 'Pause' : 'Play through the months'; pl.setAttribute('aria-label', pl.title);
      ml.textContent = ui.pmMonth != null ? monthName(ui.pmMonth) : months.length ? monthName(months[0]) + ' – ' + monthName(months[months.length - 1]) : '';
      wh.hidden = ui.pmMonth == null;
    }

    const G = geo();
    if (!G) { box.replaceChildren(el('p', 'fm-note', 'Loading the map…')); return; }
    const W = Math.max(320, box.clientWidth), H = Math.round(Math.max(360, Math.min(500, W * 0.68)));
    if (PM.W !== W) { PM.t = d3.zoomIdentity; PM.W = W; }
    const proj = d3.geoMercator().fitExtent([[18, 18], [W - 18, H - 30]], G), path = d3.geoPath(proj);
    const bp = new Map(by.map((o) => [o.prov, o])), inG = (p) => G.features.some((f) => f.properties.name === p);
    // colours: while stepping through months, fix the scale across all of them so a darker province really is a bigger number
    const scaleVals = ui.pmMonth != null ? months.flatMap((m) => [...(byMonth.get(m) || [])].filter(([p]) => inG(p)).map(([, o]) => val(o))) : by.filter((o) => inG(o.prov)).map(val);
    const vals = scaleVals.filter((v) => v != null);
    const lo = M === 'on' ? d3.min(vals) || 0 : 0, hi = d3.max(vals) || 1;
    const ramp = M === 'per' ? ['#efeafb', '#8a63d8'] : M === 'on' ? ['#f6c1cc', '#59c4bc'] : ['#dff3f1', '#1f9e96'];
    const color = d3.scaleSequential([lo, hi], d3.interpolateRgb(ramp[0], ramp[1]));
    const fillOf = (p) => { const o = bp.get(p); return o && val(o) != null ? color(val(o)) : '#dde2e8'; };

    // store dots: HQ-to-store Aramex dispatches in the same months (only when IBT shipments are in the shipment-type filter)
    const dsp = dash.data('courier_dispatch');
    const dotsOk = dsp.status === 'ok' && (!cats.length || cats.includes('IBT: HQ to store'));
    const stores = [];
    if (dotsOk) {
      const sm = d3.rollup(dsp.data.filter((x) => curSet.has(moOf(x.d))), (v) => ({ amt: d3.sum(v, (x) => x.amt), n: d3.sum(v, (x) => x.awbs) }), (x) => x.store);
      for (const [name, o] of sm) {
        const ll = storeLL(name); if (!ll) continue;
        const f = G.features.find((ft) => d3.geoContains(ft, ll));
        stores.push({ store: name, ll, prov: f ? f.properties.name : null, amt: o.amt, n: o.n, per: o.n ? o.amt / o.n : 0 });
      }
    }
    const sv = (s) => (M === 'amt' ? s.amt : M === 'per' ? s.per : s.n);
    const smax = d3.max(stores, sv) || 1, rad = d3.scaleSqrt([0, smax], [3, 11]);

    // detail panel for the selected provinces
    const det = document.getElementById('pm-detail');
    if (det) {
      if (!provs.length) { det.hidden = true; det.replaceChildren(); }
      else {
        const sel = provs.map((p) => cur.get(p)).filter(Boolean);
        const A = d3.sum(sel, (o) => o.amt), N = d3.sum(sel, (o) => o.n), On = d3.sum(sel, (o) => o.on), L = d3.sum(sel, (o) => o.late);
        const hd = el('div', 'hd'), clr = el('button', null, 'Clear selection'); clr.type = 'button';
        clr.addEventListener('click', () => { ui.cprov = []; PM.focus = true; F.drawAll(); });
        hd.append(el('b', null, provs.join(' · ')), clr);
        const st = el('div', 'st');
        for (const [v, l] of [[fmtRC(A), 'spend'], [fmtInt(N), 'waybills'], [N ? fmtR(A / N) : '—', 'per waybill'], [On + L ? pct1(On / (On + L)) : '—', 'on time · ' + fmtInt(L) + ' late']]) { const d = el('div'); d.append(el('b', null, v), el('span', null, l)); st.append(d); }
        const parts = [hd, el('p', 'fm-note', (ui.pmMonth != null ? monthName(ui.pmMonth) : 'Period above') + (N ? '' : ': no waybills to this province.')), st];
        const catRows = d3.rollups(base.filter((r) => provs.includes(r.prov) && curSet.has(moOf(r.d))), (v) => d3.sum(v, (r) => r.amt), (r) => r.cat).sort((a, b) => b[1] - a[1]);
        if (catRows.length) { const c = el('div', 'fm-bars'); c.id = 'pm-det-cats'; parts.push(el('p', 'sub', 'By shipment type'), c); }
        const trend = months.map((m) => d3.sum(provs, (p) => (byMonth.get(m) && byMonth.get(m).get(p) ? byMonth.get(m).get(p).amt : 0)));
        let spark = null;
        if (months.length > 1 && d3.max(trend) > 0) {
          const sw = 230, sh = 46, x = d3.scaleLinear([0, months.length - 1], [4, sw - 4]), y = d3.scaleLinear([0, d3.max(trend)], [sh - 4, 4]);
          const s = d3.create('svg').attr('viewBox', `0 0 ${sw} ${sh}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Monthly spend to the selected provinces');
          s.append('path').attr('d', d3.line().x((d, i) => x(i)).y((d) => y(d))(trend)).attr('fill', 'none').attr('stroke', PAL[1]).attr('stroke-width', 1.8);
          const ci = months.indexOf(ui.pmMonth); if (ci >= 0) s.append('circle').attr('cx', x(ci)).attr('cy', y(trend[ci])).attr('r', 3.5).attr('fill', PAL[0]).attr('stroke', '#fff').attr('stroke-width', 1.5);
          spark = el('div', 'spark'); spark.append(s.node()); parts.push(el('p', 'sub', 'Monthly spend'), spark);
        }
        const here = stores.filter((s) => s.prov && provs.includes(s.prov)).sort((a, b) => b.amt - a.amt);
        if (here.length) { const c = el('div', 'fm-bars'); c.id = 'pm-det-stores'; parts.push(el('p', 'sub', 'Stores receiving stock from HQ'), c); }
        det.replaceChildren(...parts); det.hidden = false;
        if (catRows.length) bars('pm-det-cats', catRows.slice(0, 5).map(([k, v]) => ({ key: k, label: k, value: v, text: fmtRC(v) + ' · ' + pct(v / (A || 1)) })), { color: PAL[1] });
        if (here.length) bars('pm-det-stores', here.slice(0, 6).map((s) => ({ key: s.store, label: short(s.store), value: s.amt, text: fmtRC(s.amt) + ' · ' + fmtInt(s.n) + ' waybills' })), { color: PAL[3], drill: (r) => window.fmDrill.store({ key: r.key }) });
      }
    }

    // zoom to the selection when it changes
    const boundsOf = (names) => {
      const fs = G.features.filter((f) => names.includes(f.properties.name)); if (!fs.length) return d3.zoomIdentity;
      const [[x0, y0], [x1, y1]] = path.bounds({ type: 'FeatureCollection', features: fs });
      const k = Math.max(1, Math.min(8, 0.78 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
      return d3.zoomIdentity.translate(W / 2 - (k * (x0 + x1)) / 2, H / 2 - (k * (y0 + y1)) / 2).scale(k);
    };
    // the target outlives a redraw: if the page redraws again before the zoom finishes, the new svg carries on towards it
    if (PM.focus) { PM.focus = false; PM.target = boundsOf(provs); }
    const zoomTo = PM.target || null;

    box.classList.toggle('hassel', provs.length > 0);
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Map of South Africa shaded by courier ' + (M === 'amt' ? 'spend' : M === 'n' ? 'waybills' : M === 'per' ? 'cost per waybill' : 'on-time rate'));
    const tip = el('div', 'fm-tip'); tip.hidden = true;
    const lg = el('div', 'legend'), bar = el('i'); bar.style.background = 'linear-gradient(90deg,' + ramp[0] + ',' + ramp[1] + ')'; lg.append(el('span', null, fmtV(lo)), bar, el('span', null, fmtV(hi)));
    const zc = el('div', 'zoom');
    const zb = (txt, title) => { const b = el('button', null, txt); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); zc.append(b); return b; };
    const zin = zb('+', 'Zoom in'), zout = zb('–', 'Zoom out'), zreset = zb('⟲', 'Reset the map');
    const chip = el('button', 'chip', 'Stores'); chip.type = 'button'; chip.title = dotsOk ? 'Show or hide the store dots' : 'Store dots need “IBT: HQ to store” in the shipment types';
    chip.setAttribute('aria-pressed', String(!!ui.pmDots && dotsOk)); chip.disabled = !dotsOk;
    chip.addEventListener('click', () => { ui.pmDots = !ui.pmDots; drawProvMap(); });
    box.replaceChildren(svg.node(), zc, chip, lg, tip);

    const vp = svg.append('g').attr('class', 'vp');
    const dur = anim ? 520 : 0, selOn = (f) => provs.includes(f.properties.name);
    const paths = vp.append('g').selectAll('path').data(G.features).join('path').attr('d', path)
      .attr('class', (f) => 'prov click' + (selOn(f) ? ' sel' : '')).attr('tabindex', 0).attr('role', 'button').attr('aria-pressed', (f) => String(selOn(f)))
      .attr('aria-label', (f) => f.properties.name + ': ' + fmtV(bp.get(f.properties.name) ? val(bp.get(f.properties.name)) : null))
      .attr('fill', (f) => (anim && PM.prev.has(f.properties.name) ? PM.prev.get(f.properties.name) : fillOf(f.properties.name)))
      .on('mousemove', (ev, f) => {
        const o = bp.get(f.properties.name);
        tipAt(box, tip, ev, [el('span', 'd', f.properties.name), ...(o ? [tline(fmtR(o.amt) + ' spend · ' + fmtInt(o.n) + ' waybills'), tline(fmtR(o.per) + ' per waybill'), tline((o.onr == null ? '—' : pct1(o.onr)) + ' on time · ' + fmtInt(o.late) + ' late'), tline(selOn(f) ? 'Click to clear' : 'Click to select and zoom')] : [tline('No waybills')])]);
      })
      .on('mouseleave', () => { tip.hidden = true; })
      .on('click', (ev, f) => toggleProv(f.properties.name))
      .on('keydown', (ev, f) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleProv(f.properties.name); } });
    if (dur) paths.transition().duration(dur).attr('fill', (f) => fillOf(f.properties.name)); else paths.attr('fill', (f) => fillOf(f.properties.name));
    PM.prev = new Map(G.features.map((f) => [f.properties.name, fillOf(f.properties.name)]));

    const provLbl = vp.append('g').selectAll('text').data(G.features.filter((f) => bp.get(f.properties.name))).join('text').attr('class', 'lbl').attr('text-anchor', 'middle')
      .attr('x', (f) => path.centroid(f)[0]).attr('y', (f) => path.centroid(f)[1]).text((f) => fmtV(val(bp.get(f.properties.name))));

    const shown = ui.pmDots && dotsOk ? stores : [];
    const dots = vp.append('g').selectAll('circle').data(shown).join('circle').attr('class', 'store').attr('cx', (s) => proj(s.ll)[0]).attr('cy', (s) => proj(s.ll)[1])
      .attr('fill', PAL[3]).attr('fill-opacity', .85).attr('stroke', '#fff').attr('stroke-width', 1.4)
      .on('mousemove', (ev, s) => tipAt(box, tip, ev, [el('span', 'd', s.store), tline(fmtInt(s.n) + ' waybills from HQ · ' + fmtR(s.amt)), tline(fmtR(s.per) + ' per waybill'), tline('Click to see its IBTs')]))
      .on('mouseleave', () => { tip.hidden = true; })
      .on('click', (ev, s) => window.fmDrill.store({ key: s.store }));
    const names = vp.append('g').selectAll('text').data(shown).join('text').attr('class', 'lbl nm').text((s) => short(s.store));
    const hq = proj(HQ_LL);
    const hqg = vp.append('g'), hqm = hqg.append('rect').attr('x', -6).attr('y', -6).attr('width', 12).attr('height', 12).attr('rx', 3).attr('transform', 'rotate(45)').attr('fill', PAL[0]).attr('stroke', '#fff').attr('stroke-width', 2);
    hqg.append('text').attr('class', 'lbl').attr('x', 11).attr('y', 4).style('font-weight', 600).style('fill', PAL[0]).text('HQ');

    // zoom and pan; dots, labels and the HQ marker keep their on-screen size while the map scales
    const apply = (t) => {
      PM.t = t; const k = t.k; vp.attr('transform', t.toString());
      const rb = (s) => (s.rb != null ? s.rb : rad(sv(s)));
      dots.attr('r', (s) => rb(s) / k);
      provLbl.style('font-size', 10 / k + 'px');
      // store names: biggest first, and only where they don't run into a name already placed
      const taken = [], vis = new Set();
      if (k >= 2) for (const s of shown.slice().sort((a, b) => sv(b) - sv(a))) {
        const [px, py] = t.apply(proj(s.ll)); if (px < 0 || px > W || py < 0 || py > H) continue;
        const bx = [px + rb(s) + 3, py - 7, px + rb(s) + 3 + 6 * short(s.store).length + 6, py + 7];
        if (taken.some((b) => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1])) continue;
        taken.push(bx); vis.add(s);
      }
      names.style('font-size', 10 / k + 'px').attr('x', (s) => proj(s.ll)[0] + (rb(s) + 4) / k).attr('y', (s) => proj(s.ll)[1] + 3 / k).style('display', (s) => (vis.has(s) ? null : 'none'));
      hqg.attr('transform', `translate(${hq[0]},${hq[1]}) scale(${1 / k})`);
      hqg.select('text').style('font-size', '10px');
    };
    const zoom = d3.zoom().scaleExtent([1, 12]).extent([[0, 0], [W, H]]).translateExtent([[0, 0], [W, H]])
      .filter((ev) => (ev.type === 'wheel' ? ev.ctrlKey || ev.metaKey : !ev.button && ev.type !== 'dblclick'))
      .on('zoom', (ev) => { tip.hidden = true; if (ev.sourceEvent) PM.target = null; apply(ev.transform); });
    svg.call(zoom); svg.node().__zoom = PM.t;
    dots.each((s) => { s.rb = null; });
    if (anim) {
      dots.each(function (s) { s.rb = PM.prevR.has(s.store) ? PM.prevR.get(s.store) : 0; });
      dots.transition().duration(dur).tween('rb', function (s) { const i = d3.interpolateNumber(s.rb, rad(sv(s))); return (t) => { s.rb = i(t); d3.select(this).attr('r', s.rb / PM.t.k); }; }).on('end', (s) => { s.rb = null; });
    }
    PM.prevR = new Map(shown.map((s) => [s.store, rad(sv(s))]));
    apply(PM.t);
    if (zoomTo) svg.transition().duration(650).call(zoom.transform, zoomTo).on('end', () => { if (PM.target === zoomTo) PM.target = null; });
    const zoomBy = (f) => {   // scale about the middle of the map, keeping the map inside the frame
      const t = PM.t, k1 = Math.max(1, Math.min(12, t.k * f)), c = [W / 2, H / 2], p = t.invert(c);
      const nt = d3.zoomIdentity.translate(Math.min(0, Math.max(W * (1 - k1), c[0] - p[0] * k1)), Math.min(0, Math.max(H * (1 - k1), c[1] - p[1] * k1))).scale(k1);
      svg.transition().duration(300).call(zoom.transform, nt);
    };
    zin.addEventListener('click', () => zoomBy(1.6));
    zout.addEventListener('click', () => zoomBy(1 / 1.6));
    zreset.addEventListener('click', () => svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity));
  }

  // ---------- Store stock (from the Inventory Movement Summary: every location's on hand now, in and out this year) ----------
  const GAP_MIN = 3;   // a gap = the store has none now, moved at least this many this year, and HQ has stock
  const storeNames = (x) => new Set(x.D.ibt.data.filter((r) => r.pclass === 'store' && r.partner).map((r) => r.partner));
  const C_STORE = [{ k: 'q', label: 'On hand here', n: true, sum: true }, { k: 'sv', label: 'Value here', n: true, sum: true, f: (v) => fmtR(v) },
    { k: 'i', label: 'In this year', n: true, sum: true }, { k: 'o', label: 'Out this year', n: true, sum: true }, { k: 'hq', label: 'At HQ now', n: true, sum: true }];
  function storeStockCard(loc, title, test) {
    const x = X(), ds = dash.data('store_stock'); if (ds.status !== 'ok') return null;
    const rows = ds.data.filter((r) => r.l === loc && x.skuOk[r.s] && (!test || test(r)))
      .map((r) => ({ ...skuInfo(x.skus[r.s]), q: r.q, i: r.i, o: r.o, sv: Math.max(0, r.v), hq: Math.max(0, x.skus[r.s].oh || 0) }));
    return {
      title: title || loc, sub: 'Stock at this location now and what moved this year' + filt(),
      kpis: [[fmtInt(d3.sum(rows, (r) => Math.max(0, r.q))), 'units on hand here'], [fmtRC(d3.sum(rows, (r) => r.sv)), 'at cost'], [fmtInt(rows.filter((r) => r.q > 0).length), 'SKUs in stock'],
        [fmtInt(d3.sum(rows, (r) => r.o)), 'out this year'], [fmtInt(rows.filter((r) => r.q <= 0 && r.o >= GAP_MIN && r.hq > 0).length), 'gaps HQ can fill']],
      cols: [...C_SKU, ...C_STORE], rows, sort: { k: 'q', dir: -1 }, onRow: toSku,
    };
  }
  function drawStores(x) {
    const ds = dash.data('store_stock'), note = document.getElementById('ss-note');
    if (ds.status !== 'ok') { document.getElementById('ss-kpis').replaceChildren(el('div', null, ds.status === 'error' ? 'The store stock data failed to load.' : 'Loading store stock…')); return; }
    ui.ssGroup = ui.ssGroup || 'store';
    segSync('ss-group', 'g', ui.ssGroup, (v) => { ui.ssGroup = v; F.drawAll(); });
    const p = P(), sset = storeNames(x), isStore = (l) => sset.has(l), weeks = Math.max(1, (x.END + 1) / 7);
    const hqOh = (s) => Math.max(0, x.skus[s].oh || 0);
    const rows = ds.data.filter((r) => x.skuOk[r.s] && (!p.stores.length || p.stores.includes(r.l)));
    const L = new Map(), dep = new Map(), heat = new Map();
    for (const r of rows) {
      let o = L.get(r.l); if (!o) { o = { l: r.l, q: 0, v: 0, i: 0, o: 0, sc: new Set(), gaps: 0, gapHq: 0 }; L.set(r.l, o); }
      o.i += r.i; o.o += r.o;
      if (r.q > 0) {
        o.q += r.q; o.v += Math.max(0, r.v); o.sc.add(x.skus[r.s].sc);
        if (isStore(r.l)) { const d = x.skus[r.s].dep; dep.set(d, (dep.get(d) || 0) + Math.max(0, r.v)); const k = r.l + '|' + d; heat.set(k, (heat.get(k) || 0) + r.q); }
      }
      if (r.q <= 0 && r.o >= GAP_MIN && hqOh(r.s) > 0) { o.gaps++; o.gapHq += hqOh(r.s); }
    }
    const all = [...L.values()], st = all.filter((o) => isStore(o.l)), ot = all.filter((o) => !isStore(o.l));
    const S = (a, f) => d3.sum(a, f), sQ = S(st, (o) => o.q), sV = S(st, (o) => o.v), sO = S(st, (o) => o.o);
    const hqV = d3.sum(x.sohRows, (s) => (s.svc ? 0 : Math.max(0, s.val || 0)));
    note.textContent = 'From Cin7’s daily Inventory Movement Summary (' + (x.rep.summary_asof || 'latest') + '): stock on hand at every location now, and what came in and went out this year. Follows the product and store filters; the date filter doesn’t apply.';
    const kp = [[fmtInt(sQ), 'units in stores', fmtInt(st.filter((o) => o.q > 0).length) + ' stores with stock'], [fmtRC(sV), 'store stock at cost', pct(sV / ((sV + hqV) || 1)) + ' of stock value is in stores'],
      [sO ? d3.format('.1f')(sQ / (sO / weeks)) : '—', 'weeks of cover in stores', fmtInt(sO / weeks) + ' units out a week'], [fmtInt(S(st, (o) => o.gaps)), 'gaps HQ can fill', 'sold 3+ this year, none at the store, in stock at HQ'],
      [fmtRC(S(ot, (o) => o.v)), 'at other locations', 'production, rejects, marketplace and more']];
    document.getElementById('ss-kpis').replaceChildren(...kp.map(([v, l, s]) => { const d = el('div'); d.append(el('span', null, l), el('b', null, v), el('em', null, s)); return d; }));
    const list = (ui.ssGroup === 'store' ? st : ot).sort((a, b) => b.v - a.v);
    setRows('ss-stores', list.map((o) => {
      const tr = el('tr'), wk = o.o ? o.q / (o.o / weeks) : null, cv = td(wk == null ? '—' : wk >= 99 ? '99+' : d3.format('.1f')(wk), 'n');
      if (wk != null && wk < 4 && isStore(o.l)) cv.classList.add('fm-bad');
      const gp = td(o.gaps ? fmtInt(o.gaps) : '—', 'n'); if (o.gaps >= 25) gp.classList.add('fm-bad');
      tr.append(td(o.l), td(fmtInt(o.q), 'n'), td(fmtR(o.v), 'n'), td(fmtInt(o.sc.size), 'n'), td(fmtInt(o.i), 'n'), td(fmtInt(o.o), 'n'), td(o.i ? pct(o.o / o.i) : '—', 'n'), cv, gp);
      return clickRow(tr, go(() => storeStockCard(o.l)), p.stores.includes(o.l));
    }), 'No stock at these locations for these filters.');
    const hqDep = d3.rollup(x.sohRows.filter((s) => !s.svc), (v) => d3.sum(v, (s) => Math.max(0, s.val || 0)), (s) => s.dep);
    bars('ss-dept', [...dep].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => ({ key: k, label: k, value: v, text: fmtRC(v) + ' · ' + pct(v / ((v + (hqDep.get(k) || 0)) || 1)) + ' in stores' })),
      { selected: p.deps, color: PAL[3], onClick: (r) => F.toggle('deps', r.key), drill: go((r) => {
        const m = new Map();
        for (const q of rows) { if (!isStore(q.l) || q.q <= 0 || x.skus[q.s].dep !== r.key) continue; const o = m.get(q.s) || { q: 0, n: 0, v: 0 }; o.q += q.q; o.n++; o.v += Math.max(0, q.v); m.set(q.s, o); }
        const rs = [...m].map(([s, o]) => ({ ...skuInfo(x.skus[s]), sq: o.q, sn: o.n, sv: o.v, hq: Math.max(0, x.skus[s].oh || 0) }));
        return { title: 'In stores: ' + r.key, sub: 'Stock on hand in stores now' + filt(), kpis: [[fmtInt(rs.length), 'SKUs'], [fmtInt(d3.sum(rs, (o) => o.sq)), 'units in stores'], [fmtRC(d3.sum(rs, (o) => o.sv)), 'at cost']],
          cols: [...C_SKU, { k: 'sq', label: 'Units in stores', n: true, sum: true }, { k: 'sn', label: 'Stores', n: true }, { k: 'sv', label: 'Value', n: true, sum: true, f: (v) => fmtR(v) }, { k: 'hq', label: 'At HQ now', n: true, sum: true }],
          rows: rs, sort: { k: 'sq', dir: -1 }, onRow: toSku };
      }) });
    const gl = st.filter((o) => o.gaps > 0).sort((a, b) => b.gaps - a.gaps);
    bars('ss-gaps', gl.slice(0, 15).map((o) => ({ key: o.l, label: short(o.l), value: o.gaps, text: fmtInt(o.gaps) + ' SKUs · HQ holds ' + fmtInt(o.gapHq) + ' units' })),
      { color: 'var(--wait)', drill: go((r) => storeStockCard(r.key, 'Gaps HQ can fill: ' + r.key, (q) => q.q <= 0 && q.o >= GAP_MIN && hqOh(q.s) > 0)), empty: 'No gaps: every store has the SKUs it has been selling, or HQ has none.' });
    // store x department heat
    const depTot = new Map(), stTot = new Map();
    for (const [k, v] of heat) { const [l, d] = k.split('|'); depTot.set(d, (depTot.get(d) || 0) + v); stTot.set(l, (stTot.get(l) || 0) + v); }
    const hDeps = [...depTot].sort((a, b) => b[1] - a[1]).slice(0, 8).map((d) => d[0]), hSt = [...stTot].sort((a, b) => b[1] - a[1]).slice(0, 40).map((d) => d[0]);
    const hmax = d3.max(hSt.flatMap((l) => hDeps.map((d) => heat.get(l + '|' + d) || 0))) || 1;
    const hh = el('tr'); hh.append(el('th', null, 'Store'), ...hDeps.map((d) => el('th', 'n', d)), el('th', 'n', 'Total'));
    document.querySelector('#ss-heat thead').replaceChildren(hh);
    setRows('ss-heat', hSt.map((l) => {
      const tr = el('tr'); tr.append(td(short(l)));
      for (const d of hDeps) {
        const v = heat.get(l + '|' + d) || 0, c = td(v ? fmtInt(v) : '·', 'n');
        if (v) {
          c.style.background = 'color-mix(in srgb, var(--purple) ' + Math.round(6 + 60 * (v / hmax)) + '%, transparent)'; if (v / hmax > .6) c.style.color = '#fff';
          c.style.cursor = 'pointer'; c.addEventListener('click', go(() => storeStockCard(l, short(l) + ' · ' + d, (q) => q.q > 0 && x.skus[q.s].dep === d)));
        }
        tr.append(c);
      }
      tr.append(td(fmtInt(stTot.get(l)), 'n'));
      return tr;
    }), 'No store stock for these filters.');
  }

  // ---------- Courier: one map per Aramex billing account ----------
  // IBT account: receiving sites as dots, with lines from where the stock was sent. 250 account (door to door):
  // provinces shaded by where the waybills went. Both follow the courier months above; the account is the split, so the type chips don't apply.
  function acctMap(box, G, { pv, dots = [], flows = [], hq = false, fmtM, unit, label }) {
    const W = Math.max(280, box.clientWidth), H = Math.round(Math.max(300, Math.min(440, W * 0.78)));
    const proj = d3.geoMercator().fitExtent([[12, 12], [W - 12, H - 12]], G), path = d3.geoPath(proj);
    const shade = d3.scaleSequential([0, d3.max([...pv.values()]) || 1], d3.interpolateRgb('#dff3f1', '#1a6f69'));
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', label);
    const tip = el('div', 'fm-tip'); tip.hidden = true;
    box.replaceChildren(svg.node(), tip);
    const tot = d3.sum([...pv.values()]) || 1;
    svg.append('g').selectAll('path').data(G.features).join('path').attr('class', 'prov').attr('d', path)
      .attr('fill', (f) => (pv.get(f.properties.name) ? shade(pv.get(f.properties.name)) : '#dde2e8'))
      .on('mousemove', (ev, f) => { const v = pv.get(f.properties.name) || 0; tipAt(box, tip, ev, [el('span', 'd', f.properties.name), tline(fmtM(v) + unit + ' delivered here'), tline(pct(v / tot) + ' of the account')]); })
      .on('mouseleave', () => { tip.hidden = true; });
    const mx = d3.max(dots, (o) => o.v) || 1, rad = d3.scaleSqrt([0, mx], [2.5, 13]), wid = d3.scaleLinear([0, d3.max(flows, (o) => o.v) || 1], [0.5, 3.5]);
    const fg = svg.append('g').attr('fill', 'none');
    for (const o of flows) {
      const a = proj(o.a), b = proj(o.b), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22;
      fg.append('path').attr('d', `M${a[0]},${a[1]}Q${cx},${cy} ${b[0]},${b[1]}`).attr('stroke', PAL[3]).attr('stroke-opacity', .3).attr('stroke-width', wid(o.v)).attr('stroke-linecap', 'round');
    }
    svg.append('g').selectAll('circle').data(dots).join('circle').attr('class', 'store')
      .attr('cx', (o) => proj(o.ll)[0]).attr('cy', (o) => proj(o.ll)[1]).attr('r', (o) => rad(o.v))
      .attr('fill', (o) => (o.hq ? PAL[0] : PAL[3])).attr('fill-opacity', .85).attr('stroke', '#fff').attr('stroke-width', 1.4)
      .on('mousemove', (ev, o) => tipAt(box, tip, ev, o.tip))
      .on('mouseleave', () => { tip.hidden = true; });
    // label the biggest dots, skipping any that would sit on top of a label already placed (Gauteng's stores are close together)
    const placed = [];
    for (const o of dots.slice().sort((a, b) => b.v - a.v)) {
      if (placed.length >= 6) break;
      const [x, y] = proj(o.ll); if (o.hq || placed.some(([px, py]) => Math.abs(px - x) < 70 && Math.abs(py - y) < 14)) continue;
      placed.push([x, y]); svg.append('text').attr('class', 'lbl nm').attr('x', x + rad(o.v) + 3).attr('y', y + 3).text(o.name);
    }
    if (hq) {
      const p = proj(HQ_LL), g = svg.append('g').attr('transform', `translate(${p[0]},${p[1]})`);
      g.append('rect').attr('x', -6).attr('y', -6).attr('width', 12).attr('height', 12).attr('rx', 2).attr('transform', 'rotate(45)').attr('fill', PAL[0]).attr('stroke', '#fff').attr('stroke-width', 2);
      g.append('text').attr('class', 'lbl nm').attr('x', 10).attr('y', 14).style('font-weight', 600).text('HQ');
    }
  }
  function drawAcctMaps() {
    const card = document.getElementById('cr-acct-card'); if (!card) return;
    ui.amMetric = ui.amMetric || 'amt';
    segSync('am-metric', 'm', ui.amMetric, (v) => { ui.amMetric = v; F.drawAll(); });
    const cd = dash.data('courier_daily'), ci = dash.data('courier_ibt'), G = geo();
    if (cd.status !== 'ok' || ci.status !== 'ok' || !G) return;
    if (!cd.data.some((r) => r.acct)) { document.getElementById('am-note').textContent = 'The courier data loaded here was built before the account split; the maps appear after the next Aramex import.'; return; }
    const cm = ui.cm, inP = (d) => { const m = moOf(d); return !cm || (m >= Math.min(cm.from, cm.to) && m <= Math.max(cm.from, cm.to)); };
    const M = ui.amMetric, unit = M === 'amt' ? '' : ' waybills', fmtM = (v) => (M === 'amt' ? fmtRC(v) : fmtInt(v));
    const daily = cd.data.filter((r) => inP(r.d)), val = (r) => (M === 'amt' ? r.amt : r.n);
    const provOf = (acct) => d3.rollup(daily.filter((r) => r.acct === acct && r.prov !== 'Unknown'), (v) => d3.sum(v, val), (r) => r.prov);
    const statsOf = (rows) => { const a = d3.sum(rows, (r) => r.amt), n = d3.sum(rows, (r) => r.n); return [[fmtRC(a), 'Aramex spend'], [fmtInt(n), 'waybills'], [n ? fmtR(a / n) : '—', 'per waybill']]; };

    // IBT account: one dot per receiving site, flows from the sending site
    const ibt = ci.data.filter((r) => r.acct === 'IBT' && inP(r.d)), v1 = (r) => (M === 'amt' ? r.amt : 1);
    const llOf = (s) => (s === 'HQ' ? HQ_LL : storeLL(s));
    const to = d3.rollups(ibt, (v) => ({ v: d3.sum(v, v1), amt: d3.sum(v, (r) => r.amt), n: v.length, pcs: d3.sum(v, (r) => r.pcs) }), (r) => r.to).map(([k, o]) => ({ name: k, ...o })).sort((a, b) => b.v - a.v);
    const dots = to.filter((o) => llOf(o.name)).map((o) => ({ name: o.name === 'HQ' ? 'HQ' : short(o.name), ll: llOf(o.name), v: o.v, hq: o.name === 'HQ',
      tip: [el('span', 'd', o.name), tline(fmtInt(o.n) + ' waybills · ' + fmtInt(o.pcs) + ' boxes'), tline(fmtRC(o.amt) + ' Aramex spend'), tline(o.n ? fmtR(o.amt / o.n) + ' per waybill' : '')] }));
    const flows = d3.rollups(ibt.filter((r) => llOf(r.from) && llOf(r.to) && r.from !== r.to), (v) => d3.sum(v, v1), (r) => r.from + '→' + r.to)
      .map(([k, v]) => { const [a, b] = k.split('→'); return { a: llOf(a), b: llOf(b), v }; });
    stat(document.getElementById('am-ibt-stats'), statsOf(daily.filter((r) => r.acct === 'IBT')));
    const ibtBox = document.getElementById('am-ibt-map');
    if (!ibt.length) ibtBox.replaceChildren(el('p', 'fm-note', 'No IBT-account waybills in these months.'));
    else acctMap(ibtBox, G, { pv: provOf('IBT'), dots: dots.filter((o) => !o.hq), flows, hq: true, fmtM, unit, label: 'Map of IBT account waybills: receiving sites and where the stock came from' });
    const tI = d3.sum(to, (o) => o.v) || 1;
    bars('am-ibt-list', to.slice(0, 10).map((o) => ({ key: o.name, label: o.name === 'Other' ? 'Other (not an FOM store)' : short(o.name), value: o.v, text: fmtM(o.v) + ' · ' + pct(o.v / tI) })),
      { color: PAL[3], empty: 'No IBT-account waybills in these months.' });

    // 250 account: provinces only (customer addresses are never loaded)
    const r250 = daily.filter((r) => r.acct === '250'), pv = provOf('250');
    const tA = d3.sum(r250, (r) => r.amt), onl = d3.sum(r250.filter((r) => r.cat === 'Online orders'), (r) => r.amt);
    stat(document.getElementById('am-250-stats'), [...statsOf(r250), [tA ? pct(onl / tA) : '—', 'of spend on online orders']]);
    const b250 = document.getElementById('am-250-map');
    if (!r250.length) b250.replaceChildren(el('p', 'fm-note', 'No 250-account waybills in these months.'));
    else acctMap(b250, G, { pv, fmtM, unit, label: 'Map of 250 account waybills by destination province' });
    const byCat = d3.rollups(r250, (v) => d3.sum(v, val), (r) => r.cat).sort((a, b) => b[1] - a[1]), tC = d3.sum(byCat, (c) => c[1]) || 1;
    const provs = [...pv].sort((a, b) => b[1] - a[1]), tP = d3.sum(provs, (p) => p[1]) || 1;
    bars('am-250-list', [...provs.map(([k, v]) => ({ key: k, label: k, value: v, text: fmtM(v) + ' · ' + pct(v / tP) }))],
      { color: PAL[1], empty: 'No 250-account waybills in these months.' });
    const mix = byCat.slice(0, 4).map(([k, v]) => k + ' ' + pct(v / tC)).join(' · ');
    if (mix) document.getElementById('am-250-list').append(el('p', 'fm-note', 'By type: ' + mix + '.'));
  }

  // ---------- Courier: most expensive stores and areas to deliver to ----------
  // HQ-to-store Aramex waybills (both accounts) in the courier months, per store and per delivery province; per unit from the Cin7-matched dispatches.
  const CT_AREA = ['Canal Walk', 'Kloof', 'V&A', 'Laborie', 'Tygervalley', 'Dorp Street', 'Cavendish', 'Somerset'];   // supplied by our own bakkie
  function drawDearest() {
    if (!document.getElementById('cr-dear-card')) return;
    const ci = dash.data('courier_ibt'), cdp = dash.data('courier_dispatch');
    if (ci.status !== 'ok' || cdp.status !== 'ok') return;
    const cm = ui.cm, inP = (d) => { const m = moOf(d); return !cm || (m >= Math.min(cm.from, cm.to) && m <= Math.max(cm.from, cm.to)); };
    const rows = ci.data.filter((r) => r.cat === 'IBT: HQ to store' && inP(r.d));
    const units = d3.rollup(cdp.data.filter((x) => inP(x.d) && x.u > 0), (v) => ({ amt: d3.sum(v, (x) => x.amt), u: d3.sum(v, (x) => x.u) }), (x) => x.store);
    const st = d3.rollups(rows, (v) => {
      const amt = d3.sum(v, (r) => r.amt), pcs = d3.sum(v, (r) => r.pcs), pv = d3.rollups(v, (w) => w.length, (r) => r.prov).sort((a, b) => b[1] - a[1]);
      return { amt, n: v.length, pcs, prov: pv.length ? pv[0][0] : '' };
    }, (r) => r.to).map(([k, o]) => { const u = units.get(k); return { store: k, ...o, per: o.amt / o.n, box: o.pcs ? o.amt / o.pcs : null, u: u ? u.u : null, pu: u && u.u ? u.amt / u.u : null }; })
      .sort((a, b) => b.amt - a.amt);
    const tot = d3.sum(st, (o) => o.amt);
    const areas = d3.rollups(st, (v) => ({ amt: d3.sum(v, (o) => o.amt), n: d3.sum(v, (o) => o.n), stores: v.length }), (o) => o.prov || 'Unknown').sort((a, b) => b[1].amt - a[1].amt);
    const isCt = (s) => CT_AREA.some((b) => s.startsWith(b)), ct = st.filter((o) => isCt(o.store));
    const pu = st.filter((o) => o.pu != null && o.u >= 300).sort((a, b) => b.pu - a.pu);
    const top = st[0], topA = areas[0];
    stat(document.getElementById('cr-dear-stats'), top ? [
      [short(top.store), 'most expensive store · ' + fmtRC(top.amt) + ' · ' + top.prov],
      [topA[0], 'most expensive area · ' + fmtRC(topA[1].amt) + ' (' + pct(topA[1].amt / (tot || 1)) + ')'],
      [pu.length ? short(pu[0].store) : '—', pu.length ? 'highest cost per unit · ' + fmtR2(pu[0].pu) : 'cost per unit needs 2026 Cin7 IBTs'],
      [fmtRC(tot), 'HQ-to-store Aramex spend · ' + fmtInt(d3.sum(st, (o) => o.n)) + ' waybills'],
    ] : [['—', 'No HQ-to-store waybills in these months.']]);
    setRows('cr-dear', st.map((o) => {
      const tr = el('tr'); if (isCt(o.store)) tr.title = 'Cape Town-area store, normally supplied by our own bakkie';
      tr.append(td(short(o.store) + (isCt(o.store) ? ' (bakkie area)' : '')), td(o.prov), td(fmtR(o.amt), 'n'), td(fmtInt(o.n), 'n'), td(fmtR(o.per), 'n'), td(fmtInt(o.pcs), 'n'),
        td(o.box == null ? '—' : fmtR(o.box), 'n'), td(o.u == null ? '—' : fmtInt(o.u), 'n'), td(o.pu == null ? '—' : fmtR2(o.pu), 'n'));
      return tr;
    }), 'No HQ-to-store waybills in these months.');
    bars('cr-dear-areas', areas.map(([k, a]) => ({ key: k, label: k + ' · ' + a.stores + (a.stores === 1 ? ' store' : ' stores'), value: a.amt, text: fmtRC(a.amt) + ' · ' + fmtR(a.amt / a.n) + ' per waybill' })),
      { color: PAL[3], empty: 'No HQ-to-store waybills in these months.' });
    // flags: dearest per unit, one-off heavy loads, Cape Town stores on Aramex
    const flags = [], med = d3.median(st, (o) => o.per) || 0;
    if (pu.length) flags.push('Highest cost per unit: ' + short(pu[0].store) + ' at ' + fmtR2(pu[0].pu) + ' a unit' + (pu.length > 2 ? ' (median ' + fmtR2(d3.median(pu, (o) => o.pu)) + ').' : '.'));
    const heavy = st.filter((o) => o.n <= 20 && o.per > 2.5 * med);
    if (heavy.length) flags.push('Unusually costly loads: ' + heavy.map((o) => short(o.store) + ' (' + fmtR(o.per) + ' per waybill over ' + o.n + ')').join(', ') + ', against a typical ' + fmtR(med) + '. Probably one-off big loads such as an opening.');
    if (ct.length) flags.push('Cape Town-area stores on Aramex: ' + fmtRC(d3.sum(ct, (o) => o.amt)) + ' over ' + fmtInt(d3.sum(ct, (o) => o.n)) + ' waybills (' + ct.slice(0, 3).map((o) => short(o.store) + ' ' + fmtRC(o.amt)).join(', ') + '). These stores normally go by our bakkie.');
    const ul = document.getElementById('cr-dear-flags'); ul.replaceChildren(...(flags.length ? flags : ['Nothing unusual in these months.']).map((t) => el('li', null, t)));
  }

  // ---------- Short picks: store packing lists (asked vs packed) checked against HQ stock in Cin7 ----------
  // Dataset short_picks (tools/build-shortpicks.js): {k:'M'} meta, {k:'L'} one row per completed list, {k:'S'} one per SKU short in a shipment folder.
  const SP_CAUSE = {
    notfound: { label: 'Not found at pick (Cin7 shows stock)', short: 'Not found', color: '#e47297', act: 'Count the bin: Cin7 says the stock is at HQ' },
    over: { label: 'Allocated more than HQ held', short: 'Over-allocated', color: PAL[3], act: 'Allocation: more asked than HQ had' },
    nostock: { label: 'Allocated with no HQ stock', short: 'No stock', color: '#7d5bc4', act: 'Allocation: HQ had none' },
    writeoff: { label: 'Had stock, written off later', short: 'Written off', color: PAL[4], act: 'Check why it was adjusted out' },
    taken: { label: 'Taken by other orders first', short: 'Taken first', color: PAL[0], act: 'Check the online/other orders that took it' },
    nodata: { label: 'SKU not in Cin7 HQ data', short: 'No data', color: '#9aa39e', act: 'Check the SKU in Cin7' },
  };
  const SP_ORDER = ['notfound', 'over', 'nostock', 'writeoff', 'taken', 'nodata'];
  const SP_TYPES = ['All', 'Bulk', 'Top-up', 'New styles', 'Opening stock', 'Namibia', 'One Day Only'];
  let spWired = false;
  function wireShorts() {
    if (spWired) return; spWired = true;
    ui.sp = ui.sp || { type: 'All' };
    const ty = document.getElementById('sp-type');
    ty.replaceChildren(...SP_TYPES.map((t) => { const b = el('button', null, t); b.type = 'button'; b.dataset.v = t; return b; }));
    for (const [id, k] of [['sp-type', 'type']]) {
      document.getElementById(id).addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; ui.sp[k] = b.dataset.v; F.drawAll(); });
    }
  }
  const spWeekLabel = (w) => 'W' + w;
  const spStores = (o) => o.ss.map(([s, p, q]) => s + ' ' + p + '/' + q).join('; ');
  function spLinesSpec(title, rows, sub) {
    return {
      title, sub: sub || 'Short lines from the completed packing lists',
      kpis: [[fmtInt(d3.sum(rows, (o) => o.sh)), 'units short'], [fmtInt(rows.length), 'SKU lines'], [fmtInt(new Set(rows.map((o) => o.sku)).size), 'SKUs']],
      cols: [{ k: 'w', label: 'Week', v: (o) => spWeekLabel(o.w) }, { k: 'ty', label: 'Shipment' }, { k: 'pr', label: 'Product', wrap: true }, { k: 'sku', label: 'SKU' },
        { k: 'ss', label: 'Stores (packed / asked)', wrap: true, v: spStores }, { k: 'sh', label: 'Short', n: true, sum: true }, { k: 'oh0', label: 'HQ before', n: true },
        { k: 'oh1', label: 'HQ after', n: true, v: (o) => (o.oh1 == null ? o.ohn : o.oh1) }, { k: 'c', label: 'Cause', v: (o) => SP_CAUSE[o.c].short }],
      rows: rows.slice().sort((a, b) => b.d - a.d || b.sh - a.sh), sort: { k: 'w', dir: -1 },
    };
  }
  function drawShorts() {
    if (!document.getElementById('sp-hero')) return;
    wireShorts();
    const ds = dash.data('short_picks'), note = document.getElementById('sp-note');
    if (ds.status !== 'ok') { note.textContent = ds.status === 'loading' ? 'Loading the packing lists…' : 'The short-picks data isn’t loaded yet.'; return; }
    const M = ds.data.find((r) => r.k === 'M') || {}, sp = ui.sp;
    document.querySelectorAll('#sp-type button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === sp.type)));
    // the dates at the top (or an FY week picked there) choose the weeks; the chart always shows the whole FY with that range highlighted
    const rp = dash.data('report'); if (rp.status !== 'ok') return;
    const END = rp.data[0].data_through_day, FY27 = rp.data[0].fy27_start_day, pp = P();
    let f0 = Math.min(END, Math.max(0, pp.from ?? 0)), t0 = Math.min(END, Math.max(0, pp.to ?? END)); if (f0 > t0) [f0, t0] = [t0, f0];
    const wk = (d) => Math.floor((d - FY27) / 7) + 1, wFrom = Math.max(1, wk(f0)), wTo = wk(t0);
    const inR = (r) => r.w >= wFrom && r.w <= wTo, typeOk = (r) => sp.type === 'All' || r.ty === sp.type;
    const allL = ds.data.filter((r) => r.k === 'L' && typeOk(r)), allS = ds.data.filter((r) => r.k === 'S' && typeOk(r));
    const maxW = Math.max(d3.max(allL, (r) => r.w) || 1, wk(END)), minW = 1;
    const q = (ui.q || '').trim().toLowerCase();
    const L = allL.filter(inR), S = allS.filter(inR);
    const rangeTxt = wTo < 1 ? 'before FY27' : wFrom === wTo ? 'FY27 W' + wFrom + ' (' + fmtDay(FY27 + (wFrom - 1) * 7) + ' – ' + fmtDay(FY27 + (wFrom - 1) * 7 + 6) + ')' : 'FY27 W' + wFrom + ' to W' + wTo;
    const Sq = q ? S.filter((o) => (o.pr + ' ' + o.sku + ' ' + o.ss.map((x) => x[0]).join(' ')).toLowerCase().includes(q)) : S;
    const asked = d3.sum(L, (r) => r.a), packed = d3.sum(L, (r) => r.p), short = d3.sum(S, (o) => o.sh);
    const byC = d3.rollup(S, (v) => d3.sum(v, (o) => o.sh), (o) => o.c);
    const inDc = (byC.get('notfound') || 0) + (byC.get('writeoff') || 0), alloc = (byC.get('over') || 0) + (byC.get('nostock') || 0);
    note.textContent = 'Showing ' + rangeTxt + ' — pick a week with “FY week” at the top or click a week in the chart. ' + fmtInt(M.lists) + ' completed packing lists from the warehouse FY27 folder and your Bulk folders, up to ' + fmtFull(M.last) + '. Cin7 stock checks run to ' + fmtFull(M.cin7)
      + (M.last > M.cin7 ? ', so picks after that show “HQ after pick” as today’s stock' : '') + '. A line counts as short when Packed is below Quantity.';
    const kp = document.getElementById('sp-kpis');
    kp.replaceChildren(...[
      [asked ? pct1(packed / asked) : '—', 'Fill rate', fmtInt(packed) + ' of ' + fmtInt(asked) + ' units packed'],
      [fmtInt(short), 'Units short', fmtInt(S.length) + ' SKU lines'],
      [fmtInt(L.length), 'Packing lists', fmtInt(d3.sum(L, (r) => r.sl)) + ' lines short'],
      [short ? pct(inDc / short) : '—', 'Short in the DC', 'not found, or written off later'],
      [short ? pct(alloc / short) : '—', 'Short from allocation', 'more asked than HQ held'],
    ].map(([v, l, s]) => { const d = el('div'); d.append(el('span', null, l), el('b', null, v), el('em', null, s)); return d; }));
    // weekly stacked columns by cause + fill-rate line
    const weeks = d3.range(minW, maxW + 1).map((w) => {
      const lw = allL.filter((r) => r.w === w), sw = allS.filter((o) => o.w === w), o = { w, a: d3.sum(lw, (r) => r.a), p: d3.sum(lw, (r) => r.p), lists: lw.length, rows: sw };
      SP_ORDER.forEach((c) => (o[c] = d3.sum(sw.filter((x) => x.c === c), (x) => x.sh))); o.sh = d3.sum(sw, (x) => x.sh); return o;
    });
    ui.spHide = ui.spHide || {};
    const on = SP_ORDER.filter((c) => !ui.spHide[c] && d3.sum(weeks, (w) => w[c]) > 0);
    document.getElementById('sp-legend').replaceChildren(...SP_ORDER.filter((c) => byC.get(c)).map((c) => {
      const b = el('button', 'fm-leg'); b.type = 'button'; b.setAttribute('aria-pressed', String(!ui.spHide[c]));
      const i = el('i'); i.style.background = SP_CAUSE[c].color; b.append(i, SP_CAUSE[c].short + ' · ' + fmtInt(byC.get(c)));
      b.addEventListener('click', () => { ui.spHide[c] = !ui.spHide[c]; F.drawAll(); }); return b;
    }), (() => { const s = el('span'); const i = el('i'); i.style.background = 'var(--color-fg-muted)'; i.style.height = '3px'; s.append(i, 'Fill rate'); return s; })());
    const box = document.getElementById('sp-chart');
    const W = Math.max(300, box.clientWidth), H = 280, mg = { t: 16, r: 46, b: 28, l: 40 };
    const x = d3.scaleBand(weeks.map((w) => w.w), [mg.l, W - mg.r]).padding(0.22);
    const ymax = d3.max(weeks, (w) => d3.sum(on, (c) => w[c])) || 1, y = d3.scaleLinear([0, ymax], [H - mg.b, mg.t]).nice();
    const fills = weeks.filter((w) => w.a).map((w) => w.p / w.a), fmin = Math.min(0.98, d3.min(fills) || 0.98);
    const y2 = d3.scaleLinear([Math.floor(fmin * 200) / 200, 1], [H - mg.b, mg.t]);
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Units short per FY27 week by cause, with fill rate');
    const ticks = y.ticks(5);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', mg.l).attr('x2', W - mg.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)').attr('stroke-dasharray', (t) => (t ? '3 4' : null));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', mg.l - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((t) => fmtInt(t));
    svg.append('g').selectAll('text').data(y2.ticks(4)).join('text').attr('x', W - mg.r + 6).attr('y', y2).attr('dy', '0.32em').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((t) => d3.format('.1%')(t));
    const step = Math.ceil(weeks.length / Math.max(1, Math.floor((W - mg.l - mg.r) / 34)));
    svg.append('g').selectAll('text').data(weeks.filter((w, i) => i % step === 0 || i === weeks.length - 1)).join('text').attr('x', (w) => x(w.w) + x.bandwidth() / 2).attr('y', H - 8)
      .attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((w) => spWeekLabel(w.w));
    const stack = d3.stack().keys(on)(weeks);
    svg.append('g').selectAll('g').data(stack).join('g').style('fill', (s) => SP_CAUSE[s.key].color)
      .selectAll('rect').data((s) => s).join('rect').attr('x', (d) => x(d.data.w)).attr('width', x.bandwidth()).attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1]))).attr('rx', 2)
      .attr('opacity', (d) => (d.data.w >= wFrom && d.data.w <= wTo ? 1 : 0.28));
    if (wFrom > minW || wTo < maxW) svg.insert('rect', 'g').attr('x', x(Math.max(minW, wFrom)) - x.step() * x.paddingInner() / 2).attr('width', x.step() * (Math.min(maxW, wTo) - Math.max(minW, wFrom) + 1))
      .attr('y', mg.t).attr('height', H - mg.t - mg.b).attr('rx', 6).attr('fill', 'var(--color-bg)');
    const fl = weeks.filter((w) => w.a);
    svg.append('path').attr('d', d3.line().x((w) => x(w.w) + x.bandwidth() / 2).y((w) => y2(w.p / w.a)).curve(d3.curveMonotoneX)(fl)).attr('fill', 'none').attr('stroke', 'var(--color-fg-muted)').attr('stroke-width', 1.8);
    svg.append('g').selectAll('circle').data(fl).join('circle').attr('cx', (w) => x(w.w) + x.bandwidth() / 2).attr('cy', (w) => y2(w.p / w.a)).attr('r', 2.6).style('fill', 'var(--color-panel)').style('stroke', 'var(--color-fg-muted)').attr('stroke-width', 1.5);
    const tip = el('div', 'fm-tip'); tip.hidden = true;
    svg.append('g').selectAll('rect').data(weeks).join('rect').attr('x', (w) => x(w.w) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', mg.t).attr('height', H - mg.t - mg.b).attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('mouseenter mousemove', (ev, w) => {
        const ln = (c) => { const l = el('div'), i = el('i'); i.style.background = SP_CAUSE[c].color; l.append(i, SP_CAUSE[c].short + ': ' + fmtInt(w[c])); return l; };
        tip.replaceChildren(el('span', 'd', 'FY27 ' + spWeekLabel(w.w) + ' · ' + fmtInt(w.lists) + ' lists · click to show this week'), el('div', null, fmtInt(w.sh) + ' short of ' + fmtInt(w.a) + ' asked · fill ' + (w.a ? pct1(w.p / w.a) : '—')),
          ...SP_ORDER.filter((c) => w[c]).map(ln));
        tip.hidden = false; const bx = (x(w.w) + x.bandwidth()) / W * box.clientWidth;
        tip.style.top = '8px'; tip.style.left = Math.min(Math.max(0, bx + 10), box.clientWidth - tip.offsetWidth) + 'px';
      })
      .on('mouseleave', () => { tip.hidden = true; })
      .on('click', (ev, w) => { const m = FY27 + (w.w - 1) * 7; dash.setParams({ from: m, to: Math.min(m + 6, END) }); });
    box.replaceChildren(svg.node(), tip);
    // causes
    bars('sp-causes', SP_ORDER.filter((c) => byC.get(c)).map((c) => ({ key: c, label: SP_CAUSE[c].label, value: byC.get(c), text: fmtInt(byC.get(c)) + ' units · ' + pct(byC.get(c) / (short || 1)) })),
      { color: (b) => SP_CAUSE[b.key].color, empty: 'Nothing short in this selection.', drill: (b) => openDrill(spLinesSpec('Short lines: ' + SP_CAUSE[b.key].label, S.filter((o) => o.c === b.key), SP_CAUSE[b.key].act)) });
    // flags: trend, the worst list, biggest stock-in-Cin7-but-not-found
    const flags = [];
    const recent = weeks.slice(-4), earlier = weeks.slice(0, -4);
    if (earlier.length >= 4 && recent.length) {
      const r = d3.mean(recent, (w) => w.sh), e = d3.mean(earlier, (w) => w.sh);
      if (r > e * 1.5 && r - e >= 3) flags.push('Getting worse: ' + d3.format('.0f')(r) + ' units short a week over the last 4 weeks, against ' + d3.format('.1f')(e) + ' a week before that.');
      else if (r < e * 0.67) flags.push('Improving: ' + d3.format('.0f')(r) + ' units short a week over the last 4 weeks, against ' + d3.format('.1f')(e) + ' before.');
    }
    const worst = L.filter((r) => r.a - r.p > 0).sort((a, b) => (b.a - b.p) - (a.a - a.p))[0];
    if (worst) flags.push('Worst list: ' + worst.st + ' (' + worst.ty.toLowerCase() + (worst.ty === 'Bulk' || worst.ty === 'Top-up' ? ' W' + worst.w : '') + ', ' + fmtFull(worst.d) + '): ' + fmtInt(worst.a - worst.p) + ' of ' + fmtInt(worst.a) + ' units short.');
    const big = S.filter((o) => o.c === 'notfound' && o.ohn >= 10).sort((a, b) => b.ohn - a.ohn).slice(0, 3);
    if (big.length) flags.push('Short while Cin7 shows plenty at HQ: ' + big.map((o) => o.pr + ' (' + fmtInt(o.ohn) + ' on hand)').join(', ') + '. Likely a second location or the wrong bin.');
    document.getElementById('sp-flags').replaceChildren(...flags.map((t) => el('li', null, t)));
    // stores
    const sts = d3.rollups(L, (v) => ({ n: v.length, a: d3.sum(v, (r) => r.a), p: d3.sum(v, (r) => r.p), sl: d3.sum(v, (r) => r.sl) }), (r) => r.st)
      .map(([k, o]) => ({ k, ...o, sh: o.a - o.p })).filter((o) => !q || o.k.toLowerCase().includes(q) || Sq.some((s) => s.ss.some((x) => x[0] === o.k)))
      .sort((a, b) => b.sh - a.sh || b.a - a.a);
    const maxSh = d3.max(sts, (o) => o.sh) || 1;
    setRows('sp-stores', sts.map((o) => {
      const tr = el('tr'), fill = o.a ? o.p / o.a : 1;
      tr.append(td(o.k), td(fmtInt(o.n), 'n'), td(fmtInt(o.a), 'n'), F.barCell(fmtInt(o.sh), o.sh / maxSh, '#e47297'), td(pct1(fill), 'n' + (fill < 0.99 ? ' fm-bad' : '')), td(fmtInt(o.sl), 'n'));
      const rows = S.filter((s) => s.ss.some((x) => x[0] === o.k)).map((s) => ({ ...s, ss: s.ss.filter((x) => x[0] === o.k), sh: d3.sum(s.ss.filter((x) => x[0] === o.k), (x) => x[2] - x[1]) }));
      return rows.length ? clickRow(tr, () => openDrill(spLinesSpec('Short lines: ' + o.k, rows, fmtInt(o.n) + ' lists · fill ' + pct1(fill)))) : tr;
    }), 'No packing lists in this selection.');
    // repeat SKUs
    const rep = d3.rollups(Sq, (v) => {
      const cs = d3.rollups(v, (w) => d3.sum(w, (o) => o.sh), (o) => o.c).sort((a, b) => b[1] - a[1]);
      const last = v.slice().sort((a, b) => b.d - a.d)[0];
      return { pr: last.pr, times: v.length, sh: d3.sum(v, (o) => o.sh), c: cs[0][0], ohn: last.ohn, last, rows: v };
    }, (o) => o.sku).map(([k, o]) => ({ sku: k, ...o })).filter((o) => o.times > 1 || o.sh >= 3).sort((a, b) => b.times - a.times || b.sh - a.sh).slice(0, 40);
    setRows('sp-repeat', rep.map((o) => {
      const tr = el('tr'), c = SP_CAUSE[o.c];
      const cc = td(c.short); cc.style.color = c.color; cc.style.fontWeight = '600'; cc.title = c.act;
      tr.append(td(o.pr), td(o.sku), td(fmtInt(o.times), 'n'), td(fmtInt(o.sh), 'n'), cc, td(o.ohn == null ? '—' : fmtInt(o.ohn), 'n' + (o.c === 'notfound' && o.ohn >= 10 ? ' fm-bad' : '')),
        td((o.last.ty === 'Bulk' || o.last.ty === 'Top-up' ? spWeekLabel(o.last.w) + ' ' : '') + o.last.ty.toLowerCase()));
      return clickRow(tr, () => openDrill(spLinesSpec(o.pr, o.rows, o.sku + ' · HQ on hand now ' + (o.ohn == null ? '—' : fmtInt(o.ohn)))));
    }), 'No SKU was short more than once in this selection.');
    // every short line
    const lines = Sq.slice().sort((a, b) => b.d - a.d || b.sh - a.sh);
    document.getElementById('sp-lines-note').textContent = fmtInt(lines.length) + ' short lines' + (q ? ' matching “' + ui.q.trim() + '”' : '') + ', newest first. The search box at the top filters by product, SKU or store.';
    setRows('sp-lines', lines.slice(0, 400).map((o) => {
      const tr = el('tr'), c = SP_CAUSE[o.c];
      const cc = td(c.short); cc.style.color = c.color; cc.style.fontWeight = '600'; cc.title = c.act;
      const st = td(spStores(o)); st.style.whiteSpace = 'normal'; st.style.minWidth = '14rem';
      tr.append(td(o.ty === 'Bulk' || o.ty === 'Top-up' ? spWeekLabel(o.w) : fmtDay(o.d)), td(o.ty), td(o.pr), td(o.sku), st, td(fmtInt(o.sh), 'n'),
        td(o.oh0 == null ? '—' : fmtInt(o.oh0), 'n'), td(o.oh1 == null ? (o.ohn == null ? '—' : fmtInt(o.ohn) + '*') : fmtInt(o.oh1), 'n'), cc);
      return tr;
    }), 'Nothing short in this selection.');
  }

  // ---------- Demand & supply forecast ----------
  // Demand = recent level (last 8 complete weeks) × last year's seasonal shape.
  //   Online: Shopify online-store orders (Peak tab model inside the Black Friday window, else same week last year × this year's growth) × units per order from Cin7.
  //   Stores: IBT units to stores (Cin7, new-store openings left out) × the shape of 2024's Aramex HQ-to-store boxes (2025 wasn't on the IBT account), smoothed over 5 weeks.
  //   Per SKU, the store rate drops its single biggest week (one-off pushes such as openings and new-style drops), then is scaled to the store total.
  //   Other sales orders (Namibia, wholesale, staff…): flat at the recent average.
  // Supply = HQ available (on hand less allocated) and on order (no due dates in Cin7) per SKU; per-SKU demand = its share of each stream.
  const FC_C = { online: PAL[0], stores: PAL[3], other: '#9aa39e' };
  let fcWired = false;
  function fcModel(x) {
    const sh = dash.data('shopify_online'), ci = dash.data('courier_ibt');
    if (sh.status !== 'ok') return null;
    const pm = peakModel(x); if (!pm) return null;
    const END = x.END, mon = (d) => d - ((d + 3) % 7);
    const curMon = mon(END), firstFc = END >= curMon + 4 ? curMon + 7 : curMon;   // a week is complete once the data reaches Friday
    const base = d3.range(8).map((i) => firstFc - 56 + i * 7);                       // 8 complete weeks before the forecast
    const inBase = (d) => d >= firstFc - 56 && d < firstFc;
    // actual weekly units (Cin7)
    const act = new Map(), A = (w) => { if (!act.has(w)) act.set(w, { online: 0, stores: 0, other: 0 }); return act.get(w); };
    const rO = new Map(), rS = new Map(), rX = new Map();
    for (const r of x.D.so.data) { const k = r.ch === 'Online' ? 'online' : 'other'; A(mon(r.d))[k] += r.out; if (inBase(r.d)) (k === 'online' ? rO : rX).set(r.s, ((k === 'online' ? rO : rX).get(r.s) || 0) + r.out / 8); }
    const wkS = new Map(), seen = new Map();   // per SKU: store units per base week, and which base weeks it moved at all
    const mark = (s, d) => { let a = seen.get(s); if (!a) seen.set(s, (a = new Uint8Array(8))); a[Math.floor((d - base[0]) / 7)] = 1; };
    for (const r of x.D.so.data) if (inBase(r.d) && r.out > 0) mark(r.s, r.d);
    for (const m of x.D.moves.data) if ((m.t === 'TRs-' || m.t === 'TRp-')) {
      A(mon(m.d)).stores += m.u;
      if (inBase(m.d)) { let a = wkS.get(m.s); if (!a) wkS.set(m.s, (a = new Float64Array(8))); a[Math.floor((m.d - base[0]) / 7)] += m.u; mark(m.s, m.d); }
    }
    const baseAvg = (k) => d3.mean(base, (w) => (act.get(w) || {})[k] || 0);
    const bO = baseAvg('online'), bX = baseAvg('other');
    // store level without new-store openings (by TR purpose or an "opening"/"part 1/2" note)
    const isOpening = (r) => r.purpose === 'New store opening' || /opening|parts*d/i.test(r.note || '');
    const ibtB = x.D.ibt.data.filter((r) => r.dir === 'out' && r.pclass === 'store' && inBase(r.od));
    const openU = d3.sum(ibtB.filter(isOpening), (r) => r.u), bS = Math.max(0, d3.sum(ibtB, (r) => r.u) - openU) / 8;
    for (const [s, a] of wkS) { const sum = d3.sum(a), mx = d3.max(a); rS.set(s, (sum - mx) / 7); }
    const sumRS = d3.sum([...rS.values()]) || 1; for (const [s, v] of rS) rS.set(s, v * bS / sumRS);
    const regular = (s) => { const a = seen.get(s); return !!a && d3.sum(a) >= 3; };
    // online orders forecast per week
    const wk = new Map(sh.data.filter((r) => r.k === 'w').map((r) => [dIso(r.p), r.orders]));
    const bfMon = dIso(BF[2026]);
    const both = base.filter((w) => wk.has(w) && wk.has(w - 364));
    const growth = d3.sum(both, (w) => wk.get(w)) / (d3.sum(both, (w) => wk.get(w - 364)) || 1);
    const ordersFc = (w) => { const i = Math.round((w - bfMon) / 7) + 10; if (i >= 0 && i <= 16 && pm.f26[i] != null) return pm.f26[i]; const ly = wk.get(w - 364); return ly == null ? null : ly * growth; };
    const baseOrders = d3.mean(base, (w) => wk.get(w) ?? ordersFc(w) ?? 0) || 1;
    // store seasonality from 2024 Aramex HQ-to-store boxes (two years back keeps the weekday: 728 days)
    const boxes = new Map();
    if (ci.status === 'ok') for (const r of ci.data) if (r.cat === 'IBT: HQ to store') { const w = mon(r.d); boxes.set(w, (boxes.get(w) || 0) + (r.pcs || 0)); }
    const sm = (w) => d3.mean([w - 14, w - 7, w, w + 7, w + 14], (v) => boxes.get(v) || 0);
    const sBase = d3.mean(base, (w) => sm(w - 728)) || 0;
    const idxS = (w) => (sBase > 0 ? Math.max(0.5, Math.min(2, sm(w - 728) / sBase)) : 1);
    const weeksAhead = (n) => d3.range(n).map((i) => firstFc + i * 7);
    const fcWeek = (w) => { const o = ordersFc(w), oo = o == null ? baseOrders : o; return { w, orders: oo, online: oo * pm.upo, stores: bS * idxS(w), other: bX, idxO: (oo * pm.upo) / (bO || 1), idxS: idxS(w), ly: wk.get(w - 364) ?? null }; };
    return { END, firstFc, base, act, rO, rS, rX, bO, bS, bX, openU, regular, ibtB, isOpening, growth, upo: pm.upo, sBase, weeksAhead, fcWeek, mon, curMon, wk };
  }
  function wireFc() {
    if (fcWired) return; fcWired = true;
    ui.fc = ui.fc || { h: '8', s: 'all', l: 'core' };
    for (const [id, k] of [['fc-h', 'h'], ['fc-s', 's'], ['fc-l', 'l']]) document.getElementById(id).addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; ui.fc[k] = b.dataset.v; F.drawAll(); });
  }
  function drawForecast(x) {
    if (!document.getElementById('fc-hero')) return;
    wireFc();
    const note = document.getElementById('fc-note'), m = fcModel(x);
    if (!m) { note.textContent = 'Loading Shopify, Aramex and Cin7 data…'; return; }
    const fc = ui.fc, H = +fc.h, S = fc.s, useO = S !== 'stores', useS = S !== 'online';
    document.querySelectorAll('#fc-h button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === fc.h)));
    document.querySelectorAll('#fc-s button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === fc.s)));
    document.querySelectorAll('#fc-l button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === fc.l)));
    const LN = { core: 'reorderable', season: 'seasonal', all: '' }[fc.l];
    const W = m.weeksAhead(H).map(m.fcWeek), FY27 = x.FY27, fyW = (d) => 'W' + (Math.floor((d - FY27) / 7) + 1);
    const tot = (w) => (useO ? w.online : 0) + (useS ? w.stores : 0) + (S === 'all' ? w.other : 0);
    const baseTot = (useO ? m.bO : 0) + (useS ? m.bS : 0) + (S === 'all' ? m.bX : 0);
    const peak = W.slice().sort((a, b) => tot(b) - tot(a))[0];
    note.textContent = 'Forecast from ' + fmtDay(m.firstFc) + ' (' + fyW(m.firstFc) + '). Recent level = the 8 weeks from ' + fmtDay(m.base[0]) + ' to ' + fmtDay(m.firstFc - 1) + ': ' + fmtInt(m.bO) + ' online units, ' + fmtInt(m.bS) + ' store IBT units and ' + fmtInt(m.bX)
      + ' other order units a week (' + fmtInt(m.openU) + ' units of new-store opening stock left out). Online follows Shopify’s weekly pattern (Black Friday shape from the Peak tab, otherwise last year × ' + d3.format('+.0%')(m.growth - 1) + ' growth) at ' + d3.format('.1f')(m.upo) + ' units per order; stores follow 2024’s Aramex HQ-to-store box pattern'
      + (m.sBase ? '' : ' (not loaded, so flat)') + '. Product filters and search apply; the date filter doesn’t.';
    // ----- SKU supply vs demand -----
    const skus = x.skus, ok = x.skuOk, rows = [];
    for (let i = 0; i < skus.length; i++) {
      const s = skus[i]; if (!ok[i] || s.svc || s.cmp) continue;
      const ro = useO ? m.rO.get(s.i) || 0 : 0, rs = useS ? m.rS.get(s.i) || 0 : 0, rx = S === 'all' ? m.rX.get(s.i) || 0 : 0;
      if (ro + rs + rx < 0.25) continue;
      const reg = m.regular(s.i), bought = s.fpo != null && s.fpo >= 0;
      const core = /^core/i.test(s.sea || '') || (bought && s.lpo - s.fpo >= 28);   // reorderable: core range or bought on POs at least 4 weeks apart
      if (fc.l === 'core' ? !core : fc.l === 'season' ? core : false) continue;
      const per = W.map((w) => ro * w.idxO + rs * w.idxS + rx), dem = d3.sum(per), av = Math.max(0, s.av ?? s.oh);
      let cum = 0, out = null; for (let k = 0; k < per.length; k++) { cum += per[k]; if (cum > av) { out = k; break; } }
      const safety = 2 * dem / H, sug = Math.max(0, Math.ceil(dem + safety - av - (s.oo || 0)));
      rows.push({ s, ro, rs, rx, dem, av, oo: s.oo || 0, out: reg ? out : null, sug: reg && bought && core ? sug : 0, reg, bought, core, short: reg ? Math.max(0, dem - av - (s.oo || 0)) : 0 });
    }
    const runOut = rows.filter((r) => r.out != null), demTot = d3.sum(rows, (r) => r.dem), demVal = d3.sum(rows, (r) => r.dem * (r.s.uc || 0));
    const sugVal = d3.sum(runOut, (r) => r.sug * (r.s.uc || 0));
    const kp = [
      [fmtInt(d3.sum(W, tot)), 'Units to pick, next ' + H + ' weeks', fmtInt(d3.sum(W, tot) / H) + ' a week vs ' + fmtInt(baseTot) + ' recently (' + d3.format('+.0%')(d3.sum(W, tot) / H / (baseTot || 1) - 1) + ')'],
      [peak ? fmtInt(tot(peak)) : '—', 'Busiest week', peak ? 'week of ' + fmtDay(peak.w) + ' (' + fyW(peak.w) + ') · ' + fmtInt(tot(peak) / 5) + ' a working day' : ''],
      useO ? [fmtInt(d3.sum(W, (w) => w.orders)), 'Online orders', 'last year ' + fmtInt(d3.sum(W, (w) => w.ly || 0)) + ' in the same weeks'] : [fmtInt(d3.sum(W, (w) => w.stores)), 'Store IBT units', fmtInt(m.bS) + ' a week recently'],
      [fmtInt(runOut.length), (LN ? LN[0].toUpperCase() + LN.slice(1) + ' SKUs' : 'SKUs') + ' running out', 'within ' + H + ' weeks at forecast demand'],
      [fmtRC(sugVal), 'Suggested reorder value', fmtInt(d3.sum(runOut, (r) => r.sug)) + ' units at cost, after on order'],
    ];
    document.getElementById('fc-kpis').replaceChildren(...kp.map(([v, l, s]) => { const d = el('div'); d.append(el('span', null, l), el('b', null, v), el('em', null, s)); return d; }));
    // ----- chart: last 12 weeks actual + forecast -----
    const keys = ['online', 'stores', 'other'].filter((k) => (k === 'online' ? useO : k === 'stores' ? useS : S === 'all'));
    const LBL = { online: 'Online', stores: 'Stores (IBTs)', other: 'Other orders' };
    const past = d3.range(12, 0, -1).map((i) => { const w = m.firstFc - i * 7, a = m.act.get(w) || { online: 0, stores: 0, other: 0 }; return { w, fc: false, ...a }; });
    const all = past.concat(W.map((w) => ({ ...w, fc: true })));
    document.getElementById('fc-legend').replaceChildren(...keys.map((k) => { const s = el('span'), i = el('i'); i.style.background = FC_C[k]; s.append(i, LBL[k]); return s; }),
      (() => { const s = el('span'), i = el('i'); i.style.background = 'repeating-linear-gradient(45deg, var(--color-fg-muted) 0 2px, transparent 2px 4px)'; s.append(i, 'Forecast'); return s; })());
    const box = document.getElementById('fc-chart');
    const Wd = Math.max(300, box.clientWidth), Ht = 280, mg = { t: 16, r: 14, b: 28, l: 48 };
    const xs = d3.scaleBand(all.map((r) => r.w), [mg.l, Wd - mg.r]).padding(0.22);
    const ys = d3.scaleLinear([0, d3.max(all, (r) => d3.sum(keys, (k) => r[k])) || 1], [Ht - mg.b, mg.t]).nice();
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${Wd} ${Ht}`).attr('role', 'img').attr('aria-label', 'Units to pick per week: last 12 weeks and forecast');
    const uid = 'fc' + Math.round(Wd);
    svg.append('defs').append('pattern').attr('id', uid + 'h').attr('patternUnits', 'userSpaceOnUse').attr('width', 6).attr('height', 6).attr('patternTransform', 'rotate(45)')
      .append('rect').attr('width', 2.5).attr('height', 6).attr('fill', 'var(--color-panel)').attr('opacity', 0.45);
    const tk = ys.ticks(5);
    svg.append('g').selectAll('line').data(tk).join('line').attr('x1', mg.l).attr('x2', Wd - mg.r).attr('y1', ys).attr('y2', ys).attr('stroke', 'var(--cds-chart-grid)').attr('stroke-dasharray', (t) => (t ? '3 4' : null));
    svg.append('g').selectAll('text').data(tk).join('text').attr('x', mg.l - 8).attr('y', ys).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((t) => d3.format('~s')(t));
    svg.append('rect').attr('x', xs(m.firstFc) - xs.step() * xs.paddingInner() / 2).attr('width', Wd - mg.r - xs(m.firstFc) + xs.step() * xs.paddingInner() / 2).attr('y', mg.t).attr('height', Ht - mg.t - mg.b).attr('rx', 6).attr('fill', 'var(--color-bg)');
    const st = d3.stack().keys(keys)(all);
    const g = svg.append('g').selectAll('g').data(st).join('g').style('fill', (s) => FC_C[s.key]);
    g.selectAll('rect').data((s) => s).join('rect').attr('x', (d) => xs(d.data.w)).attr('width', xs.bandwidth()).attr('y', (d) => ys(d[1])).attr('height', (d) => Math.max(0, ys(d[0]) - ys(d[1]))).attr('rx', 2).attr('opacity', (d) => (d.data.fc ? 0.55 : 1));
    svg.append('g').selectAll('rect').data(st.flatMap((s) => s.filter((d) => d.data.fc))).join('rect').attr('x', (d) => xs(d.data.w)).attr('width', xs.bandwidth()).attr('y', (d) => ys(d[1])).attr('height', (d) => Math.max(0, ys(d[0]) - ys(d[1]))).attr('fill', `url(#${uid}h)`);
    const stepL = Math.ceil(all.length / Math.max(1, Math.floor((Wd - mg.l - mg.r) / 44)));
    svg.append('g').selectAll('text').data(all.filter((r, i) => i % stepL === 0)).join('text').attr('x', (r) => xs(r.w) + xs.bandwidth() / 2).attr('y', Ht - 8).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((r) => fmtDay(r.w));
    svg.append('text').attr('x', xs(m.firstFc) + 4).attr('y', mg.t + 12).attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text('Forecast →');
    const tip = el('div', 'fm-tip'); tip.hidden = true;
    svg.append('g').selectAll('rect').data(all).join('rect').attr('x', (r) => xs(r.w) - xs.step() * xs.paddingInner() / 2).attr('width', xs.step()).attr('y', mg.t).attr('height', Ht - mg.t - mg.b).attr('fill', 'transparent')
      .on('mouseenter mousemove', (ev, r) => {
        const ln = (k) => { const l = el('div'), i = el('i'); i.style.background = FC_C[k]; l.append(i, LBL[k] + ': ' + fmtInt(r[k])); return l; };
        tip.replaceChildren(el('span', 'd', 'Week of ' + fmtDay(r.w) + ' · ' + fyW(r.w) + (r.fc ? ' · forecast' : r.w + 7 > m.END ? ' · to ' + fmtDay(m.END) : '')), ...keys.map(ln), el('div', null, 'Total ' + fmtInt(d3.sum(keys, (k) => r[k])) + (r.fc && r.orders ? ' · ' + fmtInt(r.orders) + ' online orders' : '')));
        tip.hidden = false; const bx = (xs(r.w) + xs.bandwidth()) / Wd * box.clientWidth;
        tip.style.top = '8px'; tip.style.left = Math.min(Math.max(0, bx + 10), box.clientWidth - tip.offsetWidth) + 'px';
      }).on('mouseleave', () => { tip.hidden = true; });
    box.replaceChildren(svg.node(), tip);
    // ----- week table -----
    document.getElementById('fc-weeks-note').textContent = 'Per working day = total ÷ 5. Online orders last year = the same week in 2025 (Shopify).' + (S !== 'all' ? ' Showing ' + (S === 'online' ? 'online only' : 'stores only') + '; the total column follows that.' : '');
    setRows('fc-weeks', W.map((w) => {
      const tr = el('tr'); if (w === peak) tr.classList.add('sel');
      tr.append(td(fmtDay(w.w)), td(fyW(w.w)), td(fmtInt(w.orders), 'n'), td(fmtInt(w.online), 'n'), td(fmtInt(w.stores), 'n'), td(fmtInt(w.other), 'n'), td(fmtInt(tot(w)), 'n'), td(fmtInt(tot(w) / 5), 'n'), td(w.ly == null ? '—' : fmtInt(w.ly), 'n'));
      return tr;
    }), 'No forecast weeks.');
    // ----- departments -----
    const dep = d3.rollups(rows, (v) => ({ av: d3.sum(v, (r) => r.av), oo: d3.sum(v, (r) => r.oo), dem: d3.sum(v, (r) => r.dem), out: v.filter((r) => r.out != null).length, short: d3.sum(v, (r) => r.short), sval: d3.sum(v, (r) => r.short * (r.s.uc || 0)) }), (r) => r.s.dep || 'Unassigned')
      .sort((a, b) => b[1].dem - a[1].dem);
    setRows('fc-dept', dep.map(([k, o]) => {
      const tr = el('tr'), cov = o.dem ? o.av / (o.dem / H) : null;
      tr.append(td(k), td(fmtInt(o.av), 'n'), td(fmtInt(o.oo), 'n'), td(fmtInt(o.dem), 'n'), td(cov == null ? '—' : d3.format('.1f')(cov), 'n' + (cov != null && cov < 4 ? ' fm-bad' : '')), td(fmtInt(o.out), 'n'),
        td(o.short >= 1 ? fmtInt(o.short) + ' · ' + fmtRC(o.sval) : '—', 'n' + (o.short >= 1 ? ' fm-bad' : '')));
      return clickRow(tr, () => F.toggle('deps', k), P().deps.includes(k));
    }), 'No SKUs with demand match these filters.');
    // ----- stores -----
    const ibt = m.ibtB.filter((r) => !m.isOpening(r));
    const tot8 = d3.sum(ibt, (r) => r.u) || 1, next4 = m.weeksAhead(4).map(m.fcWeek), pk4 = next4.slice().sort((a, b) => b.stores - a.stores)[0];
    const sts = d3.rollups(ibt, (v) => d3.sum(v, (r) => r.u), (r) => r.partner || 'Not stated').sort((a, b) => b[1] - a[1]);
    setRows('fc-stores', sts.map(([k, u]) => {
      const sh = u / tot8, tr = el('tr');
      tr.append(td(k), td(fmtInt(u / 8), 'n'), td(fmtInt(sh * d3.sum(next4, (w) => w.stores)), 'n'), td(fmtInt(sh * pk4.stores) + ' (' + fmtDay(pk4.w) + ')', 'n'));
      return tr;
    }), 'No IBTs to stores in the last 8 weeks.');
    // ----- SKUs running out -----
    runOut.sort((a, b) => a.out - b.out || b.dem - a.dem);
    document.getElementById('fc-skus-note').textContent = fmtInt(runOut.length) + ' ' + (LN ? LN + ' ' : '') + 'SKUs run out within ' + H + ' weeks (of ' + fmtInt(rows.filter((r) => r.reg).length) + ' that moved in at least 3 of the last 8 weeks; one-off pushes are left out). Reorderable = core range or bought on POs at least 4 weeks apart; seasonal lines are expected to sell through, so they get no reorder suggestion. Suggested order = forecast demand + 2 weeks’ safety − available − on order. On order has no due date in Cin7, so it isn’t counted as arriving. Click a row for the SKU’s history.';
    setRows('fc-skus', runOut.slice(0, 150).map((r) => {
      const tr = el('tr'), when = W[r.out].w;
      tr.append(td(r.s.p), td(r.s.sku), td(fmtInt(r.av), 'n' + (r.av === 0 ? ' fm-bad' : '')), td(r.oo ? fmtInt(r.oo) : '—', 'n'), td(d3.format('.1f')(r.ro), 'n'), td(d3.format('.1f')(r.rs), 'n'), td(fmtInt(r.dem), 'n'),
        td(r.av === 0 ? 'Out now' : 'Week of ' + fmtDay(when) + ' (' + fyW(when) + ')', r.out <= 1 ? 'fm-bad' : null), td(r.sug ? fmtInt(r.sug) : !r.core ? 'Seasonal: sells through' : r.bought ? 'Covered by on order' : 'Not a PO line', 'n'));
      return clickRow(tr, () => openDrill(skuCard(r.s.i)));
    }), 'Nothing runs out within ' + H + ' weeks for these filters.');
  }

  // ---------- register ----------
  function hook(x) {
    decorate();
    if (ui.tab === 'stores') drawStores(x);
    if (ui.tab === 'overview') drawStoreMap(x);
    if (ui.tab === 'stock') drawAged(x);
    if (ui.tab === 'plan') drawAbc(x);
    if (ui.tab === 'adj') drawCount(x);
    if (ui.tab === 'courier') { drawInvoices(); drawProvMap(); drawAcctMaps(); drawDearest(); }
    if (ui.tab === 'peak') drawPeak(x);
    if (ui.tab === 'shorts') drawShorts();
    if (ui.tab === 'fcst') drawForecast(x);
  }
  window.fmHooks = (window.fmHooks || []).filter((h) => h.name !== 'hook').concat([hook]);
  if (F.ctx) F.drawAll();
})();
