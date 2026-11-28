// 다듬기 — the owner's own academic Korean, made better by Claude without losing the owner's voice, and its citations
// checked against the app's own data.
// The text goes to the shelf's server, which holds the owner's Anthropic key and asks Claude (Fable first; Opus when Fable
// declines or cannot be had); the answer comes back as it is written (server-sent events). What can be asked, in this
// order: 내 문체로 다듬기 · 간결하게 · 맞춤법·문법 (the three rewrites: what changed is marked word by word, as tracked
// changes are) · 논리 점검 (opinions only, the text untouched) · 인용 점검 (no Claude: each 헌재 decision, court judgment,
// article and paper the text cites is looked up in the app's own data — cases.js, laws.js, the KCI index — and what
// differs can be put right in place) · and, apart, 옮기기: 영어 초록으로.
// A rewrite's [근거 필요: …] notes are kept out of the manuscript when it is taken (근거 메모, under the box), unless asked.
// 내 문체 익히기 picks paragraphs from the owner's own papers on the shelf (those filed '<owner>_…', or the ones the owner
// picks: introductions, arguments, conclusions — never a note, a table or a reference) and has Claude describe the style
// once; the server keeps the description, shows it here to be read, and sets it before every request.
// Kept on this device: the draft, as typed, and where it came from; the last 20 answers (다듬은 기록), also kept with the
// server and so on every device while '기기 사이에 맞추기' is on.
import * as api from './api.js?v=624e00e99c';
import * as store from './store.js?v=624e00e99c';
import { ME } from './research.js?v=624e00e99c';
import { cleanCopy } from './analyze.js?v=624e00e99c';
import * as cases from './cases.js?v=624e00e99c';
import * as laws from './laws.js?v=624e00e99c';
import * as kciq from './kciq.js?v=624e00e99c';
import * as papers from './papers.js?v=624e00e99c';

const ACTS = {
  polish: { label: '내 문체로 다듬기', rewrite: true },
  concise: { label: '간결하게', rewrite: true },
  proof: { label: '맞춤법·문법', rewrite: true },
  logic: { label: '논리·일관성 점검', sub: '의견만', rewrite: false },
  cite: { label: '인용 점검', local: true, rewrite: false },        // (the app's own data: nothing goes to Claude)
  english: { label: '영어 초록으로', rewrite: false, move: true },  // (옮기기: a translation, last and apart)
};
const KEEP = 20;          // answers kept (다듬은 기록)
const MAX = 600000;       // letters a text may have: a whole paper at once (the server says so too: info.max)
const GO_ON = 8;          // an answer longer than one reply is carried on this many times at most

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (n) => Number(n || 0).toLocaleString('ko-KR');
// what the server counts: one per character (a Hangul syllable is one), whatever its bytes
export const letters = (s) => { let n = 0; for (const c of String(s || '')) n++; return n; };
const stem = (name) => String(name || '').replace(/\.pdf$/i, '');
// a region drawn again only when what it shows changed (the same HTML twice is never written: no flicker, the focus and
// a list's scroll stay)
function setHtml(el, html) {
  if (!el || el._h === html) return false;
  el.innerHTML = html; el._h = html;
  return true;
}

const W = {
  ctx: null, root: null,
  info: null, infoErr: '',   // the server's word: key set?, models, limits, today's count, the style's date
  draft: null, hist: null,   // (null until read from this device)
  from: undefined,           // where the draft came from (setDraft): { title, page, fileId } | null (undefined: not read yet)
  cur: null,                 // what the result card shows: an answer { act, input, out, state: wait|writing|done|stopped|error,
                             // model, … } or a citation check { act: 'cite', input, items, state: checking|done }
  run: null,                 // the request under way: { ctrl, cur }
  style: null,               // the style as learned: { text, at, papers, paragraphs, chars, model }
  styleOpen: false, learn: null, diffOn: true,
  notes: null,               // 근거 메모: [{ id, note, sentence }] (null until read)
  mine: null,                // the papers picked as the owner's own (ids), or [] when none were picked
  sync: true, syncOk: null,  // 다듬은 기록 kept with the server too (the owner's choice; syncOk false: the server has no room for it)
};
const maxLetters = () => (W.info && W.info.max) || MAX;
const ready = () => !!(W.info && W.info.key && !W.info.cached) && !W.run;
// the server's answer about 다듬기 (key, today's count) as last heard: the line under the buttons is drawn with it at once, so
// it never comes a moment later and pushes the screen down (the buttons wait for the server's own answer)
const INFO_LS = 'shelf:write:info';
const infoSeen = () => { try { const v = JSON.parse(localStorage.getItem(INFO_LS) || 'null'); return v && typeof v === 'object' ? { ...v, cached: true } : null; } catch (e) { return null; } };

/* ---------------- the screen ---------------- */
// ctx (from app.js): files() — the shelf's live papers; textOf(f) — a paper's page texts; toast(msg, ms, action);
// openFrom(from) — back to where a draft came from (optional)
const NOTICE = '글은 Anthropic(Claude)으로 보내 처리합니다 · 학습에 쓰지 않고 30일 뒤 지웁니다';
const NOTICE_FULL = 'API로 보낸 글은 학습에 쓰이지 않지만(기본 설정), Fable 모델의 조건에 따라 Anthropic이 30일 동안 보관한 뒤 지웁니다. 인용 점검은 Claude에 보내지 않고 이 앱의 판례·법령·논문 자료로만 대조합니다.';
const actHtml = (k, a) => `${a.move ? '<span class="wr-move">옮기기</span>' : ''}<button type="button" class="btn wr-a${k === 'polish' ? ' primary' : ''}" data-act="${k}"${a.move ? ` aria-label="옮기기: ${esc(a.label)}"` : ''}${a.local ? ' title="판례·법령·논문 자료와 대조합니다 · Claude를 쓰지 않습니다"' : ''}>${esc(a.label)}${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</button>`;
export function show(c, ctx) {
  W.ctx = ctx;
  if (W.root && W.root.isConnected && c.contains(W.root)) {   // drawn already: a redraw of the app leaves it as it is
    paintSty(); paintFrom();   // (only what changed: the shelf's papers may have come since — 내 문체's count)
    return;
  }
  ensureStyle();
  if (W.from === undefined) { try { const f = localStorage.getItem(FROM_LS); if (f) W.from = JSON.parse(f); } catch (e) { /* none here: from IndexedDB below */ } }
  try { W.sync = localStorage.getItem(SYNC_LS) !== '0'; } catch (e) { /* kept on */ }
  if (!W.info) W.info = infoSeen();
  c.innerHTML = `<div class="wr">
    <header class="wr-head"><p class="wr-sub">내 글을 내 문체로 고치고, 논리와 인용을 점검합니다</p></header>
    <p class="wr-from" hidden></p>
    <div class="wr-edit"><textarea class="wr-in" placeholder="다듬을 글을 붙여 넣거나 여기에 쓰세요" aria-label="다듬을 글" spellcheck="false"></textarea>
      <div class="wr-foot"><span class="wr-n" aria-live="polite"></span><span class="sp"></span><button type="button" class="wr-clear">지우기</button></div></div>
    <section class="wr-notes" aria-label="근거 메모" hidden></section>
    <details class="wr-privacy"><summary><span>${esc(NOTICE)}</span></summary><p>${esc(NOTICE_FULL)}</p></details>
    <div class="wr-acts" role="group" aria-label="할 일">${Object.entries(ACTS).map(([k, a]) => actHtml(k, a)).join('')}</div>
    <p class="wr-status" aria-live="polite"></p>
    <section class="wr-res" hidden></section>
    <section class="wr-sty"></section>
    <section class="wr-rules"></section>
    <section class="wr-hist" hidden></section>
  </div>`;
  W.root = c.querySelector('.wr');
  hook();
  wire();
  const ta = $('.wr-in');
  if (W.draft != null) ta.value = W.draft;
  paintFrom();   // (read at once, before the first paint: the line never comes in later and pushes the box down)
  paintCount(); paintActs(); paintNotes(); paintRes(); paintSty(); paintHist(); paintRules();
  load(); loadRules();
}
const $ = (s) => (W.root ? W.root.querySelector(s) : null);
const live = () => !!(W.root && W.root.isConnected);

async function load() {
  if (W.draft == null) {
    // the draft as it was when the page last went away (kept at once in localStorage, as the page may not live long
    // enough to finish writing to IndexedDB), else the one saved as it was typed
    let last = null; try { last = localStorage.getItem(DRAFT_LS); } catch (e) { /* no storage here */ }
    W.draft = last != null ? last : (await store.get('kv', 'write:draft').catch(() => '')) || '';
    if (last != null) store.put('kv', 'write:draft', last).then(dropDraftLS).catch(() => {});
    const ta = $('.wr-in'); if (ta && !ta.value) { ta.value = W.draft; paintCount(); paintActs(); }
  }
  if (W.from === undefined) { const f = await store.get('kv', 'write:from').catch(() => null); if (W.from === undefined) { W.from = f || null; paintFrom(); } }
  if (W.notes == null) { W.notes = (await store.get('kv', 'write:notes').catch(() => null)) || []; paintNotes(); fillNotes(); }
  if (W.mine == null) { W.mine = (await store.get('kv', 'write:mine').catch(() => null)) || []; paintSty(); }
  if (W.hist == null) { W.hist = (await store.get('kv', 'write:history').catch(() => null)) || []; paintHist(); }
  if (!W.style) { W.style = (await store.get('kv', 'write:style').catch(() => null)) || null; paintSty(); }
  // an answer asked for before the page went away (reloaded, closed, the phone locked): the server kept it
  const p = await store.get('kv', 'write:pending').catch(() => null);
  if (p && p.id && ACTS[p.act] && !ACTS[p.act].local && !W.run && !W.cur && Date.now() - p.at < 6 * 3600e3) {
    W.cur = { id: p.id, at: p.at, act: p.act, input: p.input, out: '', state: 'wait', t0: p.at };
    resume(W.cur);
  } else if (p && !W.run && !W.cur) store.del('kv', 'write:pending').catch(() => {});
  pullHist();
  await refreshInfo();
}
let resetT = null;
async function refreshInfo() {
  try { W.info = await api.writeInfo(); W.infoErr = ''; try { localStorage.setItem(INFO_LS, JSON.stringify(W.info)); } catch (e) { /* not kept */ } }
  catch (e) { W.infoErr = api.isOffline(e) ? 'offline' : 'server'; if (W.info && W.info.cached) W.info = null; }
  // the day's count and budget start again at midnight in Korea: asked again then, so a screen left open opens too
  clearTimeout(resetT);
  const ms = W.info && W.info.reset ? W.info.reset - Date.now() + 5000 : 0;
  if (ms > 0 && ms < 2 ** 31 - 1) resetT = setTimeout(() => { if (live() && !W.run) refreshInfo(); }, ms);
  paintActs(); paintSty();
  const s = W.info && W.info.style;
  if (s && (!W.style || W.style.at !== s.at)) {   // learned again (here or on another device): the new one is read
    try { const d = await api.writeStyle(); W.style = { text: d.text, at: d.at, papers: d.papers, paragraphs: d.paragraphs, chars: d.chars, model: d.model }; store.put('kv', 'write:style', W.style).catch(() => {}); }
    catch (e) { /* the date shows; the text next time */ }
    paintSty();
  } else if (W.info && !s && W.style) { W.style = null; store.del('kv', 'write:style').catch(() => {}); paintSty(); }
}

// The draft is saved 400 ms after the typing stops; when the page goes away first (pagehide, or hidden: on a phone the
// last moment that is sure to come), it is written at once to localStorage too, which is synchronous, and that copy is
// dropped again once IndexedDB holds the same or a newer text.
const DRAFT_LS = 'shelf:write:draft';
const dropDraftLS = () => { try { localStorage.removeItem(DRAFT_LS); } catch (e) { /* no storage here */ } };
let saveT = null;
const saveDraft = () => { saveT = null; store.put('kv', 'write:draft', W.draft).then(dropDraftLS).catch(() => {}); };
function flushDraft() {
  if (!saveT || W.draft == null) return;   // nothing typed since the last save
  clearTimeout(saveT);
  try { localStorage.setItem(DRAFT_LS, W.draft); } catch (e) { /* full or blocked: IndexedDB alone */ }
  saveDraft();
}
// once for the page: the draft kept when it goes away; when it is back, the day's count read again (another device, or
// midnight, may have changed it), the answers made on another device fetched, and an answer whose connection was lost
// fetched from the server
let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  addEventListener('pagehide', flushDraft);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushDraft(); return; }
    if (!live() || W.run) return;
    refreshInfo();
    pullHist();
    if (W.cur && W.cur.resumable) resume(W.cur);
  });
}
function wire() {
  const ta = $('.wr-in');
  ta.addEventListener('input', () => {
    W.draft = ta.value; paintCount(); paintActs(); paintUse(); paintStale();
    clearTimeout(saveT); saveT = setTimeout(saveDraft, 400);
  });
  $('.wr-clear').onclick = () => {
    if (!ta.value) return;
    const prev = ta.value, was = W.from, notes = W.notes;
    putDraft(''); putFrom(null); putNotes([]);
    W.ctx.toast('지웠습니다', 6000, { label: '되돌리기', fn: () => { putDraft(prev); putFrom(was); putNotes(notes); } });
  };
  $('.wr-acts').onclick = (e) => { const b = e.target.closest('[data-act]'); if (b) ask(b.dataset.act); };
  W.root.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('.wr-stop')) { stopRun(); return; }
    if (t.closest('.wr-copy')) { copy(W.cur && W.cur.out); return; }
    if (t.closest('.wr-use')) { useIt(false); return; }
    if (t.closest('.wr-use-n')) { useIt(true); return; }
    if (t.closest('.wr-tog input')) { W.diffOn = t.checked; paintRes(); return; }
    if (t.closest('.wr-sync input')) { setSync(t.checked); return; }
    const n = t.closest('[data-n]'); if (n) { noteAct(n.dataset.n, n.closest('[data-ni]')); return; }
    const k = t.closest('[data-ck]'); if (k) { checkAct(k.dataset.ck, k); return; }
    const h = t.closest('[data-h]'); if (h) { openHist(h.dataset.h); return; }
    const s = t.closest('[data-s]'); if (s) { styleAct(s.dataset.s); return; }
  });
  // 내 논문 고르기: the list is filtered and ticked in place (never drawn again while it is open: the scroll and the focus stay)
  W.root.addEventListener('input', (e) => { if (e.target.closest('.wr-pq')) pickFilter(e.target.value); });
  W.root.addEventListener('change', (e) => { const x = e.target.closest('.wr-pi input'); if (x) pickTick(x.value, x.checked); });
}
function putDraft(v) {
  const ta = $('.wr-in'); if (ta) ta.value = v;
  W.draft = v; paintCount(); paintActs(); paintUse(); paintStale();
  clearTimeout(saveT); saveDraft();
}
// 8차 계약: a text sent here from elsewhere — a passage chosen while reading (A17) — put in the box as the draft (saved at
// once, so a reload keeps it), with where it came from shown above it: '읽던 곳: <title> · 12쪽'.
// from: { title, page (the page's label as shown: 12, '12' or '표지'), fileId, at (the reader's page index, for going back) } or null. Works whether or not the screen is drawn yet.
export function setDraft(text, { from = null } = {}) {
  putDraft(String(text ?? ''));
  putFrom(from && (from.title || from.page != null) ? { title: String(from.title || ''), page: from.page ?? '', fileId: from.fileId || '', ...(from.at != null ? { at: from.at } : {}) } : null);
}
const FROM_LS = 'shelf:write:from';
function putFrom(f) {
  W.from = f || null;
  (W.from ? store.put('kv', 'write:from', W.from) : store.del('kv', 'write:from')).catch(() => {});
  try { if (W.from) localStorage.setItem(FROM_LS, JSON.stringify(W.from)); else localStorage.removeItem(FROM_LS); } catch (e) { /* IndexedDB alone */ }
  paintFrom();
}
// the line above the box: where the draft came from (a button back there when the app gives the way: ctx.openFrom)
function paintFrom() {
  const p = $('.wr-from'); if (!p) return;
  const f = W.from;
  if (!f) { p.hidden = true; return; }
  const pg = f.page !== '' && f.page != null ? String(f.page) : '';
  const label = `읽던 곳: ${f.title}${pg ? ` · ${/^\d+$/.test(pg) ? pg + '쪽' : pg}` : ''}`;
  const go = !!(W.ctx && W.ctx.openFrom);
  setHtml(p, go ? `<button type="button" class="wr-from-go">${esc(label)}</button>` : `<span>${esc(label)}</span>`);
  if (go && p.firstChild) p.firstChild.onclick = () => W.ctx.openFrom(W.from);
  p.hidden = false;
}
// 멈추기: the server is told first (it would otherwise read the answer to the end, to keep it for this screen), then the
// stream is let go
function stopRun() {
  if (!W.run) return;
  const id = W.run.cur && W.run.cur.id;
  if (id) api.writeStop(id).catch(() => {});
  W.run.ctrl.abort();
}

function paintCount() {
  const ta = $('.wr-in'), n = $('.wr-n'); if (!ta || !n) return;
  const k = letters(ta.value.trim()), max = maxLetters();
  n.textContent = k > max ? `${nf(k)}자 · ${nf(max)}자까지 한 번에 보낼 수 있습니다. 나눠서 보내 주세요.` : `${nf(k)}자`;
  n.classList.toggle('over', k > max);
}
// the buttons, and the line under them: today's count, or why nothing can be asked now. 인용 점검 asks no one but the
// app's own data: it waits only for a text (and for a check or an answer under way)
function paintActs() {
  if (!live()) return;
  const ta = $('.wr-in'), k = letters(ta.value.trim());
  const can = ready() && k > 0 && k <= maxLetters(), full = dayFull(W.info);
  W.root.querySelectorAll('.wr-a').forEach((b) => { b.disabled = b.dataset.act === 'cite' ? !(k > 0) || !!W.run || !!W.checking : !can || full; });
  const st = $('.wr-status');
  st.classList.remove('warn');
  if (W.info && !W.info.key) { st.classList.add('warn'); st.textContent = '다듬기를 쓰려면 서버에 본인의 Claude(Anthropic) API 키를 넣어 두어야 합니다.'; return; }
  if (!W.info) { st.textContent = W.infoErr === 'offline' ? '인터넷에 연결되면 쓸 수 있습니다. 인용 점검은 이 기기에 받아 둔 자료로 합니다.' : W.infoErr ? '책장 서버에 연결하지 못했습니다. 잠시 뒤에 다시 열어 주세요.' : ''; return; }
  if (full) { st.classList.add('warn'); st.textContent = W.info.cap && W.info.used >= W.info.cap ? capText(W.info) : budgetText(W.info); return; }
  // no day's limit on the server (the owner's limit is the Anthropic account's own): just what today has used
  const spend = W.info.budget ? ` · 약 ${usd(W.info.spent)} / ${usd(W.info.budget)}` : Number(W.info.spent) > 0 ? ` · 약 ${usd(W.info.spent)}` : '';
  const count = W.info.cap ? `${nf(W.info.used)} / ${nf(W.info.cap)}회` : `${nf(W.info.used)}회`;
  st.textContent = `오늘 ${count}${spend} · ${(W.info.models && W.info.models[0] && W.info.models[0].name) || 'Claude'}`;
}
// the day used up: its requests (info.cap) or its budget in dollars (info.budget, what the answers cost as estimated)
const dayFull = (i) => !!(i && ((i.cap && i.used >= i.cap) || (i.budget && i.spent >= i.budget)));
const usd = (n) => '$' + (Number(n) || 0).toFixed(Number(n) >= 100 ? 0 : 2).replace(/\.00$/, '');
const capText = (e) => `오늘 쓸 수 있는 ${nf(e.cap || 150)}회를 다 썼습니다. 내일 0시(한국 시간)에 다시 열립니다.`;
const budgetText = (e) => `오늘 쓸 수 있는 비용(약 ${usd(e.budget || 40)})을 다 썼습니다. 내일 0시(한국 시간)에 다시 열립니다.`;

/* ---------------- asking ---------------- */
function ask(k) {
  if (!ACTS[k]) return;
  if (k === 'cite') { runCheck(); return; }
  if (W.run) return;
  const text = $('.wr-in').value.trim();
  if (!text) { W.ctx.toast('먼저 글을 넣어 주세요'); $('.wr-in').focus(); return; }
  if (letters(text) > maxLetters()) { paintCount(); return; }
  const cur = { id: newId(), at: Date.now(), act: k, input: text, out: '', state: 'wait', t0: Date.now() };
  W.cur = cur;
  paintRes();
  reveal();
  // kept until the answer is in: if the page goes away meanwhile, it is fetched from the server when the page is back
  store.put('kv', 'write:pending', { id: cur.id, at: cur.at, act: k, input: text }).catch(() => {});
  // the card brought into view once more when its first words come (a phone: the answer would grow below the fold) —
  // once, never again while it is written
  let shown = false;
  const paint = (t) => { paintRes(t); if (!shown && cur.state === 'writing' && W.cur === cur) { shown = true; reveal(); } };
  go({ action: k, text, id: cur.id }, cur, paint).then(async () => {
    // longer than one reply (a whole paper): the same request again with what was written so far, carried on to the end
    for (let n = 1; n <= GO_ON && W.cur === cur && cur.state === 'done' && cur.stop === 'max_tokens'; n++) {
      cur.base = cur.out; cur.state = 'writing'; cur.cut = false; cur.stop = '';
      cur.note = `글이 길어 이어서 씁니다 (${n + 1}번째)`;
      paint();
      await go({ action: k, text, id: newId(), sofar: cur.base }, cur, paint);
    }
    if (cur.state === 'done' && cur.stop === 'max_tokens') cur.note = '글이 너무 길어 끝까지 쓰지 못했습니다. 아래는 받은 데까지입니다. 글을 나눠서 보내 주세요.';
    settled(cur);
  });
}
// the result card's head in view: scrolled to its top (smoothly unless motion is reduced) when it is not there already
function reveal() {
  const box = $('.wr-res');
  if (!box || box.hidden || !box.scrollIntoView) return;
  const r = box.getBoundingClientRect();
  const tab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-h')) || 0;
  if (r.top >= 0 && r.top + 64 <= innerHeight - tab) return;
  box.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// an answer over: kept among the last ones when it is whole, and no longer waited for (unless it could not be fetched
// yet: then it is asked for again when the page is back)
function settled(cur) {
  if (cur.state === 'done' && !cur.cut) remember(cur);
  if (!cur.resumable) store.del('kv', 'write:pending').catch(() => {});
}

// one event of an answer (as it comes, or as the server kept it), cur kept up to date; true when the card wants a
// redraw, false when only the text grew
function onEvent(cur, ev, d) {
  if (ev === 'delta') { cur.out += (d.delta && d.delta.text) || ''; if (cur.state !== 'writing') { cur.state = 'writing'; return true; } return false; }
  if (ev !== 'shelf') return false;
  if (d.type === 'start') { cur.model = d.model; used(d); }
  else if (d.type === 'wait') cur.note = `${d.why === 'rate' ? '요청이 몰려' : 'Claude가 붐벼'} ${d.sec}초 뒤에 다시 시도합니다.`;
  else if (d.type === 'fallback') {   // what was shown is thrown away: the other model writes it all again
    cur.out = cur.base || ''; cur.state = 'wait'; cur.model = d.to; cur.fell = d.why;
    cur.note = d.why === 'refusal' ? '첫 모델이 이 글을 거절해, 다른 모델이 처음부터 다시 씁니다.' : '첫 모델을 지금 쓸 수 없어, 다른 모델이 씁니다.';
  } else if (d.type === 'done') {
    // cut short (the room for thinking and answer used up): what came is shown and can be copied, but it is not offered
    // in place of the text, nor kept among the answers
    const cut = d.stop === 'max_tokens' || d.stop === 'model_context_window_exceeded';
    Object.assign(cur, { state: 'done', model: d.model, stop: d.stop, cut, usage: d.usage, style: d.style || null, t1: Date.now() });
    cur.note = cut ? '답이 길어 끝까지 쓰지 못했습니다. 아래는 받은 데까지이며, 원고를 바꾸는 데 쓰지 않습니다. 글을 나눠서 보내 주세요.' : cur.fell ? cur.note : '';
    used(d);
  } else if (d.type === 'error') {
    Object.assign(cur, { state: 'error', err: d.code, sec: d.sec, partial: d.partial, msg: d.message || '' });
    if (d.code === 'refused') cur.out = cur.base || '';   // a refused answer is not to be used, not even the part of it already shown
  }
  return true;
}
// one request: its events read as they come, cur kept up to date, paint() called on each change (the text at most once a
// frame); resolves when it is over, however it ended. A connection lost on the way (the page in the background, the
// network gone) is not the end: the server reads the answer to the end and keeps it, and it is fetched from there.
async function go(body, cur, paint) {
  const ctrl = new AbortController();
  W.run = { ctrl, cur };
  paintActs(); paint();
  const tick = setInterval(() => paintTime(cur), 1000);
  let frame = 0, lost = false, sent = false;
  const soon = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(true); }); };
  try {
    const r = await api.writeAsk(body, ctrl.signal);
    sent = true;
    await readEvents(r, (ev, d) => { if (onEvent(cur, ev, d)) paint(); else soon(); });
    if (cur.state !== 'done' && cur.state !== 'error') lost = true;
  } catch (e) {
    if (e && e.name === 'AbortError') cur.state = 'stopped';
    else if (!sent && api.isOffline(e) && navigator.onLine === false) Object.assign(cur, { state: 'error', err: 'offline' });   // (never went)
    else if (!e || !e.status) lost = true;   // the connection, not the server: cut on the way (or maybe before it went)
    else Object.assign(cur, { state: 'error', err: e.code, cap: e.cap, max: e.max, got: e.got, budget: e.budget });
    if (e && e.code === 'no_key' && W.info) W.info.key = false;
    if (e && e.code === 'daily_cap' && W.info) W.info.used = e.used || W.info.cap;
    if (e && e.code === 'daily_budget' && W.info) { W.info.spent = e.spent; W.info.budget = e.budget; }
  } finally {
    clearInterval(tick); if (frame) cancelAnimationFrame(frame);
    if (!lost) cur.t1 = cur.t1 || Date.now();
    W.run = null;
    paintActs(); paint(); paintSty();   // (내 문체's buttons too: a redraw of the app meanwhile drew them waiting for this run)
  }
  if (!lost) return;
  if (body.action === 'profile') { Object.assign(cur, { state: 'error', err: 'lost_style', t1: Date.now() }); paint(); return; }
  cur.sent = sent;
  await recover(cur, paint);
}
// The answer whose connection was lost, fetched from the server (write/last): the events as they were streamed, read
// again here. While the server is still writing it is asked again every 3 s; a server that went away with the app (the
// platform gives it some 30 s once the app has gone) leaves it unfinished, and after 90 s that is said plainly.
async function recover(cur, paint) {
  const sent = cur.sent !== false;   // (false: the request may never have reached the server)
  if (W.run) return;
  const ctrl = new AbortController();
  W.run = { ctrl, cur };
  Object.assign(cur, { state: 'wait', out: '', err: '', resumable: false, t1: 0, note: '연결이 끊겨, 서버가 받아 둔 답을 가져오는 중입니다.' });
  paintActs(); paint();
  const tick = setInterval(() => paintTime(cur), 1000);
  const t0 = Date.now();
  let misses = 0;
  try {
    for (;;) {
      if (ctrl.signal.aborted) { cur.state = 'stopped'; break; }
      let d = null;
      try { d = await api.writeLast(cur.id); misses = 0; }
      catch (e) {
        if (e && e.code === 'gone') { Object.assign(cur, { state: 'error', err: sent ? 'lost' : 'offline', note: '' }); break; }
        if (e && e.code === 'auth') { Object.assign(cur, { state: 'error', err: 'auth', note: '' }); break; }
        // offline, or the server out of reach: asked again when the page is back, or opened again
        if (++misses >= 4) { Object.assign(cur, { state: 'error', err: api.isOffline(e) ? 'offline' : 'upstream', note: '', resumable: true }); break; }
      }
      if (d && d.state !== 'running') {
        Object.assign(cur, { out: '', note: '', fell: '' });
        parseEvents(String(d.sse || ''), (ev, x) => onEvent(cur, ev, x));
        if (d.state === 'stopped') cur.state = 'stopped';
        else if (cur.state !== 'done' && cur.state !== 'error') Object.assign(cur, { state: 'error', err: 'cut' });
        break;
      }
      if (d && Date.now() - t0 > 90e3) { Object.assign(cur, { state: 'error', err: 'lost', note: '' }); break; }
      await new Promise((r) => { const t = setTimeout(r, 3000); ctrl.signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
    }
  } finally {
    clearInterval(tick);
    cur.t1 = cur.t1 || Date.now();
    W.run = null;
    paintActs(); paint(); paintSty();   // (내 문체's buttons too: a redraw of the app meanwhile drew them waiting for this run)
  }
}
// fetched again when the page is back, or opened again with the answer still to come
function resume(cur) {
  if (W.run) return;
  recover(cur, () => { if (W.cur === cur) paintRes(); }).then(() => settled(cur));
}
function used(d) {
  const was = dayFull(W.info);
  if (W.info && d) {
    if (Number.isFinite(d.used)) W.info.used = d.used;
    if (d.cap) W.info.cap = d.cap;
    if (Number.isFinite(d.spent)) W.info.spent = d.spent;
    if (d.budget) W.info.budget = d.budget;
  }
  paintActs();
  if (dayFull(W.info) !== was) paintSty();   // (the day used up: 내 문체 익히기 waits too)
}

// server-sent events, one block at a time: event name and its JSON data
function eventOf(block, on) {
  let ev = 'message', data = '';
  for (const line of block.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
  if (!data) return;   // (a comment: the server keeping the line awake)
  let d; try { d = JSON.parse(data); } catch (e) { return; }
  on(ev, d);
}
const parseEvents = (text, on) => text.replace(/\r/g, '').split('\n\n').forEach((b) => eventOf(b, on));
// from a fetch response, as they come
async function readEvents(r, on) {
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r/g, '');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); eventOf(block, on); }
  }
}

const ERR = {
  no_key: () => '서버에 Claude API 키가 없어 보내지 않았습니다.',
  daily_cap: (c) => capText(c),
  daily_budget: (c) => budgetText(c),
  stopped: () => '멈췄습니다.',
  lost: () => '연결이 끊긴 사이 서버도 답을 끝까지 받지 못했습니다(화면을 오래 떠나 있으면 그럴 수 있습니다). 다시 해 주세요.',
  lost_style: () => '연결이 끊겼습니다. 서버가 끝까지 받았다면 문체는 저장되어 있으니, 잠시 뒤 이 화면을 다시 열어 확인해 주세요.',
  too_long: (c) => `글이 너무 깁니다(${nf(c.got)}자). ${nf(c.max || maxLetters())}자까지 보낼 수 있으니 나눠서 보내 주세요.`,
  rate_limited: (c) => `요청이 몰려 Anthropic이 잠시 받지 않습니다. ${nf(c.sec || 30)}초쯤 뒤에 다시 해 주세요.`,
  overloaded: () => 'Claude가 지금 붐벼 답하지 못했습니다. 잠시 뒤에 다시 해 주세요.',
  refused: () => '두 모델 모두 이 글을 처리하지 않았습니다(안전 정책에 따른 거절).',
  bad_key: () => '서버의 Claude API 키가 맞지 않습니다. 키를 확인해 주세요.',
  billing: () => 'Anthropic 계정에 걸어 둔 사용 한도에 닿았거나 결제에 문제가 있어 처리하지 못했습니다. Anthropic 콘솔에서 한도와 결제를 확인해 주세요.',
  no_model: () => '이 키로는 Claude 모델을 쓸 수 없습니다. 키의 권한을 확인해 주세요.',
  upstream: () => 'Claude에 연결하지 못했습니다. 잠시 뒤에 다시 해 주세요.',
  cut: () => '답이 중간에 끊겼습니다. 다시 해 주세요.',
  offline: (c) => (c.resumable ? '인터넷에 연결되지 않아 답을 가져오지 못했습니다. 연결되면 다시 가져옵니다.' : '인터넷에 연결되어 있지 않습니다.'),
  auth: () => '로그인이 풀렸습니다. 다시 로그인해 주세요.',
  too_few: () => '내 논문에서 고른 문단이 너무 적습니다.',
  // Anthropic refused the request itself: its own words (the key never in them), so a change on its side can be found
  bad_request: (c) => `Anthropic이 요청을 받지 않았습니다${c.msg ? `: ${c.msg}` : '.'}`,
};
const errText = (c) => (ERR[c.err] || (() => '처리하지 못했습니다. 잠시 뒤에 다시 해 주세요.'))(c);
const secs = (c) => Math.max(0, Math.round(((c.t1 || Date.now()) - c.t0) / 1000));
function stateText(c) {
  if (c.state === 'wait') return `생각하는 중 · ${secs(c)}초`;
  if (c.state === 'writing') return `쓰는 중 · ${secs(c)}초`;
  if (c.state === 'done') return c.hist ? new Date(c.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : `${secs(c)}초`;
  if (c.state === 'stopped') return '멈췄습니다';
  return '';
}
function paintTime(c) {
  if (!live()) return;
  const el = c.kind === 'style' ? $('.wr-sty .wr-st') : $('.wr-res .wr-st');
  if (el) el.textContent = stateText(c);
}


/* ---------------- the answer ---------------- */
// [근거 필요: …], the mark the rewrites leave where a claim wants support, stands out wherever it is
const NEED_RE = /\[근거\s*필요[^\]\n]*\]/g;   // (takeNotes' own: its place is its loop's)
const needs = (html) => html.replace(/\[근거\s*필요[^\]<\n]*\]/g, (m) => `<mark class="wr-need">${m}</mark>`);
const hasNeeds = (s) => /\[근거\s*필요[^\]\n]*\]/.test(String(s || ''));
function paintRes(textOnly) {
  if (!live()) return;
  const box = $('.wr-res'), c = W.cur;
  box.hidden = !c;
  if (!c) { box._h = null; return; }
  if (c.act === 'cite') { paintCheck(box, c); return; }
  const a = ACTS[c.act] || { label: '' };
  const running = W.run && W.run.cur === c;
  const out = box.querySelector('.wr-out');
  if (textOnly === true && out && c.state === 'writing' && out.dataset.mode === 'text') {   // the text growing: only it is redrawn
    out.textContent = c.out;
    box._h = null;
    paintTime(c);
    return;
  }
  const diff = a.rewrite && c.state === 'done' && W.diffOn && c.out && !c.cut;   // (a part only: the rest would read as struck out)
  let body;
  if (c.state === 'wait') body = `<div class="wr-think" role="status"><i></i><i></i><i></i><span>${c.note ? '' : 'Claude가 글을 읽고 생각하는 중입니다'}</span></div>`;
  else if (diff) { c.ops = c.ops || wordDiff(c.input, c.out); body = needs(renderDiff(c.ops)); }
  else body = needs(esc(c.out));
  const changes = diff ? c.ops.filter((o, k) => o[0] !== 0 && o[1].trim() && !(k && c.ops[k - 1][0] !== 0 && c.ops[k - 1][1].trim())).length : 0;   // (a deletion and its insertion: one change)
  const msg = c.state === 'error' ? `<p class="wr-msg err">${esc(errText(c))}${c.out ? ' 여기까지 받은 글입니다.' : ''}</p>` : c.note ? `<p class="wr-msg">${esc(c.note)}</p>` : '';
  const showOut = c.state !== 'wait' && (c.out || c.state === 'done');
  const usable = c.state === 'done' && c.out && a.rewrite && !c.cut;
  const nNeed = usable ? (c.out.match(/\[근거\s*필요[^\]\n]*\]/g) || []).length : 0;
  // (the rewrite's notes asking for support are set aside under the box when it is taken — or kept in it, when asked)
  const useBtns = usable ? `${nNeed ? '<button type="button" class="btn small ghost wr-use-n">메모 넣어 바꾸기</button>' : ''}<button type="button" class="btn small primary wr-use">이대로 바꾸기</button>` : '';
  setHtml(box, `<div class="wr-card">
    <div class="wr-rh"><b>${esc(a.label)}</b>${c.model ? `<span class="wr-tag">${esc(c.model.name || c.model.id || '')}</span>` : ''}<span class="wr-st">${esc(stateText(c))}</span><span class="sp"></span>${running ? '<button type="button" class="btn small wr-stop">멈추기</button>' : ''}</div>
    ${msg}
    ${showOut ? `<div class="wr-out" data-mode="${diff ? 'diff' : 'text'}" lang="${c.act === 'english' ? 'en' : 'ko'}">${body}</div>` : c.state === 'wait' ? body : ''}
    ${c.state === 'done' && c.out ? `<div class="wr-rf">${a.rewrite && !c.cut ? `<label class="wr-tog"><input type="checkbox"${W.diffOn ? ' checked' : ''}><span>바뀐 곳 표시</span></label>${diff ? `<span class="wr-cnt">${changes ? `${nf(changes)}곳` : '바뀐 곳 없음'}</span>` : ''}` : ''}<span class="sp"></span><button type="button" class="btn small wr-copy">${c.cut ? '받은 데까지 복사' : '복사'}</button>${useBtns}</div>${nNeed ? `<p class="wr-why wr-nwhy">근거 메모 ${nf(nNeed)}개는 원고에 넣지 않고 글상자 아래에 따로 둡니다.</p>` : ''}${usable ? '<p class="wr-why" hidden>위 글상자의 글이 이 결과를 받을 때의 글과 달라, 바꾸지 않습니다. 필요하면 복사해서 붙여 주세요.</p>' : ''}` : ''}
  </div>`);
  paintUse();
}
// 이대로 바꾸기 only while the box holds the very text this answer was made from: not after it was edited meanwhile (the
// owner may type on while Claude thinks), and not for an older answer about another text
const sameInput = (c) => { const ta = $('.wr-in'); return !!(ta && c && ta.value.trim() === c.input); };
function paintUse() {
  const b = $('.wr-use'); if (!b) return;
  const same = sameInput(W.cur), why = $('.wr-why:not(.wr-nwhy)');
  b.disabled = !same;
  const n = $('.wr-use-n'); if (n) n.disabled = !same;
  if (why) why.hidden = same;
}
async function copy(t) {
  if (!t) return;
  try { await navigator.clipboard.writeText(t); W.ctx.toast('복사했습니다'); } catch (e) { W.ctx.toast('복사하지 못했습니다'); }
}
// the answer in the box. Its notes asking for support ([근거 필요: …]) stay out of the manuscript, listed under the box
// with the sentence each belongs to (근거 메모) — unless withNotes; 되돌리기 brings back the text and the notes as they were
function useIt(withNotes) {
  const c = W.cur; if (!c || !c.out || c.cut || !ACTS[c.act] || !ACTS[c.act].rewrite) return;
  if (!sameInput(c)) { paintUse(); W.ctx.toast('글상자의 글이 달라져 바꾸지 않았습니다. 복사해서 붙여 주세요.'); return; }
  const ta = $('.wr-in'), prev = ta.value, prevNotes = W.notes || [];
  const split = withNotes ? { text: c.out, notes: [] } : takeNotes(c.out);
  putDraft(split.text);
  if (split.notes.length) {
    const keep = prevNotes.filter((n) => split.text.includes(n.sentence) && !split.notes.some((x) => x.note === n.note && x.sentence === n.sentence));
    putNotes([...split.notes, ...keep]);
  }
  ta.scrollTop = 0;
  const said = split.notes.length ? `글을 바꿨습니다 · 근거 메모 ${nf(split.notes.length)}개는 글상자 아래에` : '글을 바꿨습니다';
  W.ctx.toast(said, 6000, { label: '되돌리기', fn: () => { putDraft(prev); putNotes(prevNotes); } });
}
// [근거 필요: …] taken out of a text: the text without them (a space they leave between two words kept, one at a line's
// start or end dropped), and each with the sentence it follows
export function takeNotes(text) {
  const s = String(text || ''), notes = [];
  NEED_RE.lastIndex = 0;
  let m;
  while ((m = NEED_RE.exec(s))) {
    const head = s.slice(0, m.index).replace(/\s+$/, '');
    const body = head.slice(0, Math.max(0, head.length - 1));   // (its own last mark is not where it begins)
    let from = 0; const re = /(?<![\d.])[.?!。]["”’」』)\]]*\s+|\n/g; let x;
    while ((x = re.exec(body))) from = x.index + x[0].length;
    // (the sentence as it stands in the text taken: an earlier note of the same sentence out the same way, so it is found there)
    const sentence = dropNeeds(head.slice(from)).trim();
    notes.push({ id: newId() + notes.length, note: m[0].replace(/^\[\s*근거\s*필요\s*[:：]?\s*|\s*\]$/g, ''), sentence });
  }
  return { text: dropNeeds(s), notes };
}
// the notes out of a text: the spaces around one become one between two words — none at a line's start or end, nor before a
// mark that closes what comes before it (‘…무겁다 [근거 필요: 판례].’ → ‘…무겁다.’)
function dropNeeds(s) {
  return String(s || '').replace(/([ \t]*)\[근거\s*필요[^\]\n]*\]([ \t]*)/g, (all, a, b, off, str) => {
    const prev = str[off - 1], next = str[off + all.length];
    if (prev === undefined || prev === '\n' || next === undefined || next === '\n') return '';
    if (/[.,?!;:)\]」』”’。、·]/.test(next) || /[(\[「『“‘]/.test(prev)) return '';
    return a || b ? ' ' : '';
  });
}

/* ---------------- 근거 메모: the notes kept out of the manuscript ---------------- */
function putNotes(list) {
  W.notes = list || [];
  (W.notes.length ? store.put('kv', 'write:notes', W.notes) : store.del('kv', 'write:notes')).catch(() => {});
  paintNotes();
  fillNotes();
}
function paintNotes() {
  const box = $('.wr-notes'); if (!box) return;
  const list = W.notes || [];
  box.hidden = !list.length;
  if (!list.length) { setHtml(box, ''); return; }
  setHtml(box, `<div class="wr-nh"><b>근거 메모 ${nf(list.length)}개</b><span class="wr-sm">원고에는 넣지 않았습니다</span><span class="wr-nhb"><button type="button" class="btn small ghost" data-n="copyall">모두 복사</button><button type="button" class="btn small ghost" data-n="clear">모두 지우기</button></span></div>
    <ol class="wr-nl">${list.map((n) => `<li data-ni="${esc(n.id)}"><button type="button" class="wr-nq" data-n="find" title="글상자에서 이 문장 찾기">${esc(n.sentence || '(문장 없음)')}</button><p class="wr-nn">${esc(n.note || '근거를 밝혀 주세요')}</p>
      <div class="wr-nb">${n.fill ? `<button type="button" class="btn small primary" data-n="fill" title="${esc(n.fill.why || '')}">${esc(n.fill.label)}</button>` : ''}<button type="button" class="btn small" data-n="copy">복사</button><button type="button" class="btn small" data-n="done">채웠음</button></div></li>`).join('')}</ol>`);
}
const noteText = (n) => `${n.sentence} [근거 필요${n.note ? ': ' + n.note : ''}]`;
function noteAct(k, li) {
  const list = W.notes || [];
  if (k === 'copyall') { copy(list.map(noteText).join('\n')); return; }
  if (k === 'clear') { const was = list; putNotes([]); W.ctx.toast('근거 메모를 지웠습니다', 6000, { label: '되돌리기', fn: () => putNotes(was) }); return; }
  const n = li && list.find((x) => x.id === li.dataset.ni); if (!n) return;
  if (k === 'copy') { copy(noteText(n)); return; }
  if (k === 'find') { selectIn(n.sentence) || W.ctx.toast('글상자에서 이 문장을 찾지 못했습니다'); return; }
  if (k === 'done') { putNotes(list.filter((x) => x !== n)); return; }
  if (k === 'fill' && n.fill) {
    const ta = $('.wr-in'), text = ta.value, at = text.indexOf(n.sentence);
    if (at < 0) { W.ctx.toast('글상자에서 이 문장을 찾지 못했습니다'); return; }
    const s2 = n.sentence.slice(0, n.fill.at) + n.fill.put + n.sentence.slice(n.fill.at);
    const prev = text, was = list;
    putDraft(text.slice(0, at) + s2 + text.slice(at + n.sentence.length));
    putNotes(list.filter((x) => x !== n));
    W.ctx.toast(`${n.fill.put.trim()} 넣었습니다`, 6000, { label: '되돌리기', fn: () => { putDraft(prev); putNotes(was); } });
  }
}
// a sentence (or any span) chosen in the box, so it is seen there
function selectIn(span, near = -1) {
  const ta = $('.wr-in'); if (!ta || !span) return false;
  const at = locate(ta.value, span, near);
  if (at < 0) return false;
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(at, at + span.length);
  // (the box scrolled to the line: a textarea does not show a selection made by script)
  const lines = ta.value.slice(0, at).split('\n').length - 1, lh = parseFloat(getComputedStyle(ta).lineHeight) || 26;
  ta.scrollTop = Math.max(0, lines * lh - ta.clientHeight / 3);
  if (ta.scrollIntoView) ta.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return true;
}
// where a span stands in a text: the place of it nearest to where it was (a text edited since moves it a little)
function locate(text, span, near = -1) {
  if (!span) return -1;
  let best = -1, at = text.indexOf(span);
  while (at >= 0) { if (best < 0 || (near >= 0 && Math.abs(at - near) < Math.abs(best - near))) best = at; at = text.indexOf(span, at + 1); }
  return best;
}
// a note the app can fill itself: an amendment it names by its day (2023. 8. 30. 개정), of an article the sentence cites —
// the law's number, from the article's 연혁 ('법률 제19696호 넣기')
async function fillNotes() {
  for (const n of W.notes || []) {
    if (n.tried) continue;
    n.tried = true;
    const f = await fillOf(n).catch(() => null);
    if (f && (W.notes || []).includes(n)) { n.fill = f; paintNotes(); }
  }
}
const DAY = /((?:19|20)\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?/g;
const dashDay = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dotDay = (dash) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dash || '')); return m ? `${m[1]}. ${+m[2]}. ${+m[3]}.` : String(dash || ''); };
async function fillOf(n) {
  if (!/법률\s*번호|법률\s*제|개정/.test(n.note)) return null;
  const days = [...`${n.note} ${n.sentence}`.matchAll(DAY)].map((m) => dashDay(m[1], m[2], m[3]));
  if (!days.length) return null;
  for (const a of laws.scanArticlesAll(n.sentence).filter((x) => !x.foreign && !x.oldcon)) {
    if (/(?:령|규칙)$/.test(a.law)) continue;   // (a decree's number is no 법률 제…호)
    const h = await historyOf(a.law, a.art, a.sub).catch(() => null);
    const e = h && h.list.find((x) => days.includes(x.d) && x.no);
    if (!e) continue;
    const day = dotDay(e.d), no = `법률 제${e.no}호`;
    if (n.sentence.includes(no)) return null;
    // '2023. 8. 30. 개정된 …' → '2023. 8. 30. 법률 제19696호로 개정된 …'; else after the law's name: '공직선거법(2023. 8. 30.
    // 법률 제19696호로 개정된 것) 제93조'
    const said = new RegExp(day.replace(/\.\s*/g, '\\.\\s*') + '\\s*(?=(?:일부|전부)?\\s*개정)').exec(n.sentence);
    if (said) return { label: `${no} 넣기`, at: said.index + said[0].length, put: `${no}로 `, why: `${day} ${e.kind || '개정'}` };
    const span = n.sentence.slice(a.i, a.i + a.len), cut = span.search(/\s*제\s*\d/);
    if (cut <= 0) continue;
    return { label: `${no} 넣기`, at: a.i + cut, put: `(${day} ${no}로 개정된 것)`, why: `${day} ${e.kind || '개정'}` };
  }
  return null;
}

/* ---------------- 다듬은 기록: the last answers, on this device and (기기 사이에 맞추기) with the server ---------------- */
const SYNC_LS = 'shelf:write:sync';
const slim = (h) => ({ id: h.id, at: h.at, act: h.act, input: String(h.input || '').slice(0, 4000), out: h.out, model: h.model || null });
// the two lists as one: each answer once (this device's own copy first: its text is whole), newest first, the last 20
function mergeHist(a, b) {
  const m = new Map();
  for (const h of [...(a || []), ...(b || [])]) if (h && h.id && h.act && !m.has(h.id)) m.set(h.id, h);
  return [...m.values()].filter((h) => ACTS[h.act] && !ACTS[h.act].local).sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, KEEP);
}
function remember(c) {
  if (c.cut) return;   // (a part of an answer is not an answer to come back to)
  const keep = { id: c.id, at: c.at, act: c.act, input: c.input, out: c.out, model: c.model, stop: c.stop, usage: c.usage, note: c.note || '' };
  W.hist = mergeHist([keep], W.hist);
  store.put('kv', 'write:history', W.hist).catch(() => {});
  paintHist();
  pushHist();
}
let pulling = null;
const hasHistApi = () => !!(api.writeHistory && api.writeHistory.get && api.writeHistory.put);   // (an older api.js: this device's alone)
function pullHist() {
  if (!hasHistApi()) { W.syncOk = false; return null; }
  if (!W.sync || W.syncOk === false || pulling) return pulling;
  pulling = api.writeHistory.get().then((list) => {
    if (list === null) { W.syncOk = false; paintHist(); return; }   // (the server keeps no answers: this device's alone, said so)
    W.syncOk = true;
    const was = JSON.stringify((W.hist || []).map((h) => h.id));
    W.hist = mergeHist(W.hist, list);
    if (JSON.stringify(W.hist.map((h) => h.id)) !== was) store.put('kv', 'write:history', W.hist).catch(() => {});
    paintHist();
    // (answers made here while the server was out of reach, or before it kept them: sent now)
    if (W.hist.some((h) => !list.some((x) => x && x.id === h.id))) pushHist();
  }, () => { /* offline or out of reach: asked again when the page is back */ }).finally(() => { pulling = null; });
  return pulling;
}
function pushHist() {
  if (!W.sync || W.syncOk === false || !W.hist || !W.hist.length || !hasHistApi()) return;
  api.writeHistory.put(W.hist.slice(0, KEEP).map(slim)).then((list) => {
    if (list === null) { W.syncOk = false; paintHist(); return; }
    W.syncOk = true;
    if (Array.isArray(list)) { W.hist = mergeHist(W.hist, list); store.put('kv', 'write:history', W.hist).catch(() => {}); paintHist(); }
  }, () => { /* sent again with the next answer, or when the page is back */ });
}
function setSync(on) {
  W.sync = !!on;
  try { localStorage.setItem(SYNC_LS, on ? '1' : '0'); } catch (e) { /* this session alone */ }
  const had = document.activeElement && document.activeElement.closest && document.activeElement.closest('.wr-sync');
  paintHist();
  if (had) { const x = $('.wr-sync input'); if (x) x.focus({ preventScroll: true }); }   // (the line drawn again: the switch keeps the focus)
  if (on) { W.syncOk = W.syncOk === false ? null : W.syncOk; pullHist(); }
}
function paintHist() {
  if (!live()) return;
  const box = $('.wr-hist'), list = W.hist || [];
  box.hidden = !list.length;
  if (!list.length) { setHtml(box, ''); return; }
  const when = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const where = W.sync && W.syncOk !== false ? '최근 20개 · 기기 사이에 맞춤' : `최근 ${nf(KEEP)}개까지 이 기기에`;
  const tog = W.syncOk === false ? '' : `<label class="wr-sync"><input type="checkbox"${W.sync ? ' checked' : ''}><span>기기 사이에 맞추기</span></label>`;
  setHtml(box, `<div class="list-h wr-hh"><h2 class="sec-h">다듬은 기록<span class="sec-n">${esc(where)}</span></h2>${tog}</div><div class="wr-hl">${list.map((h) => `<button type="button" data-h="${esc(h.id)}"><b>${esc((ACTS[h.act] || {}).label || '')}<span>${esc(when(h.at))}${h.model ? ' · ' + esc(h.model.name || '') : ''}</span></b><em>${esc(String(h.input || '').replace(/\s+/g, ' ').slice(0, 90))}</em></button>`).join('')}</div>`);
}
function openHist(id) {
  if (W.run) return;
  const h = (W.hist || []).find((x) => x.id === id); if (!h) return;
  W.cur = { ...h, state: 'done', hist: true, t0: h.at, t1: h.at };
  paintRes();
  const box = $('.wr-res'); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/* ---------------- 내 문체 익히기 ---------------- */
// the owner's own papers on the shelf: the ones the owner picked (내 논문 고르기), else those filed as '<owner>_…' (by the
// owner alone; written with others only when there are too few of those), whose page texts the server has
const titleOf = (f) => { const s = stem(f.name), i = s.indexOf('_'); return i > 0 ? s.slice(i + 1) : s; };
function ownPapers() {
  const all = (W.ctx && W.ctx.files && W.ctx.files()) || [];
  const files = all.filter((f) => f && f.text);
  if (W.mine && W.mine.length) {
    const ids = new Set(W.mine);
    const picked = files.filter((f) => ids.has(f.id));
    if (picked.length) return picked.map((f) => ({ f, title: titleOf(f), picked: true }));
  }
  const by = (f) => stem(f.name).split('_')[0];
  const alone = files.filter((f) => by(f) === ME);
  const withOthers = files.filter((f) => by(f) !== ME && by(f).split(/[·,ㆍ]/).map((s) => s.trim()).includes(ME));
  return (alone.length >= 3 ? alone : [...alone, ...withOthers]).map((f) => ({ f, title: titleOf(f) }));
}
async function styleAct(k) {
  if (k === 'open') { W.styleOpen = !W.styleOpen; paintSty(); return; }
  if (k === 'cancel') { W.learn = null; paintSty(); return; }
  if (k === 'stop') { stopRun(); return; }
  if (k === 'pick') { W.learn = { phase: 'pick', sel: new Set(ownPapers().map((p) => p.f.id)), q: '' }; paintSty(); const q = $('.wr-pq'); if (q && matchMedia('(hover: hover) and (pointer: fine)').matches) q.focus({ preventScroll: true }); return; }
  if (k === 'picked') {   // the papers picked kept (on this device), and 익히기 reads exactly those
    const sel = [...((W.learn && W.learn.sel) || [])];
    W.mine = sel;
    (sel.length ? store.put('kv', 'write:mine', sel) : store.del('kv', 'write:mine')).catch(() => {});
    W.learn = null; paintSty();
    return;
  }
  if ((k === 'learn' || k === 'go' || k === 'again') && W.run) { W.ctx.toast('지금 쓰고 있는 답이 끝난 뒤에 할 수 있습니다'); return; }   // one request at a time
  if (k === 'again' && W.learn && W.learn.pick) { W.learn = { phase: 'picked', pick: W.learn.pick }; k = 'go'; }   // the same paragraphs once more
  if (k === 'learn') {   // read the papers and pick the paragraphs; nothing goes out yet
    if (W.learn && W.learn.phase === 'reading') return;
    const own = ownPapers();
    if (!own.length) { W.learn = { phase: 'none' }; paintSty(); return; }
    W.learn = { phase: 'reading', done: 0, total: own.length };
    paintSty();
    const papers = [];
    for (const p of own) {
      try { const t = await W.ctx.textOf(p.f); if (t && Array.isArray(t.pages)) papers.push({ title: p.title, t }); } catch (e) { /* that one is left out */ }
      W.learn.done++; paintSty();
    }
    const pick = pickParagraphs(papers);
    W.learn = pick.list.length >= 5 ? { phase: 'picked', pick } : { phase: 'few', n: pick.list.length, papers: papers.length };
    paintSty();
    return;
  }
  if (k === 'go' && W.learn && W.learn.phase === 'picked' && ready()) {   // the paragraphs go; the style comes back and is kept
    const pick = W.learn.pick;
    const cur = { kind: 'style', id: newId(), at: Date.now(), out: '', state: 'wait', t0: Date.now() };
    W.learn = { phase: 'writing', pick, cur };
    await go({ action: 'profile', id: cur.id, paragraphs: pick.list.map(({ text, part, paper }) => ({ text, part, paper })), sources: pick.sources }, cur, paintSty);
    if (cur.state === 'done' && cur.style) {
      W.style = { text: cur.out, ...cur.style };
      store.put('kv', 'write:style', W.style).catch(() => {});
      if (W.info) W.info.style = cur.style;
      W.learn = null; W.styleOpen = true;
      W.ctx.toast('내 문체를 익혔습니다. 이제부터 모든 요청에 쓰입니다.', 4000);
    } else if (cur.state === 'done') W.learn = { phase: 'writing', pick, cur: { ...cur, state: 'error', err: cur.stop === 'max_tokens' ? 'cut' : 'server' } };
    paintSty(); paintActs();
  }
}
// 내 논문 고르기: every paper on the shelf, ticked or not (those whose page texts the server has: the others cannot be read)
function pickHtml(L) {
  const all = ((W.ctx && W.ctx.files && W.ctx.files()) || []).filter(Boolean);
  const mineFirst = (f) => (L.sel.has(f.id) ? 0 : stem(f.name).split('_')[0].split(/[·,ㆍ]/).map((s) => s.trim()).includes(ME) ? 1 : 2);
  const list = all.slice().sort((a, b) => mineFirst(a) - mineFirst(b) || stem(a.name).localeCompare(stem(b.name), 'ko'));
  const n = [...L.sel].filter((id) => all.some((f) => f.id === id && f.text)).length;
  return `<div class="wr-pick"><p class="wr-p">문체를 익힐 내 논문을 고르세요. 고른 논문의 서론·본론·결론에서만 문단을 고릅니다.</p>
    <input type="search" class="wr-pq" placeholder="파일 이름으로 거르기" aria-label="파일 이름으로 거르기" autocomplete="off">
    <div class="wr-pl" role="group" aria-label="서재의 논문">${list.map((f) => `<label class="wr-pi" data-k="${esc(stem(f.name).toLowerCase())}"><input type="checkbox" value="${esc(f.id)}"${L.sel.has(f.id) ? ' checked' : ''}${f.text ? '' : ' disabled'}><span>${esc(stem(f.name))}</span>${f.text ? '' : '<small>본문 글자 없음</small>'}</label>`).join('') || '<p class="wr-p">서재에 논문이 없습니다.</p>'}</div>
    <div class="wr-sa"><span class="wr-sm wr-pn">${nf(n)}편 골랐습니다</span><span class="sp"></span><button type="button" class="btn small ghost" data-s="cancel">취소</button><button type="button" class="btn small primary" data-s="picked"${n ? '' : ' disabled'}>이 ${nf(n)}편으로</button></div></div>`;
}
function pickFilter(q) {
  const L = W.learn; if (!L || L.phase !== 'pick') return;
  L.q = String(q || '').trim().toLowerCase();
  const ws = L.q.split(/\s+/).filter(Boolean);
  W.root.querySelectorAll('.wr-pi').forEach((x) => { x.hidden = !!ws.length && !ws.every((w) => x.dataset.k.includes(w)); });
}
function pickTick(id, on) {
  const L = W.learn; if (!L || L.phase !== 'pick') return;
  if (on) L.sel.add(id); else L.sel.delete(id);
  const n = L.sel.size, b = $('.wr-pick [data-s="picked"]'), c = $('.wr-pn');
  if (c) c.textContent = `${nf(n)}편 골랐습니다`;
  if (b) { b.disabled = !n; b.textContent = `이 ${nf(n)}편으로`; }
}
function paintSty(textOnly) {
  if (!live()) return;
  const box = $('.wr-sty'), L = W.learn, s = W.style;
  if (textOnly === true && L && L.cur && L.cur.state === 'writing') { const o = box.querySelector('.wr-prof'); if (o) { o.textContent = L.cur.out; box._h = null; paintTime(L.cur); return; } }
  if (L && L.phase === 'pick' && box.querySelector('.wr-pick')) return;   // (open: ticked and filtered in place)
  const date = (t) => new Date(t).toLocaleDateString('ko-KR');
  const meta = s ? `<span class="wr-sm">${esc(date(s.at))} · 논문 ${nf(s.papers)}편 · 문단 ${nf(s.paragraphs)}개</span>` : '';
  const can = !!(W.info && W.info.key && !dayFull(W.info));
  const own = W.ctx ? ownPapers() : [], picked = own.some((p) => p.picked);
  let card;
  if (L && L.phase === 'pick') card = pickHtml(L);
  else if (L && L.phase === 'reading') card = `<p class="wr-p">내 논문을 읽는 중입니다 · ${nf(L.done)} / ${nf(L.total)}편</p>`;
  else if (L && L.phase === 'none') card = `<p class="wr-p">서재에서 ‘${esc(ME)}_’로 시작하는 내 논문을 찾지 못했습니다(0편). 내 논문을 직접 고르면 그 글에서 문체를 익힙니다.</p><div class="wr-sa"><button type="button" class="btn small ghost" data-s="cancel">닫기</button><button type="button" class="btn small primary" data-s="pick">내 논문 고르기</button></div>`;
  else if (L && L.phase === 'few') card = `<p class="wr-p">내 논문 ${nf(L.papers)}편에서 쓸 만한 문단을 ${nf(L.n)}개밖에 찾지 못했습니다(5개 이상 필요). 본문 글자를 읽을 수 있는 내 논문이 더 있어야 합니다.</p><div class="wr-sa"><button type="button" class="btn small ghost" data-s="cancel">닫기</button><button type="button" class="btn small" data-s="pick">내 논문 고르기</button></div>`;
  else if (L && L.phase === 'picked') {
    const p = L.pick, parts = { 서론: 0, 본론: 0, 결론: 0 };
    p.list.forEach((x) => { parts[x.part]++; });
    card = `<p class="wr-p">내 논문 ${nf(p.papers)}편에서 문단 ${nf(p.list.length)}개(${nf(p.chars)}자)를 골랐습니다 · 서론 ${parts.서론} · 본론 ${parts.본론} · 결론 ${parts.결론}. 각주, 표, 참고문헌은 뺐습니다. 이 문단들을 Claude에게 보내 문체를 정리하게 합니다(1~2분).</p>
      <p class="wr-sm wr-srcs">${p.sources.map((x) => `${esc(x.title)} ${nf(x.n)}`).join(' · ')}</p>
      <details class="wr-picked"><summary>고른 문단 보기</summary>${p.list.map((x) => `<p><span>${esc(x.title)} · ${esc(x.part)}</span>${esc(x.text)}</p>`).join('')}</details>
      <div class="wr-sa"><button type="button" class="btn small ghost" data-s="cancel">취소</button><button type="button" class="btn small primary" data-s="go"${can && !W.run ? '' : ' disabled'}>이대로 익히기</button></div>`;
  } else if (L && L.phase === 'writing') {
    const c = L.cur, running = W.run && W.run.cur === c;
    const msg = c.state === 'error' ? `<p class="wr-msg err">${esc(errText(c))}</p>` : c.state === 'stopped' ? '<p class="wr-msg">멈췄습니다. 익힌 문체는 저장하지 않았습니다.</p>' : c.note ? `<p class="wr-msg">${esc(c.note)}</p>` : '';
    card = `<div class="wr-rh"><b>문체를 정리하는 중</b>${c.model ? `<span class="wr-tag">${esc(c.model.name || '')}</span>` : ''}<span class="wr-st">${esc(stateText(c))}</span><span class="sp"></span>${running ? '<button type="button" class="btn small" data-s="stop">멈추기</button>' : ''}</div>${msg}
      ${c.out ? `<div class="wr-prof">${esc(c.out)}</div>` : c.state === 'wait' ? '<div class="wr-think" role="status"><i></i><i></i><i></i><span>고른 문단을 읽는 중입니다</span></div>' : ''}
      ${running ? '' : `<div class="wr-sa"><button type="button" class="btn small ghost" data-s="cancel">닫기</button><button type="button" class="btn small" data-s="again"${can ? '' : ' disabled'}>다시</button></div>`}`;
  } else if (s) {
    card = `<div class="wr-prof${W.styleOpen ? '' : ' clip'}">${esc(s.text || '')}</div>
      <div class="wr-sa"><button type="button" class="btn small ghost" data-s="open">${W.styleOpen ? '접기' : '펼쳐 읽기'}</button><span class="sp"></span><button type="button" class="btn small ghost" data-s="pick">논문 고르기</button><button type="button" class="btn small" data-s="learn"${can && !W.run && own.length ? '' : ' disabled'}>다시 익히기</button></div>`;
  } else if (!own.length) {
    // (counted first: a card never offers what cannot be done — no paper filed '<owner>_…': the owner picks them)
    card = `<p class="wr-p">아직 내 문체를 익히지 않았습니다. 서재에서 ‘${esc(ME)}_’로 시작하는 내 논문을 찾지 못했습니다(0편). 내 논문을 직접 고르면 그 글의 서론·본론·결론에서 문단을 골라, Claude가 문장 길이, 종결 표현, 접속어, 주장의 수위, 판례·조문 인용 방식, 즐겨 쓰는 용어를 정리합니다.</p>
      <div class="wr-sa"><button type="button" class="btn small primary" data-s="pick">내 논문 고르기</button></div>`;
  } else {
    card = `<p class="wr-p">아직 내 문체를 익히지 않았습니다. ${picked ? '직접 고른' : `서재에 있는 내 논문(‘${esc(ME)}_’로 시작하는 파일)`} ${nf(own.length)}편의 서론·본론·결론에서 문단을 골라, Claude가 문장 길이, 종결 표현, 접속어, 주장의 수위, 판례·조문 인용 방식, 즐겨 쓰는 용어를 정리합니다. 한 번 익혀 두면 모든 요청에 쓰입니다.</p>
      <div class="wr-sa"><button type="button" class="btn small ghost" data-s="pick">${picked ? '다시 고르기' : '직접 고르기'}</button><button type="button" class="btn small primary" data-s="learn"${can && !W.run ? '' : ' disabled'}>내 논문 ${nf(own.length)}편으로 익히기</button></div>`;
  }
  setHtml(box, `<div class="list-h"><h2 class="sec-h">내 문체 익히기</h2>${meta}</div><div class="wr-card wr-sc">${card}</div>`);
}

/* ---------------- 인용 점검: the citations of the text against the app's own data (nothing goes to Claude) ----------------
   Found in the box: 헌재 decisions (헌재 2011. 12. 29. 2007헌마1001, 판례집 23-2하, 739 — or a number alone), court
   judgments (대법원 2010. 3. 25. 선고 2009두23617 전원합의체 판결), articles (laws.scanArticlesAll: 공직선거법 제93조 제1항,
   구 정치자금에관한법률 제30조) and papers (저자, "제목", 『학술지』 제N권 제N호, 발행기관, 연도, 쪽.). Each is looked up as the
   app's screens look it up — cases.decision and cases.book, laws.courtCase, the law's text and its 연혁 (laws.artHistory,
   the record shipped with the app), laws.successor for an old or repealed law, the KCI index for a paper — six at a time,
   each answer kept for the session. What it says: 맞음, 다름 (with 고치기, which puts right the exact words in the box,
   undoable), or 확인 못 함 (not in the public data, or no answer in time). The card is drawn once when all have answered (a
   progress line until then), so nothing in it moves while it is read. */
const CK = new Map();
function once(key, make) {
  if (!CK.has(key)) { const p = Promise.resolve().then(make); CK.set(key, p); p.catch(() => CK.delete(key)); }
  return CK.get(key);
}
const timed = (p, ms) => Promise.race([p, new Promise((ok, no) => setTimeout(() => no(Object.assign(new Error('slow'), { code: 'slow' })), ms))]);
async function inTurn(jobs, n = 6) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) { const k = i++; await jobs[k](); } }));
}
// a law as the screens read it; when its text cannot be had now (offline, the mirror out of reach), its 연혁 shipped with the
// app still answers (the law's folder from the index on this device)
function lawObj(name) {
  return once('law:' + name, async () => {
    try { return await timed(laws.lawText(name), 7000); }
    catch (e) {
      if (e && e.code === 'repealed') throw e;
      const x = await laws.lawOf(name).catch(() => null);
      if (x && x.dir) return { key: null, dir: x.dir, file: /시행규칙$/.test(x.name) ? '시행규칙' : /시행령$/.test(x.name) ? '시행령' : '법률', src: 'legalize-kr', full: x.name, title: x.name, arts: null, guess: true };
      throw e;
    }
  });
}
// an article's 연혁, newest first ({ list: [{ d, no, kind, title, text, gone? }] }), or null
function historyOf(name, art, sub = 0) {
  return once(`hist:${name}|${art}|${sub}`, async () => {
    const law = await lawObj(name);
    const x = (law.arts && laws.findArt(law, art, sub)) || { art, sub, title: '', text: '' };
    const h = await timed(laws.artHistory(law, x), 8000);
    return h && Array.isArray(h.list) && h.list.length ? h : null;
  });
}
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const flat = (s) => String(s || '').replace(/<[^<>]*>/g, '').replace(/[\s「」｢｣]/g, '').replace(/ㆍ/g, '·');
// a paragraph of an article's text (①…, up to the next): the whole text when it has none so numbered
function paraOf(text, para) {
  const t = String(text || '');
  if (!para) return t;
  const a = t.indexOf(CIRC[para - 1]); if (a < 0) return '';
  const b = CIRC[para] ? t.indexOf(CIRC[para], a + 1) : -1;
  return t.slice(a, b > a ? b : undefined);
}
const artWords = (x) => `제${x.art}조${x.sub ? '의' + x.sub : ''}${x.para ? ` 제${x.para}항` : ''}`;
const sameDay = (a, b) => String(a || '').replace(/\D/g, '') === String(b || '').replace(/\D/g, '') || (() => { const p = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(a || ''), q = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(b || ''); return !!(p && q && +p[1] === +q[1] && +p[2] === +q[2] && +p[3] === +q[3]); })();
const dashOf = (s) => { const m = /((?:19|20)\d{2})\D+(\d{1,2})\D+(\d{1,2})/.exec(String(s || '')); return m ? dashDay(m[1], m[2], m[3]) : ''; };
// the sentence a place belongs to: [start, end) — ended by . ? ! after a letter (not a digit) and a space, or a line break
function sentenceAt(text, i, j = i) {
  let s = 0; const re = /(?<![\d.])[.?!。]["”’」』)\]]*(?=\s)|\n/g; let m;   // (a date's '2011. 12. 29.' ends no sentence)
  while ((m = re.exec(text)) && m.index + m[0].length <= i) s = m.index + m[0].length;
  re.lastIndex = Math.max(j, s);
  const e = re.exec(text);
  return [s, e ? e.index + e[0].length : text.length];
}

/* the citations in a text, in order: { kind, i, len, src, … } */
const CC_BACK = /(헌재|헌법재판소)\s*(?:((?:19|20)\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?)?\s*(?:선고\s*)?$/;
const PJ_AFTER = /^\s*[,，]\s*판례집\s*(\d{1,2})\s*-\s*(\d)\s*(상|하)?\s*[,，]\s*(\d{1,4})/;
const GB_AFTER = /^\s*[,，]\s*(?:헌법재판소\s*)?공보\s*(?:제\s*)?(\d{1,4})\s*호?\s*[,，]\s*(\d{1,5})/;
const COURT_BACK = /(대법원|대판|[가-힣]{2,10}(?:고등법원|지방법원|행정법원|가정법원|회생법원|특허법원|고법|지법|행법|가법)(?:\s?[가-힣]{2,4}지원)?)\s*(?:((?:19|20)\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*(자|선고)?\s*)?$/;
// (the authors: Korean names, two to five letters, joined by · and maybe ending 외 — or a Western name of a few words)
const PAPER_RE = /(?<![가-힣A-Za-z])((?:[가-힣]{2,5}(?:\s*[·ㆍ]\s*[가-힣]{2,5})*|[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})(?:\s*외)?)\s*,\s*["“]([^"”\n]{4,200})["”]\s*,\s*[『「]([^』」\n]{2,40})[』」]\s*((?:통권\s*)?(?:제\s*)?\d+\s*[권집호](?:\s*(?:제\s*)?\d+\s*호)?)?/g;
export function findCites(text) {
  const out = [], taken = [];
  const free = (i, j) => !taken.some(([a, b]) => i < b && j > a);
  const take = (it) => { out.push(it); taken.push([it.i, it.i + it.len]); };
  // 헌재 (a number the court gives after another, 2004헌마554·566, belongs to the cite before it)
  const nos = cases.scanCases(text);
  for (let k = 0; k < nos.length; k++) {
    const c = nos[k];
    if (!free(c.i, c.i + c.len)) continue;
    const back = text.slice(Math.max(0, c.i - 44), c.i), h = CC_BACK.exec(back);
    const i0 = h ? c.i - back.length + h.index : c.i;
    let j = c.i + c.len;
    while (nos[k + 1] && nos[k + 1].i - j <= 3 && /^[\s,·ㆍ]*$/.test(text.slice(j, nos[k + 1].i))) { k++; j = nos[k].i + nos[k].len; }
    const t = /^(\s*\(병합\))?(\s*등)?(?:\s*(?:전원재판부\s*)?결정)?/.exec(text.slice(j));
    const joined = !!t[2];
    j += t[0].length;
    const it = { kind: h ? 'cc' : 'ccno', no: c.no, i: i0, len: 0, joined, noAt: c.i, noEnd: c.i + c.len };
    if (h && h[2]) { const ds = h[0].slice(h[0].indexOf(h[2])).replace(/\s*(?:선고\s*)?$/, ''); it.date = `${h[2]}. ${+h[3]}. ${+h[4]}.`; it.dateSpan = ds; it.dateAt = i0 + h[0].indexOf(h[2]); }
    const b = h ? PJ_AFTER.exec(text.slice(j)) : null, g = h && !b ? GB_AFTER.exec(text.slice(j)) : null;
    if (b) { it.book = { vs: b[1] + '-' + b[2], h: b[3] || '', p: +b[4] }; const lead = b[0].search(/판례집/); it.bookSpan = b[0].slice(lead); it.bookAt = j + lead; j += b[0].length; }
    else if (g) { it.gazette = { n: +g[1], p: +g[2] }; j += g[0].length; }
    it.len = j - i0; it.src = text.slice(i0, j);
    take(it);
  }
  // 법원
  const cs = laws.scanCourtCases(text);
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k];
    if (!free(c.i, c.i + c.len)) continue;
    const back = text.slice(Math.max(0, c.i - 50), c.i), h = COURT_BACK.exec(back);
    const i0 = h ? c.i - back.length + h.index : c.i;
    // (the numbers decided with it, 2009두23617, 23624: one citation)
    let j = c.i + c.len;
    while (cs[k + 1] && cs[k + 1].i - j <= 3 && /^[\s,·ㆍ]*$/.test(text.slice(j, cs[k + 1].i))) { k++; j = cs[k].i + cs[k].len; }
    const t = /^(\s*전원합의체)?\s*(판결|결정)?/.exec(text.slice(j));
    const it = { kind: 'court', no: c.no, ref: c.ref, i: i0, len: j + t[0].length - i0, enbanc: !!t[1], form: t[2] || '', courtSaid: h ? h[1] : '', noAt: c.i, noEnd: c.i + c.len };
    if (h && h[2]) { it.date = `${h[2]}. ${+h[3]}. ${+h[4]}.`; it.dateAt = i0 + h[0].indexOf(h[2]); it.dateSpan = h[0].slice(h[0].indexOf(h[2])).replace(/\s*(?:자|선고)?\s*$/, ''); }
    if (t[1]) { it.ebAt = j + t[0].indexOf(t[1]); it.ebSpan = t[1]; }
    it.src = text.slice(i0, i0 + it.len);
    take(it);
  }
  // 조문 (one a sentence for the same article)
  const seen = new Set();
  for (const a of laws.scanArticlesAll(text)) {
    if (a.foreign || a.oldcon || !free(a.i, a.i + a.len)) continue;
    const [s] = sentenceAt(text, a.i), key = `${a.law}|${a.art}|${a.sub}|${a.para}|${s}`;
    if (seen.has(key)) continue;
    seen.add(key);
    take({ kind: 'art', law: a.law, art: a.art, sub: a.sub || 0, para: a.para || 0, old: a.old || '', i: a.i, len: a.len, src: text.slice(a.i, a.i + a.len) });
  }
  // 논문
  PAPER_RE.lastIndex = 0;
  let m;
  while ((m = PAPER_RE.exec(text))) {
    const at = m.index + m[0].indexOf(m[1].trim());
    if (!free(at, m.index + m[0].length)) continue;
    const tail = /^\s*[,，]?\s*([^,，.\n]{2,30}?)?\s*[,，]?\s*((?:19|20)\d{2})(?:\s*\.\s*\d{1,2})?\s*\.?\s*(?:[,，]\s*(\d{1,4})\s*[-–~]\s*(\d{1,4})\s*(면|쪽)?)?/.exec(text.slice(m.index + m[0].length));
    const end = m.index + m[0].length + (tail ? tail[0].length : 0);
    const it = { kind: 'paper', who: m[1].trim(), title: m[2].trim(), journal: m[3].trim(), vol: m[4] ? m[4].trim() : '', i: at, len: end - at,
      year: tail && tail[2] ? tail[2] : '', fp: tail && tail[3] ? tail[3] : '', lp: tail && tail[4] ? tail[4] : '' };
    if (m[4]) { it.volAt = m.index + m[0].lastIndexOf(m[4]); }
    it.src = text.slice(at, end);
    take(it);
  }
  return out.sort((a, b) => a.i - b.i).slice(0, 60).map((x, n) => ({ ...x, id: 'c' + n, status: 'wait', msg: '', notes: [], fixes: [] }));
}

/* each citation looked up */
const fix = (it, label, at, from, to) => { if (from !== to && at >= 0) it.fixes.push({ label, at, from, to }); };
const caseResult = (r) => { const s = String(r || ''); return /한정합헌|합헌|기각/.test(s) ? 'keep' : /위헌|불합치|인용/.test(s) ? 'void' : /각하/.test(s) ? 'out' : ''; };
async function checkCc(it, text) {
  let d;
  try { d = await once('cc:' + it.no, () => timed(cases.decision(it.no), 9000)); }
  catch (e) { it.status = 'unknown'; it.msg = e && e.code === 'offline' ? '인터넷에 연결되지 않아 확인하지 못했습니다' : '헌법재판소 자료에 지금 닿지 않습니다'; return; }
  if (!d) { it.status = 'unknown'; it.msg = `헌법재판소 공개 자료에서 ${it.no}를 찾지 못했습니다 · 사건번호를 확인하세요`; return; }
  await timed(cases.book(d), 6000).catch(() => null);
  const full = cases.citeFull(d), pj = /판례집 (\d{1,2}-\d)(상|하)?, (\d+)/.exec(full);
  const bad = [];
  it.found = full;
  if (it.kind === 'ccno') {
    it.status = 'ok'; it.msg = `${d.name ? d.name + ' · ' : ''}${d.date || ''} ${d.result || ''}`.trim();
    it.notes.push(`인용할 때: ${full}`);
    return;
  }
  if (it.date && d.date && !sameDay(it.date, d.date)) { bad.push(`선고일은 ${d.date}입니다`); fix(it, `날짜를 ${d.date}로`, it.dateAt, it.dateSpan, d.date); }
  if (it.book && pj) {
    const [vs, h, p] = [pj[1], pj[2] || '', +pj[3]];
    const sure = !(d.book && d.book.sure === false);
    if (it.book.vs !== vs || it.book.p !== p) bad.push(`판례집 ${vs}${h}, ${p}에 실렸습니다`);
    else if (sure && h && it.book.h !== h) bad.push(it.book.h ? `판례집 ${vs}${h}입니다 (${it.book.h} → ${h})` : `상·하 권이 빠졌습니다: 판례집 ${vs}${h}`);
    else if (sure && !h && it.book.h) bad.push(`판례집 ${vs}는 한 권입니다 (${it.book.h} 빼기)`);
    else if (!sure && h !== it.book.h) it.notes.push('판례집 상·하 권은 공개 자료로 확인하지 못했습니다');
    if (bad.length && (it.book.vs !== vs || it.book.p !== p || sure)) { const right = `판례집 ${vs}${sure ? h : it.book.h}, ${p}`; fix(it, `${right}로 고치기`, it.bookAt, it.bookSpan.replace(/\s+$/, ''), right); }
  } else if (it.book && !pj) {
    it.notes.push(/공보/.test(full) ? `공개 자료에는 공보로 실렸습니다: ${full}` : '공개 자료에 판례집 표기가 없어 권·쪽을 대조하지 못했습니다');
  } else if (!it.book && !it.gazette && pj) {
    // (no 판례집 in the text is no error: '헌법재판소 2004. 10. 21. 선고 2004헌마554 결정' is cited so in a sentence — the
    // reference offered, the citation itself right)
    it.notes.push(`판례집: ${pj[1]}${pj[2] || ''}, ${pj[3]}`);
    fix(it, `판례집 ${pj[1]}${pj[2] || ''}, ${pj[3]} 넣기`, it.i + it.len, '', `, 판례집 ${pj[1]}${pj[2] || ''}, ${pj[3]}`);
  }
  if (d.joined && !it.joined) it.notes.push('함께 결정된 사건이 있어 보통 ‘등’을 붙입니다');
  // the result the sentence gives it, when it gives one plainly at odds with the 주문
  const [s, e] = sentenceAt(text, it.i, it.i + it.len), said = text.slice(s, e).replace(it.src, '');
  const words = [...new Set((said.match(/한정위헌|한정합헌|헌법불합치|위헌|합헌/g) || []).map(caseResult))].filter(Boolean);
  const real = caseResult(d.result);
  if (words.length === 1 && real && real !== 'out' && words[0] !== real) it.notes.push(`주문은 ‘${d.result}’입니다 · 문장의 결론과 맞는지 확인하세요`);
  it.status = bad.length ? 'bad' : 'ok';
  it.msg = bad.length ? bad.join(' · ') : `${d.name || ''}${d.result ? ' · ' + d.result : ''}`.replace(/^ · /, '');
}
async function checkCourt(it) {
  let d;
  try { d = await once('court:' + it.ref, () => timed(laws.courtCase(it.ref), 9000)); }
  catch (e) { it.status = 'unknown'; it.msg = e && e.code === 'offline' ? '인터넷에 연결되지 않아 확인하지 못했습니다' : '판결 자료에 지금 닿지 않습니다'; return; }
  if (!d) { it.status = 'unknown'; it.msg = '공개된 판결 자료에 없습니다 · 대법원 종합법률정보에서 확인하세요'; return; }
  const bad = [];
  it.found = laws.courtCite(d);
  if (it.date && d.date && !sameDay(it.date, d.date)) { bad.push(`선고일은 ${d.date}입니다`); fix(it, `날짜를 ${d.date}로`, it.dateAt, it.dateSpan, d.date); }
  if (d.enbanc && !it.enbanc) { bad.push('전원합의체 판결입니다'); fix(it, '‘전원합의체’ 넣기', it.i + it.len - (/(?:판결|결정)$/.test(it.src) ? it.src.length - it.src.search(/\s*(?:판결|결정)$/) : 0), '', ' 전원합의체'); }
  if (!d.enbanc && it.enbanc && d.courtName === '대법원') { bad.push('전원합의체 판결이 아닙니다'); fix(it, '‘전원합의체’ 빼기', it.ebAt, it.ebSpan, ''); }
  if (it.form && d.kind && it.form !== d.kind && /^(판결|결정)$/.test(d.kind)) bad.push(`${d.kind}입니다`);
  if (!it.date && d.date) it.notes.push(`인용할 때: ${laws.courtCite(d)}`);
  it.status = bad.length ? 'bad' : 'ok';
  it.msg = bad.length ? bad.join(' · ') : `${d.name || ''}`;
}
// the 'claims' a sentence makes of an article's words — a number with its unit and the words before it ('선거일전 180일',
// '300만원 이하') — each to be found in the article as it stood
const CLAIM = /([가-힣]{2,})\s*(전|후|이내|이상|이하|부터|까지)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(일|개월|년|시간|만\s*원|천만\s*원|억\s*원|원|명|인|퍼센트|%|세)/g;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 은/는, 을/를 … by the word's last letter (a digit read as it is said: 1 일, 3 삼, 6 육, 7 칠, 8 팔, 0 영 … end in a consonant)
const josaW = (w, withF, without) => { const t = String(w || '').trim(), ch = t[t.length - 1] || ''; if (/\d/.test(ch)) return '013678'.includes(ch) ? withF : without; const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? withF : without; };
async function checkArt(it, text, all) {
  const span = it.src, cut = span.search(/\s*제\s*\d/);
  const named = cut > 0 ? span.slice(0, cut) : '';                      // the law's name as written ('「공직선거법」', '구 정치자금에관한법률')
  const bare = named.replace(/\s*\([^()]*\)\s*$/, '').replace(/[「」｢｣『』]/g, '').replace(/^구\s*/, '').trim();
  // (marked old by the text itself: '구 …', or a note that the version cited is one before some change)
  const gu = /^구\s/.test(named) || /(?:^|[^가-힣])구\s*$/.test(text.slice(Math.max(0, it.i - 3), it.i)) || /(?:전의\s*것|개정\s*전|되기\s*전|이전의\s*것)\s*\)\s*$/.test(named);
  const words = artWords(it);
  const o = bare ? laws.oldLaw(bare) : null;
  if (o) {   // an old name: renamed (the same numbers, or a 전부개정's new ones) or repealed
    const s = await once(`succ:${bare}|${it.art}`, () => timed(laws.successor(bare, it.art, o.date || '', {}), 8000)).catch(() => null);
    const c = s && s.candidates && s.candidates[0];
    const now = c ? `${c.law} 제${c.art}조${c.sub ? '의' + c.sub : ''}${c.title ? `(${c.title})` : ''}` : '';
    if (gu) { it.status = 'ok'; it.msg = `구법으로 적었습니다${now ? ` · 지금은 ${now}` : ''}`; if (s && s.note) it.notes.push(s.note); return; }
    it.status = 'bad';
    it.msg = (s && s.note) || `${bare}${o.gone ? '은 폐지되었습니다' : '은 이름이 바뀌었습니다'}`;
    if (now) it.notes.push(`지금의 조문: ${now}`);
    const head = /^.*?제\s*\d+\s*조(?:\s*의\s*\d+)?/.exec(span);
    if (c && named && head) fix(it, `${c.law} 제${c.art}조${c.sub ? '의' + c.sub : ''}로`, it.i, head[0], `${c.law} 제${c.art}조${c.sub ? '의' + c.sub : ''}`);
    if (named) fix(it, '‘구’ 붙이기', it.i, named, '구 ' + bare);
    return;
  }
  let law;
  try { law = await lawObj(it.law); }
  catch (e) {
    if (e && e.code === 'repealed') { it.status = gu ? 'ok' : 'bad'; it.msg = `${it.law}은 폐지된 법률입니다${e.nowLaw || e.now ? ` · 뒤를 이은 법률: ${e.nowLaw || e.now}` : ''}`; if (!gu && named) fix(it, '‘구’ 붙이기', it.i, named, '구 ' + bare); return; }
    it.status = 'unknown'; it.msg = e && e.code === 'offline' ? '인터넷에 연결되지 않아 조문을 확인하지 못했습니다' : `${it.law}의 조문을 지금 읽지 못했습니다`; return;
  }
  const x = law.arts ? laws.findArt(law, it.art, it.sub) : null;
  const h = await historyOf(it.law, it.art, it.sub).catch(() => null);
  const list = (h && h.list) || [];
  if (law.arts && !x && !gu) { it.status = 'bad'; it.msg = `현행 ${law.full || it.law}에 ${words.replace(/ 제\d+항$/, '')}가 없습니다${list[0] && list[0].gone ? ` (${dotDay(list[0].d)} 삭제)` : ''}`; return; }
  if (!law.arts && !list.length) { it.status = 'unknown'; it.msg = navigator.onLine === false ? '인터넷에 연결되지 않아 조문을 확인하지 못했습니다' : `${it.law}의 조문을 지금 읽지 못했습니다`; return; }
  if (!x && list[0] && list[0].gone && !gu) { it.status = 'bad'; it.msg = `${dotDay(list[0].d)} 삭제된 조문입니다`; return; }
  const nowText = x ? x.text : (list[0] && list[0].text) || '';
  if (it.para && !paraOf(nowText, it.para)) { it.status = 'bad'; it.msg = `현행 ${words.replace(/ 제\d+항$/, '')}에는 제${it.para}항이 없습니다`; return; }
  const isLaw = !/(?:령|규칙)$/.test(it.law);
  const guFix = (chg) => { if (named && chg && chg.no && isLaw && !gu) fix(it, '구법으로 적기', it.i, named, `구 ${bare}(${dotDay(chg.d)} 법률 제${chg.no}호로 개정되기 전의 것)`); };
  // the version the text speaks of: the one a note gives ('(2023. 8. 30. … 개정되기 전의 것)'), else today's
  const asOf = /(\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.)\s*(?:개정|시행)\s*전/.exec(it.old || '');
  const at = asOf ? dashOf(asOf[1]) : '';
  const verIdx = at ? list.findIndex((e) => e.d < at) : 0;
  const shown = at ? (verIdx >= 0 ? list[verIdx].text : '') : nowText;
  const bad = [];
  // 1. the numbers the sentence gives of it
  const [s, e] = sentenceAt(text, it.i, it.i + it.len), sent = text.slice(s, e);
  CLAIM.lastIndex = 0;
  let m;
  while ((m = CLAIM.exec(sent))) {
    if (s + m.index >= it.i && s + m.index < it.i + it.len) continue;
    const pre = flat(m[1] + (m[2] || '')).slice(-6), num = m[3].replace(/,/g, ''), unit = flat(m[4]);
    if (pre.length < 2) continue;
    const want = pre + num + unit, hay = flat(paraOf(shown, it.para) || shown);
    if (!shown || hay.includes(want)) continue;
    const other = new RegExp(reEsc(pre) + '(\\d+(?:\\.\\d+)?)' + reEsc(unit)).exec(hay);
    if (!other) continue;   // (the article says nothing of it: a number of something else)
    const k = list.findIndex((v) => flat(paraOf(v.text, it.para) || v.text).includes(want));
    const chg = k > 0 ? list[k - 1] : null;
    const curWords = m[0].replace(m[3], other[1].replace(/\B(?=(\d{3})+(?!\d))/g, m[3].includes(',') ? ',' : ''));
    bad.push(chg ? `‘${m[0].trim()}’${josaW(m[0].trim(), '은', '는')} ${dotDay(chg.d)} 개정(${isLaw ? '법률' : ''} 제${chg.no}호) 전의 문구입니다 · ${at ? '그때' : '지금'}은 ‘${curWords.trim()}’` : `${at ? '그때' : '현행'} ${words}에는 ‘${curWords.trim()}’로 되어 있습니다`);
    fix(it, `‘${curWords.trim()}’로`, s + m.index, m[0], curWords);
    if (!at) guFix(chg);
  }
  // 2. a decision or judgment the same sentence cites, made before the article last changed: it spoke of the old text
  if (!gu && !bad.length) {
    const ref = all.filter((y) => (y.kind === 'cc' || y.kind === 'court') && y.date && y.i >= s && y.i < e).map((y) => dashOf(y.date)).sort().pop();
    if (ref && list.length) {
      const then = list.find((v) => v.d <= ref);
      const after = list.filter((v) => v.d > ref).reverse();   // (oldest first)
      if (then && after.length) {
        let prev = flat(paraOf(then.text, it.para) || then.text), chg = null;
        for (const v of after) { const t = flat(paraOf(v.text, it.para) || v.text); if (t !== prev) { chg = v; break; } prev = t; }
        if (chg) { bad.push(`인용한 결정(${dotDay(ref)}) 뒤 ${dotDay(chg.d)} 개정으로 ${words}가 바뀌었습니다 · 결정이 다룬 것은 개정 전 조문입니다`); guFix(chg); }
      }
    }
  }
  it.status = bad.length ? 'bad' : 'ok';
  it.msg = bad.length ? bad.join(' · ') : `${x && x.title ? `${x.title} · ` : ''}${at ? `${asOf[1]} 개정 전 조문` : '현행 조문'}${!at && list[0] && list[0].d ? ` · 최근 개정 ${dotDay(list[0].d)}` : ''}`;
}
async function checkPaper(it) {
  const want = papers.norm(papers.mainTitle(it.title));
  let r = null;
  try { r = await once('kq:' + want, () => kciq.search(papers.mainTitle(it.title), { size: 20 })); } catch (e) { r = null; }
  const row = r && (r.rows || []).find((x) => papers.norm(papers.mainTitle(x.t)) === want);
  if (!row) { it.status = 'unknown'; it.msg = '이 기기의 KCI 법학 논문 색인에 없는 논문입니다 · 권호·쪽은 원문으로 확인하세요'; return; }
  const bad = [], right = papers.issueText({ journal: row.journal, v: row.v, i: row.i });
  if (row.journal && papers.norm(row.journal) !== papers.norm(it.journal)) bad.push(`학술지는 『${row.journal}』입니다`);
  if (right && papers.norm(right) !== papers.norm(it.vol)) { bad.push(it.vol ? `권호는 ${right}입니다` : `권호가 빠졌습니다: ${right}`); if (it.vol) fix(it, `${right}로`, it.volAt, it.vol, right); }
  if (row.y && it.year && row.y !== it.year) bad.push(`${row.y}년에 실렸습니다`);
  if (row.fp && it.fp && (row.fp !== it.fp || (row.lp && it.lp && row.lp !== it.lp))) bad.push(`${row.fp}${row.lp ? '-' + row.lp : ''}면입니다`);
  it.status = bad.length ? 'bad' : 'ok';
  it.msg = bad.length ? bad.join(' · ') : `${row.journal} ${right}${row.y ? ` · ${row.y}` : ''}${row.fp ? ` · ${row.fp}${row.lp ? '-' + row.lp : ''}면` : ''}`;
}
async function checkOne(it, text, all) {
  if (it.kind === 'cc' || it.kind === 'ccno') return checkCc(it, text);
  if (it.kind === 'court') return checkCourt(it);
  if (it.kind === 'art') return checkArt(it, text, all);
  if (it.kind === 'paper') return checkPaper(it);
}
async function runCheck() {
  if (W.run || W.checking) return;
  const ta = $('.wr-in'), text = ta.value;
  if (!text.trim()) { W.ctx.toast('먼저 글을 넣어 주세요'); ta.focus(); return; }
  const items = findCites(text);
  const cur = { act: 'cite', id: newId(), at: Date.now(), input: text.trim(), text, items, state: 'checking', t0: Date.now(), done: 0 };
  W.cur = cur; W.checking = true;
  paintActs(); paintRes(); reveal();
  await inTurn(items.map((it) => async () => {
    try { await checkOne(it, text, items); } catch (e) { it.status = 'unknown'; it.msg = '확인하지 못했습니다'; }
    if (it.status === 'wait') it.status = 'unknown';
    cur.done++;
    if (W.cur === cur) paintCheckProgress(cur);
  }));
  cur.state = 'done'; cur.t1 = Date.now();
  W.checking = false;
  paintActs();
  if (W.cur === cur) paintRes();
}
const KIND_NAME = { cc: '헌재 결정', ccno: '헌재 결정', court: '법원 판결', art: '조문', paper: '논문' };
function paintCheckProgress(c) {
  const p = $('.wr-res .wr-ckp i'), n = $('.wr-res .wr-ckn');
  if (p) p.style.width = `${Math.round((100 * c.done) / Math.max(1, c.items.length))}%`;
  if (n) n.textContent = `${nf(c.done)} / ${nf(c.items.length)}`;
}
function paintCheck(box, c) {
  const head = (st) => `<div class="wr-rh"><b>인용 점검</b><span class="wr-tag">앱 자료로 대조 · Claude 쓰지 않음</span><span class="wr-st">${esc(st)}</span><span class="sp"></span>${c.state === 'done' ? '<button type="button" class="btn small" data-ck="again">다시 점검</button>' : ''}</div>`;
  if (c.state === 'checking') {
    setHtml(box, `<div class="wr-card wr-ckc">${head(`인용 ${nf(c.items.length)}건`)}<p class="wr-msg">판례·법령·논문 자료와 대조하는 중 · <span class="wr-ckn">${nf(c.done)} / ${nf(c.items.length)}</span></p><div class="wr-ckp" role="progressbar" aria-label="대조한 인용"><i style="width:0%"></i></div></div>`);
    paintCheckProgress(c);
    return;
  }
  if (!c.items.length) {
    setHtml(box, `<div class="wr-card wr-ckc">${head('')}<p class="wr-msg">글에서 인용을 찾지 못했습니다. 이런 꼴을 찾습니다: 헌재 2011. 12. 29. 2007헌마1001 · 대법원 2010. 3. 25. 선고 2009두23617 판결 · 공직선거법 제93조 제1항 · 저자, "제목", 『학술지』 제N권 제N호, 연도.</p></div>`);
    return;
  }
  const by = { bad: [], unknown: [], ok: [] };
  for (const it of c.items) (by[it.status] || by.unknown).push(it);
  const kinds = Object.entries(c.items.reduce((m, it) => { const k = KIND_NAME[it.kind]; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([k, n]) => `${k} ${nf(n)}`).join(' · ');
  const item = (it) => `<li class="wr-cki is-${it.status}${it.fixed ? ' is-fixed' : ''}" data-ci="${it.id}"><button type="button" class="wr-ckq" data-ck="find" title="글상자에서 찾기">${esc(it.src.length > 120 ? it.src.slice(0, 118) + '…' : it.src)}</button>
    <p class="wr-ckm">${esc(it.fixed ? `고쳤습니다: ${it.fixed}` : it.msg)}</p>${it.notes.map((t) => `<p class="wr-cko">${esc(t)}</p>`).join('')}
    ${!it.fixed && it.fixes.length ? `<div class="wr-ckx">${it.fixes.map((f, k) => `<button type="button" class="btn small${k ? '' : ' primary'}" data-ck="fix" data-fx="${k}">${esc(f.label)}</button>`).join('')}</div>` : ''}</li>`;
  const group = (k, label) => (by[k].length ? `<h4 class="wr-ckh is-${k}">${label} <span>${nf(by[k].length)}</span></h4><ol class="wr-ckl">${by[k].map(item).join('')}</ol>` : '');
  const secs = Math.max(1, Math.round(((c.t1 || Date.now()) - c.t0) / 1000));
  setHtml(box, `<div class="wr-card wr-ckc">${head(`인용 ${nf(c.items.length)}건 · ${nf(secs)}초`)}
    <p class="wr-msg">${esc(kinds)} — 다름 ${nf(by.bad.length)} · 확인 못 함 ${nf(by.unknown.length)} · 맞음 ${nf(by.ok.length)}</p>
    <p class="wr-msg wr-ckstale"${(($('.wr-in') || {}).value || '').trim() === c.input ? ' hidden' : ''}>글이 바뀌었습니다 · 다시 점검하면 바뀐 글로 대조합니다</p>
    ${group('bad', '다름')}${group('unknown', '확인 못 함')}${group('ok', '맞음')}</div>`);
}
// the line that says the text changed since it was checked (shown and hidden in place)
function paintStale() {
  const c = W.cur, el = $('.wr-res .wr-ckstale');
  if (c && c.act === 'cite' && el) el.hidden = (($('.wr-in') || {}).value || '').trim() === c.input;
}
function checkAct(k, el) {
  const c = W.cur; if (!c || c.act !== 'cite') return;
  if (k === 'again') { runCheck(); return; }
  const li = el.closest('[data-ci]'), it = li && c.items.find((x) => x.id === li.dataset.ci);
  if (!it) return;
  const ta = $('.wr-in');
  if (k === 'find') { if (!selectIn(it.src, it.i)) W.ctx.toast('글상자에서 이 인용을 찾지 못했습니다'); return; }
  if (k === 'fix') {
    const f = it.fixes[Number(el.dataset.fx)]; if (!f) return;
    const text = ta.value;
    // (an insertion: after the citation, where it still stands; a change: the very words, nearest to where they were)
    let at;
    if (!f.from) { const p = locate(text, it.src, it.i); at = p < 0 ? -1 : p + (f.at - it.i); }
    else at = locate(text, f.from, f.at);
    if (at < 0) { W.ctx.toast('글이 바뀌어 고치지 못했습니다 · 다시 점검해 주세요'); return; }
    const prev = text;
    putDraft(text.slice(0, at) + f.to + text.slice(at + f.from.length));
    c.input = $('.wr-in').value.trim();   // (put right here: not 'changed since the check')
    it.fixed = f.to ? `${f.from || '…'} → ${f.to}` : `${f.from} 뺌`;
    paintRes();
    W.ctx.toast('고쳤습니다', 6000, { label: '되돌리기', fn: () => { putDraft(prev); it.fixed = ''; c.input = prev.trim(); if (W.cur === c) paintRes(); } });
  }
}

/* ---------------- what app.css does not style yet: the parts this screen added in 8차 ----------------
   (근거 메모, 인용 점검's card, 내 논문 고르기, the 기기 사이에 맞추기 switch — in the app's tokens; L2 may move them to app.css) */
function ensureStyle() {
  if (document.getElementById('wr-css8')) return;
  const st = document.createElement('style');
  st.id = 'wr-css8';
  st.textContent = `
.wr-notes { margin-top: 10px; background: var(--card); border-radius: 14px; box-shadow: var(--shadow); padding: 10px 16px 6px; }
.wr-notes[hidden], .wr-ckstale[hidden] { display: none; }
.wr-nh { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 32px; }
.wr-nh b { font-size: 14px; font-weight: 700; }
.wr-nhb { display: flex; gap: 6px; margin-left: auto; }   /* (the two together: on a phone they go under the head as one) */
.wr-nl { list-style: none; margin: 6px 0 0; padding: 0; }
.wr-nl li { border-top: 1px solid var(--rule); padding: 9px 0 8px; }
.wr-nq { display: block; width: 100%; text-align: left; font-size: 13.5px; line-height: 1.6; color: var(--ink-2); padding: 0; }
.wr-nn { margin: 4px 0 0; font-size: 13px; line-height: 1.55; color: var(--ink); }
.wr-nn::before { content: "근거 필요"; display: inline-block; margin-right: 6px; padding: 0 6px; border-radius: 4px; font-size: 11.5px; font-weight: 700; background: color-mix(in srgb, var(--gold) 45%, transparent); color: var(--ink); }
.wr-nb, .wr-ckx { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
.wr-ckp { height: 4px; margin: 10px 0 4px; border-radius: 2px; background: var(--chip); overflow: hidden; }
.wr-ckp i { display: block; height: 100%; background: var(--accent); }
.wr-ckh { display: flex; align-items: center; gap: 6px; margin: 16px 0 4px; font-size: 13px; font-weight: 700; color: var(--ink-2); }
.wr-ckh span { font-weight: 600; color: var(--faint); }
.wr-ckh.is-bad { color: var(--danger); }
.wr-ckl { list-style: none; margin: 0; padding: 0; }
.wr-cki { border-top: 1px solid var(--rule); padding: 9px 0 9px 12px; position: relative; }
.wr-cki::before { content: ""; position: absolute; left: 0; top: 11px; bottom: 11px; width: 3px; border-radius: 2px; background: var(--rule); }
.wr-cki.is-bad::before { background: var(--danger); }
.wr-cki.is-ok::before { background: color-mix(in srgb, var(--accent) 55%, transparent); }
.wr-cki.is-fixed::before { background: var(--accent); }
.wr-ckq { display: block; width: 100%; text-align: left; padding: 0; font-size: 14px; line-height: 1.55; font-weight: 600; color: var(--ink); word-break: keep-all; overflow-wrap: anywhere; }
.wr-ckm { margin: 3px 0 0; font-size: 13px; line-height: 1.55; color: var(--ink-2); }
.wr-cki.is-bad .wr-ckm { color: var(--danger); font-weight: 600; }
.wr-cki.is-fixed .wr-ckm { color: var(--accent); font-weight: 600; }
.wr-cko { margin: 2px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--muted); }
.wr-pick .wr-pq { display: block; width: 100%; height: 38px; margin: 10px 0 6px; padding: 0 12px; border-radius: 10px; border: 0; background: var(--chip); color: var(--ink); font: inherit; font-size: 14px; }
.wr-pl { max-height: 300px; overflow: auto; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); overscroll-behavior: contain; }
.wr-pi { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 4px 2px; font-size: 13.5px; color: var(--ink-2); cursor: pointer; }
.wr-pi[hidden] { display: none; }
.wr-pi + .wr-pi { border-top: 1px solid color-mix(in srgb, var(--rule) 60%, transparent); }
.wr-pi input { flex: none; width: 17px; height: 17px; margin: 0; accent-color: var(--accent); }
.wr-pi span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wr-pi small { margin-left: auto; flex: none; font-size: 11.5px; color: var(--faint); }
.wr-srcs { margin: 6px 0 0; line-height: 1.5; }
.wr-hh { margin-top: 24px; }
.wr-hh .sec-h { margin: 0; }
.wr-sync { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--ink-2); cursor: pointer; }
.wr-sync input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); }
@media (pointer: coarse) { .wr-nb .btn, .wr-ckx .btn, .wr-nh .btn { min-height: 44px; } .wr-pi { min-height: 44px; } .wr-sync { min-height: 44px; } .wr-ckq, .wr-nq { min-height: 44px; } }
`;
  document.head.appendChild(st);
}

/* ---------------- the style sample: paragraphs that show how the owner writes ---------------- */
// From each paper's page texts (as the shelf keeps them: a page's paragraphs line by line, its notes after a blank line):
// the paragraphs of the body only — after the first first-level heading (Ⅰ. 서론 …) and before the references or an
// abstract at the end; not headings, notes, tables, lists of figures or references. A paragraph cut by a page break is
// joined again. Each is labelled 서론, 본론 or 결론 by the first-level heading it sits under (by its place, when a
// paper has none), scored for what shows a style best — a full argument of moderate length, opened by a connective,
// citing a case or an article, taking a position — and the best of each part taken from every paper in turn.
const ROMAN = /^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[IVX]{1,5})\s*[.．]\s*\S/;
const SUBHEAD = /^(?:\d{1,2}|[가-하]|\(\d{1,2}\)|\d{1,2}\)|[가-하]\)|[①-⑳])\s*[.)．]?\s*\S/;
const INTRO = /서\s*론|머리말|들어가(?:며|는\s*말)|문제의\s*제기|문제\s*제기|서\s*언|시작하며/;
const CONC = /결\s*론|맺(?:음말|는\s*말|으며)|나가(?:며|는\s*말)|마치며|결\s*어|마무리/;
const BACK = /^[\s<[【〔(]*(?:참\s*고\s*문\s*헌|Abstract|ABSTRACT|국\s*문\s*초\s*록|초\s*록|Bibliography|References)[\s>\]】〕)]*$/;
const ENDS = /[.?!。]["”’」』)\]]*$/;
const CITE = /헌재|헌법재판소|대법원|\d{2,4}\s*헌[가-힣]{1,2}\s*\d+|\d{2,4}[가-힣]{1,2}\d{2,6}|제\s*\d+\s*조/;
const OPENS = /^(?:그러나|따라서|요컨대|이에|이러한|이와\s*같이|이처럼|한편|생각건대|결국|다만|특히|더\s*나아가|그런데|즉|물론|이상에서|그렇다면|그러므로|그리고|또한|아울러|무엇보다)/;
const STANCE = /생각건대|판단된다|보인다|할\s*것이다|필요가\s*있다|바람직하다|타당하다|생각한다|여겨진다|볼\s*수\s*있다|하여야\s*한다|해야\s*한다/;
const norm = (s) => String(s || '').replace(/[\s｢｣「」『』"“”'‘’]/g, '');
// cleanCopy (the shelf's copy cleaner) takes a number glued to ')' for a footnote marker ('…이다.12)', '이론12)은') and
// drops it. Inside a parenthesis that is a case number or an article's branch number ('(2004헌마554)', '(형법 제489조의1)'),
// and how the owner cites those is just what the style is to learn — so a ')' that closes a '(' is shielded first.
const SHIELD = '';
function shieldParens(s) {
  let depth = 0, out = '';
  for (const ch of String(s || '')) {
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) { depth--; if (/\d$/.test(out)) out += SHIELD; }
    out += ch;
  }
  return out;
}
const cleanText = (s) => cleanCopy(shieldParens(s)).split(SHIELD).join('');

function paragraphsOf(t) {
  const outline = Array.isArray(t.outline) ? t.outline : [];
  const level1 = new Set(outline.filter((o) => o.level === 1).map((o) => norm(o.title)));
  const heads = new Set(outline.map((o) => norm(o.title)));
  const out = [];
  let part = 'front', cur = null, any1 = false;
  const flush = () => { if (cur) { out.push(cur); cur = null; } };
  (t.pages || []).forEach((pg, pi) => {
    const lines = String(pg || '').split('\n\n')[0].split('\n').map((l) => l.trim()).filter(Boolean);
    lines.forEach((L, li) => {
      const n = norm(L);
      const l1 = level1.has(n) || (!level1.size && L.length <= 60 && ROMAN.test(L));
      if (BACK.test(L) || (l1 && /참고\s*문헌|Abstract/i.test(L))) { flush(); part = 'back'; return; }
      if (l1) { flush(); part = INTRO.test(L) ? '서론' : CONC.test(L) ? '결론' : '본론'; any1 = true; return; }
      if (heads.has(n) || (L.length <= 50 && SUBHEAD.test(L) && !ENDS.test(L))) { flush(); return; }   // a lower heading
      if (li === 0 && cur && cur.page === pi - 1) { cur.text += ' ' + L; cur.page = pi; return; }   // carried over the page
      flush();
      cur = { text: L, part, page: pi };
    });
    if (cur && ENDS.test(cur.text)) flush();   // a paragraph not ended at the page's foot goes on to the next page
  });
  flush();
  let paras = out.filter((p) => p.part !== 'back' && p.part !== 'front');
  if (!any1) {   // no first-level headings found: the body is all but the first page, its parts by place
    paras = out.filter((p) => p.part === 'front' && p.page > 0);
    const n = paras.length;
    paras.forEach((p, i) => { p.part = i < n * 0.15 ? '서론' : i >= n * 0.85 ? '결론' : '본론'; });
  }
  return paras;
}
function goodPara(s) {
  const L = s.length;
  if (L < 160 || L > 1600) return false;
  const chars = s.replace(/\s+/g, '');
  const ko = (chars.match(/[가-힣]/g) || []).length;
  if (ko < chars.length * 0.55) return false;                                  // an English abstract, a table of figures
  if ((chars.match(/\d/g) || []).length > chars.length * 0.12) return false;   // statistics, a table
  if ((s.match(/[가-힣][.?!]["”’」』)]*(?=\s|$)/g) || []).length < 2) return false;   // at least two sentences
  if (!ENDS.test(s)) return false;                                             // a whole paragraph
  if (/^(?:<\s*(?:표|그림)|\[\s*(?:표|그림)|(?:표|그림)\s*\d)/.test(s)) return false;
  if (s.includes(ME) || /@|https?:|www\./.test(s)) return false;               // a name or an address
  if ((s.match(/\d{4}\.\s*[“"「『]/g) || []).length >= 2) return false;          // reference entries run together
  if (/주제어|Key\s*words|국가과학기술표준분류|논문접수일|게재확정일/i.test(s)) return false;
  return true;
}
function scorePara(s) {
  let v = s.length >= 300 && s.length <= 1000 ? 2 : s.length > 1000 ? 1 : 0;
  if (OPENS.test(s)) v += 1;
  if (CITE.test(s)) v += 1.5;
  if (STANCE.test(s)) v += 1.5;   // a position taken: how the owner argues shows most there
  if (/\([^()]{1,40}?,\s*\d{4}[a-z]?:\s*[\d-]+\)/.test(s)) v += 0.5;   // an in-text (저자, 연도: 쪽) citation
  if ((s.match(/제\s*\d+\s*조/g) || []).length >= 4 || (s.match(/[｢「][^｣」]{2,60}[｣」]/g) || []).length >= 4) v -= 1;   // mostly the law's own words
  return v;
}
// papers: [{ title, t }] → { list: [{ text, part, paper, title }], papers, chars, sources: [{ title, n }] }
export function pickParagraphs(papers, { target = 26, most = 24000 } = {}) {
  const per = (papers || []).map((p, pi) => {
    const all = paragraphsOf(p.t || {}).map((x, i) => ({ ...x, text: cleanText(x.text), at: i })).filter((x) => goodPara(x.text));
    all.forEach((x) => { x.score = scorePara(x.text); x.paper = pi + 1; x.title = p.title; });
    const by = (part) => all.filter((x) => x.part === part).sort((a, b) => b.score - a.score || a.at - b.at);
    return { 서론: by('서론'), 본론: by('본론'), 결론: by('결론') };
  });
  // rounds: each paper gives its best introduction, then its best argument, then its best conclusion, then a second
  // argument (one that cites, if the first did not), … — until there are enough
  const order = ['서론', '본론', '결론', '본론', '본론', '서론', '결론', '본론'];
  const taken = [];
  let chars = 0;
  for (const part of order) {
    for (const p of per) {
      if (taken.length >= target) break;
      let x = p[part].shift();
      if (part === '본론' && x && !CITE.test(x.text) && p[part].some((y) => CITE.test(y.text)) && !taken.some((y) => y.paper === x.paper && CITE.test(y.text))) {
        const k = p[part].findIndex((y) => CITE.test(y.text)); p[part].unshift(x); x = p[part].splice(k + 1, 1)[0];
      }
      if (!x || chars + x.text.length > most) continue;
      taken.push(x); chars += x.text.length;
    }
  }
  taken.sort((a, b) => a.paper - b.paper || a.at - b.at);
  const sources = [];
  for (const x of taken) { const s = sources.find((y) => y.title === x.title); if (s) s.n++; else sources.push({ title: x.title, n: 1 }); }
  return { list: taken.map(({ text, part, paper, title }) => ({ text, part, paper, title })), papers: sources.length, chars, sources };
}

/* ---------------- what changed, word by word ---------------- */
// Sentences first (each matched, in order, to the most alike — so one sentence rewritten, dropped or added does not shift
// the rest; a long text stays quick), then the words within each matched pair (the longest common run of words, spaces
// included). Changes with only spaces between them are shown as one ('~~a b c~~ x y z' reads better than a zipper of
// single words). Every word and space belongs to one sentence, so the marks rebuild both texts exactly.
const toks = (s) => s.match(/\s+|[^\s]+/g) || [];
function units(s) {   // the text's sentences: ended by . ? ! after a letter (not a date's '2004.') and a space, or a line break
  const t = toks(String(s || '')), out = [];
  let cur = [];
  for (let k = 0; k < t.length; k++) {
    cur.push(t[k]);
    if (!t[k].trim() && (t[k].includes('\n') || (k > 0 && /[^\d.][.?!]["”’」』)\]]*$/.test(t[k - 1])))) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}
function tokenDiff(x, y) {
  let s = 0; while (s < x.length && s < y.length && x[s] === y[s]) s++;
  let e = 0; while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e++;
  const X = x.slice(s, x.length - e), Y = y.slice(s, y.length - e), n = X.length, m = Y.length;
  const ops = [];
  if (s) ops.push([0, x.slice(0, s).join('')]);
  if (n * m > 2e6) { if (n) ops.push([-1, X.join('')]); if (m) ops.push([1, Y.join('')]); }
  else {
    const M = m + 1, T = new Uint16Array((n + 1) * M);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i * M + j] = X[i] === Y[j] ? T[(i + 1) * M + j + 1] + 1 : Math.max(T[(i + 1) * M + j], T[i * M + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (X[i] === Y[j]) { ops.push([0, X[i]]); i++; j++; }
      else if (T[(i + 1) * M + j] >= T[i * M + j + 1]) ops.push([-1, X[i++]]);
      else ops.push([1, Y[j++]]);
    }
    while (i < n) ops.push([-1, X[i++]]);
    while (j < m) ops.push([1, Y[j++]]);
  }
  if (e) ops.push([0, x.slice(x.length - e).join('')]);
  return ops;
}
const joinOps = (ops) => ops.reduce((a, o) => { const l = a[a.length - 1]; if (l && l[0] === o[0]) l[1] += o[1]; else if (o[1]) a.push([o[0], o[1]]); return a; }, []);
// runs of changes (and the spaces between them) become one deletion and one insertion
function tidy(ops) {
  const out = [];
  let del = '', ins = '';
  const flush = () => {
    // the same spaces at both ends of a deletion and its insertion are no change: they stand outside it
    let a = 0, z = 0;
    if (del && ins) {
      while (a < del.length && a < ins.length && del[a] === ins[a] && /\s/.test(del[a])) a++;
      while (z < del.length - a && z < ins.length - a && del[del.length - 1 - z] === ins[ins.length - 1 - z] && /\s/.test(ins[ins.length - 1 - z])) z++;
    }
    if (a) out.push([0, del.slice(0, a)]);
    if (del) out.push([-1, del.slice(a, del.length - z)]);
    if (ins) out.push([1, ins.slice(a, ins.length - z)]);
    if (z) out.push([0, ins.slice(ins.length - z)]);
    del = ins = '';
  };
  for (let k = 0; k < ops.length; k++) {
    const [op, t] = ops[k];
    if (op === 0) {
      if (!t.trim() && !t.includes('\n') && (del || ins) && k + 1 < ops.length && ops[k + 1][0] !== 0) { del += t; ins += t; continue; }   // a space inside a change
      flush(); out.push([0, t]); continue;
    }
    if (op < 0) del += t; else ins += t;
  }
  flush();
  return joinOps(out);
}
export function wordDiff(a, b) {
  const P = units(a), Q = units(b), n = P.length, m = Q.length;
  const set = (u) => new Set(u.filter((w) => w.trim()));
  const PS = P.map(set), QS = Q.map(set);
  const M = m + 1, sim = new Float64Array(n * m), S = new Float64Array((n + 1) * M);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {   // how alike two sentences are: the words they share
    let k = 0; for (const w of PS[i]) if (QS[j].has(w)) k++;
    const u = PS[i].size + QS[j].size - k;
    sim[i * m + j] = u ? k / u : 1;
  }
  const LIKE = 0.25;   // (a sentence sharing less than a quarter of its words with another is a different sentence)
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    const s = sim[i * m + j];
    S[i * M + j] = Math.max(S[(i + 1) * M + j], S[i * M + j + 1], s >= LIKE ? S[(i + 1) * M + j + 1] + s : -1);
  }
  // sentences left unmatched between two matches (one split in two, two run together, one rewritten throughout) are
  // compared word by word as one stretch, so the words they still share show as kept
  const ops = [];
  let gp = [], gq = [];
  const gap = () => { if (gp.length || gq.length) ops.push(...tidy(tokenDiff(gp, gq))); gp = []; gq = []; };
  let i = 0, j = 0;
  while (i < n || j < m) {
    const s = i < n && j < m ? sim[i * m + j] : 0;
    if (i < n && j < m && s >= LIKE && S[i * M + j] === S[(i + 1) * M + j + 1] + s) { gap(); ops.push(...tidy(tokenDiff(P[i], Q[j]))); i++; j++; }
    else if (i < n && (j >= m || S[(i + 1) * M + j] >= S[i * M + j + 1])) gp.push(...P[i++]);
    else gq.push(...Q[j++]);
  }
  gap();
  return tidy(joinOps(ops));
}
function renderDiff(ops) {
  return ops.map(([op, t]) => (op === 0 ? esc(t) : op < 0 ? (t.trim() ? `<del>${esc(t)}</del>` : '') : (t.trim() ? `<ins>${esc(t)}</ins>` : esc(t)))).join('');
}

// 내 글쓰기 원칙: the owner's own rules (reader, structure, argument, citation, sentences), kept on the server for every device
// and put into every request (다듬기, 간결하게, 논리·일관성 점검 …). Shown folded; 고치기 opens a box, 저장 keeps it.
async function loadRules() {
  try { const r = await api.writePrinciples(); W.rules = (r && r.text) || ''; } catch (e) { if (W.rules == null) W.rules = null; }
  paintRules();
}
function paintRules() {
  const box = $('.wr-rules'); if (!box) return;
  const t = W.rules;
  if (W.rulesEdit) {
    if (box.querySelector('.wr-rules-in')) return;   // (typing: never redrawn under the cursor)
    box.innerHTML = `<h2 class="sec-h">내 글쓰기 원칙</h2><div class="wr-rc"><textarea class="wr-rules-in" aria-label="내 글쓰기 원칙" spellcheck="false" placeholder="독자, 목차, 서론, 논증, 인용, 문장 … 다듬을 때마다 지킬 원칙을 적어 두세요"></textarea>
      <div class="wr-rules-acts"><button type="button" class="btn small ghost" data-rules="cancel">그만두기</button><button type="button" class="btn small primary" data-rules="save">저장</button></div></div>`;
    const ta = box.querySelector('.wr-rules-in'); ta.value = t || ''; ta.focus();
    return;
  }
  const n = t ? [...t].length : 0;
  box.innerHTML = `<h2 class="sec-h">내 글쓰기 원칙</h2><div class="wr-rc">
    <p class="wr-rules-st">${t == null ? '불러오는 중…' : t ? `다듬기·간결하게·논리·일관성 점검·영어 초록에 늘 반영합니다 · ${nf(n)}자` : '아직 없습니다. 적어 두면 모든 다듬기에 반영합니다.'}</p>
    ${t ? `<details class="wr-rules-view"><summary>펼쳐 보기</summary><div class="wr-rules-text">${esc(t)}</div></details>` : ''}
    <div class="wr-rules-acts"><button type="button" class="btn small" data-rules="edit"${t == null ? ' disabled' : ''}>${t ? '고치기' : '적기'}</button></div></div>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest && e.target.closest('[data-rules]'); if (!b || !W.root || !W.root.contains(b)) return;
  const k = b.dataset.rules;
  if (k === 'edit') { W.rulesEdit = true; paintRules(); return; }
  if (k === 'cancel') { W.rulesEdit = false; $('.wr-rules').innerHTML = ''; paintRules(); return; }
  if (k === 'save') {
    const v = $('.wr-rules-in').value.trim();
    b.disabled = true;
    try {
      const r = await api.putWritePrinciples(v);
      W.rules = (r && r.text) || ''; W.rulesEdit = false; $('.wr-rules').innerHTML = ''; paintRules();
      W.ctx && W.ctx.toast && W.ctx.toast(v ? '글쓰기 원칙을 저장했습니다' : '글쓰기 원칙을 지웠습니다');
    } catch (err) {
      b.disabled = false;
      W.ctx && W.ctx.toast && W.ctx.toast(err && err.code === 'too_long' ? '원칙이 너무 깁니다(2만 자까지)' : '저장하지 못했습니다. 잠시 뒤에 다시 해 주세요.');
    }
  }
});
