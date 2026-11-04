/* YO아이 — 판결 분석 화면. 판결문 파일을 넣거나 붙여 넣으면 judgment.js가 읽은 구조를
   사실관계 · 소송의 경과 · 판결이유 · 쟁점의 초안으로 펼친다. 사용자가 고친 정리는 그 문헌의 기록(judg)에 남고,
   논문의 ‘대상 판결’ 장 모양(심급 판결은 각주)으로 한글·Word·마크다운으로 내보내거나, 노트 카드·판례 평석 연구로 옮긴다.
   판결문 밖의 정보는 쓰지 않는다. */
import { S, DB, ACT, ON_INPUT, ON_CHANGE, UI, JUDG, $, $$, esc, uid, toast, kdate, saveCard, saveProject, logEvent, docOf, docPages, updateDoc, addFiles, modal, confirmBox, download, safeName, copyText, libLoad } from './core.js?v=67b00d6921';
import { analyzeJudgment, isJudgment, defaultEdit, excerptOf, judgmentItems, linkJudgments, OMIT } from './judgment.js?v=67b00d6921';
import { toHwpxBlocks, toDocx, toMd, skeleton, nextCardNo } from './write.js?v=67b00d6921';
import { buildHwpx, HWPX_MIME } from './hwpx.js?v=67b00d6921';
import { DOCX_MIME } from './docx.js?v=67b00d6921';
import { projCards } from './research.js?v=67b00d6921';

const AUTHOR = '안요환';
let CUR = null; // { id, a, e }
const FLAG_CLS = { 법리: 'f-rule', 판단: 'f-eval', 결론: 'f-conc', 주장: 'f-claim', 사실: 'f-fact', 심판대상: 'f-fact' };

async function load(id) {
  if (CUR && CUR.id === id) return CUR;
  const pg = await docPages(id); if (!pg) return null;
  const a = analyzeJudgment(pg.pages);
  const full = await DB.get('docs', id);
  const saved = full && full.judg && full.judg.edit;
  const link = a.ok ? linkJudgments(a, await relatedJudgments(a, id)) : { stages: {}, facts: null, docs: [] };
  const e = saved ? { ...defaultEdit(a, link), ...saved } : defaultEdit(a, link);
  CUR = { id, a, e, saved: !!saved, link };
  // 판결문임이 분명하면 문헌 정보에 판례 인용을 넣어 둔다(사용자가 적은 정보는 건드리지 않는다)
  const d = docOf(id), patch = {};
  if (a.ok && !(d.isJudg)) patch.isJudg = true;
  const sum = a.ok ? { date: a.head.date, court: a.head.court, no: a.head.no, result: a.result, stage: a.stage, issue: (a.issues[0] || {}).text || '' } : null;
  if (sum && JSON.stringify(full.judgSum || {}) !== JSON.stringify(sum)) patch.judgSum = sum;
  if (a.ok && a.cite && !((full.cite || {}).kind)) { patch.cite = { ...(full.cite || {}), kind: 'case', caseCite: a.cite }; if (!full.year && a.head.date) patch.year = a.head.date.slice(0, 4); }
  if (Object.keys(patch).length) await updateDoc(id, patch);
  return CUR;
}
/* 서재에서 같은 사건의 다른 심급 판결문을 찾는다: 사건번호로만 잇는다(원심판결·제1심판결 → 그 판결문 머리의 아래 심급까지 두 단계) */
async function relatedJudgments(a, id) {
  const lib = await libLoad().catch(() => ({ docs: [] }));
  let want = [...new Set(a.stages.filter((s) => !s.me && s.cite && s.cite.no).map((s) => s.cite.no))];
  const others = [], seen = new Set([id]);
  for (let round = 0; round < 2 && want.length; round++) {
    const next = new Set();
    for (const x of lib.docs) {
      if (seen.has(x.id)) continue;
      const head = x.pages.slice(0, 2).join(' ').replace(/\s+/g, '');
      if (!want.some((no) => head.includes(no)) || !isJudgment(x.pages)) continue;
      const a2 = analyzeJudgment(x.pages); if (!a2.ok || !want.includes(a2.head.no)) continue;
      seen.add(x.id); others.push({ id: x.id, a: a2 });
      for (const t of a2.stages) if (!t.me && t.cite && t.cite.no) next.add(t.cite.no);
    }
    want = [...next];
  }
  return others;
}
const saidOf = (c, i) => {
  const st = c.e.stages[i] || {}, own = c.a.stages[i] && c.a.stages[i].me === !!st.me ? c.a.stages[i].said || [] : [];
  const l = (c.link && c.link.stages[i]) || { sugg: [] };
  return [...own.map((x) => ({ ...x, from: '' })), ...l.sugg.map((x) => ({ s: x.s, p: 0, from: x.from, docId: x.docId }))];
};
let saveT = 0;
function saveSoon() {
  const c = CUR; if (!c) return; clearTimeout(saveT);
  saveT = setTimeout(async () => { const v = { edit: c.e, at: Date.now() }; JUDG.set(c.id, v); await updateDoc(c.id, { judg: v, isJudg: true }); c.saved = true; const s = $('#j-saved'); if (s) s.textContent = '고친 내용을 저장했습니다'; }, 600);
}

/* ================= 처음 화면: 넣기 · 붙여 넣기 · 서재의 판결문 ================= */
async function landing() {
  const lib = await libLoad().catch(() => ({ docs: [] }));
  const found = S.docs.filter((d) => d.isJudg || (() => { const x = lib.docs.find((y) => y.id === d.id); return x && x.pages && isJudgment(x.pages); })());
  // 아직 한 번도 열지 않은 판결문도 결과·첫 쟁점을 채워 둔다(판결문 하나에 수십 ms)
  for (const d of found.filter((x) => !x.judgSum).slice(0, 60)) {
    try { const x = lib.docs.find((y) => y.id === d.id); if (!x) continue; const a = analyzeJudgment(x.pages); if (!a.ok) continue; await updateDoc(d.id, { isJudg: true, judgSum: { date: a.head.date, court: a.head.court, no: a.head.no, result: a.result, stage: a.stage, issue: (a.issues[0] || {}).text || '' }, ...(((d.cite || {}).kind) ? {} : { cite: { ...(d.cite || {}), kind: 'case', caseCite: a.cite } }) }); } catch (e) { /* leave it for when it is opened */ }
  }
  if (S.view !== 'judg' || S.judg) return;
  UI.view().innerHTML = `<div class="page wide">
    <div class="notes-head"><h1>판결 분석</h1></div>
    <section class="box jd-intro"><p class="prose">판결문을 넣으면 <b>사실관계 · 소송의 경과 · 판결이유 · 쟁점</b>으로 나누어 정리의 초안을 만듭니다. 심급마다 판결은 각주로 달고, 판결이유는 주요 부분을 그대로 발췌하여 생략한 곳에 ${OMIT}를 넣습니다 — 「불법원인급여에 대한 반환 금지 규정의 개선방안 연구」(2021)의 ‘Ⅱ. 대상 판결’과 같은 모양입니다.</p>
      <p class="sub">대법원·하급심 판결서, 헌법재판소 결정문, 종합법률정보의 【판시사항】【이 유】 양식을 읽습니다. PDF·한글·Word·텍스트 모두 됩니다. 판결문 밖의 정보는 넣지 않으며, 찾지 못한 것은 비워 두고 알려 드립니다. 초안은 고쳐 쓰라고 있는 것입니다.</p>
      <div class="tools-row"><label class="btn primary">판결문 파일 넣기<input type="file" id="j-file" accept=".pdf,.hwp,.hwpx,.docx,.txt,application/pdf,text/plain" class="sr"></label><button class="btn" data-act="j-paste">판결문 붙여 넣기</button></div></section>
    <section class="box"><h2 class="bh">서재의 판결문 <small>${found.length}건</small></h2>
      ${found.length ? `<div class="tbl"><table class="jd-flow"><thead><tr><th>선고일</th><th>법원 · 사건번호</th><th>결과</th><th>첫 쟁점</th></tr></thead><tbody>${found.map((d) => ({ d, j: d.judgSum || {} })).sort((x, y) => String(x.j.date || '9').localeCompare(String(y.j.date || '9'), 'en', { numeric: true })).map(({ d, j }) => `<tr><td>${esc(j.date || '')}</td><td><button class="linkish" data-act="j-open" data-id="${d.id}">${esc(j.no ? `${j.court} ${j.no}` : ((d.cite || {}).caseCite) || d.title)}</button>${JUDG.get(d.id) ? ' <span class="tag">정리함</span>' : ''}</td><td>${esc(j.result || '')}</td><td>${esc(String((JUDG.get(d.id) && JUDG.get(d.id).edit && JUDG.get(d.id).edit.issues && JUDG.get(d.id).edit.issues[0]) || j.issue || '').slice(0, 70))}</td></tr>`).join('')}</tbody></table></div><p class="sub">선고일 순서입니다. 같은 쟁점의 판결을 나란히 넣으면 판례의 흐름이 보입니다. 결과·쟁점은 한 번 열어 본 판결부터 채워집니다.</p>` : '<p class="sub">아직 없습니다. 서재에 넣은 문헌 가운데 주문·이유가 있는 판결문은 여기에 저절로 모입니다.</p>'}</section>
  </div>`;
}
async function takeFile(f) {
  const ids = await addFiles([f], { quiet: false });
  if (!ids.length) return;
  CUR = null; S.judg = ids[0]; UI.show('judg');
}
ON_CHANGE.push((t) => { if (t.id === 'j-file') { const f = t.files && t.files[0]; t.value = ''; if (f) takeFile(f); return true; } return false; });
ACT['j-paste'] = () => {
  const m = modal(`<h2>판결문 붙여 넣기</h2><p class="sub">법원 사이트나 종합법률정보의 판결문 전문을 복사해 붙여 넣으세요. 서재에 텍스트 문헌으로 들어가고 바로 분석합니다.</p>
    <label class="field"><span>판결문 전문</span><textarea id="jp-text" rows="14" placeholder="대 법 원&#10;제 3 부&#10;판 결&#10;사 건 …&#10;주 문&#10;…&#10;이 유&#10;…"></textarea></label>
    <div class="modal-foot"><button class="btn" data-close>닫기</button><button class="btn primary" id="jp-ok">분석하기</button></div>`);
  $('#jp-ok', m.el).addEventListener('click', async () => {
    const text = $('#jp-text', m.el).value.replace(/\r/g, '');
    if (text.replace(/\s/g, '').length < 80) { toast('판결문 전문을 붙여 넣으세요.'); return; }
    const a = analyzeJudgment([text]);
    const name = (a.cite || `붙여 넣은 판결문 ${kdate()}`).replace(/[\\/:*?"<>|]/g, ' ');
    m.close();
    await takeFile(new File([text], `${name}.txt`, { type: 'text/plain' }));
  });
};
ACT['j-open'] = (el) => { CUR = null; S.judg = el.dataset.id; UI.show('judg'); };
ACT['j-back'] = () => { S.judg = null; CUR = null; UI.show('judg'); };
export function openJudgment(id) { CUR = null; S.judg = id; UI.show('judg'); }

/* ================= 분석 화면 ================= */
export async function viewJudg() {
  if (!S.judg || !docOf(S.judg)) { S.judg = null; return landing(); }
  UI.view().innerHTML = '<div class="page wide"><p class="sub">판결문을 읽는 중…</p></div>';
  const c = await load(S.judg); if (!c || S.view !== 'judg') return;
  const { a, e } = c, d = docOf(c.id), H = a.head;
  const pageBtn = (p) => (p ? `<button class="pg-chip" data-act="j-page" data-p="${p}" title="원문의 이 자리">${d.kind === 'pdf' ? `${p}쪽` : `${p}번째 부분`}</button>` : '');
  const parties = H.parties.filter((x) => !x.only).map((x) => `<li><span class="lbl">${esc(x.label)}</span><span>${esc(x.name)}</span></li>`).join('');
  const warn = !a.ok ? `<div class="banner"><span>이 문헌에서 판결문의 짜임(사건번호·주문·이유)을 찾지 못했습니다. 판결문이 맞다면 스캔본일 수 있으니 서재에서 글자 읽기(OCR)를 먼저 하세요.</span></div>` : '';
  const stageBox = (s, i) => {
    const src = { said: saidOf(c, i), me: !!s.me }, ln = (c.link && c.link.stages[i]) || null;
    return `<div class="jd-stage" data-si="${i}">
      <div class="jd-stage-h"><span class="sec-n">${'가나다라마바사'[i] || i + 1}.</span><label class="sr" for="js-t-${i}">심급</label><input id="js-t-${i}" class="sec-t" data-js-title="${i}" value="${esc(s.title)}">${src.me ? '<span class="tag">대상 판결</span>' : ''}</div>
      <label class="field"><span>${src.me ? '대상 판결' : '이 심급의 판결'} <small>${src.me ? '— 내보내면 제목에 들어갑니다' : '— 내보내면 이 문단 끝에 각주로 답니다'}</small></span><input data-js-cite="${i}" value="${esc(s.citeText || '')}" placeholder="${src.me ? '' : '예: 서울지방법원 1990. 5. 24. 선고 89가합51667 판결 (판결문에 없으면 비워 두거나 직접 적으세요)'}"></label>
      <label class="field"><span>정리</span><textarea data-js-text="${i}" rows="${Math.min(8, Math.max(2, Math.ceil((s.text || '').length / 70)))}" placeholder="${src.me ? '' : '이 심급이 무엇을 어떻게 판단했는지'}">${esc(s.text || '')}</textarea></label>
      ${ln && ln.docId ? `<p class="sub jd-link">서재에 이 심급의 판결문이 있습니다: <button class="linkish" data-act="j-open" data-id="${ln.docId}">${esc(ln.docCite)}</button>${ln.citeText && !s.citeText ? ` · <button class="linkish" data-act="j-link-cite" data-i="${i}">인용 넣기</button>` : ''}</p>` : ln && ln.citeText && !s.citeText ? `<p class="sub jd-link">서재의 다른 심급 판결문에 이 심급의 판결이 적혀 있습니다: ${esc(ln.citeText)} · <button class="linkish" data-act="j-link-cite" data-i="${i}">인용 넣기</button></p>` : ''}
      ${src.said && src.said.length ? `<details class="peek"${s.text ? '' : ' open'}><summary>판결문들이 이 심급에 관해 쓴 문장 ${src.said.length}개 — 눌러서 정리에 덧붙이기</summary>${src.said.map((x, k) => `<p><button class="linkish" data-act="j-said" data-i="${i}" data-k="${k}">＋</button> ${esc(x.s)} ${x.from ? `<span class="tag gray">${esc(x.from)}</span>` : pageBtn(x.p)}</p>`).join('')}</details>` : ''}
      ${!src.me && !s.citeText && !(ln && ln.citeText) ? `<p class="sub">판결문에 ${esc(s.title)} 판결의 법원·선고일·사건번호가 적혀 있지 않습니다. ${esc(s.title)} 판결문을 함께 넣어 분석하면 확인할 수 있습니다.</p>` : ''}
    </div>`;
  };
  const rp = a.reasons.map((x, k) => `<li class="${e.picked.includes(k) ? 'on' : ''}"><label><input type="checkbox" data-jp="${k}"${e.picked.includes(k) ? ' checked' : ''}> <span class="t">${esc(x.t)}</span></label><span class="jd-f">${x.flags.map((f) => `<b class="${FLAG_CLS[f] || ''}">${f}</b>`).join('')}${pageBtn(x.p)}</span></li>`).join('');
  UI.view().innerHTML = `<div class="page wide jd">
    <div class="notes-head"><h1>판결 분석</h1><div class="tools"><button class="btn" data-act="j-back">← 판결문 목록</button><button class="btn primary" data-act="j-export">내보내기</button></div></div>
    ${warn}
    <section class="box jd-head"><div class="bh-row"><h2 class="bh">${esc(a.cite || d.title)}</h2><span class="tools-row"><button class="btn sm" data-act="j-copy-cite">인용 복사</button><button class="btn sm" data-act="j-read">원문 보기</button></span></div>
      <div class="two tight"><div><ul class="plain jd-kv">
        ${H.name ? `<li><span class="lbl">사건명</span><span>${esc(H.name)}</span></li>` : ''}${H.bench ? `<li><span class="lbl">재판부</span><span>${esc(H.bench)}</span></li>` : ''}${parties}
        ${a.stages.filter((s) => !s.me && s.citeText).map((s) => `<li><span class="lbl">${esc(s.stage)}</span><span>${esc(s.citeText)}</span></li>`).join('')}</ul></div>
        <div><span class="lbl">주문${a.result ? ` — <b>${esc(a.result)}</b>` : ''}</span><div class="jd-order">${a.order.map((x) => `<p>${esc(x)}</p>`).join('') || '<p class="sub">주문을 찾지 못했습니다.</p>'}</div>
          ${a.claim.length ? `<details class="peek"><summary>청구취지 등</summary>${a.claim.map((x) => `<p>${esc(x)}</p>`).join('')}</details>` : ''}
          ${a.opinions.length ? `<p class="sub">별개·반대의견 ${a.opinions.length}개: ${a.opinions.map((o) => `${esc(o.who)}의 ${esc(o.kind)}`).join(', ')} — 아래 ‘덧붙임’에 있습니다.</p>` : ''}</div></div>
      <p class="sub" id="j-saved">${c.saved ? '고친 내용이 저장되어 있습니다' : '아래 초안을 고치면 이 판결문의 기록으로 저장됩니다'} · <button class="linkish" data-act="j-reset">초안으로 되돌리기</button></p></section>

    <section class="box"><h2 class="bh">1. 사실관계 <small>${a.factsFrom ? `판결문의 ‘${esc(a.factsFrom.slice(0, 40))}’에서` : '판결문에서 따로 적은 부분을 찾지 못함'}</small></h2>
      ${a.facts.length ? '' : c.link.facts ? `<p class="sub jd-link">이 판결문은 사실관계를 따로 적지 않아, 서재의 <button class="linkish" data-act="j-open" data-id="${c.link.facts.docId}">${esc(c.link.facts.from)}</button>의 기초사실을 ${String(e.facts).includes(c.link.facts.text.slice(0, 30)) ? '가져왔습니다' : `가져올 수 있습니다 · <button class="linkish" data-act="j-link-facts">가져오기</button>`}.</p>` : '<p class="sub">판결문이 사실관계를 따로 적지 않았습니다(대법원 판결에서 흔합니다). 원심판결 이유를 인용한 부분이나 하급심 판결문의 ‘기초사실’을 보고 적으세요. 하급심 판결문을 서재에 넣으면 사건번호로 이어 붙여 기초사실·심급별 결과를 채웁니다.</p>'}
      <label class="field"><span class="sr">사실관계</span><textarea data-je="facts" rows="${Math.min(16, Math.max(4, Math.ceil(e.facts.length / 80)))}" placeholder="당사자와 분쟁에 이르게 된 경위, 청구의 내용">${esc(e.facts)}</textarea></label>
      ${a.evidence.length ? `<p class="sub">인정근거(내보내기에는 넣지 않음): ${esc(a.evidence.join(' / ').slice(0, 300))}</p>` : ''}
      ${a.facts.length ? `<p class="sub">판결문의 ‘원고’·‘피고’를 그대로 옮겼습니다. 논문에서는 당사자를 처음 적을 때 ‘원고(서울특별시)’처럼 밝혀 두면 읽기 쉽습니다.</p>` : ''}</section>

    <section class="box"><h2 class="bh">2. 소송의 경과 <small>심급마다 판결은 각주로</small></h2>
      ${e.stages.map(stageBox).join('')}
      <div class="tools-row"><button class="btn sm" data-act="j-stage-add">+ 심급 더하기(환송 후 판결 등)</button></div></section>

    <section class="box"><h2 class="bh">3. ${a.stage === '상고심' ? '대법원의 판결이유' : a.stage === '헌법재판' ? '헌법재판소의 결정이유' : '판결이유'} <small>주요 부분을 골라 그대로 발췌</small></h2>
      <p class="sub">문단을 고르면 판결문 순서대로 잇고, 건너뛴 자리에 ${OMIT}를 넣습니다. <b class="f-rule">법리</b> <b class="f-eval">판단</b> <b class="f-conc">결론</b> 표시는 판결문의 말투로 가린 것이고, 처음에는 이것들을 골라 두었습니다.</p>
      <label class="field"><span>발췌 앞 문장</span><input data-je="lead" value="${esc(e.lead)}"></label>
      <ul class="jd-paras">${rp || '<li class="sub">이유 부분을 찾지 못했습니다.</li>'}</ul>
      <label class="field"><span>발췌문 <small>${e.excerptEdited ? '— 직접 고쳤습니다. 문단을 다시 골라도 덮어쓰지 않습니다' : '— 직접 고칠 수 있습니다'}</small></span><textarea data-je="excerpt" rows="${Math.min(18, Math.max(5, Math.ceil(e.excerpt.length / 80)))}">${esc(e.excerpt)}</textarea></label>
      ${e.excerptEdited ? '<div class="tools-row"><button class="btn sm" data-act="j-excerpt">고른 문단으로 발췌문 다시 만들기</button></div>' : ''}</section>

    <section class="box"><h2 class="bh">4. 쟁점 <small>${a.points.length ? '판시사항 · ' : ''}이유의 제목 · ‘쟁점은’ ‘~인지 여부’ 문장 · ‘~에 관한 법리 오해’ · 당사자의 주장에서</small></h2>
      ${a.issues.length ? '' : '<p class="sub">쟁점으로 보이는 문장을 찾지 못했습니다. 직접 적으세요.</p>'}
      <ol class="jd-issues">${e.issues.map((t, i) => { const src = a.issues.find((x) => x.text === t); return `<li><textarea data-ji="${i}" rows="2">${esc(t)}</textarea><span class="jd-f">${src ? `<b class="tag gray">${esc(src.from)}</b>${pageBtn(src.p)}` : ''}<button class="linkish danger" data-act="j-issue-del" data-i="${i}">빼기</button></span>${src && src.verdict ? `<p class="sub">법원의 답: ${esc(src.verdict)}</p>` : ''}</li>`; }).join('')}</ol>
      <div class="tools-row"><button class="btn sm" data-act="j-issue-add">+ 쟁점</button></div></section>

    <section class="box"><h2 class="bh">덧붙임</h2>
      ${a.summary.length ? `<details class="peek"><summary>판결요지</summary>${a.summary.map((x) => `<p>${esc(x)}</p>`).join('')}</details>` : ''}
      ${a.outline.length ? `<details class="peek"><summary>이유의 짜임 (${a.outline.length})</summary><ul class="plain jd-outline">${a.outline.map((o) => `<li style="padding-left:${(o.depth - 1) * 14}px">${esc(o.label)} ${pageBtn(o.p)}</li>`).join('')}</ul></details>` : ''}
      ${a.laws.length ? `<details class="peek"><summary>판결문의 조문 (${a.laws.length})</summary><p>${a.laws.map((x) => `${esc(x.k)}${x.n > 1 ? ` <small>×${x.n}</small>` : ''}`).join(' · ')}</p></details>` : ''}
      ${a.cases.length ? `<details class="peek"><summary>판결문이 인용한 판례 (${a.cases.length})</summary><ul class="plain">${a.cases.map((x) => `<li>${esc(x.court)} ${esc(x.date)} ${x.court === '헌법재판소' ? '' : '선고 '}${esc(x.no)} ${esc(x.kind || '')}${libHas(x.no) ? ' <span class="tag">서재에 있음</span>' : ''}</li>`).join('')}</ul></details>` : ''}
      ${a.opinions.map((o) => `<details class="peek"><summary>${esc(o.who)}의 ${esc(o.kind)}</summary>${o.text.split('\n').map((x) => `<p>${esc(x)}</p>`).join('')}</details>`).join('')}
      ${a.judges.length ? `<p class="sub">관여 법관: ${esc(a.judges.join(', '))}</p>` : ''}</section>

    <section class="box"><h2 class="bh">이 판결을 다룬 서재 문헌 <small>평석·선행연구를 찾을 때</small></h2><div id="j-citing"><p class="sub">서재를 찾는 중…</p></div></section>
    <section class="box"><h2 class="bh">옮기기</h2><div class="tools-row">
      <button class="btn primary" data-act="j-export">한글·Word로 내보내기</button><button class="btn" data-act="j-copy">글자로 복사</button>
      ${S.project ? `<button class="btn" data-act="j-cards">‘${esc(S.project.title.slice(0, 16))}’ 노트로 보내기</button>` : ''}<button class="btn" data-act="j-project">판례 평석 연구로 만들기</button></div>
      <p class="sub">노트로 보내면 고른 판결이유 문단이 카드가 되어 집필에서 〔카드 n〕으로 쓸 때 “${esc(a.cite || '판결')}.”로 각주가 됩니다.</p></section>
  </div>`;
  paintCiting(c);
}
async function paintCiting(c) {
  const box = () => $('#j-citing');
  const m = String(c.a.head.no || '').match(/^(\d+)(\D+?)(\d+)$/);
  if (!m) { if (box()) box().innerHTML = '<p class="sub">사건번호를 읽지 못해 찾을 수 없습니다.</p>'; return; }
  const re = new RegExp(`(?<![\\d가-힣])${m[1]}\\s?${m[2]}\\s?${m[3]}(?!\\d)`);
  const lib = await libLoad().catch(() => ({ docs: [] }));
  const hits = [];
  for (const x of lib.docs) { if (x.id === c.id) continue; const ps = []; x.pages.forEach((t, i) => { if (re.test(t)) ps.push(i + 1); }); if (ps.length) hits.push({ d: docOf(x.id), ps }); }
  const el = box(); if (!el || !CUR || CUR.id !== c.id) return;
  el.innerHTML = hits.length ? `<ul class="plain jd-cite-list">${hits.filter((h) => h.d).sort((a, b) => b.ps.length - a.ps.length).map((h) => `<li><b>${esc(h.d.title)}</b>${h.d.author ? ` <span class="sub">${esc(h.d.author)}${h.d.year ? `, ${esc(h.d.year)}` : ''}</span>` : ''}${h.d.isJudg ? ' <span class="tag gray">판결문</span>' : ''} <span class="jd-f">${h.ps.slice(0, 8).map((p) => `<button class="pg-chip" data-act="open-at" data-id="${h.d.id}" data-p="${p}">${h.d.kind === 'pdf' ? `${p}쪽` : `${p}번째`}</button>`).join('')}${h.ps.length > 8 ? ` 외 ${h.ps.length - 8}곳` : ''}</span></li>`).join('')}</ul><p class="sub">사건번호 ${esc(c.a.head.no)}가 나오는 쪽입니다. 누르면 그 쪽이 열립니다.</p>`
    : `<p class="sub">서재의 다른 문헌에는 사건번호 ${esc(c.a.head.no)}가 나오지 않습니다. 평석·관련 논문을 서재에 넣으면 여기에 모입니다.</p>`;
}
const libHas = (no) => S.docs.some((d) => d.isJudg && (d.cite || {}).caseCite && d.cite.caseCite.includes(no));

/* ---------------- 고치기 ---------------- */
ON_INPUT.push((t) => {
  const c = CUR; if (!c || S.view !== 'judg' || !t.dataset) return false;
  const ds = t.dataset;
  if (ds.je) { c.e[ds.je] = t.value; if (ds.je === 'excerpt') c.e.excerptEdited = true; saveSoon(); return true; }
  if (ds.jsText !== undefined) { c.e.stages[+ds.jsText].text = t.value; saveSoon(); return true; }
  if (ds.jsCite !== undefined) { c.e.stages[+ds.jsCite].citeText = t.value; saveSoon(); return true; }
  if (ds.jsTitle !== undefined) { c.e.stages[+ds.jsTitle].title = t.value; saveSoon(); return true; }
  if (ds.ji !== undefined) { c.e.issues[+ds.ji] = t.value; saveSoon(); return true; }
  return false;
});
ON_CHANGE.push((t) => {
  const c = CUR; if (!c || S.view !== 'judg' || !t.dataset || t.dataset.jp === undefined) return false;
  const k = +t.dataset.jp; c.e.picked = t.checked ? [...new Set([...c.e.picked, k])] : c.e.picked.filter((x) => x !== k);
  t.closest('li').classList.toggle('on', t.checked);
  if (!c.e.excerptEdited) { c.e.excerpt = excerptOf(c.a.reasons, c.e.picked); const x = $('[data-je="excerpt"]'); if (x) x.value = c.e.excerpt; }
  saveSoon(); return true;
});
ACT['j-excerpt'] = () => { const c = CUR; if (!c) return; c.e.excerpt = excerptOf(c.a.reasons, c.e.picked); c.e.excerptEdited = false; saveSoon(); viewJudg(); };
ACT['j-link-cite'] = (el) => { const c = CUR; if (!c) return; const i = +el.dataset.i, l = c.link.stages[i]; if (!l || !l.citeText) return; c.e.stages[i].citeText = l.citeText; saveSoon(); viewJudg(); };
ACT['j-link-facts'] = () => { const c = CUR; if (!c || !c.link.facts) return; c.e.facts = [c.e.facts, c.link.facts.text].filter((x) => String(x || '').trim()).join('\n'); saveSoon(); viewJudg(); };
ACT['j-said'] = (el) => { const c = CUR; if (!c) return; const i = +el.dataset.i, s = saidOf(c, i)[+el.dataset.k]; if (!s) return; const st = c.e.stages[i]; st.text = [st.text, s.s].filter((x) => String(x || '').trim()).join('\n'); saveSoon(); const ta = $(`[data-js-text="${i}"]`); if (ta) ta.value = st.text; };
ACT['j-stage-add'] = () => { const c = CUR; if (!c) return; c.e.stages.push({ title: '환송 후 판결', text: '', citeText: '', me: false }); saveSoon(); viewJudg(); };
ACT['j-issue-add'] = () => { const c = CUR; if (!c) return; c.e.issues.push(''); saveSoon(); viewJudg().then(() => { const t = $$('[data-ji]').pop(); if (t) t.focus(); }); };
ACT['j-issue-del'] = (el) => { const c = CUR; if (!c) return; c.e.issues.splice(+el.dataset.i, 1); saveSoon(); viewJudg(); };
ACT['j-reset'] = async () => { const c = CUR; if (!c || !(await confirmBox('고친 내용을 지우고 판결문에서 다시 읽은 초안으로 되돌릴까요?', '되돌리기'))) return; c.e = defaultEdit(c.a); JUDG.delete(c.id); await updateDoc(c.id, { judg: null }); c.saved = false; viewJudg(); };
ACT['j-page'] = (el) => { if (UI.openDoc) UI.openDoc(S.judg, +el.dataset.p || 1, []); };
ACT['j-read'] = () => { if (UI.openDoc) UI.openDoc(S.judg, 1, []); };
ACT['j-copy-cite'] = () => { const c = CUR; if (c && c.a.cite) copyText(`${c.a.cite}.`, '판례 인용을 복사했습니다.'); };

/* ---------------- 옮기기 ---------------- */
const itemsNow = () => judgmentItems(CUR.a, CUR.e);
const asProject = () => ({ title: `${CUR.a.cite || docOf(CUR.id).title} — 판결 분석` });
ACT['j-export'] = () => {
  const c = CUR; if (!c) return;
  const m = modal(`<h2>판결 분석 내보내기</h2><p class="sub">논문의 한 장으로 붙여 쓸 수 있는 모양입니다: <b>Ⅱ. ${esc(c.a.cite || '대상 판결')}</b> → 1. 사실관계 → 2. 소송의 경과(심급 판결은 각주) → 3. 판결이유(발췌) → 4. 쟁점.</p>
    <label class="field"><span>장 번호</span><select id="je-roman">${['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'].map((r) => `<option${r === 'Ⅱ' ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    <div class="modal-foot"><button class="btn" data-close>닫기</button><button class="btn" data-fmt="md">마크다운</button><button class="btn" data-fmt="docx">Word(.docx)</button><button class="btn primary" data-fmt="hwpx">한글(.hwpx)</button></div>`);
  $$('[data-fmt]', m.el).forEach((b) => b.addEventListener('click', async () => {
    try {
      const items = judgmentItems(c.a, c.e, { roman: $('#je-roman', m.el).value }), p = asProject(), name = safeName(`${c.a.cite || docOf(c.id).title} 판결 분석`, '판결 분석');
      if (b.dataset.fmt === 'hwpx') download(`${name}.hwpx`, await buildHwpx(await skeleton(), { title: p.title, author: AUTHOR, blocks: toHwpxBlocks(p, items) }), HWPX_MIME);
      else if (b.dataset.fmt === 'docx') download(`${name}.docx`, toDocx(p, items), DOCX_MIME);
      else download(`${name}.md`, toMd(p, items), 'text/markdown;charset=utf-8');
      m.close(); toast(`각주 ${items.reduce((n, it) => n + it.notes.length, 0)}개를 단 판결 분석을 냈습니다.`);
    } catch (err) { toast('파일을 만들지 못했습니다: ' + (err.message || err)); }
  }));
};
export function plainText(items) {
  let n = 0; const foot = [];
  const body = items.map((it) => it.text.replace(/〔@(\d+)〕/g, (_, k) => { foot.push(it.notes[+k]); return `${++n})`; })).join('\n\n');
  return body + (foot.length ? `\n\n${foot.map((f, i) => `${i + 1}) ${f}`).join('\n')}` : '');
}
ACT['j-copy'] = () => { if (CUR) copyText(plainText(itemsNow()), '판결 분석을 글자로 복사했습니다(각주는 끝에 번호로).'); };
async function cardsFor(p) {
  const c = CUR, made = [];
  const order0 = Math.max(0, ...projCards(p).map((x) => x.order || 0));
  const mk = async (quote, page, memo) => { const card = { id: uid(), projectId: p.id, no: nextCardNo(p), docId: c.id, page: page || 0, quote, memo, order: order0 + made.length + 1, createdAt: Date.now() + made.length }; S.cards.push(card); await saveCard(card); made.push(card); return card; };
  if (String(c.e.facts || '').trim()) await mk('', 0, `[사실관계] ${c.e.facts.trim()}`);
  for (const k of c.e.picked.slice().sort((x, y) => x - y)) { const r = c.a.reasons[k]; if (r) await mk(r.t, r.p, `[판결이유 · ${r.flags.join('·') || '발췌'}]`); }
  const iss = c.e.issues.filter((x) => String(x || '').trim()); if (iss.length) await mk('', 0, `[쟁점]\n${iss.map((x, i) => `${i + 1}. ${x}`).join('\n')}`);
  return made;
}
ACT['j-cards'] = async () => {
  const p = S.project, c = CUR; if (!p || !c) return;
  const made = await cardsFor(p);
  logEvent(p, `판결 분석: ${c.a.cite || docOf(c.id).title} — 카드 ${made.length}장`); await saveProject(p); UI.side();
  toast(`‘${p.title}’ 노트에 카드 ${made.length}장을 담았습니다(카드 ${made[0] ? made[0].no : ''}–${made.length ? made[made.length - 1].no : ''}).`);
};
/* 판례 평석: 서론 · 대상 판결(사실관계·소송의 경과·판결이유) · 쟁점별 검토 · 결론 */
ACT['j-project'] = async () => {
  const c = CUR; if (!c || !UI.newProject) return;
  if (!(await confirmBox(`‘${c.a.cite || docOf(c.id).title}’ 평석을 새 연구로 만들까요? 개요(서론 · 대상 판결 · 쟁점의 검토 · 결론)를 세우고 정리한 내용을 초고로, 고른 판결이유를 노트 카드로, 쟁점마다 논증 설계도의 주장 자리(근거에 대상 판결의 판단)를 넣습니다.`, '만들기'))) return;
  const iss = c.e.issues.map((x) => String(x || '').trim()).filter(Boolean);
  const p = await UI.newProject(`${c.a.cite || docOf(c.id).title} 평석`, `대상 판결(${c.a.cite || docOf(c.id).title})의 판단은 타당한가${iss[0] ? ` — ${iss[0]}` : ''}?`);
  const made = await cardsFor(p);
  const st = c.e.stages.filter((s) => String(s.text || '').trim());
  const excerptCards = made.filter((x) => x.quote);
  const sec = (lv, title, text = '', hint = '') => ({ id: uid(), lv, title, hint, text, claims: [], cards: [] });
  p.outline = [
    sec(1, '서론', '', '대상 판결을 고른 까닭, 연구 질문, 선행 평석과의 차별성'),
    sec(1, `대상 판결: ${c.a.cite || ''}`.trim()),
    sec(2, '사실관계', c.e.facts || ''),
    sec(2, '소송의 경과'),
    ...st.map((x) => sec(3, x.title, `${x.text}${x.citeText && !x.me ? ` (${x.citeText})` : ''}`, x.citeText && !x.me ? '괄호 속 판결은 각주로 옮기세요' : '')),
    sec(2, c.a.stage === '상고심' ? '대법원의 판결이유' : '판결이유', [c.e.lead, `${c.e.excerpt}${excerptCards[0] ? `〔카드 ${excerptCards[0].no}〕` : ''}`].filter((x) => String(x || '').trim()).join('\n')),
    sec(1, '쟁점의 검토', '', '쟁점마다: 대상 판결의 판단 → 학설·선례 → 비판(형식과 실질) → 사견'),
    ...iss.map((x) => sec(2, x.length > 60 ? x.slice(0, 60) + '…' : x)),
    sec(1, '결론', '', '“이상에서 … 그 결과 …를 확인하였다”, 입법론·후속연구'),
  ];
  // 논증 설계도: 쟁점마다 핵심 주장 자리를 만들고, 대상 판결의 판단(판결문이 그 쟁점에 답한 문장)을 근거 자리에 판결문과 이어 둔다
  iss.forEach((x, k) => {
    const claim = { id: uid(), parent: null, kind: 'claim', text: `[쟁점 ${k + 1}] ${x} — 대상 판결의 판단에 대한 사견을 한 문장으로`, refs: [], order: k + 1 };
    const src = c.a.issues.find((y) => y.text === x);
    const ans = src && src.verdict ? src.verdict.replace(/^(받아들임|배척|원심 잘못)\s·\s/, '') : '';
    p.arg.push(claim, { id: uid(), parent: claim.id, kind: 'ground', text: ans ? `대상 판결의 판단: ${ans}` : '대상 판결의 판단(판결이유에서 이 쟁점에 답한 부분)', refs: [{ t: 'doc', id: c.id, page: src && src.p ? src.p : 0 }], order: 1 });
  });
  logEvent(p, `판결 분석에서 평석 연구를 만듦: ${c.a.cite || ''}`); await saveProject(p);
  toast(`‘${p.title}’ 연구를 만들었습니다. 집필에서 이어 쓰세요.`);
  S.project = p; UI.show('write');
};
export const _test = { plainText };
