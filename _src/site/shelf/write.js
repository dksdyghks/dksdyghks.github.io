// 글쓰기 도우미 — the owner's own academic Korean, made better by Claude without losing the owner's voice.
// The text goes to the shelf's server, which holds the owner's Anthropic key and asks Claude (Fable first; Opus when Fable
// declines or cannot be had); the answer comes back as it is written (server-sent events). Five things to ask: 내 문체로
// 다듬기 · 간결하게 · 맞춤법·문법 (the three rewrites: what changed is marked word by word, as tracked changes are) ·
// 논리 점검 (opinions only, the text untouched) · 영어 초록으로.
// 내 문체 익히기 picks paragraphs from the owner's own papers on the shelf (introductions, arguments, conclusions — never a
// note, a table or a reference) and has Claude describe the style once; the server keeps the description, shows it here
// to be read, and sets it before every request.
// Kept on this device only: the draft, as typed, and the last 20 answers.
import * as api from './api.js';
import * as store from './store.js';
import { ME } from './research.js';
import { cleanCopy } from './analyze.js';

const ACTS = {
  polish: { label: '내 문체로 다듬기', rewrite: true },
  concise: { label: '간결하게', rewrite: true },
  proof: { label: '맞춤법·문법', rewrite: true },
  logic: { label: '논리 점검', sub: '의견만', rewrite: false },
  english: { label: '영어 초록으로', rewrite: false },
};
const KEEP = 20;          // answers kept on this device
const MAX = 12000;        // letters a text may have (the server says so too: info.max)

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (n) => Number(n || 0).toLocaleString('ko-KR');
// what the server counts: one per character (a Hangul syllable is one), whatever its bytes
export const letters = (s) => { let n = 0; for (const c of String(s || '')) n++; return n; };
const stem = (name) => String(name || '').replace(/\.pdf$/i, '');

const W = {
  ctx: null, root: null,
  info: null, infoErr: '',   // the server's word: key set?, models, limits, today's count, the style's date
  draft: null, hist: null,   // (null until read from this device)
  cur: null,                 // the answer on screen: { act, input, out, state: wait|writing|done|stopped|error, model, … }
  run: null,                 // the request under way: { ctrl, cur }
  style: null,               // the style as learned: { text, at, papers, paragraphs, chars, model }
  styleOpen: false, learn: null, diffOn: true,
};
const maxLetters = () => (W.info && W.info.max) || MAX;
const ready = () => !!(W.info && W.info.key) && !W.run;

/* ---------------- the screen ---------------- */
// ctx (from app.js): files() — the shelf's live papers; textOf(f) — a paper's page texts; toast(msg, ms, action)
export function show(c, ctx) {
  W.ctx = ctx;
  if (W.root && W.root.isConnected && c.contains(W.root)) return;   // drawn already: a redraw of the app leaves it as it is
  c.innerHTML = `<div class="wr">
    <div class="wr-edit"><textarea class="wr-in" placeholder="다듬을 글을 붙여 넣거나 여기에 쓰세요" aria-label="다듬을 글" spellcheck="false"></textarea>
      <div class="wr-foot"><span class="wr-n" aria-live="polite"></span><span class="sp"></span><button type="button" class="wr-clear">지우기</button></div></div>
    <p class="wr-privacy">글은 Anthropic(Claude)으로 보내 처리합니다. API로 보낸 글은 학습에 쓰이지 않지만(기본 설정), Fable 모델의 조건에 따라 Anthropic이 30일 동안 보관한 뒤 지웁니다.</p>
    <div class="wr-acts" role="group" aria-label="할 일">${Object.entries(ACTS).map(([k, a]) => `<button type="button" class="btn wr-a${k === 'polish' ? ' primary' : ''}" data-act="${k}">${esc(a.label)}${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</button>`).join('')}</div>
    <p class="wr-status" aria-live="polite"></p>
    <section class="wr-res" hidden></section>
    <section class="wr-sty"></section>
    <section class="wr-hist" hidden></section>
  </div>`;
  W.root = c.querySelector('.wr');
  hook();
  wire();
  const ta = $('.wr-in');
  if (W.draft != null) ta.value = W.draft;
  paintCount(); paintActs(); paintRes(); paintSty(); paintHist();
  load();
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
    const ta = $('.wr-in'); if (ta && !ta.value) { ta.value = W.draft; paintCount(); }
  }
  if (W.hist == null) { W.hist = (await store.get('kv', 'write:history').catch(() => null)) || []; paintHist(); }
  if (!W.style) { W.style = (await store.get('kv', 'write:style').catch(() => null)) || null; paintSty(); }
  // an answer asked for before the page went away (reloaded, closed, the phone locked): the server kept it
  const p = await store.get('kv', 'write:pending').catch(() => null);
  if (p && p.id && ACTS[p.act] && !W.run && !W.cur && Date.now() - p.at < 6 * 3600e3) {
    W.cur = { id: p.id, at: p.at, act: p.act, input: p.input, out: '', state: 'wait', t0: p.at };
    resume(W.cur);
  } else if (p && !W.run && !W.cur) store.del('kv', 'write:pending').catch(() => {});
  await refreshInfo();
}
let resetT = null;
async function refreshInfo() {
  try { W.info = await api.writeInfo(); W.infoErr = ''; }
  catch (e) { W.infoErr = api.isOffline(e) ? 'offline' : 'server'; }
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
// midnight, may have changed it) and an answer whose connection was lost fetched from the server
let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  addEventListener('pagehide', flushDraft);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushDraft(); return; }
    if (!live() || W.run) return;
    refreshInfo();
    if (W.cur && W.cur.resumable) resume(W.cur);
  });
}
function wire() {
  const ta = $('.wr-in');
  ta.addEventListener('input', () => {
    W.draft = ta.value; paintCount(); paintActs(); paintUse();
    clearTimeout(saveT); saveT = setTimeout(saveDraft, 400);
  });
  $('.wr-clear').onclick = () => {
    if (!ta.value) return;
    const prev = ta.value;
    setDraft('');
    W.ctx.toast('지웠습니다', 6000, { label: '되돌리기', fn: () => setDraft(prev) });
  };
  $('.wr-acts').onclick = (e) => { const b = e.target.closest('[data-act]'); if (b) ask(b.dataset.act); };
  W.root.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('.wr-stop')) { stopRun(); return; }
    if (t.closest('.wr-copy')) { copy(W.cur && W.cur.out); return; }
    if (t.closest('.wr-use')) { useIt(); return; }
    if (t.closest('.wr-tog input')) { W.diffOn = t.checked; paintRes(); return; }
    const h = t.closest('[data-h]'); if (h) { openHist(h.dataset.h); return; }
    const s = t.closest('[data-s]'); if (s) { styleAct(s.dataset.s); return; }
  });
}
function setDraft(v) {
  const ta = $('.wr-in'); if (ta) ta.value = v;
  W.draft = v; paintCount(); paintActs(); paintUse();
  clearTimeout(saveT); saveDraft();
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
  n.textContent = k > max ? `${nf(k)} / ${nf(max)}자 · ${nf(max)}자까지 보낼 수 있습니다. 나눠서 보내 주세요.` : `${nf(k)} / ${nf(max)}자`;
  n.classList.toggle('over', k > max);
}
// the five buttons, and the line under them: today's count, or why nothing can be asked now
function paintActs() {
  if (!live()) return;
  const ta = $('.wr-in'), k = letters(ta.value.trim());
  const can = ready() && k > 0 && k <= maxLetters();
  W.root.querySelectorAll('.wr-a').forEach((b) => { b.disabled = !can; });
  const st = $('.wr-status');
  st.classList.remove('warn');
  if (W.info && !W.info.key) { st.classList.add('warn'); st.textContent = '글쓰기 도우미를 쓰려면 서버에 본인의 Claude(Anthropic) API 키를 넣어 두어야 합니다.'; return; }
  if (!W.info) { st.textContent = W.infoErr === 'offline' ? '인터넷에 연결되면 쓸 수 있습니다.' : W.infoErr ? '책장 서버에 연결하지 못했습니다. 잠시 뒤에 다시 열어 주세요.' : ''; return; }
  if (dayFull(W.info)) { st.classList.add('warn'); st.textContent = W.info.used >= W.info.cap ? capText(W.info) : budgetText(W.info); W.root.querySelectorAll('.wr-a').forEach((b) => { b.disabled = true; }); return; }
  const spend = W.info.budget ? ` · 약 ${usd(W.info.spent)} / ${usd(W.info.budget)}` : '';
  st.textContent = `오늘 ${nf(W.info.used)} / ${nf(W.info.cap)}회${spend} · ${(W.info.models && W.info.models[0] && W.info.models[0].name) || 'Claude'}`;
}
// the day used up: its requests (info.cap) or its budget in dollars (info.budget, what the answers cost as estimated)
const dayFull = (i) => !!(i && (i.used >= i.cap || (i.budget && i.spent >= i.budget)));
const usd = (n) => '$' + (Number(n) || 0).toFixed(Number(n) >= 100 ? 0 : 2).replace(/\.00$/, '');
const capText = (e) => `오늘 쓸 수 있는 ${nf(e.cap || 150)}회를 다 썼습니다. 내일 0시(한국 시간)에 다시 열립니다.`;
const budgetText = (e) => `오늘 쓸 수 있는 비용(약 ${usd(e.budget || 40)})을 다 썼습니다. 내일 0시(한국 시간)에 다시 열립니다.`;

/* ---------------- asking ---------------- */
function ask(k) {
  if (!ACTS[k] || W.run) return;
  const text = $('.wr-in').value.trim();
  if (!text) { W.ctx.toast('먼저 글을 넣어 주세요'); $('.wr-in').focus(); return; }
  if (letters(text) > maxLetters()) { paintCount(); return; }
  const cur = { id: newId(), at: Date.now(), act: k, input: text, out: '', state: 'wait', t0: Date.now() };
  W.cur = cur;
  paintRes();
  const box = $('.wr-res'); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // kept until the answer is in: if the page goes away meanwhile, it is fetched from the server when the page is back
  store.put('kv', 'write:pending', { id: cur.id, at: cur.at, act: k, input: text }).catch(() => {});
  go({ action: k, text, id: cur.id }, cur, paintRes).then(() => settled(cur));
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
    cur.out = ''; cur.state = 'wait'; cur.model = d.to; cur.fell = d.why;
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
    if (d.code === 'refused') cur.out = '';   // a refused answer is not to be used, not even the part of it already shown
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
    paintActs(); paint();
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
    paintActs(); paint();
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
  billing: () => 'Anthropic 계정의 결제나 한도 문제로 처리하지 못했습니다.',
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
const needs = (html) => html.replace(/\[근거 필요[^\]<]*\]/g, (m) => `<mark class="wr-need">${m}</mark>`);
function paintRes(textOnly) {
  if (!live()) return;
  const box = $('.wr-res'), c = W.cur;
  box.hidden = !c;
  if (!c) return;
  const a = ACTS[c.act] || { label: '' };
  const running = W.run && W.run.cur === c;
  const out = box.querySelector('.wr-out');
  if (textOnly === true && out && c.state === 'writing' && out.dataset.mode === 'text') {   // the text growing: only it is redrawn
    out.textContent = c.out;
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
  box.innerHTML = `<div class="wr-card">
    <div class="wr-rh"><b>${esc(a.label)}</b>${c.model ? `<span class="wr-tag">${esc(c.model.name || c.model.id || '')}</span>` : ''}<span class="wr-st">${esc(stateText(c))}</span><span class="sp"></span>${running ? '<button type="button" class="btn small ghost wr-stop">멈추기</button>' : ''}</div>
    ${msg}
    ${showOut ? `<div class="wr-out" data-mode="${diff ? 'diff' : 'text'}" lang="${c.act === 'english' ? 'en' : 'ko'}">${body}</div>` : c.state === 'wait' ? body : ''}
    ${c.state === 'done' && c.out ? `<div class="wr-rf">${a.rewrite && !c.cut ? `<label class="wr-tog"><input type="checkbox"${W.diffOn ? ' checked' : ''}><span>바뀐 곳 표시</span></label>${diff ? `<span class="wr-cnt">${changes ? `${nf(changes)}곳` : '바뀐 곳 없음'}</span>` : ''}` : ''}<span class="sp"></span><button type="button" class="btn small wr-copy">${c.cut ? '받은 데까지 복사' : '복사'}</button>${a.rewrite && !c.cut ? '<button type="button" class="btn small primary wr-use">이대로 바꾸기</button>' : ''}</div>${a.rewrite && !c.cut ? '<p class="wr-why" hidden>위 글상자의 글이 이 결과를 받을 때의 글과 달라, 바꾸지 않습니다. 필요하면 복사해서 붙여 주세요.</p>' : ''}` : ''}
  </div>`;
  paintUse();
}
// 이대로 바꾸기 only while the box holds the very text this answer was made from: not after it was edited meanwhile (the
// owner may type on while Claude thinks), and not for an older answer about another text
const sameInput = (c) => { const ta = $('.wr-in'); return !!(ta && c && ta.value.trim() === c.input); };
function paintUse() {
  const b = $('.wr-use'); if (!b) return;
  const same = sameInput(W.cur), why = $('.wr-why');
  b.disabled = !same;
  if (why) why.hidden = same;
}
async function copy(t) {
  if (!t) return;
  try { await navigator.clipboard.writeText(t); W.ctx.toast('복사했습니다'); } catch (e) { W.ctx.toast('복사하지 못했습니다'); }
}
function useIt() {
  const c = W.cur; if (!c || !c.out || c.cut || !ACTS[c.act] || !ACTS[c.act].rewrite) return;
  if (!sameInput(c)) { paintUse(); W.ctx.toast('글상자의 글이 달라져 바꾸지 않았습니다. 복사해서 붙여 주세요.'); return; }
  const ta = $('.wr-in'), prev = ta.value;
  setDraft(c.out);
  ta.scrollTop = 0;
  W.ctx.toast('글을 바꿨습니다', 6000, { label: '되돌리기', fn: () => setDraft(prev) });
}

/* ---------------- the last answers, on this device ---------------- */
function remember(c) {
  if (c.cut) return;   // (a part of an answer is not an answer to come back to)
  const keep = { id: c.id, at: c.at, act: c.act, input: c.input, out: c.out, model: c.model, stop: c.stop, usage: c.usage, note: c.note || '' };
  W.hist = [keep, ...(W.hist || []).filter((h) => h.id !== c.id)].slice(0, KEEP);
  store.put('kv', 'write:history', W.hist).catch(() => {});
  paintHist();
}
function paintHist() {
  if (!live()) return;
  const box = $('.wr-hist'), list = W.hist || [];
  box.hidden = !list.length;
  if (!list.length) return;
  const when = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  box.innerHTML = `<h2 class="sec-h">지난 결과<span class="sec-n">최근 ${nf(KEEP)}개까지 이 기기에</span></h2><div class="wr-hl">${list.map((h) => `<button type="button" data-h="${esc(h.id)}"><b>${esc((ACTS[h.act] || {}).label || '')}<span>${esc(when(h.at))}${h.model ? ' · ' + esc(h.model.name || '') : ''}</span></b><em>${esc(h.input.replace(/\s+/g, ' ').slice(0, 90))}</em></button>`).join('')}</div>`;
}
function openHist(id) {
  if (W.run) return;
  const h = (W.hist || []).find((x) => x.id === id); if (!h) return;
  W.cur = { ...h, state: 'done', hist: true, t0: h.at, t1: h.at };
  paintRes();
  const box = $('.wr-res'); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- 내 문체 ---------------- */
// the owner's own papers on the shelf: those filed as '<owner>_…' (by the owner alone; written with others only when
// there are too few of those), whose page texts the server has
function ownPapers() {
  const files = (W.ctx.files() || []).filter((f) => f && f.text);
  const by = (f) => stem(f.name).split('_')[0];
  const alone = files.filter((f) => by(f) === ME);
  const withOthers = files.filter((f) => by(f) !== ME && by(f).split(/[·,ㆍ]/).map((s) => s.trim()).includes(ME));
  return (alone.length >= 3 ? alone : [...alone, ...withOthers]).map((f) => ({ f, title: stem(f.name).slice(stem(f.name).indexOf('_') + 1) }));
}
async function styleAct(k) {
  if (k === 'open') { W.styleOpen = !W.styleOpen; paintSty(); return; }
  if (k === 'cancel') { W.learn = null; paintSty(); return; }
  if (k === 'stop') { stopRun(); return; }
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
function paintSty(textOnly) {
  if (!live()) return;
  const box = $('.wr-sty'), L = W.learn, s = W.style;
  if (textOnly === true && L && L.cur && L.cur.state === 'writing') { const o = box.querySelector('.wr-prof'); if (o) { o.textContent = L.cur.out; paintTime(L.cur); return; } }
  const date = (t) => new Date(t).toLocaleDateString('ko-KR');
  const meta = s ? `<span class="wr-sm">${esc(date(s.at))} · 논문 ${nf(s.papers)}편 · 문단 ${nf(s.paragraphs)}개</span>` : '';
  const can = !!(W.info && W.info.key && !dayFull(W.info));
  let card;
  if (L && L.phase === 'reading') card = `<p class="wr-p">내 논문을 읽는 중입니다 · ${nf(L.done)} / ${nf(L.total)}편</p>`;
  else if (L && L.phase === 'none') card = `<p class="wr-p">서재에서 ‘${esc(ME)}_’로 시작하는 내 논문을 찾지 못했습니다. 내 논문을 올리면 그 글에서 문체를 익힙니다.</p><div class="wr-sa"><button type="button" class="btn small ghost" data-s="cancel">닫기</button></div>`;
  else if (L && L.phase === 'few') card = `<p class="wr-p">내 논문 ${nf(L.papers)}편에서 쓸 만한 문단을 ${nf(L.n)}개밖에 찾지 못했습니다(5개 이상 필요). 본문 글자를 읽을 수 있는 내 논문이 더 있어야 합니다.</p><div class="wr-sa"><button type="button" class="btn small ghost" data-s="cancel">닫기</button></div>`;
  else if (L && L.phase === 'picked') {
    const p = L.pick, parts = { 서론: 0, 본론: 0, 결론: 0 };
    p.list.forEach((x) => { parts[x.part]++; });
    card = `<p class="wr-p">내 논문 ${nf(p.papers)}편에서 문단 ${nf(p.list.length)}개(${nf(p.chars)}자)를 골랐습니다 · 서론 ${parts.서론} · 본론 ${parts.본론} · 결론 ${parts.결론}. 각주, 표, 참고문헌은 뺐습니다. 이 문단들을 Claude에게 보내 문체를 정리하게 합니다(1~2분).</p>
      <details class="wr-picked"><summary>고른 문단 보기</summary>${p.list.map((x) => `<p><span>${esc(x.title)} · ${esc(x.part)}</span>${esc(x.text)}</p>`).join('')}</details>
      <div class="wr-sa"><button type="button" class="btn small ghost" data-s="cancel">취소</button><button type="button" class="btn small primary" data-s="go"${can && !W.run ? '' : ' disabled'}>이대로 익히기</button></div>`;
  } else if (L && L.phase === 'writing') {
    const c = L.cur, running = W.run && W.run.cur === c;
    const msg = c.state === 'error' ? `<p class="wr-msg err">${esc(errText(c))}</p>` : c.state === 'stopped' ? '<p class="wr-msg">멈췄습니다. 익힌 문체는 저장하지 않았습니다.</p>' : c.note ? `<p class="wr-msg">${esc(c.note)}</p>` : '';
    card = `<div class="wr-rh"><b>문체를 정리하는 중</b>${c.model ? `<span class="wr-tag">${esc(c.model.name || '')}</span>` : ''}<span class="wr-st">${esc(stateText(c))}</span><span class="sp"></span>${running ? '<button type="button" class="btn small ghost" data-s="stop">멈추기</button>' : ''}</div>${msg}
      ${c.out ? `<div class="wr-prof">${esc(c.out)}</div>` : c.state === 'wait' ? '<div class="wr-think" role="status"><i></i><i></i><i></i><span>고른 문단을 읽는 중입니다</span></div>' : ''}
      ${running ? '' : `<div class="wr-sa"><button type="button" class="btn small ghost" data-s="cancel">닫기</button><button type="button" class="btn small" data-s="again"${can ? '' : ' disabled'}>다시</button></div>`}`;
  } else if (s) {
    card = `<div class="wr-prof${W.styleOpen ? '' : ' clip'}">${esc(s.text || '')}</div>
      <div class="wr-sa"><button type="button" class="btn small ghost" data-s="open">${W.styleOpen ? '접기' : '펼쳐 읽기'}</button><span class="sp"></span><button type="button" class="btn small" data-s="learn"${can && !W.run ? '' : ' disabled'}>다시 익히기</button></div>`;
  } else {
    card = `<p class="wr-p">아직 내 문체를 익히지 않았습니다. 서재에 있는 내 논문(‘${esc(ME)}_’로 시작하는 파일)의 서론·본론·결론에서 문단을 골라, Claude가 문장 길이, 종결 표현, 접속어, 주장의 수위, 판례·조문 인용 방식, 즐겨 쓰는 용어를 정리합니다. 한 번 익혀 두면 모든 요청에 쓰입니다.</p>
      <div class="wr-sa"><button type="button" class="btn small primary" data-s="learn"${can && !W.run ? '' : ' disabled'}>내 문체 익히기</button></div>`;
  }
  box.innerHTML = `<div class="list-h"><h2 class="sec-h">내 문체</h2>${meta}</div><div class="wr-card wr-sc">${card}</div>`;
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
