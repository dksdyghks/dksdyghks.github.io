/* YO아이 — 집필(개요·자료 배치·한글 내보내기)과 원고 점검.
   개요의 장·절마다 논증 설계도의 주장과 노트 카드를 배치하고, 본문 초고에 〔카드 n〕을 넣으면 내보낼 때 그 자리가 각주가 된다.
   각주는 박사학위논문의 양식을 따르고, 두 번째부터는 ‘앞의 논문’으로 줄인다.
   원고 점검은 사용자가 고른 원고와 서재만 읽는다. 원고는 저장하지 않으며, 바깥으로 아무것도 보내지 않는다. */
import { S, DB, ACT, ON_INPUT, ON_CHANGE, UI, $, $$, esc, uid, toast, kdate, kdt, saveProject, saveCard, docOf, docPages, citer, where, modal, confirmBox, download, safeName, libLoad, logEvent, pdfOpen, copyText } from './core.js?v=bcd0083210';
import { noteCitations, buildRefList, parseRefList, compareRefs, docCitation, titleKey } from './lawtext.js?v=bcd0083210';
import { fixGlyphs, bodyOfPages, sentencesOf, styleMetrics, similarSentences, manuscriptHeads, quotesIn, findQuote, notePages, noteChecks, noteKind, bodyChecks, COUNTER_RE, TOP_RE, caseCourt } from './lawtext.js?v=bcd0083210';
import { readHangul } from './hwp.js?v=bcd0083210';
import { buildHwpx, HWPX_MIME } from './hwpx.js?v=bcd0083210';
import { buildDocx, DOCX_MIME } from './docx.js?v=bcd0083210';
import { BASE, PORTRAIT, excluded } from './profile.js?v=bcd0083210';
import { projCards } from './research.js?v=bcd0083210';

const AUTHOR = '안요환';
const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ'];
const GA = '가나다라마바사아자차카타파하';
export function sectionNumbers(outline) {
  let a = 0, b = 0, c = 0;
  return outline.map((s) => { if (s.lv === 1) { a++; b = 0; c = 0; return `${ROMAN[a - 1] || a}.`; } if (s.lv === 2) { b++; c = 0; return `${b}.`; } c++; return `${GA[c - 1] || c}.`; });
}
const skeleton = async () => new Uint8Array(await (await fetch(new URL('./hwpx-skeleton.hwpx', import.meta.url))).arrayBuffer());

/* ---------------- 카드 번호: 한 번 붙으면 바뀌지 않는다(순서를 바꿔도 〔카드 n〕이 그대로 맞도록) ---------------- */
export function ensureCardNos(p) {
  const list = S.cards.filter((c) => c.projectId === (p && p.id)); let max = Math.max(0, ...list.map((c) => c.no || 0)); const fix = [];
  for (const c of list.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) if (!c.no) { c.no = ++max; fix.push(c); }
  fix.forEach((c) => saveCard(c));
  return list;
}
export const nextCardNo = (p) => Math.max(0, ...S.cards.filter((c) => c.projectId === (p && p.id)).map((c) => c.no || 0)) + 1;
const cardByNo = (p, n) => S.cards.find((c) => c.projectId === p.id && c.no === n) || null;
const CARD_MARK = /〔\s*카드\s*(\d+)\s*〕/g;

/* ---------------- 판례 각주: 선고일은 서재 문헌에 적힌 것을 읽는다(없으면 ○로 비워 둔다) ---------------- */
export function caseCite(key, lib) {
  // 서재에 그 사건의 판결문이 있으면 판결문 자체에서 읽은 인용이 가장 정확하다
  const own = S.docs.find((d) => d.isJudg && (d.cite || {}).caseCite && new RegExp(`(^|\\s)${String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(d.cite.caseCite));
  if (own) return { text: `${own.cite.caseCite}.`, date: (own.cite.caseCite.match(/\d{4}\. \d{1,2}\. \d{1,2}\./) || [''])[0], from: 1, seen: 1, own: true };
  const m = String(key).match(/^(\d{2,4})(\D+?)(\d+)$/); const court = caseCourt(key);
  const counts = new Map(); let whole = 0, seen = 0;
  if (m && lib) {
    const re = new RegExp(`${m[1]}\\s?${m[2]}\\s?${m[3]}(?!\\d)`, 'g');
    for (const d of lib.docs) for (const raw of d.pages) {
      if (!raw.includes(m[3])) continue;
      const t = fixGlyphs(raw).replace(/\s+/g, ' ');
      for (const x of t.matchAll(re)) {
        seen++;
        const before = t.slice(Math.max(0, x.index - 40), x.index), after = t.slice(x.index + x[0].length, x.index + x[0].length + 14);
        const dm = before.match(/((?:19|20)\d{2})\s?\.\s?(\d{1,2})\s?\.\s?(\d{1,2})\s?\.?\s*(?:선고)?\s*,?\s*$/);
        if (dm) { const k = `${dm[1]}. ${+dm[2]}. ${+dm[3]}.`; counts.set(k, (counts.get(k) || 0) + 1); }
        if (/^\s*,?\s*전원재판부/.test(after)) whole++;
      }
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const tail = court === '헌법재판소' ? '결정' : '판결';
  const text = `${court === '하급심' ? '○○법원' : court} ${best ? best[0] : '○. ○. ○.'} 선고 ${key}${court === '헌법재판소' && whole && whole * 2 >= seen ? ' 전원재판부' : ''} ${tail}.`;
  return { text, date: best ? best[0] : '', from: best ? best[1] : 0, seen };
}

/* ================= 집필 ================= */
const TEMPLATE = [
  [1, '서론', '현실의 사건·통계 → 입법자의 의도와 현실의 괴리 → 연구 질문과 목적, 선행연구와의 차별성'],
  [1, '현황과 연혁', '법제의 내용과 연혁, 조문 대조표'],
  [1, '판례의 검토', '헌법재판소·대법원 판단의 요지와 비판(사건번호와 함께). 반대 견해도 정면으로'],
  [1, '비교법적 검토', '미국·일본·캐나다 … 대륙법(독일·프랑스)도 살펴보면 차별성이 커집니다 → 시사점'],
  [1, '개선방안', '개헌안·개정안을 ①②③으로, 조문까지. 예상 반론과 재반론'],
  [1, '결론', '“이상에서 … 그 결과 …를 확인하였다”, 연구 질문에 대한 답 한 문장, 후속연구'],
];
const secOf = (id) => (S.project.outline || []).find((s) => s.id === id);
const nodeOf = (p, id) => p.arg.find((n) => n.id === id);
const kidsOf = (p, id) => p.arg.filter((n) => n.parent === id).sort((a, b) => (a.order || 0) - (b.order || 0));
const KIND = { claim: '주장', sub: '소주장', ground: '근거', counter: '예상 반론', rebut: '재반론' };
const short = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

export function viewWrite() {
  const p = S.project; if (!p) return;
  ensureCardNos(p);
  const out = p.outline, nums = sectionNumbers(out), cards = projCards(p);
  const placedClaims = new Set(out.flatMap((s) => s.claims || [])), placedCards = new Set(out.flatMap((s) => s.cards || []));
  const usedNos = new Set(out.flatMap((s) => [...String(s.text || '').matchAll(CARD_MARK)].map((m) => +m[1])));
  const claims = p.arg.filter((n) => n.kind === 'claim');
  const loose = claims.filter((c) => !placedClaims.has(c.id)), looseCards = cards.filter((c) => !placedCards.has(c.id) && !usedNos.has(c.no));
  const sec = (s, i) => {
    const cl = (s.claims || []).map((id) => nodeOf(p, id)).filter(Boolean), cs = (s.cards || []).map((id) => S.cards.find((c) => c.id === id)).filter(Boolean);
    return `<section class="sec lv${s.lv}" data-sec="${s.id}">
      <div class="sec-h"><span class="sec-n">${nums[i]}</span><label class="sr" for="st-${s.id}">제목</label><input id="st-${s.id}" class="sec-t" data-sec-title value="${esc(s.title || '')}" placeholder="${s.lv === 1 ? '장 제목' : '절 제목'}">
        <span class="node-tools">${s.lv < 3 ? `<button data-act="sec-add" data-lv="${s.lv + 1}" title="이 아래에 ${s.lv === 1 ? '절' : '항'} 추가">+ ${s.lv === 1 ? '절' : '항'}</button>` : ''}<button data-act="sec-lv" data-d="-1" title="한 단계 위로" aria-label="한 단계 위로"${s.lv === 1 ? ' disabled' : ''}>←</button><button data-act="sec-lv" data-d="1" title="한 단계 아래로" aria-label="한 단계 아래로"${s.lv === 3 || i === 0 ? ' disabled' : ''}>→</button><button data-act="sec-up" aria-label="위로" title="위로">↑</button><button data-act="sec-down" aria-label="아래로" title="아래로">↓</button><button data-act="sec-del" class="del" aria-label="지우기" title="지우기">×</button></span></div>
      <label class="sr" for="sx-${s.id}">초고</label><textarea id="sx-${s.id}" data-sec-text rows="${Math.min(14, Math.max(3, String(s.text || '').split('\n').length + 1))}" placeholder="${esc(s.hint || '초고나 쓸 내용의 메모. 카드를 누르면 커서 자리에 〔카드 n〕이 들어가고, 내보낼 때 그 자리가 각주가 됩니다.')}">${esc(s.text || '')}</textarea>
      <div class="sec-count" data-sec-count="${s.id}" aria-live="polite">${countLabel(s.text)}</div>
      <div class="sec-refs">${cl.map((n) => `<span class="ref claim"><span title="${esc(n.text)}">주장 · ${esc(short(n.text || '이름 없는 주장', 34))}</span><button data-act="sec-unclaim" data-id="${n.id}" aria-label="빼기" title="빼기">×</button></span>`).join('')}
        ${cs.map((c) => { const d = c.docId ? docOf(c.docId) : null; return `<span class="ref kcard"><button class="ins" data-act="sec-ins" data-no="${c.no}" title="본문 커서 자리에 〔카드 ${c.no}〕 넣기">카드 ${c.no} · ${esc(short(c.quote || c.memo || (d ? `${d.author || d.title} ${where(d, c.page).ui}` : '메모'), 26))}</button><button data-act="sec-uncard" data-id="${c.id}" aria-label="빼기" title="빼기">×</button></span>`; }).join('')}
        <button class="ref-add" data-act="sec-place">+ 주장·카드 배치</button></div></section>`;
  };
  const qa = `<section class="box qa"><h2 class="bh">질문과 답 <small>서론의 질문과 결론의 답이 한 문장으로 맞물리는지</small></h2>
      <div class="two tight"><div><span class="lbl">연구 질문</span><p>${p.question ? esc(p.question) : '<span class="sub">비어 있음 — 논증 설계도에서 적으세요</span>'}</p></div><div><span class="lbl">답(결론)</span><p>${p.answer ? esc(p.answer) : '<span class="sub">비어 있음 — 논증 설계도에서 적으세요</span>'}</p></div></div>
      ${p.gap ? `<div><span class="lbl">차별성</span><p>${esc(p.gap)}</p></div>` : ''}<div class="tools-row"><button class="linkish" data-act="go" data-v="arg">논증 설계도에서 고치기</button></div></section>`;
  UI.view().innerHTML = `<div class="page wide">
    <div class="notes-head"><h1>집필</h1><div class="tools">${out.length ? '<button class="btn primary" data-act="w-export">내보내기</button>' : ''}<button class="btn" data-act="sec-add" data-lv="1">+ 장</button></div></div>
    ${out.length ? `<p class="w-total" id="w-total">${totalLabel(out)}</p>` : ''}
    ${out.length >= 3 ? `<label class="w-jump"><span>장·절로 가기</span><select id="w-jump"><option value="">— 고르세요 —</option>${out.map((x, i) => `<option value="${x.id}">${'\u3000'.repeat(Math.max(0, (x.lv || 1) - 1))}${esc(nums[i])} ${esc(short(x.title || '(제목 없음)', 28))} · ${fmt(counts(x.text)[0])}자</option>`).join('')}</select></label>` : ''}
    <p class="sub">장·절을 세우고, 논증 설계도의 주장과 노트 카드를 배치합니다. <b>내보내기</b>를 누르면 개요·초고·배치한 자료가 한글 파일(.hwpx)이 되고, 〔카드 n〕과 연결한 근거는 박사학위논문 양식의 <b>진짜 각주</b>가 됩니다. 같은 문헌이 다시 나오면 ‘앞의 논문’으로 줄입니다.</p>
    ${qa}
    ${out.length ? `<div class="outline">${out.map(sec).join('')}</div>` : `<section class="box empty-start"><h2 class="bh">개요를 세웁니다</h2><p>그동안의 논문에서 되풀이된 흐름(서론 → 현황 → 판례 → 비교법 → 개선방안 → 결론)으로 시작하거나, 빈 장부터 세울 수 있습니다.</p><ol class="plain">${PORTRAIT.flow.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><div class="tools-row"><button class="btn primary" data-act="w-template">내 논문 틀로 시작</button><button class="btn" data-act="sec-add" data-lv="1">빈 장 하나로 시작</button></div></section>`}
    ${out.length && (loose.length || looseCards.length) ? `<section class="box"><h2 class="bh">아직 배치하지 않은 자료</h2>
      ${loose.length ? `<p class="sub">핵심 주장 ${loose.length}개</p><ul class="plain">${loose.map((c) => `<li>${esc(short(c.text || '이름 없는 주장', 80))}</li>`).join('')}</ul>` : ''}
      ${looseCards.length ? `<p class="sub">노트 카드 ${looseCards.length}개: ${looseCards.slice(0, 30).map((c) => `카드 ${c.no}`).join(', ')}${looseCards.length > 30 ? ' …' : ''}</p>` : ''}
      <p class="sub">장·절의 <b>+ 주장·카드 배치</b>로 넣으세요. 배치하지 않은 자료는 내보낼 때 빠집니다.</p></section>` : ''}
  </div>`;
}
// 초고 글자 수: 〔카드 n〕 표시는 내보낼 때 각주 번호가 되므로 세지 않는다. 공백 포함·제외를 함께 보여 준다.
const bodyOf = (t) => String(t || '').replace(/〔\s*카드\s*\d+\s*〕/g, '');
const counts = (t) => { const b = bodyOf(t); return [b.replace(/\n/g, '').length, b.replace(/\s/g, '').length]; };
const fmt = (n) => n.toLocaleString('ko-KR');
function countLabel(t) { const [a, b] = counts(t); return a ? `${fmt(a)}자 · 공백 제외 ${fmt(b)}자` : ''; }
function totalLabel(out) {
  let a = 0, b = 0; for (const x of out) { const [i, j] = counts(x.text); a += i; b += j; }
  return `초고 합계 <b>${fmt(a)}자</b> · 공백 제외 ${fmt(b)}자`;
}
let lastCaret = { id: '', pos: -1 };
document.addEventListener('focusout', (e) => { const t = e.target; if (t && t.dataset && 'secText' in t.dataset) lastCaret = { id: t.closest('[data-sec]').dataset.sec, pos: t.selectionStart }; });
let secT = 0;
const saveSoon = () => { clearTimeout(secT); secT = setTimeout(() => saveProject(S.project), 500); };
ON_INPUT.push((t) => {
  const box = t.closest && t.closest('[data-sec]'); if (!box || !t.dataset || !('secText' in t.dataset || 'secTitle' in t.dataset)) return false;
  const s = secOf(box.dataset.sec); if (!s) return true;
  if ('secText' in t.dataset) {
    s.text = t.value;
    const c = box.querySelector(`[data-sec-count="${s.id}"]`); if (c) c.textContent = countLabel(s.text);
    const tot = document.getElementById('w-total'); if (tot && S.project) tot.innerHTML = totalLabel(S.project.outline || []);
  } else s.title = t.value;
  saveSoon(); return true;
});
ACT['w-template'] = async () => {
  const p = S.project;
  p.outline = TEMPLATE.map(([lv, title, hint]) => ({ id: uid(), lv, title, hint, text: '', claims: [], cards: [] }));
  const first = p.outline[0], last = p.outline[p.outline.length - 1];
  first.text = [p.question && `[연구 질문] ${p.question}`, p.gap && `[차별성] ${p.gap}`].filter(Boolean).join('\n\n');
  last.text = p.answer ? `[답] ${p.answer}` : '';
  logEvent(p, '집필: 내 논문 틀로 개요를 세움'); if (p.stage === 'idea' || p.stage === 'reading' || p.stage === 'design') p.stage = 'writing';
  await saveProject(p); viewWrite();
};
ACT['sec-add'] = async (el) => {
  const p = S.project, lv = +el.dataset.lv || 1, box = el.closest('[data-sec]');
  const s = { id: uid(), lv, title: '', text: '', claims: [], cards: [] };
  if (!box) p.outline.push(s);
  else { // after this section and everything under it
    let i = p.outline.findIndex((x) => x.id === box.dataset.sec), base = p.outline[i].lv; i++;
    while (i < p.outline.length && p.outline[i].lv > base) i++;
    p.outline.splice(i, 0, s);
  }
  await saveProject(p); viewWrite();
  setTimeout(() => { const t = $(`#st-${s.id}`); if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); } }, 30);
};
const secIdx = (el) => S.project.outline.findIndex((x) => x.id === el.closest('[data-sec]').dataset.sec);
const blockEnd = (o, i) => { let j = i + 1; while (j < o.length && o[j].lv > o[i].lv) j++; return j; };
ACT['sec-del'] = async (el) => {
  const p = S.project, i = secIdx(el), s = p.outline[i]; if (!s) return;
  const j = blockEnd(p.outline, i), n = j - i;
  if ((s.text || '').trim() || n > 1 || (s.claims || []).length || (s.cards || []).length) { if (!(await confirmBox(n > 1 ? `이 장과 그 아래 ${n - 1}개 절을 지울까요? 쓴 초고도 함께 지워집니다.` : '이 장·절을 지울까요? 쓴 초고도 함께 지워집니다.', '지우기'))) return; }
  p.outline.splice(i, n); await saveProject(p); viewWrite();
};
const moveSec = async (el, dir) => { // moves the section with everything under it, past a whole neighbouring block of the same level
  const o = S.project.outline, i = secIdx(el), lv = o[i].lv, j = blockEnd(o, i), block = o.slice(i, j);
  if (dir < 0) { let k = i - 1; while (k >= 0 && o[k].lv > lv) k--; if (k < 0 || o[k].lv < lv) return; o.splice(i, j - i); o.splice(k, 0, ...block); }
  else { if (j >= o.length || o[j].lv < lv) return; const e = blockEnd(o, j); o.splice(i, j - i); o.splice(e - block.length, 0, ...block); }
  await saveProject(S.project); viewWrite();
};
ACT['sec-up'] = (el) => moveSec(el, -1); ACT['sec-down'] = (el) => moveSec(el, 1);
ACT['sec-lv'] = async (el) => { const s = S.project.outline[secIdx(el)]; if (!s) return; s.lv = Math.min(3, Math.max(1, s.lv + +el.dataset.d)); await saveProject(S.project); viewWrite(); };
ACT['sec-unclaim'] = async (el) => { const s = secOf(el.closest('[data-sec]').dataset.sec); s.claims = (s.claims || []).filter((x) => x !== el.dataset.id); await saveProject(S.project); viewWrite(); };
ACT['sec-uncard'] = async (el) => { const s = secOf(el.closest('[data-sec]').dataset.sec); s.cards = (s.cards || []).filter((x) => x !== el.dataset.id); await saveProject(S.project); viewWrite(); };
ACT['sec-ins'] = (el) => {
  const box = el.closest('[data-sec]'), ta = $('[data-sec-text]', box), s = secOf(box.dataset.sec); if (!ta || !s) return;
  const mark = `〔카드 ${el.dataset.no}〕`;
  const pos = lastCaret.id === s.id && lastCaret.pos >= 0 ? lastCaret.pos : ta.value.length;
  ta.value = ta.value.slice(0, pos) + mark + ta.value.slice(pos); s.text = ta.value; saveSoon();
  lastCaret = { id: s.id, pos: pos + mark.length };
  ta.focus(); ta.setSelectionRange(pos + mark.length, pos + mark.length);
};
ACT['sec-place'] = (el) => {
  const p = S.project, s = secOf(el.closest('[data-sec]').dataset.sec); if (!s) return;
  const claims = p.arg.filter((n) => n.kind === 'claim'), cards = projCards(p);
  const elsewhere = (id, k) => p.outline.find((x) => x !== s && (x[k] || []).includes(id));
  const m = modal(`<h2>‘${esc(s.title || '이 장·절')}’에 배치</h2>
    <div class="seg" role="tablist"><button class="on" data-tab="c">주장 ${claims.length}</button><button data-tab="k">노트 카드 ${cards.length}</button></div>
    <div data-pane="c">${claims.length ? `<div class="pick">${claims.map((c) => { const o = elsewhere(c.id, 'claims'); return `<label class="pick-row"><input type="checkbox" value="${c.id}"${(s.claims || []).includes(c.id) ? ' checked' : ''}><span>${esc(short(c.text || '이름 없는 주장', 120))}<small>근거 ${kidsOf(p, c.id).filter((x) => x.kind === 'ground').length}개 · 반론 ${kidsOf(p, c.id).filter((x) => x.kind === 'counter').length}개${o ? ` · ‘${esc(o.title || '다른 장')}’에도 배치됨` : ''}</small></span></label>`; }).join('')}</div>` : '<p class="find-none">논증 설계도에 핵심 주장이 없습니다.</p>'}</div>
    <div data-pane="k" hidden>${cards.length ? `<div class="pick">${cards.map((c) => { const d = c.docId ? docOf(c.docId) : null, o = elsewhere(c.id, 'cards'); return `<label class="pick-row"><input type="checkbox" value="${c.id}"${(s.cards || []).includes(c.id) ? ' checked' : ''}><span>카드 ${c.no} · ${c.quote ? `“${esc(short(c.quote, 100))}”` : esc(short(c.memo || '메모', 100))}<small>${d ? esc(`${d.author || d.title} · ${where(d, c.page).ui}`) : '메모 카드(출처 없음)'}${o ? ` · ‘${esc(o.title || '다른 장')}’에도 배치됨` : ''}</small></span></label>`; }).join('')}</div>` : '<p class="find-none">이 연구의 노트 카드가 없습니다.</p>'}</div>
    <div class="modal-foot"><button class="btn" data-close>취소</button><button class="btn primary" id="sp-ok">배치</button></div>`);
  $$('[data-tab]', m.el).forEach((b) => b.addEventListener('click', () => { $$('[data-tab]', m.el).forEach((x) => x.classList.toggle('on', x === b)); $$('[data-pane]', m.el).forEach((x) => { x.hidden = x.dataset.pane !== b.dataset.tab; }); }));
  $('#sp-ok', m.el).addEventListener('click', async () => {
    s.claims = $$('[data-pane="c"] input:checked', m.el).map((x) => x.value); s.cards = $$('[data-pane="k"] input:checked', m.el).map((x) => x.value);
    await saveProject(p); m.close(); viewWrite();
  });
};

/* ---------- 내보내기: 개요 → 문단 목록(각주 자리 〔@k〕) → 한글·Word·마크다운 ---------- */
async function draftItems(p, opt) {
  const items = [], nums = sectionNumbers(p.outline); let dropped = 0, needLib = false;
  const cardRef = (c) => (c && c.docId && docOf(c.docId) ? { doc: docOf(c.docId), page: c.page } : null);
  const refOf = (r) => {
    if (r.t === 'card') return cardRef(S.cards.find((x) => x.id === r.id));
    if (r.t === 'doc') return docOf(r.id) ? { doc: docOf(r.id), page: r.page || 0 } : null;
    if (r.t === 'case') { needLib = true; return { case: r.key }; }
    return null;
  };
  for (const [i, s] of p.outline.entries()) {
    items.push({ t: s.lv === 1 ? 'h1' : s.lv === 2 ? 'h2' : 'h3', text: `${nums[i]} ${s.title || '(제목 없음)'}`, refs: [] });
    for (const para of String(s.text || '').split(/\n\s*\n|\n/).map((x) => x.trim()).filter(Boolean)) {
      const refs = [];
      const text = para.replace(CARD_MARK, (_, n) => { const r = cardRef(cardByNo(p, +n)); if (!r) { dropped++; return ''; } refs.push(r); return `〔@${refs.length - 1}〕`; });
      items.push({ t: 'p', text, refs });
    }
    if (opt.claims) for (const id of s.claims || []) {
      const c = nodeOf(p, id); if (!c) continue;
      const walk = (n, depth) => {
        const refs = [], laws = [];
        for (const r of n.refs || []) { if (r.t === 'law') { laws.push(r.key); continue; } const x = refOf(r); if (x) refs.push(x); }
        items.push({ t: 'p', text: `${'　'.repeat(depth)}${depth ? '· ' : '▶ '}${KIND[n.kind]}: ${n.text || ''}${laws.length ? ` (${laws.join(', ')})` : ''}${refs.map((_, k) => `〔@${k}〕`).join('')}`, refs, skel: true });
        kidsOf(p, n.id).forEach((k) => walk(k, depth + 1));
      };
      walk(c, 0);
    }
    if (opt.cards) for (const id of s.cards || []) {
      const c = S.cards.find((x) => x.id === id); if (!c) continue;
      if ([...String(s.text || '').matchAll(CARD_MARK)].some((m) => +m[1] === c.no)) continue; // already cited in the draft itself
      const r = cardRef(c);
      if (c.quote) items.push({ t: 'quote', text: `“${c.quote.replace(/\s+/g, ' ')}”${r ? '〔@0〕' : ''}`, refs: r ? [r] : [] });
      if (c.memo && c.memo.trim()) items.push({ t: 'small', text: `[카드 ${c.no} 메모] ${c.memo.trim()}${!c.quote && r ? '〔@0〕' : ''}`, refs: !c.quote && r ? [r] : [] });
    }
  }
  // 참고문헌: the library documents the draft cites
  const citedDocs = [...new Map(items.flatMap((it) => it.refs.filter((r) => r.doc).map((r) => [r.doc.id, r.doc]))).values()];
  const refDocs = citedDocs.filter((d) => (d.cite || {}).kind !== 'case');
  if (opt.refs !== false && refDocs.length) {
    const list = buildRefList(refDocs.map(docCitation), rangeFromLibrary);
    items.push({ t: 'h1', text: '참고문헌', refs: [] }, ...refBlocks(list).map((b) => ({ t: b.t === 'h1' ? 'h2' : b.t === 'h2' ? 'h3' : 'p', text: b.text, refs: [] })));
  }
  // footnotes in reading order, so the second time a work comes back it is “앞의 논문”
  const lib = needLib ? await libLoad() : null, cite = citer();
  for (const it of items) it.notes = it.refs.map((r) => (r.case ? caseCite(r.case, lib).text : cite(r.doc, r.page)));
  return { items, dropped };
}
function toHwpxBlocks(p, items) {
  return [{ t: 'title', text: p.title }, ...items.map((it) => ({ t: it.t, text: it.text.replace(/〔@(\d+)〕/g, '〔n:$1〕'), notes: it.notes }))];
}
function toDocx(p, items) {
  const sections = []; let cur = null;
  for (const it of items) {
    if (it.t === 'h1' || !cur) { cur = { heading: it.t === 'h1' ? it.text : '', md: '', notes: [] }; sections.push(cur); if (it.t === 'h1') continue; }
    const base = cur.notes.length; cur.notes.push(...it.notes);
    const text = it.text.replace(/〔@(\d+)〕/g, (_, k) => `〔c${base + +k + 1}〕`).replace(/^([#>]|\d+[.)]\s|[-*+•]\s)/, '​$1');
    cur.md += (it.t === 'h2' ? `## ${text}` : it.t === 'h3' ? `### ${text}` : it.t === 'quote' ? `> ${text}` : text) + '\n\n';
  }
  return buildDocx({ title: p.title, subtitle: `${kdate()} 초고`, sections, creator: AUTHOR });
}
function toMd(p, items) {
  let n = 0; const foot = [];
  const body = items.map((it) => { const t = it.text.replace(/〔@(\d+)〕/g, (_, k) => { foot.push(it.notes[+k]); return `[^${++n}]`; }); return it.t === 'h1' ? `## ${t}` : it.t === 'h2' ? `### ${t}` : it.t === 'h3' ? `#### ${t}` : it.t === 'quote' ? `> ${t}` : t; }).join('\n\n');
  return `# ${p.title}\n\n${body}\n\n${foot.map((f, i) => `[^${i + 1}]: ${f}`).join('\n')}\n`;
}
ACT['w-export'] = () => {
  const p = S.project;
  const m = modal(`<h2>내보내기</h2><p class="sub">개요와 초고, 배치한 자료를 한 파일로 냅니다. 각주는 박사학위논문 양식이고, 두 번째부터 ‘앞의 논문’으로 줄입니다. 판례 각주의 선고일은 서재 문헌에 적힌 것을 쓰고, 찾지 못하면 ○로 비워 둡니다.</p>
    <label class="ck"><input type="checkbox" id="we-claims" checked> 배치한 주장·근거·반론을 골격으로 넣기(▶ 주장, · 근거 …)</label>
    <label class="ck"><input type="checkbox" id="we-refs" checked> 인용한 서재 문헌으로 참고문헌 붙이기(국내자료 단행본·학술연구, 국외자료, 가나다순)</label>
    <label class="ck"><input type="checkbox" id="we-cards" checked> 배치한 카드의 인용문과 메모 넣기(본문에 〔카드 n〕으로 쓴 카드는 각주로만)</label>
    <div class="modal-foot"><button class="btn" data-close>닫기</button><button class="btn" data-fmt="md">마크다운</button><button class="btn" data-fmt="docx">Word(.docx)</button><button class="btn primary" data-fmt="hwpx">한글(.hwpx)</button></div>
    <p class="sub">한글 2014 이후(한컴오피스·한글 뷰어)에서 .hwpx를 엽니다. 열리지 않으면 Word 파일을 한글에서 불러오세요(각주도 함께 옵니다).</p>`);
  $$('[data-fmt]', m.el).forEach((b) => b.addEventListener('click', async () => {
    const fmt = b.dataset.fmt, opt = { claims: $('#we-claims', m.el).checked, cards: $('#we-cards', m.el).checked, refs: $('#we-refs', m.el).checked };
    try {
      const { items, dropped } = await draftItems(p, opt), name = `${safeName(p.title, '초고')} 초고 ${kdate().replace(/\s/g, '').replace(/\.$/, '')}`;
      const nNotes = items.reduce((n, it) => n + it.notes.length, 0);
      if (fmt === 'hwpx') download(`${name}.hwpx`, await buildHwpx(await skeleton(), { title: p.title, author: AUTHOR, blocks: toHwpxBlocks(p, items) }), HWPX_MIME);
      else if (fmt === 'docx') download(`${name}.docx`, toDocx(p, items), DOCX_MIME);
      else download(`${name}.md`, toMd(p, items), 'text/markdown;charset=utf-8');
      logEvent(p, `집필: 초고를 ${fmt === 'hwpx' ? '한글' : fmt === 'docx' ? 'Word' : '마크다운'} 파일로 냄(각주 ${nNotes}개)`); saveProject(p);
      m.close(); toast(`각주 ${nNotes}개를 단 초고를 냈습니다.${dropped ? ` 출처가 없는 〔카드 n〕 ${dropped}곳은 뺐습니다.` : ''}`);
    } catch (e) { toast('파일을 만들지 못했습니다: ' + (e.message || e)); }
  }));
};

/* the article's own page range, from the library document of the same title (its 정보 ‘쪽 범위’) */
function rangeFromLibrary(c) {
  if (c.doc) { const d = docOf(c.doc); return d && d.cite && d.cite.pages ? d.cite.pages : ''; }
  const d = S.docs.find((x) => { const k = titleKey(x.title); return k && (k === c.key || (k.length >= 8 && c.key.length >= 8 && (k.includes(c.key) || c.key.includes(k)))); });
  return d && d.cite && d.cite.pages ? d.cite.pages : '';
}
/* the reference list as 한글 blocks, in the dissertation's sections */
function refBlocks(list) {
  const out = [];
  if (list.books.length || list.papers.length) {
    out.push({ t: 'h1', text: 'Ⅰ. 국내자료' });
    if (list.books.length) out.push({ t: 'h2', text: '1. 단행본' }, ...list.books.map((e) => ({ t: 'p', text: e.text })));
    if (list.papers.length) out.push({ t: 'h2', text: `${list.books.length ? 2 : 1}. 학술연구` }, ...list.papers.map((e) => ({ t: 'p', text: e.text })));
  }
  if (list.foreign.length) out.push({ t: 'h1', text: `${list.books.length || list.papers.length ? 'Ⅱ' : 'Ⅰ'}. 국외자료` }, ...list.foreign.map((e) => ({ t: 'p', text: e.text })));
  return out;
}
const refCount = (l) => l.books.length + l.papers.length + l.foreign.length;
const refText = (l) => refBlocks(l).map((b) => (b.t === 'p' ? b.text : `\n${b.text}`)).join('\n').trim();

/* ================= 원고 점검 ================= */
let MS = null, REPORT = null, checking = false;
async function pdfParas(bytes) {
  const doc = await pdfOpen(bytes); const pages = [];
  try { for (let i = 1; i <= doc.numPages; i++) { const tc = await (await doc.getPage(i)).getTextContent(); pages.push(tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : '')).join('')); } } finally { doc.destroy(); }
  return linesToParas(bodyOfPages(pages).split('\n'));
}
function linesToParas(lines) { // a line that ends a sentence, or a heading, closes a paragraph
  const out = []; let cur = '';
  for (const raw of lines) {
    const l = raw.replace(/\s+/g, ' ').trim(); if (!l) { if (cur) { out.push(cur); cur = ''; } continue; }
    if (/^-?\s*\d{1,4}\s*-?$/.test(l)) continue; // page numbers
    const head = l.length <= 60 && (TOP_RE.test(l) || /^\d{1,2}\.\s+\S/.test(l) && !/[다요]\.$/.test(l));
    if (head) { if (cur) out.push(cur); out.push(l); cur = ''; continue; }
    cur = cur ? cur + ' ' + l : l;
    const open = (re) => (cur.match(re) || []).length;
    if (/[다요음]\.[”’)]?$/.test(l) && open(/“/g) === open(/”/g) && open(/\(/g) === open(/\)/g)) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur); return out;
}
async function readManuscript(src) {
  if (src.file) {
    const f = src.file, ext = (f.name.split('.').pop() || '').toLowerCase(), name = f.name.replace(/\.[^.]+$/, '');
    if (ext === 'hwp' || ext === 'hwpx') { const r = await readHangul(await f.arrayBuffer(), f.name); return { name, kind: 'hwp', paras: r.paras, notes: r.notes }; }
    if (ext === 'pdf') return { name, kind: 'pdf', paras: await pdfParas(await f.arrayBuffer()), notes: [] };
    if (['txt', 'md', 'text'].includes(ext)) return { name, kind: 'text', paras: (await f.text()).replace(/\r/g, '').split(/\n/).map((x) => x.trim()).filter(Boolean), notes: [] };
    throw new Error('한글(.hwp·.hwpx), PDF, 텍스트 원고만 점검할 수 있습니다.');
  }
  const d = docOf(src.docId); if (!d) throw new Error('문헌을 찾을 수 없습니다.');
  if (d.kind === 'hwp') { const full = await DB.get('docs', d.id); if (full && full.bytes) { const r = await readHangul(full.bytes, d.title + '.hwp'); return { name: d.title, kind: 'hwp', paras: r.paras, notes: r.notes, docId: d.id }; } }
  const pg = await docPages(d.id); if (!pg) throw new Error('문헌을 읽지 못했습니다.');
  return { name: d.title, kind: d.kind === 'pdf' ? 'pdf' : 'text', paras: linesToParas(bodyOfPages(pg.pages).split('\n')), notes: [], docId: d.id };
}
const STOP = new Set(['그리고', '그러나', '하는', '있는', '것은', '것이', '위한', '대한', '대하여', '통한', '어떻게', '무엇', '어떤', '있는가', '하는가', '되어야', '하여야', '것인가', '관한', '따른', '경우', '이러한', '그러한', '필요', '필요가']);
const VERBISH = /(하|되|있|없|가진|진|한|된|할|될|함|하여|되어|어야|아야|는가|는지|인가|이다|하다|된다|한다|해야|에서|으로|처럼|이며|이고|지만|면서)$/;
const keyWords = (s) => [...new Set((String(s || '').match(/[가-힣A-Za-z]{2,}/g) || []).map((w) => w.replace(/(에서는|에서|으로는|으로|에는|에게|와의|과의|이라는|라는|에|의|은|는|이|가|을|를|와|과|도|만|로|라)$/, '')).filter((w) => w.length >= 2 && !STOP.has(w) && !VERBISH.test(w)))];
const TOC_PARA = /(\t\s*\d{1,3}\s*$|\.{4,}|·{4,}|…{2,})/;
const JANG = /^\s*제\s*\d+\s*장(?=\s)/;
function topSections(paras) { // chapters (제1장) when the manuscript has them, otherwise Ⅰ. Ⅱ.
  const out = []; let cur = { head: '', paras: [] };
  const isHead = paras.some((t) => t.trim().length <= 80 && JANG.test(t)) ? (s) => JANG.test(s) : (s) => TOP_RE.test(s);
  paras.forEach((t, i) => { const s = t.trim(); if (s && s.length <= 80 && isHead(s)) { if (cur.head || cur.paras.length) out.push(cur); cur = { head: s, at: i, paras: [] }; } else cur.paras.push(t); });
  out.push(cur); return out.filter((x) => x.head || x.paras.join('').trim().length > 200);
}
async function runCheck(src) {
  const p = S.project, issues = [];
  const add = (cat, level, msg, extra = {}) => issues.push({ cat, level, msg, ...extra });
  const ms = await readManuscript(src); MS = ms;
  // the table of contents and the reference list are not prose: blanked (so paragraph numbers stay as in the file)
  const paras = proseOf(ms.paras), notes = ms.notes;
  const body = paras.join('\n'), bodyClean = body.replace(/〔주\d+〕/g, '');
  if (bodyClean.replace(/\s+/g, '').length < 200) throw new Error('원고에서 읽을 수 있는 글자가 거의 없습니다(스캔본이거나 암호가 걸린 파일일 수 있습니다).');
  const heads = manuscriptHeads(paras), secs = topSections(paras), sents = sentencesOf(bodyClean);
  // 1. 질문과 답
  const intro = secs.find((x) => /서\s*론|머리말|들어가며|문제의\s*제기/.test(x.head)) || secs[0], concl = [...secs].reverse().find((x) => /결\s*론|맺음말|나가며|마치며|결\s*어/.test(x.head)) || secs[secs.length - 1];
  const cover = (q, sec) => { const ws = keyWords(q), t = sec ? sec.paras.join(' ') : ''; const miss = ws.filter((w) => !t.includes(w)); return { ws, miss, r: ws.length ? 1 - miss.length / ws.length : 1 }; };
  if (p.question) { const c = cover(p.question, intro); if (c.r < 0.5) add('qa', 'warn', `서론${intro && intro.head ? `(${intro.head})` : ''}에 연구 질문의 핵심 낱말이 잘 보이지 않습니다. 빠진 낱말: ${c.miss.slice(0, 8).join(', ')}`); else add('qa', 'ok', `서론에 연구 질문의 핵심 낱말 ${c.ws.length - c.miss.length}/${c.ws.length}개가 있습니다.`); }
  else add('qa', 'info', '이 연구의 연구 질문이 비어 있어 서론과 맞춰 보지 못했습니다(논증 설계도에서 적으세요).');
  if (p.answer) { const c = cover(p.answer, concl); if (c.r < 0.5) add('qa', 'warn', `결론${concl && concl.head ? `(${concl.head})` : ''}에 연구 질문에 대한 답의 핵심 낱말이 잘 보이지 않습니다. 빠진 낱말: ${c.miss.slice(0, 8).join(', ')}`); else add('qa', 'ok', `결론에 답의 핵심 낱말 ${c.ws.length - c.miss.length}/${c.ws.length}개가 있습니다.`); }
  // 2. 인용문을 서재의 원문과 대조
  const lib = await libLoad(), self = ms.docId || '';
  const usable = (d) => d && !excluded(d) && d.id !== self;
  const prior = lib.docs.filter((x) => { const d = docOf(x.id); return usable(d) && !d.mine; }), mine = lib.docs.filter((x) => { const d = docOf(x.id); return usable(d) && d.mine; });
  // a document in the library that is this very manuscript (or a version of it) is left out of every comparison
  const sim = (sources) => { const hits = similarSentences(sents, sources, 2); const per = new Map(); for (const h of hits) per.set(h.doc, (per.get(h.doc) || 0) + 1); const same = [...per].filter(([, n]) => n > Math.max(8, sents.length * 0.3)).map(([id]) => id); return { hits: hits.filter((h) => !same.includes(h.doc)), same }; };
  const sp = sim(prior), sm = sim(mine), sameIds = new Set([...sp.same, ...sm.same]);
  const sources = [...prior, ...mine].filter((x) => !sameIds.has(x.id));
  const STATUTE = /(제\s*\d+\s*(?:조(?:의\s*\d+)?|항|호)|전문[은의에이]?|헌장|헌법[은이의]|법률[은이]?|법률안|의안|제안\)|주문|선고|규정하고|규정은|조항은|명시하고|위임과|발의|당시|권리는)[^“”]{0,60}$|[”"][,.]?\s*(?:라고|라며|라는)?[,.]?\s*$/;
  const quotes = quotesIn(paras).slice(0, 250); let qFound = 0;
  for (const q of quotes) {
    const hit = findQuote(q.text, sources), note = q.note ? notes[q.note - 1] || '' : '';
    const pt = paras[q.para] || '', at0 = pt.indexOf(q.text), statute = at0 > 0 && STATUTE.test(pt.slice(Math.max(0, at0 - 60), at0 - 1));
    const snip = `“${short(q.text, 60)}”`;
    if (!hit) { add('quote', 'info', `${snip} — 서재에서 원문을 찾지 못했습니다(서재에 없는 문헌이거나, 인용문이 원문과 다릅니다).`, { para: q.para }); continue; }
    qFound++;
    const d = docOf(hit.doc), w = where(d, hit.page), np = notePages(note);
    const at = `「${short(d.title, 30)}」 ${w.ui}`;
    if (!hit.exact && !statute) add('quote', 'warn', `${snip} — 원문(${at})과 글자가 조금 다릅니다. 인용문을 원문 그대로 옮겼는지 확인하세요.`, { para: q.para, doc: d.id, page: hit.page });
    if (ms.kind === 'hwp' && !q.note && !statute) add('quote', 'info', `${snip} — 인용한 문장 뒤에 각주가 보이지 않습니다(법령·의안·주문을 옮긴 것이면 괜찮습니다). 같은 문장이 ${at}에 있습니다`, { para: q.para, doc: d.id, page: hit.page });
    if (note && !statute && q.text.length >= 40 && !['again', 'case'].includes(noteKind(note)) && d.author) { const sur = d.author.split(/[·,\s]/)[0]; if (sur.length >= 2 && !note.includes(sur)) add('quote', 'bad', `${snip} — 각주 ${q.note}에는 ${sur}이(가) 없는데, 이 문장은 ${d.author}의 ${at}에 있습니다. 출처를 확인하세요.`, { para: q.para, doc: d.id, page: hit.page }); }
    if (np && w.known) { const a = hit.page + +d.page1 - 1; if (a + 1 < np.a || a > np.b) add('quote', 'bad', `${snip} — 각주 ${q.note}의 쪽(${np.a === np.b ? np.a : `${np.a}-${np.b}`}면)과 원문의 쪽(${a}면)이 다릅니다.`, { para: q.para, doc: d.id, page: hit.page }); }
    else if (np && !w.known && d.kind === 'pdf') add('quote', 'info', `${snip} — 원문은 「${short(d.title, 30)}」 PDF ${hit.page}쪽입니다. 서재에서 이 문헌의 첫 쪽 번호를 적으면 각주의 쪽수(○면)까지 대조합니다.`, { para: q.para, doc: d.id, page: hit.page });
  }
  if (quotes.length) add('quote', 'ok', `“큰따옴표” 인용 ${quotes.length}개 가운데 ${qFound}개의 원문을 서재에서 찾았습니다.`);
  // 3. 각주 형식
  if (ms.kind === 'hwp') { for (const x of noteChecks(notes, body)) add('note', x.kind === 'again' || x.kind === 'ambig' ? 'bad' : 'warn', `각주 ${x.no}: ${x.msg}`, { note: x.no }); add('note', 'ok', `각주 ${notes.length}개를 읽었습니다.`); }
  else add('note', 'info', 'PDF·텍스트 원고는 각주가 본문과 섞여 있어 각주 형식은 점검하지 않습니다. 한글 파일(.hwp·.hwpx)로 점검하면 각주를 따로 읽습니다.');
  // 4. 본문 형식과 용어
  for (const x of bodyChecks(paras)) add('body', x.kind === 'space' ? 'info' : 'warn', x.msg, { para: x.para });
  for (const t of p.terms || []) {
    const n0 = bodyClean.split(t.term).length - 1, vars = String(t.variants || '').split(/[,，]/).map((x) => x.trim()).filter((x) => x && x !== t.term);
    const used = vars.map((v) => [v, bodyClean.split(v).length - 1 - (v.length < t.term.length && t.term.includes(v) ? n0 : 0)]).filter(([, n]) => n > 0);
    if (used.length) add('body', 'warn', `개념 ‘${t.term}’(${n0}곳)을 ${used.map(([v, n]) => `‘${v}’(${n}곳)`).join(', ')}로도 썼습니다. 정의한 이름으로 맞추거나, 줄여 부른다고 밝히세요.`);
    else if (!n0) add('body', 'info', `논증 설계도에 정의한 개념 ‘${t.term}’이 원고에 나오지 않습니다.`);
  }
  // 5. 반론 검토: 장마다
  const midSecs = secs.filter((x) => x.head && x !== intro && x !== concl);
  for (const s of midSecs) { const n = sentencesOf(s.paras.join(' ')).filter((x) => COUNTER_RE.test(x)).length; if (!n) add('counter', 'warn', `${s.head}: 반대 견해나 예상 반론을 다루는 문장이 보이지 않습니다.`); else add('counter', 'ok', `${s.head}: 반론을 다루는 문장 ${n}개`); }
  if (!midSecs.length) { const n = sents.filter((x) => COUNTER_RE.test(x)).length; add('counter', n ? 'ok' : 'warn', n ? `반론을 다루는 문장 ${n}개` : '반대 견해나 예상 반론을 다루는 문장이 보이지 않습니다.'); }
  // 6. 문체: 평소의 나와 견주기
  const st = styleMetrics(bodyClean);
  const style = Object.keys(BASE).filter((k) => BASE[k] && BASE[k].label).map((k) => { const b = BASE[k], v = st[k]; return { k, label: b.label, unit: b.unit, v, b, out: v < b.lo ? 'low' : v > b.hi ? 'high' : '' }; });
  for (const x of style) if (x.out) add('style', 'info', `${x.label}: ${x.v}${x.unit} — 평소(${x.b.lo}–${x.b.hi}${x.unit})보다 ${x.out === 'high' ? '높습니다' : '낮습니다'}.`);
  const longest = sents.filter((x) => x.length > 250 && !/^[\[<(]?\s*(?:표|그림)\s*\d/.test(x) && !/^[“"]/.test(x)).sort((a, b) => b.length - a.length).slice(0, 6);
  for (const x of longest) add('style', 'info', `${x.length}자 문장: “${short(x, 90)}”`);
  if (st.pilja) add('style', 'info', `‘필자’를 ${st.pilja}번 썼습니다. 평소에는 ‘본 연구’로 지칭합니다.`);
  // 참고문헌: 각주의 첫 인용 ↔ 원고의 참고문헌
  let refs = null;
  if (ms.kind === 'hwp' && notes.length) {
    const cites = noteCitations(notes), listed = parseRefList(ms.paras.map((x) => String(x || '')));
    refs = buildRefList(cites, rangeFromLibrary);
    const noRange = refs.papers.filter((e) => e.c.kind === 'article' && !/\d면\.$/.test(e.text)).length;
    if (listed) {
      const cmp = compareRefs(cites, listed);
      for (const c of cmp.missing) add('refs', 'bad', `각주 ${c.note}에 인용한 ${c.author}, ${c.kind === 'book' || c.kind === 'fbook' ? `『${c.title}』` : `“${short(c.title, 50)}”`}이(가) 참고문헌에 없습니다.`, { note: c.note });
      for (const x of cmp.uncited) add('refs', 'warn', `참고문헌의 ‘${short(x.text, 90)}’을(를) 각주에서 찾지 못했습니다(인용하지 않았거나, 각주에 다르게 적었습니다).`, { para: x.para });
      for (const y of cmp.years) add('refs', 'warn', `${y.c.author}, “${short(y.c.title, 40)}”: 각주 ${y.c.note}에는 ${y.cy}년, 참고문헌에는 ${y.ly}년으로 적었습니다.`, { para: y.l.para });
      if (!cmp.missing.length && !cmp.uncited.length && !cmp.years.length) add('refs', 'ok', `각주에서 인용한 ${cites.length}편과 참고문헌 ${listed.length}편이 서로 맞습니다.`);
      else add('refs', 'ok', `각주에서 인용한 문헌 ${cites.length}편, 참고문헌 ${listed.length}편을 맞춰 보았습니다.`);
    } else add('refs', 'info', `원고에 [참고문헌]이 없습니다. 각주에서 인용한 ${cites.length}편으로 만든 참고문헌을 아래 단추로 받을 수 있습니다.`);
    if (noRange) add('refs', 'info', `만든 참고문헌에서 학술지 논문 ${noRange}편은 논문의 쪽 범위를 몰라 비워 두었습니다(서재에 있는 문헌이면 정보의 ‘논문 쪽 범위’를 적으면 채워집니다).`);
  }
  // 7. 겹치는 문장: 선행연구(인용 표시 없이), 내 글(자기표절)
  for (const id of sameIds) add('sim', 'info', `서재의 「${short((docOf(id) || {}).title, 40)}」은(는) 이 원고와 같은 글로 보여 대조에서 뺐습니다.`);
  for (const h of sp.hits.slice(0, 60)) { const d = docOf(h.doc), quoted = /[“"]/.test(h.sentence); add('sim', quoted ? 'info' : h.n >= 3 ? 'bad' : 'warn', `${quoted ? '(따옴표 안) ' : ''}“${short(h.sentence, 80)}” — 「${short(d.title, 30)}」 ${where(d, h.page).ui}와 7어절 이상 연달아 같은 곳 ${h.n}군데`, { doc: h.doc, page: h.page }); }
  for (const h of sm.hits.slice(0, 40)) { const d = docOf(h.doc); add('sim', 'warn', `내 글 「${short(d.title, 30)}」 ${where(d, h.page).ui}와 겹침(자기표절 확인): “${short(h.sentence, 80)}”`, { doc: h.doc, page: h.page }); }
  if (!sp.hits.length && !sm.hits.length) add('sim', 'ok', `서재의 선행연구 ${prior.length}편과 내 글 ${mine.length}편에서 7어절 이상 연달아 같은 문장을 찾지 못했습니다.`);
  const count = (lv) => issues.filter((x) => x.level === lv).length;
  REPORT = { refs, at: Date.now(), name: ms.name, kind: ms.kind, paras: paras.length, notes: notes.length, chars: bodyClean.replace(/\s+/g, '').length, sentences: sents.length, heads, style, issues, bad: count('bad'), warn: count('warn'), info: count('info'), libDocs: prior.length + mine.length };
  p.checks = (p.checks || []).concat({ at: REPORT.at, name: ms.name, bad: REPORT.bad, warn: REPORT.warn, info: REPORT.info, chars: REPORT.chars, notes: notes.length, avgLen: st.avgLen }).slice(-40);
  logEvent(p, `원고 점검: ‘${ms.name}’ — 고칠 것 ${REPORT.bad}, 살필 것 ${REPORT.warn}`); await saveProject(p);
  return REPORT;
}
const CATS = [['qa', '질문과 답'], ['quote', '인용문과 원문'], ['note', '각주 형식'], ['refs', '참고문헌'], ['body', '본문 형식·용어'], ['counter', '반론 검토'], ['sim', '겹치는 문장'], ['style', '문체']];
const LV = { bad: '고칠 것', warn: '살필 것', info: '참고', ok: '확인' };
function reportHTML(r) {
  const heads = r.heads.slice(0, 40);
  return `<section class="box report"><div class="bh-row"><h2 class="bh">‘${esc(r.name)}’ 점검 결과 <small>${kdt(r.at)}</small></h2><span class="tools-row" style="margin:0">${r.refs && refCount(r.refs) ? `<button class="btn sm" data-act="ck-refs">각주로 만든 참고문헌(한글) ${refCount(r.refs)}편</button><button class="btn sm" data-act="ck-refs-copy">참고문헌 복사</button>` : ''}<button class="btn sm" data-act="ck-copy">결과 복사</button></span></div>
    <div class="score"><span class="s-bad"><b>${r.bad}</b> 고칠 것</span><span class="s-warn"><b>${r.warn}</b> 살필 것</span><span class="s-info"><b>${r.info}</b> 참고</span></div>
    <p class="sub">문단 ${r.paras.toLocaleString()}개 · 문장 ${r.sentences.toLocaleString()}개 · ${r.chars.toLocaleString()}자${r.kind === 'hwp' ? ` · 각주 ${r.notes}개` : ''} · 서재 문헌 ${r.libDocs}편과 대조</p>
    ${heads.length ? `<details class="peek"><summary>읽어 낸 장·절 제목 ${r.heads.length}개</summary><ul class="toc">${heads.map((h) => `<li class="${TOP_RE.test(h.t) ? 'top' : 'sub'}">${esc(h.t)}</li>`).join('')}</ul></details>` : ''}
    ${CATS.map(([k, label]) => { const list = r.issues.filter((x) => x.cat === k); if (!list.length) return ''; const nb = list.filter((x) => x.level === 'bad' || x.level === 'warn').length;
      const rows = list.slice().sort((a, b) => 'bad warn info ok'.indexOf(a.level) - 'bad warn info ok'.indexOf(b.level));
      return `<details class="rp"${nb ? ' open' : ''}><summary>${label} <span class="n">${nb ? `${nb}건` : '이상 없음'}</span></summary><ul class="issues">${rows.slice(0, 120).map((x) => `<li class="${x.level}"><b>${LV[x.level]}</b><span>${esc(x.msg)}${x.para != null ? ` <small>${x.para + 1}번째 문단</small>` : ''}</span>${x.doc && docOf(x.doc) ? `<button class="linkish" data-act="ck-open" data-id="${x.doc}" data-p="${x.page || 1}">원문</button>` : ''}</li>`).join('')}${rows.length > 120 ? `<li class="info"><b>참고</b><span>외 ${rows.length - 120}건</span></li>` : ''}</ul>
        ${k === 'style' ? `<div class="tbl"><table class="st"><thead><tr><th></th><th>이 원고</th><th>평소 범위</th></tr></thead><tbody>${r.style.map((x) => `<tr class="${x.out}"><th>${esc(x.label)}</th><td>${x.v}${x.unit}</td><td>${x.b.lo}–${x.b.hi}${x.unit}</td></tr>`).join('')}</tbody></table></div>` : ''}</details>`; }).join('')}
    <p class="sub">점검은 규칙으로 찾은 후보입니다. 판단은 원고를 쓴 사람이 합니다. 원고는 이 화면에서만 읽고 저장하지 않습니다.</p></section>`;
}
export function viewCheck() {
  const p = S.project; if (!p) return;
  const cand = S.docs.filter((d) => d.indexed && !d.blank).sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.addedAt - a.addedAt);
  UI.view().innerHTML = `<div class="page wide">
    <div class="notes-head"><h1>원고 점검</h1></div>
    <section class="box"><h2 class="bh">원고 고르기</h2>
      <label class="drop" id="ck-drop">한글(.hwp·.hwpx)·PDF·텍스트 원고를 끌어 놓거나 <u>눌러서 고르세요</u><input type="file" id="ck-file" accept=".hwp,.hwpx,.pdf,.txt,.md" class="sr"></label>
      ${cand.length ? `<div class="tools-row"><label class="sr" for="ck-doc">서재의 문헌으로 점검</label><select id="ck-doc"><option value="">또는 서재의 문헌으로 점검…</option>${cand.map((d) => `<option value="${d.id}">${d.mine ? '[내 글] ' : ''}${esc(d.title)}</option>`).join('')}</select></div>` : ''}
      <p class="sub">한글 파일이면 각주까지 따로 읽어 각주 양식과 ‘앞의 논문’을 점검합니다. 인용문은 서재의 원문과 대조하고, 서재의 선행연구·내 글과 7어절 이상 연달아 겹치는 문장을 찾습니다. 연구 질문·답·개념은 이 연구(‘${esc(p.title)}’)의 것과 맞춰 봅니다.</p></section>
    <div id="ck-out">${checking ? '<p class="sub">원고를 읽고 점검하는 중…</p>' : REPORT ? reportHTML(REPORT) : ''}</div>
    ${(p.checks || []).length ? `<section class="box"><h2 class="bh">점검 기록 <small>원고가 나아진 과정</small></h2><div class="tbl"><table class="st"><thead><tr><th>때</th><th>원고</th><th>고칠 것</th><th>살필 것</th><th class="opt">글자</th><th class="opt">각주</th><th class="opt">문장 평균</th></tr></thead><tbody>${p.checks.slice().reverse().map((c) => { const d = new Date(c.at); return `<tr><td class="nw">${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</td><td>${esc(short(c.name, 30))}</td><td>${c.bad}</td><td>${c.warn}</td><td class="opt">${(c.chars || 0).toLocaleString()}</td><td class="opt">${c.notes || '-'}</td><td class="opt">${c.avgLen || '-'}자</td></tr>`; }).join('')}</tbody></table></div></section>` : ''}
  </div>`;
}
async function startCheck(src) {
  if (checking) return; checking = true; REPORT = null;
  const out = $('#ck-out'); if (out) out.innerHTML = '<p class="sub">원고를 읽고 점검하는 중… 서재가 크면 몇십 초 걸릴 수 있습니다.</p>';
  try { await runCheck(src); } catch (e) { toast('점검하지 못했습니다: ' + (e.message || e)); } finally { checking = false; if (S.view === 'check') viewCheck(); }
}
// 장·절 바로가기: 고른 장·절로 옮겨 제목 칸에 커서를 둔다(폰에서 긴 개요를 일일이 넘기지 않도록).
ON_CHANGE.push((t) => {
  if (t.id !== 'w-jump') return false;
  const box = t.value && document.querySelector(`[data-sec="${t.value}"]`);
  if (box) { box.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); const ti = box.querySelector('[data-sec-title]'); if (ti) ti.focus({ preventScroll: true }); }
  t.value = ''; return true;
});
ON_CHANGE.push((t) => {
  if (t.id === 'ck-file') { const f = t.files && t.files[0]; t.value = ''; if (f) startCheck({ file: f }); return true; }
  if (t.id === 'ck-doc') { if (t.value) startCheck({ docId: t.value }); return true; }
  return false;
});
document.addEventListener('dragover', (e) => { const d = e.target.closest && e.target.closest('#ck-drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', (e) => { const d = e.target.closest && e.target.closest('#ck-drop'); if (d) d.classList.remove('over'); });
document.addEventListener('drop', (e) => { const d = e.target.closest && e.target.closest('#ck-drop'); if (!d) return; e.preventDefault(); d.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) startCheck({ file: f }); });
ACT['ck-refs'] = async () => {
  const r = REPORT; if (!r || !r.refs) return;
  download(`${safeName(r.name, '원고')} 참고문헌.hwpx`, await buildHwpx(await skeleton(), { title: '참고문헌', author: AUTHOR, blocks: [{ t: 'title', text: '참고문헌' }, ...refBlocks(r.refs)] }), HWPX_MIME);
};
ACT['ck-refs-copy'] = () => { const r = REPORT; if (r && r.refs) copyText(refText(r.refs), `참고문헌 ${refCount(r.refs)}편을 복사했습니다.`); };
ACT['ck-open'] = (el) => UI.openDoc(el.dataset.id, +el.dataset.p || 1, []);
ACT['ck-copy'] = () => {
  const r = REPORT; if (!r) return;
  const txt = [`원고 점검: ${r.name} (${kdt(r.at)})`, `고칠 것 ${r.bad} · 살필 것 ${r.warn} · 참고 ${r.info}`, ''];
  for (const [k, label] of CATS) { const list = r.issues.filter((x) => x.cat === k && x.level !== 'ok'); if (!list.length) continue; txt.push(`[${label}]`); for (const x of list) txt.push(`- (${LV[x.level]}) ${x.msg}${x.para != null ? ` [${x.para + 1}번째 문단]` : ''}`); txt.push(''); }
  copyText(txt.join('\n'), '점검 결과를 복사했습니다.');
};
export const proseOf = (paras) => { // the paragraphs a style measure reads: no table of contents, no reference list
  const out = paras.map((t) => (String(t).length <= 120 && TOC_PARA.test(t) ? '' : String(t)));
  for (let i = out.length - 1; i > out.length * 0.5; i--) if (/^\s*[\[<【(]?\s*참\s*고\s*문\s*헌\s*[\]>】)]?\s*$/.test(out[i])) { out.fill('', i); break; }
  return out;
};
export { toHwpxBlocks, toDocx, toMd, skeleton };
export const _test = { linesToParas, keyWords, topSections, draftItems, toMd, runCheck, readManuscript };
