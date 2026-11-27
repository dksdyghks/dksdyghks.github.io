// 헌재 소식 on the 판례 home: the court's 선고 일정 of this month and the next (each 선고일's cases a tap away), its 최근 주요
// 결정 with their 개요 (보도자료), and its 주요 변론 with the 변론 개요 PDF — from the 책장 server's /api/ccourt/* (헌법재판소
// 선고사건·변론사건 정보, 공공데이터포털; the server holds the key and keeps the answers at the edge).
// A decision's line opens the 결정 sheet (data-case-open, as every case line in the app). Each answer is kept on this device
// too: shown at once next time, and when the server or the internet cannot be reached; with nothing kept, one quiet line.
//
//   mount(home)   home: the 판례 first screen (.law-home); the section is put at its top. Safe to call on every render.
import * as api from './api.js?v=c7790c4af0';
import * as store from './store.js?v=c7790c4af0';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WD = '일월화수목금토';
// (the court's calendar is Korea's, wherever the device is)
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const today = () => kstNow().toISOString().slice(0, 10);
const ym = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
const monthFrom = (k) => { const n = kstNow(); return ym(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + k, 1))); };
const isoDate = (iso) => new Date(iso + 'T00:00:00Z');
const dot = (iso) => { const d = isoDate(iso); return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`; };   // as a citation writes it
const short = (iso) => { const d = isoDate(iso); return `${d.getUTCMonth() + 1}. ${d.getUTCDate()}.(${WD[d.getUTCDay()]})`; };
const dayOf = (iso) => { const d = isoDate(iso); return `${d.getUTCDate()}일`; };
const wdOf = (iso) => WD[isoDate(iso).getUTCDay()];
const yearOf = (iso) => Number(String(iso).slice(0, 4));
const withYear = (iso) => (yearOf(iso) === Number(today().slice(0, 4)) ? short(iso) : `${yearOf(iso)}. ${short(iso)}`);

// the court's names as its lists write them: '구 공직선거법제93조 제1항 본문 등위헌제청' → '… 공직선거법 제93조 … 등 위헌제청';
// a 변론's '경찰청장(조지호) 탄핵 (경찰청장에 대한 탄핵심판 사건)' → the name, and what is in brackets after it
// A '·' lost on the way to the court's lists comes as '?' or '？' ('배부 ? 살포', '배부？살포'): between two Hangul words of a
// name a question mark never asks anything, so it is the dot again. In running text (a 개요) only where it cannot end a
// question: right between the letters, or with a space before it ('배부 ?살포') — '…인가? 그렇다' is left alone
const dotName = (s) => String(s || '').replace(/([가-힣])[ \t]*[？?][ \t]*(?=[가-힣])/g, '$1·');
const dotText = (s) => String(s || '').replace(/([가-힣])(?:[？?]|[ \t]+[？?][ \t]*)(?=[가-힣])/g, '$1·');
function mend(s) {
  return dotName(String(s || '')).replace(/\s+/g, ' ').trim()
    .replace(/([^\s(「‘'"])(제\d+조)/g, '$1 $2')
    .replace(/(조|항|호|목|본문|단서|부분|등|조의\d+)(위헌|헌법소원|권한쟁의)/g, '$1 $2')
    .replace(/\s+$/, '');
}
function nameParts(s) {
  const m = /^(.+?\S)\s+\(([^()]+)\)\s*$/.exec(String(s || ''));
  return m ? [mend(m[1]), mend(m[2])] : [mend(s), ''];
}
// 위헌·헌법불합치·한정위헌·인용 are what a reader looks for first
const hot = (r) => /위헌|불합치|인용|파면/.test(r) && !/^합헌$/.test(r);
const resultHtml = (r) => (r ? `<em class="cn-res${hot(r) ? ' cn-hot' : ''}">${esc(r.replace(/\s*,\s*/g, '·'))}</em>` : '');   // ('합헌,각하' → 합헌·각하)

/* ---------- asking the server, and what is kept here ---------- */
const fail = (code, status = 0) => Object.assign(new Error(code), { code, status });
async function fetchJson(op, params) {
  if (typeof api.ccourt === 'function') return api.ccourt(op, params);   // (when api.js has its own call for these)
  const base = api.base();
  if (!base || !api.hasToken()) throw fail('auth', 401);
  const qs = new URLSearchParams(params).toString();
  let r;
  try { r = await fetch(`${base}/api/ccourt/${op}${qs ? '?' + qs : ''}`, { headers: api.authHeader(), cache: 'no-store' }); }
  catch (e) { throw fail(navigator.onLine === false ? 'offline' : 'server'); }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw fail((d && d.error) || 'http_' + r.status, r.status);
  return d;
}
const mem = new Map();   // key → { at, d }
const MIN = 60e3;
// an answer: kept and fresh → at once; else asked, and kept; the server not answering → the kept one, however old (old: true)
async function get(op, params = {}, fresh = 20 * MIN) {
  const key = 'cn:' + op + '?' + new URLSearchParams(params);
  let kept = mem.get(key);
  if (!kept) { try { kept = await store.get('kv', key); } catch (e) { kept = null; } if (kept) mem.set(key, kept); }
  if (kept && Date.now() - kept.at < fresh) return { d: kept.d, at: kept.at };
  try {
    const d = await fetchJson(op, params);
    const v = { at: Date.now(), d };
    mem.set(key, v);
    store.put('kv', key, v).catch(() => {});
    return { d, at: v.at };
  } catch (e) {
    if (kept && e.code !== 'none' && e.status !== 400) return { d: kept.d, at: kept.at, old: true, err: e };
    throw e;
  }
}
// (what was kept here two months ago and not asked since is let go, once a session)
let pruned = false;
async function prune() {
  if (pruned) return; pruned = true;
  try {
    for (const k of await store.keys('kv')) {
      if (typeof k !== 'string' || !k.startsWith('cn:')) continue;
      const v = await store.get('kv', k);
      if (!v || !(Date.now() - v.at < 60 * 24 * 60 * MIN)) store.del('kv', k).catch(() => {});
    }
  } catch (e) { /* kept */ }
}
const whyNot = (e) => (e && e.code === 'offline' ? '인터넷에 연결되면 헌재 소식을 보여 드립니다' : '지금은 헌재 소식을 불러오지 못했습니다');
const keptAt = (at) => { const d = new Date(at + 9 * 3600e3); return `${d.getUTCMonth() + 1}. ${d.getUTCDate()}. ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

/* ---------- the section ---------- */
const TABS = [['sun', '선고 일정'], ['main', '주요 결정'], ['dscs', '변론']];
const TAB_KEY = 'shelf:cn-tab';
const savedTab = () => { try { const t = localStorage.getItem(TAB_KEY); return TABS.some(([k]) => k === t) ? t : 'sun'; } catch (e) { return 'sun'; } };
const saveTab = (t) => { try { localStorage.setItem(TAB_KEY, t); } catch (e) { /* this device keeps nothing */ } };

export function mount(home) {
  if (!home || !home.isConnected) return;
  const old = home.querySelector(':scope > .cn'); if (old) old.remove();
  const sec = document.createElement('section');
  sec.className = 'cn';
  sec.setAttribute('aria-label', '헌재 소식');
  const tab = savedTab();
  sec.innerHTML = `<div class="cn-head"><h2 class="sec-h">헌재 소식</h2><div class="cn-tabs" role="tablist" aria-label="헌재 소식">${TABS.map(([k, t]) => `<button type="button" role="tab" id="cn-t-${k}" data-cn-tab="${k}" aria-controls="cn-panel" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}">${t}</button>`).join('')}</div></div>`
    + `<div class="cn-card" id="cn-panel" role="tabpanel" aria-labelledby="cn-t-${tab}"><p class="cn-wait">불러오는 중…</p></div>`;
  home.prepend(sec);
  const st = { tab, seq: 0, date: null, open: new Set() };
  sec.addEventListener('click', (e) => onClick(sec, st, e));
  sec.addEventListener('keydown', (e) => {
    const t = e.target.closest('[data-cn-tab]'); if (!t || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const all = [...sec.querySelectorAll('[data-cn-tab]')], i = all.indexOf(t);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length;
    all[n].focus(); pick(sec, st, all[n].dataset.cnTab);
  });
  paint(sec, st);
  setTimeout(prune, 4000);
}

function pick(sec, st, tab) {
  if (st.tab === tab) return;
  st.tab = tab; saveTab(tab);
  sec.querySelectorAll('[data-cn-tab]').forEach((b) => { const on = b.dataset.cnTab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  const card = sec.querySelector('.cn-card'); card.setAttribute('aria-labelledby', 'cn-t-' + tab);
  paint(sec, st);
}

async function paint(sec, st) {
  const my = ++st.seq, card = sec.querySelector('.cn-card');
  const live = () => sec.isConnected && st.seq === my;
  if (!card.querySelector('[data-cn-for="' + st.tab + '"]')) card.innerHTML = '<p class="cn-wait">불러오는 중…</p>';
  try {
    const html = st.tab === 'sun' ? await sunView(st) : st.tab === 'main' ? await mainView(st) : await dscsView(st);
    if (!live()) return;
    card.innerHTML = html;
    sec.classList.remove('cn-off');
    card.querySelectorAll('[data-cn-outline][aria-expanded="true"]').forEach(fillOutline);
    card.querySelectorAll('[data-cn-hearing][aria-expanded="true"]').forEach(fillHearing);
    if (st.tab === 'sun') await fillDay(sec, st, live);
  } catch (e) {
    if (!live()) return;
    // nothing to show: one quiet line (and, offline, it tries again by itself once the device is back online)
    // (not offline: a quiet 다시 불러오기 beside it — the court's service is often only slow for a moment)
    card.innerHTML = `<p class="cn-quiet">${esc(whyNot(e))}${e && e.code === 'offline' ? '' : ' · <button type="button" class="law-eg" data-cn-retry>다시 불러오기</button>'}</p>`;
    sec.classList.add('cn-off');
    if (e && e.code === 'offline') addEventListener('online', () => { if (live()) paint(sec, st); }, { once: true });
  }
}
const oldNote = (r) => (r && r.old ? `<p class="cn-old">${r.err && r.err.code === 'offline' ? '인터넷에 연결되지 않아' : '지금은 새 소식을 받지 못해'} ${esc(keptAt(r.at))}에 받은 소식을 보여 드립니다</p>` : '');

/* 선고 일정: this month's and the next month's 선고일 (and the 변론 days beside them); a day's cases under them */
async function sunView(st) {
  const ms = [monthFrom(-1), monthFrom(0), monthFrom(1)];
  const got = await Promise.all(ms.map((m, i) => get('schedule', { year: m.year, month: m.month }).catch((e) => { if (i === 1) throw e; return null; })));
  const slots = got.flatMap((r) => (r && r.d && r.d.sentence) || []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
  const t = today();
  const days = [...new Set(slots.map((x) => x.date))].sort();
  // the day shown: today's 선고; else one of the last seven days (its results); else the next one; else the last one
  const last = days.filter((d) => d < t).pop() || null, week = new Date(Date.parse(t + 'T00:00:00Z') - 7 * 864e5).toISOString().slice(0, 10);
  if (!st.date || !days.includes(st.date)) st.date = days.includes(t) ? t : last && last >= week ? last : days.find((d) => d > t) || last;
  st.slots = slots;
  const rows = [];
  for (const [i, m] of ms.entries()) {
    const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
    if (i === 0 && !(st.date && st.date.startsWith(key))) continue;   // last month: only when its 선고 is the one shown
    const r = got[i], mine = days.filter((d) => d.startsWith(key));
    const disc = r && r.d && Array.isArray(r.d.discuss) ? [...new Set(r.d.discuss.map((x) => x.date))].sort() : [];
    const chips = mine.map((d) => {
      const times = slots.filter((x) => x.date === d).map((x) => x.time).filter(Boolean);
      const when = d === t ? '오늘' : d < t ? '지난' : '';
      return `<button type="button" class="cn-day${d < t ? ' cn-past' : ''}" data-cn-date="${d}" aria-pressed="${d === st.date}"><b>${dayOf(d)} <span>(${wdOf(d)})</span></b><small>${when ? `<i>${when}</i> ` : ''}${esc([...new Set(times)].join(' · '))}</small></button>`;
    }).join('');
    const none = r ? '<span class="cn-none">선고 일정이 아직 없습니다</span>' : '<span class="cn-none">일정을 불러오지 못했습니다</span>';
    rows.push(`<div class="cn-mo"><span class="cn-mk">${m.year !== Number(t.slice(0, 4)) ? m.year + '년 ' : ''}${m.month}월</span><div class="cn-mv"><div class="cn-days">${chips || none}</div>`
      + (disc.length ? `<p class="cn-disc">변론 ${disc.map((d) => esc(dayOf(d))).join(' · ')}</p>` : '') + '</div></div>');
  }
  return `<div data-cn-for="sun"><div class="cn-cal">${rows.join('')}</div><div class="cn-dayp" aria-live="polite"></div>${oldNote(got[1])}</div>`;
}

// one 선고일's cases: each 선고 time of the day, the cases decided together on one line
async function fillDay(sec, st, live) {
  const box = sec.querySelector('.cn-dayp'); if (!box) return;
  const d = st.date;
  sec.querySelectorAll('[data-cn-date]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cnDate === d)));
  if (!d) { box.innerHTML = ''; return; }
  const at = [...new Set(st.slots.filter((x) => x.date === d).map((x) => x.at))].sort();
  box.innerHTML = `<div class="cn-dh"><b>${esc(withYear(d))} 선고</b></div><p class="cn-wait">불러오는 중…</p>`;
  const t = today(), near = d >= t;
  const got = await Promise.all(at.map((a) => get('day', { at: a }, d === t ? 5 * MIN : near ? 20 * MIN : 120 * MIN).then((r) => ({ a, r }), (e) => ({ a, e }))));
  if (!live() || st.date !== d) return;
  const groups = got.map(({ a, r, e }) => ({ a, e, time: `${a.slice(8, 10)}:${a.slice(10, 12)}`, rows: r ? joinMerged(r.d.items || []) : [], old: r && r.old ? r : null }));
  const total = groups.reduce((n, g) => n + g.rows.length, 0), all = groups.every((g) => g.e);
  // (on the day itself the results come in later: said once, not on every line)
  const waiting = d === t && total && groups.every((g) => g.rows.every((x) => !x.res));
  const head = `<div class="cn-dh"><b>${esc(withYear(d))} 선고</b>${d === t ? '<i class="cn-tag">오늘</i>' : ''}${total ? `<span>${total}건</span>` : ''}${waiting ? '<small>결과는 아직 반영되지 않았습니다</small>' : ''}</div>`;
  if (all) { box.innerHTML = head + `<p class="cn-quiet">${esc(whyNot(groups[0].e))}</p>`; return; }
  const SHOW = 4;
  let n = 0;
  const body = groups.map((g) => {
    const folded = n >= SHOW && !st.open.has(d);   // (a time whose every line is folded away: its heading too)
    const sub = groups.length > 1 ? `<p class="cn-th"${folded ? ' hidden' : ''}>${esc(g.time)}${g.rows.length ? ` · ${g.rows.length}건` : ''}</p>` : '';
    if (g.e) return sub + `<p class="cn-quiet">${esc(whyNot(g.e))}</p>`;
    if (!g.rows.length) return sub + `<p class="cn-none">${d > t ? '선고할 사건 목록이 아직 올라오지 않았습니다' : '사건 목록이 없습니다'}</p>`;
    return sub + `<div class="cn-list">${g.rows.map((x) => dayRow(x, d, t, g.a, n++ >= SHOW && !st.open.has(d))).join('')}</div>`;
  }).join('');
  const more = total > SHOW && !st.open.has(d) ? `<button type="button" class="cn-more" data-cn-all="${d}">${total}건 모두 보기</button>` : '';
  box.innerHTML = head + body + more + (groups.find((g) => g.old) ? oldNote(groups.find((g) => g.old).old) : '');
}
// (the cases of one 병합 are one line, whatever order each one's mrgInfo lists them in; each member's court and result kept)
function joinMerged(items) {
  const out = [], seen = new Map();
  for (const x of items) {
    const k = x.merged && x.merged.length > 1 ? [...x.merged].sort().join(',') : x.eventNo;
    let g = seen.get(k);
    if (!g) { g = { ...x, nos: x.merged && x.merged.length > 1 ? x.merged : [x.eventNo], mem: [] }; seen.set(k, g); out.push(g); }
    g.mem.push(x);
  }
  for (const g of out) {
    // a 헌가's court is the one that asked (제청); a 헌바's is the court of the 당해사건, which did not ask
    const ct = (re) => [...new Set(g.mem.filter((x) => x.court && re.test(x.eventNo)).map((x) => x.court))];
    const asked = ct(/헌가/), trial = ct(/헌[^가]/);
    g.who = [asked.length ? asked.join('·') + ' 제청' : '', trial.length ? '당해사건 ' + trial.join('·') : ''].filter(Boolean).join(' · ');
    // (권한쟁의: the two sides as the list names them — a 법무법인 may stand there, so 측, not the party itself)
    const p = g.mem.find((x) => x.party || x.other);
    if (!g.who && p) g.who = [p.party ? '청구인 측 ' + p.party : '', p.other ? '피청구인 측 ' + p.other : ''].filter(Boolean).join(' · ');
    // each member's result, once ('각하' and '합헌' → 각하,합헌); none while any is still 심리중 or empty
    const rs = g.mem.map((x) => String(x.result || '').trim());
    g.res = rs.every((r) => r && r !== '심리중') ? [...new Set(rs.flatMap((r) => r.split(/\s*,\s*/)).filter(Boolean))].join(',') : '';
  }
  return out;
}
function dayRow(x, d, t, at, hidden) {
  const lead = x.nos[0] || x.eventNo, joined = x.nos.length > 1, done = d <= t && x.res;
  const nos = joined ? `${x.nos.join('·')}(병합)` : lead;
  const res = done ? resultHtml(x.res) : '';
  // the sheet is given the 선고일 once the case is decided: its result in, or today past its 선고 time (results come in later);
  // not before, and not for a past day's case still 심리중 (its 선고 put off)
  const decided = done || (d === t && kstNow().toISOString().slice(11, 16).replace(':', '') >= String(at || '').slice(8, 12));
  const hint = ` data-cname="${esc(mend(x.title))}"${decided ? ` data-cdate="${esc(dot(d))}"` : ''}${joined ? ' data-cjoined="true"' : ''}`;
  return `<button type="button" class="cn-row" data-case-open="${esc(lead)}"${hint}${hidden ? ' hidden' : ''}><b>${esc(mend(x.title))}</b><span>${[esc(nos), esc(x.who)].filter(Boolean).join(' · ')}${res ? ' · ' + res : ''}</span></button>`;
}

/* 주요 결정: the court's latest major decisions, by 선고일; each line opens the decision, 개요 its 보도자료 under it */
const MAIN_SHOW = 6;
async function mainView(st) {
  const r = await get('recent', { page: 1 });
  const items = (r.d.items || []).filter((x) => x.eventNo);
  if (!items.length) return `<div data-cn-for="main"><p class="cn-none">최근 주요 결정이 없습니다</p></div>`;
  const show = st.mainShow || MAIN_SHOW;
  let last = '', html = '';
  for (const [i, x] of items.entries()) {
    const hide = i >= show ? ' hidden' : '';
    if (x.date !== last) { last = x.date; html += `<p class="cn-th" data-cn-i="${i}"${hide}>${esc(x.date ? withYear(x.date) + ' 선고' : '선고일 모름')}</p>`; }
    const open = st.open.has('o' + x.seq);
    html += `<div class="cn-item" data-cn-i="${i}"${hide}><button type="button" class="cn-row" data-case-open="${esc(x.eventNo)}" data-cname="${esc(mend(x.title))}"${x.date ? ` data-cdate="${esc(dot(x.date))}"` : ''}><b>${esc(mend(x.title))}</b><span>${esc(x.eventNo)}${x.result ? ' · ' + resultHtml(x.result) : ''}</span></button>`
      + (x.seq ? `<button type="button" class="cn-ol" data-cn-outline="${esc(x.seq)}" aria-expanded="${open}" aria-controls="cn-ol-${esc(x.seq)}">개요</button><div class="cn-olbox" id="cn-ol-${esc(x.seq)}"${open ? '' : ' hidden'}></div>` : '') + '</div>';
  }
  const more = items.length > show ? `<button type="button" class="cn-more" data-cn-more="main">더 보기</button>` : '';
  return `<div data-cn-for="main"><div class="cn-list cn-main">${html}</div>${more}${oldNote(r)}</div>`;
}
// a 개요 as the court wrote it: its first lines (what was decided), the rest (□ 사건개요, □ 심판대상 …) one more tap away
function outlineHtml(o) {
  const ls = dotText(o.text).split('\n').map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^\[\s*\d{2,4}헌[가-힣]{1,2}\d+/.test(l));   // (the '[2022헌가28 사건명]' line: its line says so already)
  if (!ls.length) return '<p class="cn-none">개요가 비어 있습니다</p>';
  const cut = ls.findIndex((l) => /^□/.test(l)), lead = cut < 0 ? ls : ls.slice(0, cut), rest = cut < 0 ? [] : ls.slice(cut);
  const p = (l, i) => (/^□/.test(l) ? `<h4>${esc(l.replace(/^□\s*/, ''))}</h4>` : `<p${i === 0 && lead.length > 1 ? ' class="cn-lead"' : ''}>${esc(l)}</p>`);
  return `<div class="cn-ot">${lead.map(p).join('')}</div>` + (rest.length ? `<details class="cn-ofull"><summary>개요 모두 보기</summary><div class="cn-ot">${rest.map((l) => p(l, 1)).join('')}</div></details>` : '');
}
async function openOutline(btn, st) {
  const seq = btn.dataset.cnOutline, box = btn.parentElement.querySelector('.cn-olbox');
  const on = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(on)); box.hidden = !on;
  if (on) st.open.add('o' + seq); else st.open.delete('o' + seq);
  if (on) fillOutline(btn);
}
// (also for a box drawn open again, the tab chosen once more)
async function fillOutline(btn) {
  const seq = btn.dataset.cnOutline, box = btn.parentElement.querySelector('.cn-olbox');
  if (box.dataset.done) return;
  box.innerHTML = '<p class="cn-wait">불러오는 중…</p>';
  try {
    const r = await get('outline', { seq }, 24 * 60 * MIN);
    box.innerHTML = outlineHtml(r.d); box.dataset.done = '1';
  } catch (e) {
    box.innerHTML = `<p class="cn-quiet">${e && e.code === 'none' ? '개요가 아직 올라오지 않았습니다' : e && e.code === 'offline' ? '인터넷에 연결되면 개요를 볼 수 있습니다' : '지금은 개요를 불러오지 못했습니다'}</p>`;
  }
}

/* 변론: the court's 주요 변론, a case a line with its 변론 days (a coming one marked); tapped, the 변론 개요 PDF */
const DSCS_SHOW = 6;
async function dscsView(st) {
  const r = await get('hearings', { page: 1 });
  const t = today(), by = new Map();
  for (const x of r.d.items || []) {
    if (!x.eventNo) continue;
    const g = by.get(x.eventNo) || { eventNo: x.eventNo, title: x.title, dates: [] };
    if (x.date && !g.dates.includes(x.date)) g.dates.push(x.date);
    by.set(x.eventNo, g);
  }
  const groups = [...by.values()];
  if (!groups.length) return `<div data-cn-for="dscs"><p class="cn-none">주요 변론 일정이 없습니다</p></div>`;
  const show = st.dscsShow || DSCS_SHOW;
  const html = groups.map((g, i) => {
    const [name, sub] = nameParts(g.title), dates = g.dates.sort().reverse(), coming = dates.filter((d) => d >= t);
    const open = st.open.has('h' + g.eventNo);
    const when = dates.slice(0, 3).map((d) => `<span class="cn-nw">${esc(withYear(d))}</span>`).join(' · ') + (dates.length > 3 ? ` 외 ${dates.length - 3}회` : '');
    return `<div class="cn-item" data-cn-i="${i}"${i >= show ? ' hidden' : ''}><button type="button" class="cn-row" data-cn-hearing="${esc(g.eventNo)}" data-cn-past="${coming.length ? '' : '1'}" data-cname="${esc(name)}" aria-expanded="${open}"><b>${esc(name)}${coming.length ? ' <i class="cn-tag">변론 예정</i>' : ''}</b>${sub ? `<span class="cn-sub">${esc(sub)}</span>` : ''}<span>${esc(g.eventNo)} · ${when}</span></button><div class="cn-olbox"${open ? '' : ' hidden'}></div></div>`;
  }).join('');
  const more = groups.length > show ? `<button type="button" class="cn-more" data-cn-more="dscs">더 보기</button>` : '';
  return `<div data-cn-for="dscs"><div class="cn-list cn-main">${html}</div>${more}${oldNote(r)}</div>`;
}
async function openHearing(btn, st) {
  const no = btn.dataset.cnHearing, box = btn.parentElement.querySelector('.cn-olbox');
  const on = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(on)); box.hidden = !on;
  if (on) st.open.add('h' + no); else st.open.delete('h' + no);
  if (on) fillHearing(btn);
}
async function fillHearing(btn) {
  const no = btn.dataset.cnHearing, box = btn.parentElement.querySelector('.cn-olbox');
  if (box.dataset.done) return;
  box.innerHTML = '<p class="cn-wait">불러오는 중…</p>';
  // (a case whose every 변론 is past may be decided: its decision one tap away)
  const goCase = btn.dataset.cnPast ? `<button type="button" class="cn-go" data-case-open="${esc(no)}" data-cname="${esc(btn.dataset.cname || '')}">결정 보기 ›</button>` : '';
  try {
    const r = await get('hearing', { eventNo: no }, 6 * 60 * MIN);
    const items = r.d.items || [];
    const files = [], seen = new Set();
    for (const x of items) for (const f of x.files || []) if (f.url && !seen.has(f.url)) { seen.add(f.url); files.push(f); }
    const texts = items.filter((x) => x.text).map((x) => `${x.date ? `<h4>${esc(withYear(x.date))} 변론</h4>` : ''}${dotText(x.text).split('\n').filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join('')}`).join('');
    const links = files.map((f) => `<a class="cn-file" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(/개요/.test(f.name) ? '변론 개요' : f.name.replace(/\.pdf$/i, '') || '변론 자료')} <small>PDF</small></a>`).join('');
    box.innerHTML = (links ? `<div class="cn-files">${links}</div>` : '') + (texts ? `<div class="cn-ot">${texts}</div>` : '')
      + (!links && !texts ? '<p class="cn-none">변론 개요가 아직 올라오지 않았습니다</p>' : '') + goCase;
    box.dataset.done = '1';
  } catch (e) {
    box.innerHTML = `<p class="cn-quiet">${e && e.code === 'offline' ? '인터넷에 연결되면 변론 개요를 볼 수 있습니다' : '지금은 변론 개요를 불러오지 못했습니다'}</p>` + goCase;
  }
}

function onClick(sec, st, e) {
  const t = e.target;
  const tb = t.closest('[data-cn-tab]'); if (tb) { pick(sec, st, tb.dataset.cnTab); return; }
  if (t.closest('[data-cn-retry]')) { const c = sec.querySelector('.cn-card'); if (c) c.innerHTML = '<p class="cn-quiet cn-wait">불러오는 중…</p>'; paint(sec, st); return; }
  const dy = t.closest('[data-cn-date]'); if (dy) { if (st.date !== dy.dataset.cnDate) { st.date = dy.dataset.cnDate; fillDay(sec, st, () => sec.isConnected && st.tab === 'sun'); } return; }
  const all = t.closest('[data-cn-all]');
  if (all) { st.open.add(all.dataset.cnAll); sec.querySelectorAll('.cn-dayp [hidden]').forEach((x) => { x.hidden = false; }); all.remove(); return; }
  const mo = t.closest('[data-cn-more]');
  if (mo) {
    const k = mo.dataset.cnMore === 'main' ? 'mainShow' : 'dscsShow', n = (st[k] || (k === 'mainShow' ? MAIN_SHOW : DSCS_SHOW)) + 10;
    st[k] = n;
    const list = sec.querySelector('.cn-card');
    list.querySelectorAll('[data-cn-i]').forEach((x) => { if (Number(x.dataset.cnI) < n) x.hidden = false; });
    if (!list.querySelector('[data-cn-i][hidden]')) mo.remove();
    return;
  }
  const ol = t.closest('[data-cn-outline]'); if (ol) { openOutline(ol, st); return; }
  const hr = t.closest('[data-cn-hearing]'); if (hr) { openHearing(hr, st); return; }
  // (data-case-open: the app's own handler opens the 결정 sheet)
}
