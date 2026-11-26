// 행정심판 재결례 (국민권익위원회 온라인행정심판, 공공데이터포털 1140100/data) in 판례: the service takes no words, only a month's
// dates, so the 책장 server gathers every month's 재결 of the last three years into one small index (/api/acrc/index, the
// cron filling it month by month) and the words are looked for here, in each 재결's 사건명, 피청구인, 위원회, 분야 and the
// names of its 관련 법령 (an abbreviation lawyers use — 지방계약법 — finds the law's full name). A 재결 opens in a sheet: its
// 주문, 청구취지, 재결 이유 and 관련 법령, the articles and cases they cite linked as everywhere in the app (cases.linkCases),
// each 관련 법령's article headings opening that article in 법령. The index and each 재결 opened are kept on this device too.
//
//   render(sec, q, live, ui) → how many 재결 hold the words; sec: an empty <section> after 법원 판결 (none: it stays hidden)
//   find(q)                   → { rows, total, range, gathered } (rows: { no, date, cmt, clme, title, result, laws, field })
//   open(no, ui, row?)        → the 재결's sheet
//   ui: { sheet(html) → box, closeSheet(), lawGo(q, kind, old), caseSheet(no), courtSheet(ref), toast(msg) }
import * as api from './api.js?v=3dab24bfa8';
import * as store from './store.js?v=3dab24bfa8';
import * as cases from './cases.js?v=3dab24bfa8';
import * as laws from './laws.js?v=3dab24bfa8';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fail = (code, status = 0) => Object.assign(new Error(code), { code, status });
const MIN = 60e3;
export const dot = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[1]}. ${+m[2]}. ${+m[3]}.` : ''; };
const ymDot = (ym) => { const [y, m] = String(ym).split('-'); return `${y}. ${+m}.`; };
const norm = (s) => String(s || '').replace(/[\s·ㆍ「」｢｣『』()（）,.'"‘’“”-]/g, '').toLowerCase();

/* ---------- asking the server, and what is kept here ---------- */
async function fetchJson(op, params = {}) {
  const base = api.base();
  if (!base) throw fail('no_server');
  if (!api.hasToken()) throw fail('auth', 401);
  const qs = new URLSearchParams(params).toString();
  let r;
  try { r = await fetch(`${base}/api/acrc/${op}${qs ? '?' + qs : ''}`, { headers: api.authHeader(), cache: 'no-store' }); }
  catch (e) { throw fail(navigator.onLine === false ? 'offline' : 'server'); }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw fail((d && d.error) || 'http_' + r.status, r.status);
  return d;
}
const mem = new Map();
// kept and fresh → at once; else asked and kept; the server not answering → the kept one, however old
async function get(op, params, key, fresh) {
  let kept = mem.get(key);
  if (!kept) { try { kept = await store.get('kv', key); } catch (e) { kept = null; } if (kept) mem.set(key, kept); }
  if (kept && Date.now() - kept.at < fresh) return kept.d;
  try {
    const d = await fetchJson(op, params);
    const v = { at: Date.now(), d };
    mem.set(key, v);
    if (mem.size > 25) for (const k of mem.keys()) if (k !== key && k.startsWith('aj:b:')) { mem.delete(k); break; }   // (bodies are big: the last few kept here)
    store.put('kv', key, v).catch(() => {});
    return d;
  } catch (e) {
    if (kept && e.code !== 'none' && e.status !== 400) return kept.d;
    throw e;
  }
}

/* ---------- the index, and finding in it ---------- */
let idx = null, idxAt = 0;
function decode(d) {
  const at = (list, i) => (Array.isArray(list) && Number.isInteger(i) ? list[i] || '' : '');
  const rows = [];
  for (const r of Array.isArray(d.rows) ? d.rows : []) {
    if (!Array.isArray(r) || !r[0]) continue;
    const ls = (Array.isArray(r[6]) ? r[6] : []).map((i) => at(d.laws, i)).filter(Boolean);
    rows.push({ no: String(r[0]), date: String(r[1] || ''), cmt: at(d.cmts, r[2]), clme: String(r[3] || ''), title: String(r[4] || ''), result: at(d.results, r[5]), laws: ls, field: at(d.fields, r[7]) });
  }
  // how far back it reaches: the months gathered that have 재결, first to last ('2023. 12.–2026. 10.')
  const months = d.months && typeof d.months === 'object' ? d.months : {};
  const full = Object.keys(months).filter((k) => /^\d{4}-\d{2}$/.test(k) && months[k] > 0).sort();
  return { rows, range: full.length ? `${ymDot(full[0])}–${ymDot(full[full.length - 1])}` : '', gathered: Object.keys(months).length, want: Number(d.want) || 36 };
}
async function index() {
  if (idx && Date.now() - idxAt < 30 * MIN) return idx;
  const d = await get('index', {}, 'aj:index', 3 * 60 * MIN);
  idx = decode(d); idxAt = Date.now();
  return idx;
}
const hayOf = (r) => r._h || (r._h = [r.title, r.clme, r.cmt, r.field, ...r.laws, ...r.laws.map((l) => laws.lawId(l))].map(norm).join('|'));
// the words, each a law's own name when it is an abbreviation lawyers use (지방계약법 → 지방자치단체를당사자로하는계약에관한법률)
function wordsOf(q) {
  const ws = String(q || '').replace(/[「」｢｣『』]/g, ' ').split(/\s+/).map(norm).filter(Boolean);
  return ws.map((w) => { const id = norm(laws.lawId(w)); return id && id !== w ? [w, id] : [w]; });
}
export async function find(q) {
  const ix = await index();
  const ws = wordsOf(q);
  if (!ws.length) return { rows: [], total: 0, range: ix.range, gathered: ix.gathered, want: ix.want, all: ix.rows.length };
  const whole = norm(q);   // (a law's full name typed with its spaces: its words are each in it, and so is the whole)
  const hit = [], inTitle = [];
  for (const r of ix.rows) {
    const h = hayOf(r);
    if (!(ws.every((alts) => alts.some((w) => h.includes(w))) || (whole.length >= 4 && h.includes(whole)))) continue;
    const t = norm(r.title);
    (ws.every((alts) => alts.some((w) => t.includes(w))) ? inTitle : hit).push(r);
  }
  const rows = inTitle.concat(hit);   // (the words in the 사건명 first; each part newest first, as the index is)
  return { rows, total: rows.length, range: ix.range, gathered: ix.gathered, want: ix.want, all: ix.rows.length };
}

/* ---------- shown ---------- */
// 인용 (일부인용 too), 기각, 각하, and what else a 재결 may say (취하, 사정재결 …)
const resKind = (s) => (/인용/.test(s) ? 'in' : /기각/.test(s) ? 'rej' : /각하/.test(s) ? 'dis' : 'etc');
const KIND_NAME = { in: '인용', rej: '기각', dis: '각하', etc: '기타' };
const resHtml = (s, tag = 'em') => (s ? `<${tag} class="aj-res aj-${resKind(s)}">${esc(s)}</${tag}>` : '');
const lawShort = (ls) => (ls.length ? esc(ls.slice(0, 2).join(' · ')) + (ls.length > 2 ? ` 외 ${ls.length - 2}` : '') : '');
function rowHtml(r, hidden) {
  const meta = [esc(r.cmt), r.date ? esc(dot(r.date)) + ' 재결' : '', r.clme ? '피청구인 ' + esc(r.clme) : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="lrow aj-row" data-aj="${esc(r.no)}"${hidden ? ' hidden' : ''}><b>${esc(r.title || '사건명 없음')}</b><span>${meta}${r.result ? ' · ' + resHtml(r.result) : ''}</span>${r.laws.length ? `<span class="aj-ll">${lawShort(r.laws)}</span>` : ''}</button>`;
}
const SHOW = 10;
const whyNot = (e) => (e && e.code === 'offline' ? '인터넷에 연결되면 찾을 수 있습니다' : '지금은 행정심판 재결례에 닿지 않습니다');

// 판례: the 재결 that hold the words, under a line saying what was looked in ('2023. 12.–2026. 10. 재결 1,234건에서')
export async function render(sec, q, live = () => true, ui = {}) {
  if (!sec) return 0;
  const ok = () => sec.isConnected && live();
  sec.classList.add('law-sec', 'aj-sec');
  sec.dataset.sec = sec.dataset.sec || 'acrc';
  sec.setAttribute('aria-label', '행정심판 재결례');
  sec.hidden = true;
  let r;
  try { r = await find(q); }
  catch (e) {
    if (!ok() || ['auth', 'no_key', 'no_server'].includes(e && e.code)) return 0;
    sec.hidden = false;
    sec.innerHTML = `<h2 class="sec-h">행정심판 재결례</h2><div class="list law-list"><p class="none">${esc(whyNot(e))}</p></div>`;
    return 0;
  }
  if (!ok() || !r.total) return 0;
  const st = { kind: '', shown: SHOW };
  const counts = { in: 0, rej: 0, dis: 0, etc: 0 };
  for (const x of r.rows) counts[resKind(x.result)]++;
  const kinds = Object.keys(counts).filter((k) => counts[k]);
  const scope = `${r.range ? `${r.range} ` : ''}재결 ${r.all.toLocaleString()}건에서 찾았습니다${r.gathered < r.want ? ' · 지난 재결은 아직 모으는 중입니다' : ''}`;
  const draw = () => {
    const list = st.kind ? r.rows.filter((x) => resKind(x.result) === st.kind) : r.rows;
    const rows = list.map((x, i) => rowHtml(x, i >= st.shown)).join('');
    const more = list.length > st.shown ? `<button type="button" class="more aj-more">더 보기 · ${Math.min(st.shown, list.length)} / ${list.length.toLocaleString()}</button>` : '';
    const chips = kinds.length > 1 ? `<div class="aj-chips" role="group" aria-label="재결 결과"><button type="button" data-aj-kind="" aria-pressed="${!st.kind}">전체 <i>${r.total.toLocaleString()}</i></button>${kinds.map((k) => `<button type="button" data-aj-kind="${k}" aria-pressed="${st.kind === k}">${KIND_NAME[k]} <i>${counts[k].toLocaleString()}</i></button>`).join('')}</div>` : '';
    sec.innerHTML = `<h2 class="sec-h">행정심판 재결례 <small>국민권익위 온라인행정심판</small> <span class="sec-n">${r.total.toLocaleString()}건</span></h2>`
      + `<p class="aj-scope">${esc(scope)}</p>${chips}<div class="list law-list aj-list">${rows}${more}</div>`;
  };
  draw();
  sec.hidden = false;
  setTimeout(prune, 5000);
  sec.onclick = (e) => {
    const k = e.target.closest('[data-aj-kind]');
    if (k) { if (st.kind !== k.dataset.ajKind) { st.kind = k.dataset.ajKind; st.shown = SHOW; draw(); const b = sec.querySelector(`[data-aj-kind="${st.kind}"]`); if (b) b.focus({ preventScroll: true }); } return; }
    if (e.target.closest('.aj-more')) {
      const was = st.shown; st.shown += 20; draw();
      const first = sec.querySelectorAll('.aj-row')[was]; if (first) first.focus({ preventScroll: true });
      return;
    }
    const row = e.target.closest('[data-aj]');
    if (row) { const x = r.rows.find((y) => y.no === row.dataset.aj); open(row.dataset.aj, ui, x); }
  };
  return r.total;
}

/* ---------- one 재결 ---------- */
const HEAD = /^\s*(?:\d{1,2}\s*\.|[가-하]\s*\.|\d{1,2}\s*\)|[가-하]\s*\))\s*\S.{0,28}$/;   // '1. 사건개요', '가. 관계법령', '나. 판  단'
const LAW_HEAD = /^\s*【\s*([^【】]{2,80}?)\s*】\s*$/;
const ART_HEAD = /^(\s*)(제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,2}))?)(\s*\([^()\n]{1,60}\))?/;
// (a name the 재결 hides — 【○○시 수도 급수 조례】 — is no law to open: shown, not linked)
const masked = (name) => /[○◯〇●□△]|ㅇㅇ|OO/.test(name);
const lawLink = (name, label) => (masked(name) ? `<span class="aj-lawn aj-masked">${esc(label)}</span>` : `<span class="case-ln aj-lawn" role="button" tabindex="0" data-aj-law="${esc(name)}">${esc(label)}</span>`);
// a numbered heading of the 재결 itself ('3. 인정사실', '4. 이 사건 처분의 위법ㆍ부당 여부'), told from a quoted law's 호 by
// its number (the one after the heading the law came under) and its make (a 호 says '…경우', '…자', or has a colon)
const NUM_HEAD = /^\s*(\d{1,2})\s*\.\s*(\S.{0,28})$/;
const notHo = (t) => !/[:：]|(?:경우|것|자|사항|행위|때|곳)\s*$/.test(t);
// text as paragraphs, each with its citations linked; under a 【법령】 line (관련 법령, and the 관계법령 a 재결 quotes), each
// article's heading opens that article (제9조(계약의 방법) → 지방자치단체를 당사자로 하는 계약에 관한 법률 제9조)
function linked(text, { heads = false } = {}) {
  const out = [];
  let law = '', top = 0;   // top: the number of the last numbered heading
  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue;
    const lh = LAW_HEAD.exec(line);
    if (lh) { law = lh[1].replace(/\s+/g, ' '); out.push(`<p class="aj-lh">${lawLink(law, '【' + law + '】')}</p>`); continue; }
    const nh = heads && law && NUM_HEAD.exec(line);
    if (nh && +nh[1] === top + 1 && notHo(nh[2]) && !/[다음함]\.\s*$/.test(line)) { law = ''; top++; out.push(`<h5 class="aj-h">${esc(line.trim().replace(/\s{2,}/g, ' '))}</h5>`); continue; }
    const ah = law && !masked(law) && ART_HEAD.exec(line);
    if (ah) {
      const ref = `${law} 제${ah[3]}조${ah[4] ? '의' + ah[4] : ''}`, head = ah[2] + (ah[5] || '');
      out.push(`<p class="aj-art">${esc(ah[1])}<span class="case-ln" role="button" tabindex="0" data-art="${esc(ref)}">${esc(head)}</span>${cases.linkCases(line.slice(ah[0].length))}</p>`);
      continue;
    }
    // (inside a quoted law, its 호 '1. 공사: …' are no headings: only an unindented '나. 판  단' ends it)
    if (heads && HEAD.test(line) && !/[다음함]\.\s*$/.test(line) && (!law || /^[가-하]\s*\.\s*\S.{0,16}$/.test(line))) { const n = /^\s*(\d{1,2})\s*\./.exec(line); if (n) top = +n[1]; law = ''; out.push(`<h5 class="aj-h">${esc(line.trim().replace(/\s{2,}/g, ' '))}</h5>`); continue; }
    if (/^\s*\[표\]\s*$|^\s*\[그림\]\s*$/.test(line)) { out.push('<p class="aj-fig">[표는 재결서 원문에 있습니다]</p>'); continue; }
    out.push(`<p>${cases.linkCases(line)}</p>`);
  }
  return out;
}
const part = (h, inner, cls = '') => (inner ? `<section class="cs-sec${cls ? ' ' + cls : ''}"><h4>${h}</h4>${inner}</section>` : '');
const REASON_SHOW = 14;   // paragraphs of the 재결 이유 shown at first; the rest one tap away
function bodyHtml(b) {
  const order = linked(b.order).join(''), claim = linked(b.claim).join('');
  const reason = linked(b.reason, { heads: true });
  const rHtml = reason.length > REASON_SHOW + 4
    ? reason.slice(0, REASON_SHOW).join('') + `<details class="cs-fold aj-rmore"><summary>이유 모두 보기<span>${reason.length - REASON_SHOW}문단 더</span></summary><div class="aj-txt">${reason.slice(REASON_SHOW).join('')}</div></details>`
    : reason.join('');
  const names = (b.lawNames && b.lawNames.length ? b.lawNames : [...String(b.laws || '').matchAll(/【\s*([^【】\n]{2,80}?)\s*】/g)].map((m) => m[1]));
  const lawText = linked(b.laws).join('');
  const lawsHtml = names.length || lawText ? `<section class="cs-sec aj-lawsec"><h4>관련 법령</h4>${names.length ? `<p class="aj-lawnames">${names.map((n) => lawLink(n, n)).join('')}</p>` : ''}`
    + (lawText ? `<details class="cs-fold aj-lawtext"><summary>조문 보기<span>${names.length ? `${names.length}개 법령` : ''}</span></summary><div class="aj-txt">${lawText}</div></details>` : '') + '</section>' : '';
  const src = b.hwp ? `<section class="cs-sec aj-src"><h4>원문</h4><div class="cs-links"><a class="cs-link" href="${esc(b.hwp)}" target="_blank" rel="noopener">재결서 원문 <em>HWP</em></a></div></section>` : '';
  return part('주문', order ? `<div class="aj-txt">${order}</div>` : '') + part('청구취지', claim ? `<div class="aj-txt">${claim}</div>` : '')
    + part('재결 이유', rHtml ? `<div class="aj-txt">${rHtml}</div>` : '')
    + (b.cut ? '<p class="cs-wait aj-cut">긴 재결이라 앞부분까지만 보여 드립니다 · 전문은 재결서 원문에 있습니다</p>' : '')
    + lawsHtml + src
    + (!order && !claim && !rHtml ? '<p class="cs-wait">재결서 본문이 아직 공개되지 않았습니다</p>' : '');
}
const metaHtml = (x) => [resHtml(x.result, 'b'), esc(x.cmt), x.date ? esc(dot(x.date)) + ' 재결' : '', x.clme ? '피청구인 ' + esc(x.clme) : '', esc(x.field)].filter(Boolean).join(' · ');

// (without the app's own sheet, a plain one of the same make: the tests' and a page's that has none)
function ownSheet(html) {
  document.querySelectorAll('.sheet-wrap').forEach((w) => w.remove());
  const w = document.createElement('div');
  w.className = 'sheet-wrap in';
  w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><button class="ib sheet-x" aria-label="닫기">✕</button>${html}</div>`;
  document.body.appendChild(w);
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('.sheet-x')) w.remove(); });
  const box = w.querySelector('.sheet'); box.focus({ preventScroll: true });
  return box;
}
export async function open(no, ui = {}, row = null) {
  const x = row || (idx && idx.rows.find((r) => r.no === no)) || { no, title: '', cmt: '', date: '', clme: '', result: '', field: '', laws: [] };
  const box = (ui.sheet || ownSheet)(`<div class="cs-head"><h2>${esc(x.title || '행정심판 재결')}</h2></div><div class="cs-body aj-body"><div class="cs-meta aj-meta">${metaHtml(x)}</div><div class="aj-parts"><p class="cs-wait">재결서를 불러오는 중…</p></div></div>`);
  box.classList.add('case-sheet', 'aj-sheet');
  box.addEventListener('click', (e) => {
    const close = () => (ui.closeSheet ? ui.closeSheet() : box.closest('.sheet-wrap') && box.closest('.sheet-wrap').remove());
    const a = e.target.closest('[data-art]');
    if (a) { if (ui.lawGo) { close(); ui.lawGo(a.dataset.art, 'law', a.dataset.old ? { old: a.dataset.old, by: a.dataset.by || '' } : null); } return; }
    const l = e.target.closest('[data-aj-law]');
    if (l) { if (ui.lawGo) { close(); ui.lawGo(l.dataset.ajLaw, 'law'); } return; }
    const c = e.target.closest('[data-case]'); if (c) { if (ui.caseSheet) ui.caseSheet(c.dataset.case); return; }
    const j = e.target.closest('[data-court]'); if (j) { if (ui.courtSheet) ui.courtSheet(j.dataset.court); }
  });
  const parts = box.querySelector('.aj-parts');
  try {
    const b = await get('body', { no }, 'aj:b:' + no, 7 * 24 * 60 * MIN);
    if (!box.isConnected) return box;
    if (!x.title && b.title) { box.querySelector('.cs-head h2').textContent = b.title; box.querySelector('.aj-meta').innerHTML = metaHtml({ ...b, laws: b.lawNames || [] }); }
    parts.innerHTML = bodyHtml(b);
  } catch (e) {
    if (box.isConnected) parts.innerHTML = `<p class="cs-wait">${e && e.code === 'offline' ? '인터넷에 연결되면 재결서를 볼 수 있습니다' : e && e.code === 'none' ? '이 재결의 본문을 찾지 못했습니다' : '지금은 재결서를 불러오지 못했습니다 · 잠시 뒤 다시 열어 보세요'}</p>`;
  }
  return box;
}

// (what was kept here and not opened for two months is let go, once a session)
let pruned = false;
export async function prune() {
  if (pruned) return; pruned = true;
  try {
    for (const k of await store.keys('kv')) {
      if (typeof k !== 'string' || !k.startsWith('aj:b:')) continue;
      const v = await store.get('kv', k);
      if (!v || !(Date.now() - v.at < 60 * 24 * 60 * MIN)) store.del('kv', k).catch(() => {});
    }
  } catch (e) { /* kept */ }
}
