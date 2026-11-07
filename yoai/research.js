/* YO아이 — 연구의 뼈대: 연구 질문과 그 변천, 논증 설계도와 점검, 개념, 선행연구 지도와 차별성, 서재 인용망, 심사 대응, 내 연구. */
import { S, DB, ACT, ON_INPUT, ON_CHANGE, UI, $, $$, esc, uid, toast, kdate, kdt, saveProject, saveRead, docOf, docPages, footnote, pageLabel, modal, closeModals, confirmBox, formBox, copyText, download, safeName, libLoad, logEvent } from './core.js?v=5da61c4e8c';
import { citationsIn, titleKey, styleMetrics, bodyOfPages } from './lawtext.js?v=5da61c4e8c';
import { BASE, PORTRAIT, excluded } from './profile.js?v=5da61c4e8c';
import { buildHwpx, HWPX_MIME } from './hwpx.js?v=5da61c4e8c';

export const STAGES = [['idea', '구상'], ['reading', '선행연구'], ['design', '논증 설계'], ['writing', '집필'], ['submitted', '투고'], ['review', '심사·수정'], ['published', '게재']];
export const stageName = (k) => (STAGES.find((x) => x[0] === k) || STAGES[0])[1];
export function ensureProject(p) {
  for (const [k, v] of Object.entries({ stage: 'idea', venue: '', deadline: '', question: '', answer: '', qlog: [], gap: '', gapDocs: [], arg: [], terms: [], reviews: [], log: [], outline: [], checks: [] })) if (p[k] === undefined) p[k] = Array.isArray(v) ? [] : v;
  return p;
}
export const projReads = (p) => S.reads.filter((r) => r.projectId === (p && p.id));
export const projCards = (p) => S.cards.filter((c) => c.projectId === (p && p.id)).sort((a, b) => (a.order || 0) - (b.order || 0));
const RELS = [['', '미정'], ['agree', '동의'], ['oppose', '반박'], ['supplement', '보완'], ['none', '다른 쟁점']];
const relName = (k) => (RELS.find((x) => x[0] === (k || '')) || RELS[0])[1];

/* ================= 읽기 카드: 문헌 한 편을 비판적으로 읽은 기록 ================= */
const RC_FIELDS = [['q', '이 글의 질문', '저자가 풀려는 문제는 무엇인가'], ['claim', '주장', '결론으로 내세우는 것'], ['ground', '근거', '주장을 받치는 논거·판례·자료'], ['method', '방법', '해석론, 비교법(어느 나라), 판례 분석, 입법론, 실증 …'], ['limit', '한계', '다루지 않은 것, 약한 고리, 내가 파고들 틈'], ['note', '내 연구와의 관계', '어디서 쓰고, 어디서 넘어설 것인가']];
export function readFor(docId, p = S.project) { return S.reads.find((r) => r.projectId === (p && p.id) && r.docId === docId) || null; }
export async function openReadCard(docId) {
  const p = S.project, d = docOf(docId); if (!p || !d) return;
  let r = readFor(docId);
  const fresh = !r;
  if (!r) r = { id: uid(), projectId: p.id, docId, rel: '', createdAt: Date.now() };
  const pg = await docPages(docId), f = (pg && pg.facts) || {};
  const m = modal(`<h2>읽기 카드</h2><p class="sub">「${esc(d.title)}」 · ‘${esc(p.title)}’ 연구</p>
    ${f.abstract ? `<details class="peek"><summary>이 문헌의 초록 보기</summary><p>${esc(f.abstract.text)}</p></details>` : ''}
    ${f.conclusion ? `<details class="peek"><summary>결론 첫머리 보기 (${esc(f.conclusion.head)})</summary><p>${esc(f.conclusion.text)}</p></details>` : ''}
    ${RC_FIELDS.map(([k, l, ph]) => `<label class="field"><span>${l}</span><textarea data-rc="${k}" rows="2" placeholder="${esc(ph)}">${esc(r[k] || '')}</textarea></label>`).join('')}
    <label class="field"><span>내 연구와의 입장</span><select data-rc="rel">${RELS.map(([v, l]) => `<option value="${v}"${(r.rel || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="modal-foot">${fresh ? '' : '<button class="btn danger" id="rc-del">카드 지우기</button>'}<button class="btn" data-close>닫기</button><button class="btn primary" id="rc-save">저장</button></div>`);
  $('#rc-save', m.el).addEventListener('click', async () => {
    $$('[data-rc]', m.el).forEach((x) => { r[x.dataset.rc] = x.value; });
    if (fresh) { S.reads.push(r); logEvent(p, `읽기 카드: 「${d.title}」`); saveProject(p); }
    await saveRead(r); m.close(); toast('읽기 카드를 저장했습니다.'); UI.side(); if (S.view === 'lit') viewLit(); else if (UI.refresh) UI.refresh();
  });
  const del = $('#rc-del', m.el);
  if (del) del.addEventListener('click', async () => { if (!(await confirmBox('이 읽기 카드를 지울까요?', '지우기'))) return; S.reads = S.reads.filter((x) => x.id !== r.id); await DB.del('reads', r.id); m.close(); if (S.view === 'lit') viewLit(); else if (UI.refresh) UI.refresh(); });
}

/* ================= 논증 설계도 ================= */
const KIND = { claim: '핵심 주장', sub: '소주장', ground: '근거', counter: '예상 반론', rebut: '재반론' };
const KIDS = { claim: ['sub', 'ground', 'counter'], sub: ['ground', 'counter'], ground: [], counter: ['rebut'], rebut: ['ground'] };
const kidsOf = (p, id) => p.arg.filter((n) => n.parent === id).sort((a, b) => (a.order || 0) - (b.order || 0));
const descendants = (p, id) => { const out = []; const walk = (x) => kidsOf(p, x).forEach((k) => { out.push(k); walk(k.id); }); walk(id); return out; };
export function argIssues(p) {
  const out = []; if (!p) return out;
  const add = (level, msg, node, go) => out.push({ level, msg, node, go });
  if (!String(p.question || '').trim()) add('bad', '연구 질문이 비어 있습니다. 이 논문이 답하려는 물음을 한 문장으로 적으세요.', null, 'question');
  if (!String(p.answer || '').trim()) add('warn', '연구 질문에 대한 답(결론 한 문장)을 아직 적지 않았습니다. 서론의 질문과 결론의 답이 맞물려야 합니다.', null, 'answer');
  const claims = p.arg.filter((n) => n.kind === 'claim');
  if (!claims.length) add('warn', '핵심 주장이 아직 없습니다.');
  for (const c of claims) {
    const all = descendants(p, c.id), name = `‘${(c.text || '이름 없는 주장').slice(0, 26)}${(c.text || '').length > 26 ? '…' : ''}’`;
    const grounds = all.filter((n) => n.kind === 'ground'), counters = all.filter((n) => n.kind === 'counter');
    if (!grounds.length) add('bad', `${name}: 근거가 없습니다.`, c.id);
    if (!counters.length) add('warn', `${name}: 예상 반론을 검토하지 않았습니다. 이 주장에 대한 가장 강한 반대는 무엇입니까?`, c.id);
    for (const k of counters) if (!kidsOf(p, k.id).some((x) => x.kind === 'rebut')) add('warn', `${name}: 반론 ‘${(k.text || '').slice(0, 20)}…’에 답하지 않았습니다(재반론 없음).`, k.id);
    const docs = new Set(grounds.flatMap((g) => (g.refs || []).map((r) => (r.t === 'card' ? (S.cards.find((x) => x.id === r.id) || {}).docId : r.t === 'doc' ? r.id : `${r.t}:${r.key}`)).filter(Boolean)));
    if (grounds.length >= 2 && docs.size === 1) add('warn', `${name}: 근거가 모두 한 문헌에서 나옵니다. 다른 문헌·판례·조문으로 받치세요.`, c.id);
    const bare = grounds.filter((g) => !(g.refs || []).length);
    if (bare.length) add('info', `${name}: 자료가 연결되지 않은 근거가 ${bare.length}개 있습니다.`, bare[0].id);
  }
  if (!String(p.gap || '').trim()) add('warn', '선행연구와의 차별성을 아직 적지 않았습니다.', null, 'gap');
  else if (!(p.gapDocs || []).length) add('warn', '차별성 문장에 근거가 되는 선행연구를 연결하지 않았습니다.', null, 'gapdocs');
  const reads = projReads(p);
  if (reads.length < 5) add('info', `선행연구 읽기 카드가 ${reads.length}편입니다.`, null, 'reads');
  else if (!reads.some((r) => r.rel === 'oppose')) add('info', '반대 입장의 선행연구 읽기 카드가 없습니다. 반론 검토와 차별성을 위해 찾아 읽어 보세요.', null, 'reads');
  return out;
}
function nodeHTML(p, n, depth) {
  const refs = (n.refs || []).map((r, i) => {
    let label = '';
    if (r.t === 'card') { const c = S.cards.find((x) => x.id === r.id); const d = c && c.docId ? docOf(c.docId) : null; label = c ? (c.quote ? `“${c.quote.slice(0, 30)}${c.quote.length > 30 ? '…' : ''}”` : (c.memo || '메모').slice(0, 30)) + (d ? ` · ${d.author || d.title.slice(0, 12)} ${pageLabel(d, c.page)}` : '') : '(지운 카드)'; }
    else if (r.t === 'doc') { const d = docOf(r.id); label = d ? `${d.author || d.title.slice(0, 14)} ${r.page ? pageLabel(d, r.page) : ''}` : '(지운 문헌)'; }
    else label = r.t === 'case' ? `판례 ${r.key}` : r.t === 'law' ? r.key : r.key;
    return `<span class="ref"><span>${esc(label)}</span><button data-act="ref-del" data-node="${n.id}" data-i="${i}" aria-label="연결 지우기" title="연결 지우기">×</button></span>`;
  }).join('');
  const kids = kidsOf(p, n.id).map((k) => nodeHTML(p, k, depth + 1)).join('');
  return `<div class="node k-${n.kind}" data-node="${n.id}">
    <div class="node-h"><span class="nk">${KIND[n.kind]}</span><span class="node-tools">${KIDS[n.kind].map((k) => `<button data-act="node-add" data-kind="${k}" data-parent="${n.id}">+ ${KIND[k]}</button>`).join('')}<button data-act="node-up" aria-label="위로" title="위로">↑</button><button data-act="node-down" aria-label="아래로" title="아래로">↓</button><button data-act="node-del" class="del" aria-label="지우기" title="지우기">×</button></span></div>
    <textarea data-node-text="${n.id}" rows="2" placeholder="${n.kind === 'claim' ? '이 논문이 내세우는 주장' : n.kind === 'counter' ? '이 주장에 대한 가장 강한 반대' : n.kind === 'rebut' ? '반론에 대한 답' : n.kind === 'ground' ? '근거(논거·판례·조문·비교법 자료)' : '주장을 나눈 하위 주장'}">${esc(n.text || '')}</textarea>
    ${n.kind === 'ground' || n.kind === 'rebut' || n.kind === 'counter' ? `<div class="refs">${refs}<button class="ref-add" data-act="ref-add" data-node="${n.id}">+ 자료 연결</button></div>` : refs ? `<div class="refs">${refs}</div>` : ''}
    ${kids ? `<div class="kids">${kids}</div>` : ''}</div>`;
}
const LEVEL = { bad: '고칠 것', warn: '살필 것', info: '참고' };
// 주장 마디가 아닌 점검 항목의 바로 가기: [보여 줄 화면, 그 화면에서 데려갈 자리, 단추 글자]
const ISSUE_GO = { question: ['arg', '[data-pf="question"]', '적기'], answer: ['arg', '[data-pf="answer"]', '적기'], gap: ['lit', '[data-pf="gap"]', '적으러 가기'], gapdocs: ['lit', '[data-act="gap-pick"]', '연결하러 가기'], reads: ['lit', '[data-act="lit-add"]', '선행연구 지도로'] };
export function issuesHTML(list) {
  if (!list.length) return '<p class="ok-line">점검할 것이 없습니다. 질문·답·주장·근거·반론·차별성이 모두 갖춰졌습니다.</p>';
  return `<ul class="issues">${list.map((x) => `<li class="${x.level}"><b>${LEVEL[x.level]}</b><span>${esc(x.msg)}</span>${x.node ? `<button class="linkish" data-act="node-go" data-node="${x.node}">보기</button>` : x.go ? `<button class="linkish" data-act="issue-go" data-go="${x.go}">${ISSUE_GO[x.go][2]}</button>` : ''}</li>`).join('')}</ul>`;
}
export function viewArg() {
  const p = S.project; if (!p) return;
  const claims = p.arg.filter((n) => !n.parent).sort((a, b) => (a.order || 0) - (b.order || 0));
  const issues = argIssues(p);
  UI.view().innerHTML = `<div class="page wide">
    <div class="notes-head"><h1>논증 설계도</h1><div class="tools"><button class="btn" data-act="go" data-v="lit">선행연구 지도</button><button class="btn" data-act="go" data-v="write">집필로</button></div></div>
    <section class="box"><h2 class="bh">연구 질문 <small>호기심이 학문의 물음이 되기까지</small></h2>
      <label class="field"><span>지금의 연구 질문</span><textarea data-pf="question" rows="2" placeholder="예: 고도의 독립성을 가진 선거관리위원회에 그에 상응하는 통제는 어떻게 마련되어야 하는가?">${esc(p.question || '')}</textarea></label>
      <div class="tools-row"><button class="btn" data-act="q-revise">질문을 고쳐 쓰기(지금 질문은 기록으로)</button></div>
      ${p.qlog.length ? `<ol class="qlog">${p.qlog.slice().reverse().map((x) => `<li><span class="d">${kdate(x.at)}</span><span class="t">${esc(x.text)}</span>${x.why ? `<span class="w">고친 이유: ${esc(x.why)}</span>` : ''}</li>`).join('')}</ol>` : '<p class="sub">질문을 고쳐 쓸 때마다 이전 질문과 고친 이유가 날짜와 함께 남습니다. 논문이 끝나면 호기심이 어떻게 학문의 물음이 되었는지가 한 줄로 보입니다.</p>'}
      <label class="field"><span>질문에 대한 답 <small>— 결론의 한 문장</small></span><textarea data-pf="answer" rows="2" placeholder="예: 감독 기능은 합의제 중앙선관위가, 실시 기능은 독임제 각급 선관위가 맡는 ‘기능적 분리’와 사법적 통제가 필요하다.">${esc(p.answer || '')}</textarea></label>
    </section>
    <section class="box"><h2 class="bh">점검 <small>고칠 것 ${issues.filter((x) => x.level === 'bad').length} · 살필 것 ${issues.filter((x) => x.level === 'warn').length}</small></h2>${issuesHTML(issues)}</section>
    <section class="box"><div class="bh-row"><h2 class="bh">주장·근거·반론</h2><button class="btn primary" data-act="node-add" data-kind="claim">+ 핵심 주장</button></div>
      <p class="sub">핵심 주장마다 근거와 <b>예상 반론</b>, 그 반론에 대한 <b>재반론</b>을 세웁니다. 근거에는 노트 카드·서재의 쪽·판례·조문을 연결하면 집필 때 각주가 됩니다.</p>
      <div class="tree">${claims.map((c) => nodeHTML(p, c, 0)).join('') || '<p class="find-none">아직 주장이 없습니다. <b>+ 핵심 주장</b>으로 시작하세요.</p>'}</div></section>
    <section class="box"><div class="bh-row"><h2 class="bh">개념 정의</h2><button class="btn" data-act="term-add">+ 개념</button></div>
      <p class="sub">핵심 개념의 정의와, 같은 대상을 가리키는 다른 표현을 적어 두면 원고 점검에서 용어가 섞인 곳을 찾아냅니다.</p>
      ${p.terms.length ? `<div class="terms">${p.terms.map((t) => `<div class="term" data-term="${t.id}"><b>${esc(t.term)}</b>${t.variants ? `<span class="m">다른 표현: ${esc(t.variants)}</span>` : ''}<p>${esc(t.def || '')}</p><span class="tools-row"><button class="linkish" data-act="term-edit">고치기</button> <button class="linkish danger" data-act="term-del">지우기</button></span></div>`).join('')}</div>` : ''}</section>
    <section class="box"><h2 class="bh">연구 일지</h2>${(p.log || []).length ? `<ul class="log">${p.log.slice(-40).reverse().map((x) => `<li><span class="d">${kdt(x.at)}</span>${esc(x.text)}</li>`).join('')}</ul>` : '<p class="sub">질문을 고치고, 문헌을 읽고, 원고를 점검하고, 심사에 답한 일이 여기에 쌓입니다.</p>'}</section>
  </div>`;
}
function nextOrder(p, parent) { return Math.max(0, ...p.arg.filter((n) => n.parent === parent).map((n) => n.order || 0)) + 1; }
ACT['node-add'] = async (el) => {
  const p = S.project, kind = el.dataset.kind, parent = el.dataset.parent || null;
  const n = { id: uid(), parent, kind, text: '', refs: [], order: nextOrder(p, parent) };
  p.arg.push(n); await saveProject(p); viewArg();
  setTimeout(() => { const t = $(`[data-node-text="${n.id}"]`); if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); } }, 30);
};
ACT['node-del'] = async (el) => {
  const p = S.project, id = el.closest('[data-node]').dataset.node, all = [id, ...descendants(p, id).map((x) => x.id)];
  if (all.length > 1 && !(await confirmBox(`이 항목과 그 아래 ${all.length - 1}개 항목을 지울까요?`, '지우기'))) return;
  p.arg = p.arg.filter((n) => !all.includes(n.id)); await saveProject(p); viewArg();
};
const moveNode = async (el, dir) => {
  const p = S.project, id = el.closest('[data-node]').dataset.node, n = p.arg.find((x) => x.id === id); if (!n) return;
  const sib = p.arg.filter((x) => x.parent === n.parent).sort((a, b) => (a.order || 0) - (b.order || 0)); sib.forEach((x, i) => { x.order = i + 1; });
  const i = sib.indexOf(n), j = i + dir; if (j < 0 || j >= sib.length) return;
  [sib[i].order, sib[j].order] = [sib[j].order, sib[i].order]; await saveProject(p); viewArg();
};
ACT['node-up'] = (el) => moveNode(el, -1); ACT['node-down'] = (el) => moveNode(el, 1);
ACT['node-go'] = (el) => { const x = $(`[data-node="${el.dataset.node}"]`); if (x) { x.scrollIntoView({ block: 'center', behavior: 'smooth' }); x.classList.add('flash'); setTimeout(() => x.classList.remove('flash'), 1400); } };
ACT['issue-go'] = (el) => {
  const g = ISSUE_GO[el.dataset.go]; if (!g) return;
  if (g[0] === 'lit') litTab = 'map';
  if (S.view !== g[0]) UI.show(g[0]); else if (g[0] === 'lit') viewLit();
  const x = $(g[1]); if (!x) return;
  x.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const box = x.closest('.field') || x; box.classList.add('flash'); setTimeout(() => box.classList.remove('flash'), 1400);
  if (x.tagName === 'TEXTAREA') x.focus({ preventScroll: true });
};
ACT['ref-del'] = async (el) => { const p = S.project, n = p.arg.find((x) => x.id === el.dataset.node); if (!n) return; n.refs.splice(+el.dataset.i, 1); await saveProject(p); viewArg(); };
ACT['ref-add'] = async (el) => {
  const p = S.project, n = p.arg.find((x) => x.id === el.dataset.node); if (!n) return;
  const cards = projCards(p);
  const lib = await libLoad();
  const cases = new Map(); for (const d of lib.docs) for (const c of (d.facts && d.facts.cases) || []) cases.set(c.key, (cases.get(c.key) || 0) + 1);
  const docs = S.docs.filter((d) => d.indexed && !d.blank).sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  const m = modal(`<h2>근거 자료 연결</h2><p class="sub">${esc((n.text || KIND[n.kind]).slice(0, 60))}</p>
    <div class="seg" role="tablist"><button class="on" data-tab="card">노트 카드</button><button data-tab="doc">서재의 쪽</button><button data-tab="case">판례</button><button data-tab="law">조문·기타</button></div>
    <div class="tab" data-pane="card">${cards.length ? `<div class="pick">${cards.map((c) => { const d = c.docId ? docOf(c.docId) : null; return `<label class="pick-row"><input type="checkbox" value="${c.id}"><span>${c.quote ? `“${esc(c.quote.slice(0, 90))}${c.quote.length > 90 ? '…' : ''}”` : esc((c.memo || '메모').slice(0, 90))}<small>${d ? esc(`${d.author || d.title} · ${pageLabel(d, c.page)}`) : '메모 카드'}</small></span></label>`; }).join('')}</div>` : '<p class="find-none">이 연구의 노트 카드가 없습니다. 읽기 화면에서 글을 골라 <b>카드에 담기</b>를 누르세요.</p>'}</div>
    <div class="tab" data-pane="doc" hidden><label class="field"><span>문헌</span><select id="rf-doc">${docs.map((d) => `<option value="${d.id}">${esc(d.title)}</option>`).join('')}</select></label><label class="field"><span>쪽(PDF 쪽 번호)</span><input id="rf-page" inputmode="numeric" placeholder="예: 12"></label></div>
    <div class="tab" data-pane="case" hidden><label class="field"><span>사건번호</span><input id="rf-case" list="rf-cases" placeholder="예: 2013헌바190"><datalist id="rf-cases">${[...cases.keys()].sort().map((k) => `<option value="${esc(k)}">`).join('')}</datalist></label><p class="sub">서재 문헌에 나오는 사건번호 ${cases.size}개가 목록에 있습니다.</p></div>
    <div class="tab" data-pane="law" hidden><label class="field"><span>조문이나 기타 근거</span><input id="rf-law" placeholder="예: 공직선거법 제272조의2, 2024년 감사원 감사보고서"></label></div>
    <div class="modal-foot"><button class="btn" data-close>취소</button><button class="btn primary" id="rf-ok">연결</button></div>`);
  let tab = 'card';
  $$('[data-tab]', m.el).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; $$('[data-tab]', m.el).forEach((x) => x.classList.toggle('on', x === b)); $$('[data-pane]', m.el).forEach((x) => { x.hidden = x.dataset.pane !== tab; }); }));
  $('#rf-ok', m.el).addEventListener('click', async () => {
    const add = [];
    if (tab === 'card') $$('[data-pane="card"] input:checked', m.el).forEach((x) => add.push({ t: 'card', id: x.value }));
    else if (tab === 'doc') { const id = $('#rf-doc', m.el).value, pg = parseInt($('#rf-page', m.el).value, 10); if (id) add.push({ t: 'doc', id, page: pg > 0 ? pg : 0 }); }
    else if (tab === 'case') { const k = $('#rf-case', m.el).value.replace(/\s+/g, ''); if (k) add.push({ t: 'case', key: k }); }
    else { const k = $('#rf-law', m.el).value.trim(); if (k) add.push({ t: 'law', key: k }); }
    if (!add.length) { toast('연결할 자료를 고르세요.'); return; }
    n.refs = (n.refs || []).concat(add); await saveProject(p); m.close(); viewArg();
  });
};
ACT['q-revise'] = async () => {
  const p = S.project, cur = String(p.question || '').trim();
  const v = await formBox('연구 질문 고쳐 쓰기', [{ label: '새 연구 질문', value: cur, type: 'textarea', rows: 3 }, { label: '고친 이유 (선행연구에서 무엇을 보았나, 무엇이 달라졌나)', value: '', type: 'textarea', rows: 2 }], { intro: cur ? `<p class="sub">지금 질문: ${esc(cur)}</p>` : '' });
  if (!v || !v[0].trim() || v[0].trim() === cur) return;
  if (cur) p.qlog.push({ at: Date.now(), text: cur, why: v[1].trim() });
  p.question = v[0].trim(); logEvent(p, `연구 질문을 고쳐 씀${v[1].trim() ? `: ${v[1].trim()}` : ''}`);
  await saveProject(p); viewArg(); toast('질문을 고쳐 쓰고 이전 질문을 기록에 남겼습니다.');
};
const termForm = async (t) => { const v = await formBox(t ? '개념 고치기' : '개념 추가', [{ label: '개념', value: t ? t.term : '' }, { label: '같은 대상을 가리키는 다른 표현(쉼표로) — 원고 점검에서 섞어 쓴 곳을 찾습니다', value: t ? t.variants : '', placeholder: '예: 선관위, 중앙선관위' }, { label: '이 논문에서의 정의', value: t ? t.def : '', type: 'textarea', rows: 3 }]); return v && v[0].trim() ? { term: v[0].trim(), variants: v[1].trim(), def: v[2].trim() } : null; };
ACT['term-add'] = async () => { const v = await termForm(); if (!v) return; S.project.terms.push({ id: uid(), ...v }); await saveProject(S.project); viewArg(); };
ACT['term-edit'] = async (el) => { const t = S.project.terms.find((x) => x.id === el.closest('[data-term]').dataset.term); if (!t) return; const v = await termForm(t); if (!v) return; Object.assign(t, v); await saveProject(S.project); viewArg(); };
ACT['term-del'] = async (el) => { const id = el.closest('[data-term]').dataset.term; if (!(await confirmBox('이 개념을 지울까요?', '지우기'))) return; S.project.terms = S.project.terms.filter((x) => x.id !== id); await saveProject(S.project); viewArg(); };
let nodeT = 0;
ON_INPUT.push((t) => { const id = t.dataset && t.dataset.nodeText; if (!id) return false; const n = S.project && S.project.arg.find((x) => x.id === id); if (n) { n.text = t.value; clearTimeout(nodeT); nodeT = setTimeout(() => saveProject(S.project), 500); } return true; });

/* ================= 선행연구 지도 ================= */
let litTab = 'map', litRel = 'all';
export async function viewLit() {
  const p = S.project; if (!p) return;
  const reads = projReads(p).map((r) => ({ r, d: docOf(r.docId) })).filter((x) => x.d);
  const counts = RELS.map(([k, l]) => [k, l, reads.filter((x) => (x.r.rel || '') === k).length]);
  const shown = reads.filter((x) => litRel === 'all' || (x.r.rel || '') === litRel).sort((a, b) => (a.d.year || '').localeCompare(b.d.year || '') || a.d.title.localeCompare(b.d.title, 'ko'));
  const gapDocs = (p.gapDocs || []).map(docOf).filter(Boolean);
  UI.view().innerHTML = `<div class="page wide">
    <div class="notes-head"><h1>선행연구 지도</h1><div class="seg"><button class="${litTab === 'map' ? 'on' : ''}" data-act="lit-tab" data-v="map">읽기 카드</button><button class="${litTab === 'net' ? 'on' : ''}" data-act="lit-tab" data-v="net">서재 인용망</button></div></div>
    ${litTab === 'map' ? `
    <section class="box"><h2 class="bh">차별성 <small>선행연구가 한 것, 하지 않은 것, 이 연구가 할 것</small></h2>
      <label class="field"><span>차별성 문장</span><textarea data-pf="gap" rows="3" placeholder="예: 선행연구는 선관위의 위상 강화에 집중했을 뿐, 고도의 독립성에 상응하는 통제는 다루지 않았다. 본 연구는 …">${esc(p.gap || '')}</textarea></label>
      <div class="refs">${gapDocs.map((d) => `<span class="ref"><span>${esc(d.author || '')} 「${esc(d.title.slice(0, 30))}」</span><button data-act="gap-del" data-id="${d.id}" aria-label="빼기">×</button></span>`).join('')}<button class="ref-add" data-act="gap-pick">+ 근거가 되는 선행연구 연결</button></div>
      <p class="sub">“기존 연구는 ~에 그쳤다”는 문장이 실제 읽은 문헌으로 뒷받침되는지 이 연결로 확인합니다.</p></section>
    <section class="box"><div class="bh-row"><h2 class="bh">읽기 카드 ${reads.length}편</h2><button class="btn primary" data-act="lit-add">+ 문헌 읽기 카드</button></div>
      <div class="chips-row"><button class="chip${litRel === 'all' ? ' on' : ''}" data-act="lit-rel" data-v="all">모두 ${reads.length}</button>${counts.map(([k, l, n]) => `<button class="chip${litRel === k ? ' on' : ''}" data-act="lit-rel" data-v="${k}">${l} ${n}</button>`).join('')}</div>
      ${shown.length ? `<div class="matrix">${shown.map(({ r, d }) => `<article class="rc" data-read="${r.id}">
        <div class="rc-h"><button class="doc-open" data-act="lit-open" data-id="${d.id}" title="${esc(d.title)}">${esc(d.title)}</button><span class="m">${esc([d.author, d.year].filter(Boolean).join(', '))}</span><span class="rel r-${r.rel || 'none0'}">${relName(r.rel)}</span></div>
        <dl>${RC_FIELDS.filter(([k]) => r[k]).map(([k, l]) => `<dt>${l}</dt><dd>${esc(r[k])}</dd>`).join('') || '<dd class="sub">아직 비어 있습니다.</dd>'}</dl>
        <div class="tools-row"><button class="linkish" data-act="lit-edit" data-id="${d.id}">고치기</button></div></article>`).join('')}</div>` : `<p class="find-none">${reads.length ? '이 입장의 카드가 없습니다.' : '아직 읽기 카드가 없습니다. 서재나 읽기 화면에서 <b>읽기 카드</b>를 쓰거나, <b>+ 문헌 읽기 카드</b>로 시작하세요.'}</p>`}
    </section>` : '<section class="box" id="net-box"><p class="sub">서재 문헌들의 각주와 참고문헌을 읽는 중…</p></section>'}
  </div>`;
  if (litTab === 'net') paintNet();
}
async function citeNet() {
  const lib = await libLoad();
  const lk = (t) => titleKey(t);
  const libKeys = S.docs.map((d) => ({ d, k: lk(d.title) })).filter((x) => x.k.length >= 6);
  const match = (key) => { const hit = libKeys.find((x) => x.k === key || (key.length >= 8 && x.k.length >= 8 && (x.k.includes(key) || key.includes(x.k)))); return hit ? hit.d : null; };
  const works = new Map();
  for (const d of lib.docs) for (const c of citationsIn(d.pages)) {
    const inLib = match(c.key); if (inLib && inLib.id === d.id) continue;
    const e = works.get(c.key) || { ...c, by: new Set(), lib: inLib }; e.by.add(d.id); works.set(c.key, e);
  }
  const all = [...works.values()];
  return { missing: all.filter((e) => !e.lib && e.by.size >= 2).sort((a, b) => b.by.size - a.by.size), core: all.filter((e) => e.lib).sort((a, b) => b.by.size - a.by.size), docs: lib.docs.length };
}
async function paintNet() {
  const box = $('#net-box'); if (!box) return;
  const net = await citeNet(); if (!$('#net-box')) return;
  const byList = (e) => [...e.by].map(docOf).filter(Boolean).map((d) => `<button class="linkish" data-act="lit-open" data-id="${d.id}">${esc(d.author || d.title.slice(0, 12))}</button>`).join(', ');
  box.innerHTML = `<h2 class="bh">서재 인용망 <small>서재 문헌 ${net.docs}편의 각주·참고문헌</small></h2>
    <p class="sub">서재에 넣은 문헌들이 서로를, 그리고 서재 밖의 어떤 문헌을 인용하는지 각주와 참고문헌에서 읽었습니다. 여러 문헌이 함께 인용하는데 서재에 없는 문헌은 꼭 구해 읽을 후보입니다.</p>
    <h3 class="mh">서재에 없는데 여러 문헌이 인용한 문헌 ${net.missing.length}편</h3>
    ${net.missing.length ? `<ul class="netlist">${net.missing.slice(0, 80).map((e) => `<li><span class="cnt">${e.by.size}편</span><span><b>${esc(e.author)}</b>, ${e.kind === 'book' ? `『${esc(e.title)}』` : `“${esc(e.title)}”`}<small>인용한 문헌: ${byList(e)}</small></span><button class="btn sm" data-act="net-copy" data-t="${esc(`${e.author}, ${e.kind === 'book' ? `『${e.title}』` : `“${e.title}”`}`)}">복사</button></li>`).join('')}</ul>` : '<p class="find-none">두 편 이상이 함께 인용하는데 서재에 없는 문헌은 없습니다.</p>'}
    <h3 class="mh">서재 안에서 많이 인용된 문헌</h3>
    ${net.core.length ? `<ul class="netlist">${net.core.slice(0, 40).map((e) => `<li><span class="cnt">${e.by.size}편</span><span><button class="linkish" data-act="lit-open" data-id="${e.lib.id}">${esc(e.lib.title)}</button><small>인용한 문헌: ${byList(e)}</small></span></li>`).join('')}</ul>` : '<p class="find-none">서재 문헌끼리 인용한 관계를 찾지 못했습니다.</p>'}
    <p class="sub">각주가 ‘저자, “제목”, 『학술지』’, ‘저자, 『책』 (출판사 …)’, ‘저자. 연도. “제목.”’ 꼴로 적힌 인용을 읽습니다. 다른 꼴로 적힌 인용은 빠질 수 있습니다.</p>`;
}
ACT['lit-tab'] = (el) => { litTab = el.dataset.v; viewLit(); };
ACT['lit-rel'] = (el) => { litRel = el.dataset.v; viewLit(); };
ACT['lit-edit'] = (el) => openReadCard(el.dataset.id);
ACT['lit-open'] = (el) => { closeModals(); UI.openDoc(el.dataset.id, 1, []); };
ACT['net-copy'] = (el) => copyText(el.dataset.t, '문헌 정보를 복사했습니다.');
ACT['lit-add'] = async () => {
  const p = S.project, have = new Set(projReads(p).map((r) => r.docId));
  const docs = S.docs.filter((d) => !have.has(d.id)).sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  if (!docs.length) { toast('서재의 모든 문헌에 이미 읽기 카드가 있습니다. 서재에 문헌을 더 넣으세요.'); return; }
  const m = modal(`<h2>읽기 카드를 쓸 문헌</h2><input class="pick-q" id="pk-q" placeholder="제목·저자로 거르기"><div class="pick" id="pk-list">${docs.map((d) => `<button class="pick-row btnrow" data-id="${d.id}"><span>${esc(d.title)}<small>${esc([d.author, d.year].filter(Boolean).join(', ') || '저자·연도 미입력')}</small></span></button>`).join('')}</div><div class="modal-foot"><button class="btn" data-close>닫기</button></div>`);
  $('#pk-q', m.el).addEventListener('input', (e) => { const q = e.target.value.trim().toLowerCase(); $$('#pk-list .pick-row', m.el).forEach((b) => { b.hidden = q && !b.textContent.toLowerCase().includes(q); }); });
  $('#pk-list', m.el).addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (!b) return; m.close(); openReadCard(b.dataset.id); });
};
ACT['gap-pick'] = async () => {
  const p = S.project, reads = projReads(p).map((r) => docOf(r.docId)).filter(Boolean);
  if (!reads.length) { toast('먼저 선행연구 읽기 카드를 쓰세요. 읽은 문헌만 차별성의 근거로 연결할 수 있습니다.'); return; }
  const m = modal(`<h2>차별성의 근거가 되는 선행연구</h2><div class="pick">${reads.map((d) => `<label class="pick-row"><input type="checkbox" value="${d.id}"${(p.gapDocs || []).includes(d.id) ? ' checked' : ''}><span>${esc(d.title)}<small>${esc(relName((readFor(d.id) || {}).rel))}</small></span></label>`).join('')}</div><div class="modal-foot"><button class="btn" data-close>취소</button><button class="btn primary" id="gp-ok">연결</button></div>`);
  $('#gp-ok', m.el).addEventListener('click', async () => { p.gapDocs = $$('input:checked', m.el).map((x) => x.value); await saveProject(p); m.close(); viewLit(); });
};
ACT['gap-del'] = async (el) => { const p = S.project; p.gapDocs = (p.gapDocs || []).filter((x) => x !== el.dataset.id); await saveProject(p); viewLit(); };

/* ================= 심사 대응 ================= */
export function viewReview() {
  const p = S.project; if (!p) return;
  const rounds = [...new Set(p.reviews.map((r) => r.round || 1))].sort((a, b) => a - b);
  const done = p.reviews.filter((r) => r.done).length;
  UI.view().innerHTML = `<div class="page wide">
    <div class="notes-head"><h1>심사 대응</h1><div class="tools"><button class="btn primary" data-act="rv-add">+ 심사의견 넣기</button>${p.reviews.length ? '<button class="btn" data-act="rv-export">수정대조표(한글)</button>' : ''}</div></div>
    <p class="sub">심사의견을 붙여 넣으면 의견마다 칸이 생깁니다. 반영 내용과 원고의 수정 위치를 적으면 수정대조표를 한글 파일로 냅니다. 의견은 <b>예상 반론</b>으로 논증 설계도에 옮겨 다음 논문에서도 대비할 수 있습니다.</p>
    ${p.reviews.length ? `<p class="find-count">의견 ${p.reviews.length}개 · 반영 끝남 ${done}개</p>` : ''}
    ${rounds.map((rd) => `<section class="box"><h2 class="bh">${rd}차 심사</h2>${p.reviews.filter((r) => (r.round || 1) === rd).map((r, i) => `<article class="rv${r.done ? ' done' : ''}" data-rv="${r.id}">
      <div class="rv-h"><b>${esc(r.who || '심사위원')} · 의견 ${i + 1}</b><label class="ck"><input type="checkbox" data-rvf="done"${r.done ? ' checked' : ''}> 반영 끝남</label></div>
      <blockquote>${esc(r.comment)}</blockquote>
      <label class="field"><span>반영 내용(답변)</span><textarea data-rvf="response" rows="3">${esc(r.response || '')}</textarea></label>
      <label class="field"><span>원고의 수정 위치</span><input data-rvf="where" value="${esc(r.where || '')}" placeholder="예: 12면 각주 34, Ⅲ.2. 셋째 문단"></label>
      <div class="tools-row"><button class="linkish" data-act="rv-counter">예상 반론으로 논증에 옮기기</button><button class="linkish danger" data-act="rv-del">지우기</button></div></article>`).join('')}</section>`).join('') || '<p class="find-none">아직 심사의견이 없습니다.</p>'}
  </div>`;
}
ACT['rv-add'] = async () => {
  const p = S.project, next = Math.max(0, ...p.reviews.map((r) => r.round || 1)) || 1;
  const v = await formBox('심사의견 넣기', [{ label: '심사 차수', value: String(next), placeholder: '1' }, { label: '심사위원 (예: 심사위원 A)', value: '' }, { label: '심사의견 — 번호(1. 2. ①)나 빈 줄로 나뉜 의견을 각각 한 칸으로 만듭니다', value: '', type: 'textarea', rows: 10 }]);
  if (!v || !v[2].trim()) return;
  const parts = v[2].replace(/\r/g, '').split(/\n\s*\n|\n(?=\s*(?:\d{1,2}\s*[.)]|[①-⑳]|[가-하]\s*[.)]|[-•·]\s))/).map((x) => x.trim()).filter((x) => x.length > 3);
  const round = Math.max(1, parseInt(v[0], 10) || next);
  for (const c of parts) p.reviews.push({ id: uid(), round, who: v[1].trim(), comment: c.replace(/^(?:\d{1,2}\s*[.)]|[①-⑳]|[가-하]\s*[.)]|[-•·])\s*/, ''), response: '', where: '', done: false });
  logEvent(p, `${round}차 심사의견 ${parts.length}개를 넣음`); if (p.stage !== 'review' && p.stage !== 'published') p.stage = 'review';
  await saveProject(p); viewReview(); toast(`의견 ${parts.length}개로 나누었습니다.`);
};
ACT['rv-del'] = async (el) => { const p = S.project, id = el.closest('[data-rv]').dataset.rv; if (!(await confirmBox('이 의견을 지울까요?', '지우기'))) return; p.reviews = p.reviews.filter((x) => x.id !== id); await saveProject(p); viewReview(); };
ACT['rv-counter'] = async (el) => {
  const p = S.project, r = p.reviews.find((x) => x.id === el.closest('[data-rv]').dataset.rv); if (!r) return;
  const claims = p.arg.filter((n) => n.kind === 'claim');
  const v = await formBox('예상 반론으로 옮기기', [{ label: '어느 핵심 주장에 대한 반론입니까', type: 'select', value: claims[0] ? claims[0].id : '', options: [...claims.map((c) => [c.id, (c.text || '이름 없는 주장').slice(0, 50)]), ['', '(새 핵심 주장 없이 따로 두기)']] }, { label: '반론', value: r.comment, type: 'textarea', rows: 4 }]);
  if (!v) return;
  p.arg.push({ id: uid(), parent: v[0] || null, kind: v[0] ? 'counter' : 'claim', text: v[0] ? v[1] : `(심사 지적) ${v[1]}`, refs: [], order: nextOrder(p, v[0] || null) });
  await saveProject(p); toast('논증 설계도에 반론으로 옮겼습니다.');
};
ON_CHANGE.push((t) => { const k = t.dataset && t.dataset.rvf, card = t.closest && t.closest('[data-rv]'); if (!k || !card) return false; const r = S.project.reviews.find((x) => x.id === card.dataset.rv); if (r) { r[k] = t.type === 'checkbox' ? t.checked : t.value; saveProject(S.project); if (k === 'done') card.classList.toggle('done', t.checked); } return true; });
let rvT = 0;
ON_INPUT.push((t) => { const k = t.dataset && t.dataset.rvf, card = t.closest && t.closest('[data-rv]'); if (!k || !card || t.type === 'checkbox') return false; const r = S.project.reviews.find((x) => x.id === card.dataset.rv); if (r) { r[k] = t.value; clearTimeout(rvT); rvT = setTimeout(() => saveProject(S.project), 500); } return true; });
ACT['rv-export'] = async () => {
  const p = S.project; const blocks = [{ t: 'title', text: '심사의견 반영 대조표' }, { t: 'subtitle', text: p.title }];
  const rounds = [...new Set(p.reviews.map((r) => r.round || 1))].sort((a, b) => a - b);
  for (const rd of rounds) {
    blocks.push({ t: 'h1', text: `${rd}차 심사` });
    p.reviews.filter((r) => (r.round || 1) === rd).forEach((r, i) => {
      blocks.push({ t: 'h2', text: `${r.who ? r.who + ' ' : ''}의견 ${i + 1}` }, { t: 'quote', text: r.comment }, { t: 'p', text: `반영 내용: ${r.response || '(작성 중)'}` }, { t: 'p', text: `수정 위치: ${r.where || '-'}` });
    });
  }
  const skel = new Uint8Array(await (await fetch(new URL('./hwpx-skeleton.hwpx', import.meta.url))).arrayBuffer());
  download(`${safeName(p.title, '연구')} 수정대조표.hwpx`, await buildHwpx(skel, { title: '심사의견 반영 대조표', author: '안요환', blocks }), HWPX_MIME);
  logEvent(p, '수정대조표를 한글 파일로 냄'); saveProject(p);
};

/* ================= 내 연구 ================= */
let mineCalc = null;
export async function viewMe() {
  const mine = S.docs.filter((d) => d.mine), used = mine.filter((d) => !excluded(d));
  const row = (k) => { const b = BASE[k], v = mineCalc && mineCalc.m ? mineCalc.m[k] : null; return `<tr><th>${b.label}</th><td>${b.median}${b.unit}</td><td>${b.lo}–${b.hi}${b.unit}</td>${mineCalc && mineCalc.m ? `<td>${v}${b.unit}</td>` : ''}</tr>`; };
  UI.view().innerHTML = `<div class="page wide">
    <div class="notes-head"><h1>내 연구</h1></div>
    <section class="box portrait"><h2 class="bh">관통하는 문제의식</h2><p class="thesis">${esc(PORTRAIT.thesis)}</p>
      <ul class="plain">${PORTRAIT.threads.map(([h, t]) => `<li><b>${esc(h)}</b> — ${esc(t)}</li>`).join('')}</ul></section>
    <section class="box"><h2 class="bh">전형적 논증 흐름 <small>새 연구의 개요 기본 틀로 씁니다</small></h2><ol class="plain">${PORTRAIT.flow.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>
    <div class="two">
      <section class="box"><h2 class="bh">문체</h2><ul class="plain">${PORTRAIT.style.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
      <section class="box"><h2 class="bh">강점과 살필 점</h2><ul class="plain">${PORTRAIT.strengths.map((x) => `<li class="good">${esc(x)}</li>`).join('')}${PORTRAIT.watch.map((x) => `<li class="watch">${esc(x)}</li>`).join('')}</ul></section>
    </div>
    <section class="box"><h2 class="bh">문체 기준값 <small>박사학위논문과 학술지 논문 ${BASE.n - 1}편, 문장 ${BASE.sentences.toLocaleString()}개</small></h2>
      <div class="tbl"><table class="st"><thead><tr><th></th><th>가운데 값</th><th>평소 범위</th>${mineCalc && mineCalc.m ? `<th>서재의 ‘내 글’ ${mineCalc.n}편</th>` : ''}</tr></thead><tbody>${['avgLen', 'p90', 'longShare', 'assertShare', 'hedgeShare', 'quoteMarks', 'selfRef'].map(row).join('')}</tbody></table></div>
      <p class="sub">원고 점검에서 새 원고의 값이 평소 범위를 벗어나면 알려 줍니다. 군사과학논집 게재 글과 3인 이상 공저는 이 기준과 ‘내 글’ 대조에서 늘 뺍니다.</p></section>
    <section class="box"><div class="bh-row"><h2 class="bh">서재의 ‘내 글’ ${mine.length}편</h2>${used.length ? '<button class="btn" data-act="me-calc">내 글로 다시 재기</button>' : ''}</div>
      <p class="sub">서재에서 문헌의 <b>내 글</b>을 켜 두면 자기표절 대조와 판례·조문 색인에 쓰입니다.</p>
      ${mine.length ? `<ul class="plain">${mine.map((d) => `<li>${esc(d.title)}${excluded(d) ? ' <span class="tag gray">기준에서 제외</span>' : ''}</li>`).join('')}</ul>` : '<p class="find-none">아직 ‘내 글’로 표시한 문헌이 없습니다.</p>'}
      ${mineCalc && mineCalc.idx ? `<h3 class="mh">내 글에서 다룬 판례 ${mineCalc.idx.cases.length}건 · 조문 ${mineCalc.idx.laws.length}개</h3><p class="chips-wrap">${mineCalc.idx.cases.slice(0, 60).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</p>` : ''}</section>
    <section class="box"><h2 class="bh">각주 양식 <small>박사학위논문 각주 319개에서 확인</small></h2><dl class="cite-style">${Object.entries({ '학술지 논문': PORTRAIT.citeStyle.article, '단행본': PORTRAIT.citeStyle.book, '다시 인용': PORTRAIT.citeStyle.again, '헌법재판소 결정': PORTRAIT.citeStyle.case }).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p class="sub">YO아이가 만드는 각주는 모두 이 양식을 따릅니다.</p></section>
  </div>`;
}
ACT['me-calc'] = async () => {
  const used = S.docs.filter((d) => d.mine && !excluded(d)); if (!used.length) return;
  toast('내 글을 다시 재는 중…');
  const texts = [], cases = new Set(), laws = new Set();
  for (const d of used) { const pg = await docPages(d.id); if (!pg) continue; texts.push(bodyOfPages(pg.pages)); for (const c of (pg.facts && pg.facts.cases) || []) cases.add(c.key); for (const l of (pg.facts && pg.facts.laws) || []) laws.add(l.key); }
  const per = texts.map((t) => styleMetrics(t)), med = (k) => { const v = per.map((m) => m[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  mineCalc = { n: per.length, m: Object.fromEntries(Object.keys(BASE).filter((k) => BASE[k].label).map((k) => [k, med(k)])), idx: { cases: [...cases].sort(), laws: [...laws].sort() } };
  viewMe();
};
