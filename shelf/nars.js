// 국회입법조사처 발간물 (이슈와 논점 · NARS 현안분석 · 입법·정책보고서 · NARS 브리프 …) by the words of their titles, from the
// 책장 server's /api/nars/reports (공공데이터포털 9735000/PublicationService; the server holds the key and keeps the answers
// 6 hours). Each report: its title, kind and date, '원문 보기' (the institute's own viewer, in a new tab) and '서재에 넣기'
// (its PDF through /api/paper/pdf { nars } — the server fetches it from www.nars.go.kr alone — put on the shelf as any
// open original is).
//
//   search(q, { kind, page })        → { q, kind, total, page, rows, more, items: [{ id, title, kind, kindCode, date, pdf?, viewer? }] }
//   forLaw(name, { aliases, limit }) → { items, more, next() } the reports whose title names that law (for 법령: app.js or laws.js)
//   mount(sec, q, ui)                → 논문 찾기's section: sec an empty <section>; resolves to how many were found
//   lawSection(sec, name, ui)        → the same rows for one law (법령's screen), quiet when there are none
//   ui: { upload(files), toast(msg), mine?(title) → bool, live?() → bool }
import * as api from './api.js?v=8af7a0a5d7';
import * as papers from './papers.js?v=8af7a0a5d7';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SHOW = 5;   // rows shown at first; 더 보기 shows ten more at a time (and asks the next page when those run out)
const fail = (code, status = 0) => Object.assign(new Error(code), { code, status });
// '2026-11-26' → '2026. 11. 26.'
export const dot = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[1]}. ${+m[2]}. ${+m[3]}.` : ''; };
const web = (u) => (/^https?:\/\/[^\s"'<>]+$/.test(String(u || '')) ? String(u) : '');

/* ---------- asking ---------- */
async function ask(params) {
  const base = api.base();
  if (!base) throw fail('no_server');
  if (!api.hasToken()) throw fail('auth', 401);
  let r;
  try { r = await fetch(`${base}/api/nars/reports?${new URLSearchParams(params)}`, { headers: api.authHeader(), cache: 'no-store' }); }
  catch (e) { throw fail(navigator.onLine === false ? 'offline' : 'server'); }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw fail((d && d.error) || 'http_' + r.status, r.status);
  return d;
}
const mem = new Map();   // the last answers, for going back to a question (the server keeps them 6 hours as well)
export async function search(q, { kind = '', page = 1 } = {}) {
  const words = String(q || '').replace(/\s+/g, ' ').trim();
  if (words.replace(/\s/g, '').length < 2) return { q: words, kind, total: 0, page: 1, rows: 0, more: false, items: [] };
  const key = JSON.stringify([words, kind, page]);
  const kept = mem.get(key);
  if (kept && Date.now() - kept.at < 30 * 60e3) return kept.d;
  const d = await ask({ q: words, ...(kind ? { kind } : {}), page: String(page) });
  const items = (Array.isArray(d.items) ? d.items : []).filter((x) => x && x.title).map((x) => ({ ...x, title: papers.clean(x.title), viewer: web(x.viewer), pdf: web(x.pdf) }));
  const out = { ...d, items };
  mem.set(key, { at: Date.now(), d: out });
  if (mem.size > 40) mem.delete(mem.keys().next().value);
  return out;
}

/* ---------- a law's reports ---------- */
const tight = (s) => String(s || '').replace(/[\s·ㆍ「」｢｣『』<>〈〉《》"'“”‘’]/g, '');
// whether a title names this law: the name as a word of its own — not 주택법 inside 임대주택법, nor 헌법 inside 헌법재판소, nor
// the law inside its 시행령
const lawRe = (n) => new RegExp([...n].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s·ㆍ]*'), 'g');   // (spaced or not)
export function names(title, n) {
  const t = String(title || ''), re = lawRe(n);
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const before = t[m.index - 1] || '', after = t.slice(m.index + m[0].length).replace(/^\s+/, '').slice(0, 4);
    if (/[가-힣]/.test(before)) continue;
    if (/^(?:시행령|시행규칙|재판소|재판관|학회)/.test(after)) continue;
    return true;
  }
  return false;
}
// name: the law's own name; aliases: what lawyers call it too (laws.lawAliases(name), spaces out): 정보공개법 …
// → { items, more, next() }: next() gives the next ones ({ items, more }), each name's next page asked only while it has one
export async function forLaw(name, { aliases = [], limit = 30 } = {}) {
  const full = String(name || '').replace(/\s+/g, ' ').trim();
  if (tight(full).length < 2) return { items: [], more: false, next: async () => ({ items: [], more: false }) };
  const all = [...new Set([tight(full), ...aliases.map(tight)])].filter((n) => n.length >= 2);
  // asked: the full name (its words matched on the server) and the two shortest other names (an abbreviation is what a
  // report's title most often writes) — at most three asks, each kept by the server
  const asks = [full, ...all.filter((n) => n !== tight(full)).sort((a, b) => a.length - b.length).slice(0, 2)].map((q) => ({ q, page: 0, more: true }));
  const seen = new Set(), left = [];
  const take = async () => {
    const got = await Promise.all(asks.map((a) => (!a.more ? null : search(a.q, { page: a.page + 1 })
      .then((r) => { a.page++; a.more = !!r.more; return r; }, (e) => (e.code === 'auth' || e.code === 'no_key' ? Promise.reject(e) : null)))));
    const items = [];
    for (const r of got) for (const x of (r && r.items) || []) if (!seen.has(x.id || x.title) && all.some((n) => names(x.title, n))) { seen.add(x.id || x.title); items.push(x); }
    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    left.push(...items);
  };
  const more = () => left.length > 0 || asks.some((a) => a.more);
  await take();
  const first = left.splice(0, limit);
  // (the next ones: what was found and not shown yet, then the next pages — a page whose titles name the law nowhere gives none)
  const next = async () => { if (!left.length && asks.some((a) => a.more)) await take(); return { items: left.splice(0, limit), more: more() }; };
  return { items: first, more: more(), next };
}

/* ---------- shown ---------- */
const rowHtml = (x, ui, hidden) => {
  const mine = ui && typeof ui.mine === 'function' && ui.mine(x.title);
  const meta = [x.kind, dot(x.date)].filter(Boolean).map(esc).join(' · ');
  return `<div class="nr-item" data-nr="${esc(x.id)}"${hidden ? ' hidden' : ''}><p class="nr-t">${esc(x.title)}${mine ? ' <em class="pp-mine">내 서재</em>' : ''}</p><p class="nr-m">${meta}</p>`
    + `<div class="nr-acts">${x.viewer ? `<a class="btn ghost small nr-view" href="${esc(x.viewer)}" target="_blank" rel="noopener">원문 보기</a>` : ''}`
    + `${x.pdf ? `<button type="button" class="btn small nr-put" data-nr-put="${esc(x.id)}">서재에 넣기</button>` : ''}</div></div>`;
};
const whyNot = (e) => (e && e.code === 'offline' ? '인터넷에 연결되면 찾을 수 있습니다' : '지금은 국회입법조사처 자료에 닿지 않습니다');
const quiet = (e) => !e || ['auth', 'no_key', 'no_server', 'bad_kind'].includes(e.code);   // (no key on the server: the section is simply not there)

// the PDF of a report onto the shelf: asked of the server once (it reads the institute's file and checks it is a PDF)
async function put(btn, x, ui) {
  if (btn.disabled) return;
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = '받는 중…';
  const again = (msg) => { btn.disabled = false; btn.textContent = was; if (ui.toast) ui.toast(msg); };
  try {
    const got = await api.paperPdf({ nars: x.pdf });
    if (!got || !got.blob) { again('지금은 원문 PDF를 받지 못했습니다 · ‘원문 보기’로 열어 보세요'); return; }
    const nm = ('국회입법조사처_' + papers.mainTitle(x.title)).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    ui.upload([new File([got.blob], nm + '.pdf', { type: 'application/pdf' })]);
    btn.textContent = '넣었습니다';
    if (ui.toast) ui.toast('보고서를 서재에 넣고 있습니다');
  } catch (e) {
    again(e && e.code === 'offline' ? '인터넷에 연결되면 받을 수 있습니다' : '지금은 원문 PDF를 받지 못했습니다');
  }
}

// a list of reports in sec: SHOW at first, 더 보기 for more (next(): the next page's items, or null when there are none)
function paint(sec, head, first, ui, next) {
  const st = { items: first.items.slice(), shown: Math.min(SHOW, first.items.length), more: !!next };
  const draw = () => {
    const list = st.items.map((x, i) => rowHtml(x, ui, i >= st.shown)).join('');
    const left = st.items.length - st.shown;
    const more = left > 0 || st.more ? `<button type="button" class="more nr-more">더 보기${first.total ? ` · ${st.shown} / ${Math.max(first.total, st.items.length).toLocaleString()}` : ''}</button>` : '';
    sec.innerHTML = head(st) + `<div class="list law-list nr-list">${list}${more}</div>`;
  };
  draw();
  let asking = false;   // (a second press while the next page comes asks nothing more: else a page would be skipped)
  sec.onclick = async (e) => {
    const b = e.target.closest('[data-nr-put]');
    if (b) { const x = st.items.find((y) => y.id === b.dataset.nrPut); if (x) put(b, x, ui); return; }
    const mo = e.target.closest('.nr-more');
    if (!mo || asking) return;
    if (st.items.length - st.shown < 10 && st.more) {
      mo.textContent = '불러오는 중…';
      asking = true;
      try { const add = await next(); if (!sec.isConnected) return; if (add) { const have = new Set(st.items.map((x) => x.id)); st.items.push(...add.items.filter((x) => !have.has(x.id))); st.more = add.more; } else st.more = false; }
      catch (err) { mo.textContent = '불러오지 못했습니다 · 다시 누르기'; return; }
      finally { asking = false; }
    }
    st.shown = Math.min(st.items.length, st.shown + 10);
    draw();
    const firstNew = sec.querySelectorAll('.nr-item')[st.shown - 10];
    if (firstNew) { const t = firstNew.querySelector('.nr-view, .nr-put'); if (t) t.focus({ preventScroll: true }); }
  };
  return st;
}

// 논문 찾기: the reports whose titles hold the words — a section under the papers (none found: nothing shown)
export async function mount(sec, q, ui = {}) {
  if (!sec) return 0;
  const live = () => sec.isConnected && (!ui.live || ui.live());
  sec.classList.add('nr-sec');
  sec.setAttribute('aria-label', '국회입법조사처');
  sec.hidden = true;
  const words = String(q || '').replace(/\s+/g, ' ').trim();
  if (words.replace(/\s/g, '').length < 2) return 0;
  let r;
  try { r = await search(words); }
  catch (e) {
    if (!live() || quiet(e)) return 0;
    sec.hidden = false;
    sec.innerHTML = `<h2 class="sec-h">국회입법조사처</h2><div class="list law-list nr-list"><p class="none">${esc(whyNot(e))}</p></div>`;
    return 0;
  }
  if (!live()) return 0;
  // (several words: the server asked the longest and kept those whose title holds every word — the count it gives is of
  // the longest word alone, so what is shown is counted here)
  const many = words.includes(' ');
  if (!r.items.length) return 0;
  let page = 1;
  const next = async () => { const n = await search(words, { page: page + 1 }); page++; return n; };   // (a failed ask is asked again)
  const total = many ? 0 : r.total;
  sec.hidden = false;
  paint(sec, (st) => `<h2 class="sec-h">국회입법조사처 <small>보고서 · 제목에서</small> <span class="sec-n">${total ? `${total.toLocaleString()}건` : `${st.items.length}건${st.more ? ' 이상' : ''}`}</span></h2>`,
    { items: r.items, total }, ui, r.more ? next : null);
  return r.items.length;
}

// 법령: the reports that name this law in their titles (aliases: laws.lawAliases(name)); nothing found, nothing shown
export async function lawSection(sec, name, ui = {}) {
  if (!sec) return 0;
  const live = () => sec.isConnected && (!ui.live || ui.live());
  sec.classList.add('nr-sec');
  sec.hidden = true;
  let r;
  try { r = await forLaw(name, { aliases: ui.aliases || [] }); } catch (e) { return 0; }
  if (!live() || !r.items.length) return 0;
  sec.hidden = false;
  paint(sec, (st) => `<h2 class="sec-h">국회입법조사처 보고서 <small>제목에 이 법령</small> <span class="sec-n">${st.items.length}건${st.more ? ' 이상' : ''}</span></h2>`, { items: r.items, total: 0 }, ui, r.more ? r.next : null);
  return r.items.length;
}
