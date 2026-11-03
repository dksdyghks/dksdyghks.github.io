/* YO아이 — 공법 연구자 안요환의 연구 보조 도구.
   질문을 세우고, 선행연구를 비판적으로 읽고, 주장·근거·반론으로 논증을 설계하고, 한글로 초고를 내고, 원고를 점검하고, 심사에 답한다.
   AI도 서버도 로그인도 없다. 모든 기록은 이 브라우저 안에 있고, 바깥 정보는 사용자가 넣은 문헌뿐이다. */
import { S, DB, DEFAULTS, ACT, UI, ON_INPUT, ON_CHANGE, hooks, $, $$, esc, uid, EMBED, fmtSize, kdate, kdt, toast, applyTheme, saveSettings, saveProject, saveCard, saveIdea, logEvent,
  docMeta, docPages, docOf, addFiles, removeDoc, updateDoc, libLoad, parseQuery, searchLib, indexLibrary, libStats, connectFolder, syncFolder, OCR, scanned, ocrAll,
  CITE_KINDS, where, footnote, citer, pageLabel, guessMeta, modal, closeModals, confirmBox, formBox, download, safeName, copyText, closePdf, pdfDocFor, setRender,
  backupData, stamp, autoBackup, chooseBackupDir, fullBackupZip, restoreFrom, touched, JUDG } from './core.js?v=85b1f8f6a6';
import { STAGES, stageName, ensureProject, projReads, projCards, readFor, openReadCard, argIssues, viewArg, viewLit, viewReview, viewMe } from './research.js?v=85b1f8f6a6';
import { viewWrite, viewCheck, caseCite, ensureCardNos, nextCardNo } from './write.js?v=85b1f8f6a6';
import { caseCourt, citationsIn } from './lawtext.js?v=85b1f8f6a6';
import { excluded, excludeHint } from './profile.js?v=85b1f8f6a6';
import { buildHwpx, HWPX_MIME } from './hwpx.js?v=85b1f8f6a6';
import { buildDocx, DOCX_MIME } from './docx.js?v=85b1f8f6a6';
import { viewJudg, openJudgment } from './judg.js?v=85b1f8f6a6';
import { isJudgment } from './judgment.js?v=85b1f8f6a6';

/* ---------------- 모양 ---------------- */
const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  menu: sv('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  home: sv('<path d="M4 11.5L12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M10 19v-5h4v5"/>'),
  lib: sv('<path d="M5 4h4v16H5zM10 4h4v16h-4z"/><path d="M15.5 5.5l3.8-1 3 15.5-3.8 1z"/>'),
  find: sv('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  me: sv('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'),
  judg: sv('<path d="M12 4v16M7 20h10"/><path d="M5 7h14"/><path d="M7 7l-3 6a3 3 0 0 0 6 0z"/><path d="M17 7l-3 6a3 3 0 0 0 6 0z"/>'),
  arg: sv('<rect x="9" y="3.5" width="6" height="4" rx="1"/><rect x="3.5" y="16.5" width="6" height="4" rx="1"/><rect x="14.5" y="16.5" width="6" height="4" rx="1"/><path d="M12 7.5v4.5M6.5 16.5V12h11v4.5"/>'),
  lit: sv('<path d="M4 5.5c2.5-1 5-1 8 1 3-2 5.5-2 8-1v13c-2.5-1-5-1-8 1-3-2-5.5-2-8-1z"/><path d="M12 6.5v13"/>'),
  notes: sv('<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M9 11h6M9 15h6M14.5 3.5V7H18"/>'),
  write: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  check: sv('<path d="M5 12.5l4 4L19 7"/>'),
  review: sv('<path d="M5 5.5h14v10H11l-4 3.5v-3.5H5z"/><path d="M9 9.5h6M9 12.5h4"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>'),
  help: sv('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>'),
  close: sv('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  ext: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg>',
};
const VIEWS = { home: '연구', library: '서재', find: '찾기', read: '읽기', judg: '판결 분석', me: '내 연구', arg: '논증 설계도', lit: '선행연구', notes: '노트', write: '집필', check: '원고 점검', review: '심사 대응' };
const PROJECT_VIEWS = ['arg', 'lit', 'notes', 'write', 'check', 'review'];
const view = () => $('#view');
UI.view = view;

function paintShell() {
  $('#app').innerHTML = `<div class="shell">
    <aside class="side" id="side"></aside>
    <section class="main">
      <div class="topbar"><button class="icon menu-btn" data-act="menu" aria-label="메뉴">${IC.menu}</button><div class="title" id="title"></div>
        ${EMBED ? `<button class="icon" data-act="close" title="닫기" aria-label="닫기">${IC.close}</button>` : ''}</div>
      <div class="thread" id="view"></div>
    </section><div class="scrim" data-act="scrim"></div></div>`;
  show(S.view);
}
function paintSide() {
  const el = $('#side'); if (!el) return;
  const p = S.project, on = (v) => S.view === v || (v === 'library' && S.view === 'read' && S.reader && S.reader.from === 'library') || (v === 'find' && S.view === 'read' && (!S.reader || !['library', ...PROJECT_VIEWS].includes(S.reader.from)));
  const nav = (v, ic, label, n) => `<button class="side-btn nav${on(v) ? ' on' : ''}" data-act="go" data-v="${v}"${on(v) ? ' aria-current="page"' : ''}>${ic} ${label}${n ? `<span class="n">${n}</span>` : ''}</button>`;
  const open = p ? p.reviews.filter((r) => !r.done).length : 0;
  el.innerHTML = `<div class="side-top"><span class="mark">YO</span><div class="brand">YO아이<small>연구 보조 도구</small></div></div>
    <nav class="side-nav" aria-label="전체">${nav('home', IC.home, '연구')}${nav('library', IC.lib, '서재', S.docs.length)}${nav('find', IC.find, '찾기')}${nav('judg', IC.judg, '판결 분석')}${nav('me', IC.me, '내 연구')}</nav>
    <div class="side-sec"><div class="side-label"><span>지금 연구</span><button class="icon sm" data-act="new-project" title="새 연구" aria-label="새 연구">${IC.plus}</button></div>
      <label class="sr" for="project-sel">지금 연구</label><select id="project-sel">${S.projects.map((x) => `<option value="${x.id}"${p && x.id === p.id ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
      ${p ? `<div class="side-stage">단계 <b>${esc(stageName(p.stage))}</b>${p.deadline ? ` · 마감 ${dday(p.deadline)}` : ''}</div>` : ''}</div>
    <nav class="side-nav" aria-label="지금 연구">${nav('arg', IC.arg, '논증')}${nav('lit', IC.lit, '선행연구', p ? projReads(p).length : 0)}${nav('notes', IC.notes, '노트', p ? projCards(p).length : 0)}${nav('write', IC.write, '집필')}${nav('check', IC.check, '점검')}${nav('review', IC.review, '심사', open)}</nav>
    <div class="side-status" id="side-status"></div>
    <div class="side-foot"><button class="side-btn" data-act="help">${IC.help} 사용법</button><button class="side-btn" data-act="settings">${IC.gear} 설정</button></div>`;
  paintStatus();
}
function statusText() {
  if (S.sync) return `폴더 읽는 중 ${S.sync.done}/${S.sync.total}`;
  if (S.indexing) return `본문 읽는 중 ${S.indexing.done}/${S.indexing.total}`;
  if (OCR.run) return `글자 읽는 중 ${OCR.done}/${OCR.total}${OCR.doc ? ` · ${OCR.doc} ${OCR.page}` : ''}`;
  if (S.backupState === 'prompt') return '자동 백업: 설정에서 폴더 사용을 다시 허락하세요';
  if (S.backupState === 'error') return '자동 백업을 하지 못했습니다(설정 확인)';
  return '';
}
function paintStatus() {
  const t = statusText();
  const s = $('#side-status'); if (s) { s.textContent = t; s.hidden = !t; }
  const f = $('#find-status'); if (f) f.innerHTML = findStatus();
  const l = $('#lib-status'); if (l) l.innerHTML = libStatusHTML();
}
function closeSide() { const sd = $('#side'); if (sd) sd.classList.remove('open'); const sh = $('.shell'); if (sh) sh.classList.remove('side-open'); }
const RENDER = { home: viewHome, library: viewLibrary, find: viewFind, read: viewRead, judg: viewJudg, me: viewMe, arg: viewArg, lit: viewLit, notes: viewNotes, write: viewWrite, check: viewCheck, review: viewReview };
function show(v) {
  if (!RENDER[v]) v = 'home';
  S.view = v; closeSide(); selTool(null);
  if (v !== 'read') closePdf();
  const t = $('#title'); if (t) t.textContent = `${VIEWS[v]}${PROJECT_VIEWS.includes(v) && S.project ? ` · ${S.project.title}` : ''}`;
  RENDER[v]();
  const th = $('#view'); if (th && v !== 'read') th.scrollTop = 0;
  paintSide();
}
const redraw = (v) => { if (S.view === v) RENDER[v](); };
UI.show = show; UI.side = paintSide; UI.openDoc = (id, p, t) => openDoc(id, p, t); UI.newProject = (t, q) => newProject(t, q);
UI.refresh = () => { if (S.view === 'library') paintDocList(); else if (S.view === 'read') viewRead(); };
hooks.status = paintStatus; hooks.side = paintSide;
hooks.redraw = () => { if (['library', 'home', 'me'].includes(S.view) && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#view input, #view textarea'))) RENDER[S.view](); };
const dday = (d) => { const t = new Date(d + 'T00:00:00'); if (isNaN(t)) return ''; const n = Math.round((t - new Date(new Date().toDateString())) / 86400000); return n > 0 ? `D-${n}` : n === 0 ? 'D-day' : `D+${-n}`; };

/* ---------------- 연구(처음 화면) ---------------- */
let homeIdeaOpen = false;
function viewHome() {
  const list = S.projects.slice().sort((a, b) => (STAGES.findIndex((s) => s[0] === a.stage) === 6) - (STAGES.findIndex((s) => s[0] === b.stage) === 6) || (b.updatedAt || 0) - (a.updatedAt || 0));
  const ideas = S.ideas.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const logs = S.projects.flatMap((p) => (p.log || []).map((x) => ({ ...x, p }))).sort((a, b) => b.at - a.at).slice(0, 14);
  const stale = !S.backupDir && (!S.settings.backupAt || Date.now() - S.settings.backupAt > 7 * 86400000) && (S.projects.some((p) => (p.log || []).length) || S.cards.length || S.reads.length);
  const card = (p) => {
    const iss = argIssues(p), bad = iss.filter((x) => x.level === 'bad').length, warn = iss.filter((x) => x.level === 'warn').length, last = (p.checks || [])[p.checks.length - 1];
    return `<article class="pj${S.project && p.id === S.project.id ? ' cur' : ''}" data-pid="${p.id}">
      <div class="pj-h"><button class="pj-t" data-act="pj-open">${esc(p.title)}</button><span class="pj-d">${p.deadline ? `<b>${dday(p.deadline)}</b> ` : ''}${esc(p.venue || '')}</span></div>
      ${p.question ? `<p class="pj-q">${esc(p.question)}</p>` : '<p class="pj-q sub">연구 질문을 아직 적지 않았습니다.</p>'}
      <div class="pj-m"><label class="sr" for="stg-${p.id}">단계</label><select id="stg-${p.id}" data-stage="${p.id}">${STAGES.map(([k, l]) => `<option value="${k}"${p.stage === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <span>읽기 카드 ${projReads(p).length}</span><span>주장 ${p.arg.filter((n) => n.kind === 'claim').length}</span><span>노트 ${projCards(p).length}</span>${p.outline.length ? `<span>개요 ${p.outline.filter((s) => s.lv === 1).length}장</span>` : ''}
        ${bad || warn ? `<button class="linkish" data-act="pj-go" data-v="arg">논증 점검 ${bad ? `고칠 것 ${bad}` : ''}${bad && warn ? ' · ' : ''}${warn ? `살필 것 ${warn}` : ''}</button>` : '<span class="good">논증 점검 이상 없음</span>'}
        ${last ? `<button class="linkish" data-act="pj-go" data-v="check">원고 점검 ${kdate(last.at)}: 고칠 것 ${last.bad}</button>` : ''}</div>
      <div class="pj-tools"><button class="linkish" data-act="pj-edit">정보 고치기</button><button class="linkish danger" data-act="pj-del">지우기</button></div></article>`;
  };
  view().innerHTML = `<div class="page wide">
    <div class="notes-head"><h1>연구</h1><div class="tools"><button class="btn primary" data-act="new-project">${IC.plus} 새 연구</button></div></div>
    ${stale ? `<div class="banner"><span>기록은 이 브라우저 안에만 있습니다. 백업 폴더를 정해 두면 바뀐 내용을 날마다 자동으로 그 폴더에 저장합니다(최근 14일치).</span><button class="btn" data-act="backup-dir">백업 폴더 정하기</button></div>` : ''}
    <div class="stages">${STAGES.map(([k, l]) => { const n = S.projects.filter((p) => p.stage === k).length; return `<span class="stg${n ? ' on' : ''}"><b>${n}</b>${l}</span>`; }).join('<i aria-hidden="true">›</i>')}</div>
    <div class="pjs">${list.map(card).join('')}</div>
    <section class="box"><div class="bh-row"><h2 class="bh">아이디어 은행 <small>떠오른 호기심을 버리지 않고 모아 두는 곳</small></h2></div>
      <div class="idea-in"><label class="sr" for="idea-text">새 아이디어</label><textarea id="idea-text" rows="${homeIdeaOpen ? 3 : 1}" placeholder="예: 선관위 사무총장 인사청문회 도입은 위헌인가? — 뉴스·판례·강의에서 떠오른 물음을 한 줄로"></textarea><button class="btn" data-act="idea-add">담기</button></div>
      ${ideas.length ? `<ul class="ideas">${ideas.map((x) => `<li data-idea="${x.id}"><span class="d">${kdate(x.createdAt)}</span><span class="t">${esc(x.text)}</span><span class="tools-row"><button class="linkish" data-act="idea-proj">연구로 만들기</button><button class="linkish danger" data-act="idea-del">지우기</button></span></li>`).join('')}</ul>` : '<p class="sub">아직 담은 아이디어가 없습니다. 연구로 만들면 그 물음이 첫 연구 질문이 되고, 질문이 다듬어지는 과정이 기록으로 남습니다.</p>'}</section>
    ${logs.length ? `<section class="box"><h2 class="bh">최근 기록</h2><ul class="log">${logs.map((x) => `<li><span class="d">${kdt(x.at)}</span><b>${esc(x.p.title)}</b> · ${esc(x.text)}</li>`).join('')}</ul></section>` : ''}
  </div>`;
}
const untouched = (p) => p && p.title === '새 연구 프로젝트' && !p.question && !p.arg.length && !p.outline.length && !p.reviews.length && !projCards(p).length && !projReads(p).length;
async function newProject(title, question) {
  // the empty project made on the very first start gives way to the first real one
  if (S.projects.length === 1 && untouched(S.projects[0]) && title !== '새 연구 프로젝트') { await DB.del('projects', S.projects[0].id); S.projects = []; }
  const p = ensureProject({ id: uid(), title: title || '새 연구 프로젝트', createdAt: Date.now(), updatedAt: Date.now() });
  if (question) p.question = question;
  logEvent(p, '연구를 시작함'); S.projects.push(p); await saveProject(p); return p;
}
function selectProject(id, to) {
  S.project = S.projects.find((p) => p.id === id) || S.projects[0];
  DB.put('kv', S.project.id, 'lastProject').catch(() => {});
  show(to || (PROJECT_VIEWS.includes(S.view) ? S.view : S.view === 'read' ? 'arg' : S.view));
}
async function editProject(p) {
  const v = await formBox('연구 정보', [{ label: '연구 이름(논문 가제)', value: p.title }, { label: '투고할 학술지', value: p.venue, placeholder: '예: 공법연구' }, { label: '마감일', value: p.deadline, type: 'date' }, { label: '단계', type: 'select', value: p.stage, options: STAGES }]);
  if (!v) return;
  const before = p.stage;
  p.title = v[0].trim() || p.title; p.venue = v[1].trim(); p.deadline = v[2]; p.stage = v[3];
  if (before !== p.stage) logEvent(p, `단계: ${stageName(before)} → ${stageName(p.stage)}`);
  await saveProject(p); show(S.view);
}
ACT['new-project'] = async () => { closeSide(); const v = await formBox('새 연구', [{ label: '연구 이름(논문 가제)', value: '' }, { label: '처음의 물음(나중에 고쳐 쓸 수 있습니다)', value: '', type: 'textarea', rows: 2 }]); if (!v || !v[0].trim()) return; S.project = await newProject(v[0].trim(), v[1].trim()); DB.put('kv', S.project.id, 'lastProject').catch(() => {}); show('arg'); };
const pjOf = (el) => S.projects.find((x) => x.id === el.closest('[data-pid]').dataset.pid);
ACT['pj-open'] = (el) => selectProject(pjOf(el).id, 'arg');
ACT['pj-go'] = (el) => selectProject(pjOf(el).id, el.dataset.v);
ACT['pj-edit'] = (el) => editProject(pjOf(el));
ACT['pj-del'] = async (el) => {
  const p = pjOf(el); if (!p) return;
  if (S.projects.length < 2) { toast('연구가 하나뿐이라 지울 수 없습니다. 먼저 새 연구를 만드세요.'); return; }
  const nc = projCards(p).length, nr = projReads(p).length;
  if (!(await confirmBox(`‘${p.title}’과(와) 그 노트 카드 ${nc}개, 읽기 카드 ${nr}개, 논증·개요·심사 기록을 지울까요? 되돌릴 수 없습니다. 서재의 문헌은 그대로입니다.`, '지우기'))) return;
  for (const x of projCards(p)) await DB.del('cards', x.id);
  for (const x of projReads(p)) await DB.del('reads', x.id);
  S.cards = S.cards.filter((x) => x.projectId !== p.id); S.reads = S.reads.filter((x) => x.projectId !== p.id);
  await DB.del('projects', p.id); S.projects = S.projects.filter((x) => x.id !== p.id);
  if (S.project && S.project.id === p.id) S.project = S.projects[0];
  touched(); show('home');
};
ACT['idea-add'] = async () => {
  const t = $('#idea-text'), text = t ? t.value.trim() : ''; if (!text) { if (t) t.focus(); return; }
  const x = { id: uid(), text, createdAt: Date.now() }; S.ideas.push(x); await saveIdea(x); homeIdeaOpen = false; viewHome(); toast('아이디어 은행에 담았습니다.');
};
const ideaOf = (el) => S.ideas.find((x) => x.id === el.closest('[data-idea]').dataset.idea);
ACT['idea-del'] = async (el) => { const x = ideaOf(el); if (!x || !(await confirmBox('이 아이디어를 지울까요?', '지우기'))) return; S.ideas = S.ideas.filter((y) => y !== x); await DB.del('ideas', x.id); touched(); viewHome(); };
ACT['idea-proj'] = async (el) => {
  const x = ideaOf(el); if (!x) return;
  const v = await formBox('아이디어를 연구로', [{ label: '연구 이름(논문 가제)', value: x.text.replace(/[?？].*$/, '').slice(0, 40) }, { label: '처음의 물음', value: x.text, type: 'textarea', rows: 3 }]);
  if (!v || !v[0].trim()) return;
  const p = await newProject(v[0].trim(), v[1].trim()); logEvent(p, `아이디어(${kdate(x.createdAt)})에서 시작함: ${x.text}`); p.ideaFrom = x.text; await saveProject(p);
  S.ideas = S.ideas.filter((y) => y !== x); await DB.del('ideas', x.id);
  S.project = p; DB.put('kv', p.id, 'lastProject').catch(() => {}); show('arg');
};
ON_CHANGE.push((t) => {
  const id = t.dataset && t.dataset.stage; if (!id) return false;
  const p = S.projects.find((x) => x.id === id); if (!p) return true;
  logEvent(p, `단계: ${stageName(p.stage)} → ${stageName(t.value)}`); p.stage = t.value; saveProject(p); paintSide(); return true;
});
ON_INPUT.push((t) => { if (t.id !== 'idea-text') return false; if (!homeIdeaOpen && t.value.length > 40) { homeIdeaOpen = true; t.rows = 3; } return true; });

/* ---------------- 찾기: 본문, 판례 색인, 조문 색인 ---------------- */
function findStatus() {
  const st = libStats(), t = statusText();
  if (!st.n) return '서재가 비어 있습니다. <button class="linkish" data-act="go" data-v="library">서재</button>에서 문헌 폴더를 고르면 모든 쪽을 찾을 수 있습니다.';
  return `문헌 ${st.ok}개 · ${st.pages.toLocaleString()}쪽에서 찾습니다${t ? ` · <b>${esc(t)}</b>` : ''}${st.blank ? ` · 글자 없는 스캔본 ${st.blank}개 제외(<button class="linkish" data-act="go" data-v="library">서재에서 글자 읽기</button>)` : ''}. 띄어쓰기와 조사는 달라도 찾고, <b>"따옴표"</b>로 묶으면 그 표현 그대로, <b>-낱말</b>은 그 낱말이 없는 쪽만 찾습니다.`;
}
function viewFind() {
  const tab = S.findTab || 'text';
  const docs = S.docs.filter((d) => d.indexed && !d.blank).sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  view().innerHTML = `<div class="page">
    <div class="seg find-tabs" role="tablist"><button class="${tab === 'text' ? 'on' : ''}" data-act="find-tab" data-v="text" role="tab" aria-selected="${tab === 'text'}">본문</button><button class="${tab === 'case' ? 'on' : ''}" data-act="find-tab" data-v="case" role="tab" aria-selected="${tab === 'case'}">판례 색인</button><button class="${tab === 'law' ? 'on' : ''}" data-act="find-tab" data-v="law" role="tab" aria-selected="${tab === 'law'}">조문 색인</button></div>
    ${tab === 'text' ? `<div class="find-box">
      <label class="sr" for="q">서재에서 찾기</label><input id="q" type="search" placeholder="서재 전체에서 찾기 · 예: 의회유보 본질성이론" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search">
      <label class="sr" for="q-doc">찾을 문헌</label><select id="q-doc"><option value="">모든 문헌</option>${docs.map((d) => `<option value="${d.id}"${S.qDoc === d.id ? ' selected' : ''}>${esc(d.title)}</option>`).join('')}</select></div>
    <p class="find-meta" id="find-status">${findStatus()}</p><div id="hits"></div>`
    : `<div class="find-box"><label class="sr" for="idx-q">색인 거르기</label><input id="idx-q" type="search" placeholder="${tab === 'case' ? '사건번호·법원으로 거르기 · 예: 2013헌바, 헌마' : '법령 이름으로 거르기 · 예: 공직선거법'}" value="${esc(S.idxQ || '')}" autocomplete="off"></div>
    <p class="find-meta">${tab === 'case' ? '서재 문헌에 나오는 사건번호를 모았습니다. <b>각주 복사</b>는 박사학위논문 양식으로 복사하며, 선고일은 서재 문헌에 적힌 날짜를 씁니다(찾지 못하면 ○로 비웁니다).' : '서재 문헌에 나오는 법령과 조문을 모았습니다. <b>법령 보기</b>는 누를 때만 국가법령정보센터(law.go.kr)를 새 창으로 엽니다.'}</p><div id="idx"><p class="sub">서재를 읽는 중…</p></div>`}
  </div>`;
  if (tab === 'text') { if (S.q) runFind(); setTimeout(() => { const q = $('#q'); if (q && !S.q && matchMedia('(pointer: fine)').matches) q.focus(); }, 30); }
  else paintIndex(tab);
}
ACT['find-tab'] = (el) => { S.findTab = el.dataset.v; viewFind(); };
const hlTerms = (pq) => [...pq.phrases, ...pq.words].filter((w) => w.length > 1).sort((a, b) => b.length - a.length);
function highlight(text, terms) {
  const html = esc(text);
  const pats = terms.map((t) => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  if (!pats.length) return html;
  const re = new RegExp(`(${pats.join('|')})`, 'gi');
  return html.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : part.replace(re, '<mark>$1</mark>'))).join('');
}
function snippet(text, pq) {
  const flat = text.replace(/\s+/g, ' '), low = flat.toLowerCase();
  let at = -1;
  for (const t of [...pq.phrases, ...pq.words, ...pq.terms]) { const i = low.indexOf(t); if (i >= 0) { at = i; break; } }
  const a = Math.max(0, at - 70), s = flat.slice(a, a + 240);
  return (a ? '…' : '') + s + (a + 240 < flat.length ? '…' : '');
}
let findT = 0, findSeq = 0;
async function runFind() {
  const box = $('#hits'); if (!box) return;
  const seq = ++findSeq, pq = parseQuery(S.q);
  if (!pq.terms.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<p class="sub">찾는 중…</p>';
  const lib = await libLoad(); if (seq !== findSeq || !$('#hits')) return;
  const hits = searchLib(lib, pq, 60, S.qDoc);
  if (!hits.length) { box.innerHTML = '<p class="find-none">맞는 쪽이 없습니다. 다른 낱말이나 동의어, 법률명·조문 번호로 찾아 보세요.</p>'; return; }
  const terms = hlTerms(pq), nDocs = new Set(hits.map((h) => h.id)).size;
  S.hits = hits;
  box.innerHTML = `<p class="find-count">${nDocs}개 문헌의 ${hits.length}${hits.length === 60 ? '+' : ''}쪽</p>` + hits.map((h, i) => {
    const d = docOf(h.id), D = lib.docs.find((x) => x.id === h.id), meta = [d.author, d.year].filter(Boolean).join(', ');
    return `<button class="hit" data-act="open-hit" data-i="${i}"><span class="hit-h"><b>${esc(d.title)}</b><span>${pageLabel(d, h.page)}${meta ? ` · ${esc(meta)}` : ''}${d.mine ? ' · 내 글' : ''}</span></span><span class="hit-s">${highlight(snippet(D.pages[h.page - 1], pq), terms)}</span></button>`;
  }).join('');
}
ACT['open-hit'] = (el) => { const h = S.hits && S.hits[+el.dataset.i]; if (h) openDoc(h.id, h.page, hlTerms(parseQuery(S.q))); };
let IDX = null;
async function buildIndex() {
  const lib = await libLoad(); if (IDX && IDX.key === lib.key) return IDX;
  const cases = new Map(), laws = new Map();
  for (const D of lib.docs) {
    const f = D.facts || {};
    for (const c of f.cases || []) { const e = cases.get(c.key) || { key: c.key, court: caseCourt(c.key), n: 0, docs: [] }; e.n += c.n; e.docs.push({ id: D.id, pages: c.pages }); cases.set(c.key, e); }
    for (const l of f.laws || []) {
      const m = l.key.match(/^(.*?)(?:\s(제\d+조(?:의\d+)?))?$/), name = m[1], art = m[2] || '';
      const e = laws.get(name) || { name, n: 0, docs: new Set(), arts: new Map() }; e.n += l.n; e.docs.add(D.id);
      if (art) { const a = e.arts.get(art) || { art, n: 0, docs: [] }; a.n += l.n; a.docs.push({ id: D.id, pages: l.pages }); e.arts.set(art, a); }
      laws.set(name, e);
    }
  }
  IDX = { key: lib.key, lib, cases: [...cases.values()].sort((a, b) => b.docs.length - a.docs.length || b.n - a.n), laws: [...laws.values()].sort((a, b) => b.docs.size - a.docs.size || b.n - a.n) };
  return IDX;
}
const artNum = (a) => { const m = a.match(/제(\d+)조(?:의(\d+))?/); return m ? +m[1] * 100 + +(m[2] || 0) : 0; };
const LAW_ALIAS = { 헌법: '대한민국헌법' };
const lawUrl = (name, art) => `https://www.law.go.kr/${encodeURI(`법령/${LAW_ALIAS[name] || name}${art ? `/${art}` : ''}`)}`;
const pagesHTML = (docs, max = 6) => docs.map((x) => { const d = docOf(x.id); if (!d) return ''; return `<span class="ix-doc"><span class="t" title="${esc(d.title)}">${d.mine ? '<b class="tag">내 글</b> ' : ''}${esc(d.author ? `${d.author}, ` : '')}${esc(d.title.length > 28 ? d.title.slice(0, 28) + '…' : d.title)}</span>${x.pages.slice(0, max).map((p) => `<button class="pg-chip" data-act="open-at" data-id="${d.id}" data-p="${p}" title="${esc(where(d, p).ui)}">${d.kind === 'pdf' ? p : `${p}부분`}</button>`).join('')}${x.pages.length > max ? `<span class="m">외 ${x.pages.length - max}곳</span>` : ''}</span>`; }).join('');
/* 서재에 그 사건의 판결문이 있으면(판결 분석에서 읽은 인용으로 가린다) */
const judgDocOf = (key) => S.docs.find((d) => d.isJudg && new RegExp(`(^|\\s)${String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test((d.cite || {}).caseCite || '')) || null;
async function paintIndex(tab) {
  const idx = await buildIndex(), box = $('#idx'); if (!box || S.view !== 'find') return;
  const q = String(S.idxQ || '').replace(/\s+/g, '').toLowerCase();
  if (tab === 'case') {
    const list = idx.cases.filter((c) => !q || `${c.key}${c.court}`.toLowerCase().includes(q));
    box.innerHTML = list.length ? `<p class="find-count">사건 ${list.length}건${list.length > 200 ? ' 가운데 많이 다룬 200건' : ''}</p><ul class="ix">${list.slice(0, 200).map((c) => `<li><div class="ix-h"><b>${esc(c.key)}</b><span class="m">${esc(c.court)} · 문헌 ${c.docs.length}편 · ${c.n}회</span><button class="btn sm" data-act="case-copy" data-k="${esc(c.key)}">각주 복사</button>${judgDocOf(c.key) ? `<button class="btn sm primary" data-act="j-open" data-id="${judgDocOf(c.key).id}">판결 분석</button>` : ''}</div><div class="ix-docs">${pagesHTML(c.docs)}</div></li>`).join('')}</ul>` : `<p class="find-none">${idx.cases.length ? '맞는 사건번호가 없습니다.' : '서재 문헌에서 사건번호를 찾지 못했습니다.'}</p>`;
  } else {
    const list = idx.laws.filter((l) => !q || l.name.replace(/\s+/g, '').toLowerCase().includes(q));
    box.innerHTML = list.length ? `<p class="find-count">법령 ${list.length}개${list.length > 150 ? ' 가운데 많이 다룬 150개' : ''}</p><ul class="ix">${list.slice(0, 150).map((l) => { const arts = [...l.arts.values()].sort((a, b) => artNum(a.art) - artNum(b.art)); return `<li><details${q && list.length < 6 ? ' open' : ''}><summary class="ix-h"><b>${esc(l.name)}</b><span class="m">문헌 ${l.docs.size}편 · ${l.n}회${arts.length ? ` · 조문 ${arts.length}개` : ''}</span><a class="btn sm" href="${lawUrl(l.name)}" target="_blank" rel="noopener noreferrer">법령 보기 ${IC.ext}</a></summary>
      ${arts.length ? `<table class="arts"><tbody>${arts.map((a) => `<tr><th><a href="${lawUrl(l.name, a.art)}" target="_blank" rel="noopener noreferrer" title="국가법령정보센터에서 이 조문 보기">${esc(a.art)} ${IC.ext}</a></th><td>${pagesHTML(a.docs, 4)}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">조문 번호 없이 법령 이름만 나옵니다.</p>'}</details></li>`; }).join('')}</ul>` : `<p class="find-none">${idx.laws.length ? '맞는 법령이 없습니다.' : '서재 문헌에서 법령을 찾지 못했습니다.'}</p>`;
  }
}
ACT['case-copy'] = async (el) => { const idx = await buildIndex(), r = caseCite(el.dataset.k, idx.lib); copyText(r.text, r.date ? `각주를 복사했습니다(선고일은 서재 문헌 ${r.from}곳에 적힌 날짜).` : '각주를 복사했습니다. 선고일을 서재에서 찾지 못해 ○로 비워 두었습니다.'); };
let idxT = 0;
ON_INPUT.push((t) => {
  if (t.id === 'q') { S.q = t.value; clearTimeout(findT); findT = setTimeout(runFind, 250); return true; }
  if (t.id === 'idx-q') { S.idxQ = t.value; clearTimeout(idxT); idxT = setTimeout(() => paintIndex(S.findTab), 200); return true; }
  if (t.id === 'rd-q' && S.reader) { S.reader.q = t.value; clearTimeout(docFindT); docFindT = setTimeout(runDocFind, 250); return true; }
  if (t.id === 'lib-q') { S.libQ = t.value; clearTimeout(idxT); idxT = setTimeout(paintDocList, 150); return true; }
  return false;
});
ON_CHANGE.push((t) => { if (t.id === 'q-doc') { S.qDoc = t.value; runFind(); return true; } return false; });

/* ---------------- 읽기 ---------------- */
let renderTask = null;
function openDoc(id, page, terms) { closeModals(); S.reader = { id, page: Math.max(1, page || 1), terms: terms || [], from: S.view === 'read' ? (S.reader && S.reader.from) : S.view }; show('read'); }
UI.openDoc = openDoc;
async function viewRead() {
  const r = S.reader, d = r && docOf(r.id);
  if (!d) { view().innerHTML = '<div class="page"><p class="find-none">문헌을 찾을 수 없습니다(서재에서 지웠을 수 있습니다).</p></div>'; return; }
  const pg = await docPages(d.id);
  const n = Math.max(1, (pg && pg.pages.length) || d.npages || 1);
  r.page = Math.min(Math.max(1, r.page), n);
  const pdfOk = d.kind === 'pdf' && !d.textOnly, mode = pdfOk ? S.settings.read : 'text';
  const meta = [d.author, d.year, d.venue].filter(Boolean).join(', ');
  const t = $('#title'); if (t) t.textContent = d.title;
  const back = VIEWS[r.from] && r.from !== 'read' ? VIEWS[r.from] : '찾기';
  const rc = S.project && readFor(d.id);
  view().innerHTML = `<div class="reader">
    <div class="rd-bar">
      <button class="btn" data-act="rd-back">← ${esc(back)}</button>
      <div class="rd-t"><b title="${esc(d.title)}">${esc(d.title)}</b><small>${esc(meta || '저자·연도 미입력')} · ${pageLabel(d, r.page)}</small></div>
      <div class="rd-nav"><button class="icon" data-act="rd-prev" aria-label="앞 쪽" ${r.page <= 1 ? 'disabled' : ''}>‹</button><input id="rd-pg" inputmode="numeric" value="${r.page}" aria-label="쪽 번호"><span>/ ${n}</span><button class="icon" data-act="rd-next" aria-label="다음 쪽" ${r.page >= n ? 'disabled' : ''}>›</button></div>
      ${pdfOk ? `<div class="seg" role="group" aria-label="보기"><button class="${mode === 'pdf' ? 'on' : ''}" data-act="rd-mode" data-v="pdf">원문</button><button class="${mode === 'text' ? 'on' : ''}" data-act="rd-mode" data-v="text">글자</button></div>` : ''}
    </div>
    <div class="rd-find"><label class="sr" for="rd-q">이 문헌에서 찾기</label><input id="rd-q" type="search" placeholder="이 문헌에서 찾기" autocomplete="off" value="${esc(r.q || '')}"><div id="rd-hits" class="rd-hits"></div></div>
    <div class="rd-body" id="rd-body">${mode === 'pdf' ? '<div class="rd-canvas"><canvas id="rd-canvas" aria-label="원문 쪽"></canvas></div><p class="rd-tip">글을 골라 인용하려면 <b>글자</b> 보기로 바꾸세요.</p>' : `<div class="rd-text" id="rd-text">${pageTextHTML(pg ? pg.pages[r.page - 1] : '', r.terms)}</div><p class="rd-tip">글을 골라 <b>카드에 담기</b>나 <b>인용 복사</b>를 누르세요.</p>`}</div>
    <div class="rd-foot">${d.isJudg || (pg && isJudgment(pg.pages)) ? '<button class="btn primary" data-act="rd-judg">판결 분석</button>' : ''}<button class="btn" data-act="rd-facts">빠른 파악</button>${S.project ? `<button class="btn${rc ? ' has' : ''}" data-act="rd-read">${rc ? '읽기 카드 ✓' : '읽기 카드'}</button>` : ''}<button class="btn" data-act="rd-card">이 쪽을 노트에</button><button class="btn" data-act="rd-cite">이 쪽 각주 복사</button></div>
  </div>`;
  if (mode === 'pdf') drawPage(d.id, r.page);
  if (r.q) runDocFind();
  const b = $('#rd-body'); if (b) b.scrollTop = 0;
}
function pageTextHTML(text, terms) {
  if (!text || !text.trim()) return '<p class="sub">이 쪽에서는 글자를 추출하지 못했습니다(스캔본일 수 있습니다). 원문 보기로 확인하거나, 서재에서 글자 읽기(OCR)를 하세요.</p>';
  return pageParas(text).map((x) => `<p class="${x.k}">${highlight(x.t, terms || [])}</p>`).join('');
}
/* a PDF page comes as lines; a paragraph ends where a sentence ends on a short line, headings and footnotes stand alone */
function pageParas(text) {
  const lines = String(text).split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  const lens = lines.filter((l) => l.length > 20).map((l) => l.length).sort((a, b) => a - b);
  const full = lens.length ? lens[Math.floor(lens.length * 0.75)] : 60;
  const HEAD = /^([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.．]|제\s*\d+\s*[장절편](\s|$)|\d{1,2}\.\s|[가-하]\.\s|\(\d{1,2}\)\s|[①-⑳]\s)/;
  const NOTE = /^\d{1,3}\)\s?\S/;
  const out = []; let cur = null;
  const flush = () => { if (cur && cur.t) out.push(cur); cur = null; };
  let first = true;
  for (const l of lines) {
    if (!l) { flush(); continue; }
    if (/^-?\s?\d{1,4}\s?-?$/.test(l)) continue; // page numbers
    if (first && l.length <= 60 && (/^\d{1,4}\s+\S/.test(l) || /\S\s\d{1,4}$/.test(l)) && !/[다요]\.$/.test(l)) { first = false; out.push({ k: 'rh', t: l }); continue; } // running head
    first = false;
    if (NOTE.test(l) && l.length <= 40 && !/[.다]$/.test(l) && !/선고|『|“|면\.?$/.test(l)) { flush(); out.push({ k: 'hd', t: l }); continue; } // “1) 조사권 발동요건” is a heading
    if (NOTE.test(l) && (!cur || cur.k !== 'fn')) { flush(); cur = { k: 'fn', t: l }; continue; }
    if (NOTE.test(l) && cur && cur.k === 'fn') { flush(); cur = { k: 'fn', t: l }; continue; }
    if (HEAD.test(l) && l.length <= 60 && !/[다요]\.$/.test(l)) { flush(); out.push({ k: 'hd', t: l }); continue; }
    if (!cur) cur = { k: '', t: l }; else cur.t += ' ' + l;
    if (cur.k !== 'fn' && /[.?!”’」』)]$/.test(l) && /[다요음]\.[”’)]?$|[.?!]$/.test(l) && l.length < full * 0.8) flush();
  }
  flush();
  return out;
}
async function drawPage(id, n) {
  const canvas = $('#rd-canvas'); if (!canvas) return;
  try {
    const doc = await pdfDocFor(id); if (!doc || !$('#rd-canvas')) return;
    const page = await doc.getPage(Math.min(n, doc.numPages));
    const box = canvas.parentElement.clientWidth || 700, v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2.4, box / v1.width), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vp = page.getViewport({ scale: scale * dpr });
    if (renderTask) { try { renderTask.cancel(); } catch (e) { /* ignore */ } }
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    canvas.style.width = `${Math.floor(vp.width / dpr)}px`; canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
    renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }); setRender(renderTask);
    await renderTask.promise; renderTask = null; setRender(null);
  } catch (e) { if (!e || e.name !== 'RenderingCancelledException') { const b = $('#rd-body'); if (b && $('#rd-canvas')) b.insertAdjacentHTML('afterbegin', '<p class="sub">원문을 그리지 못했습니다. 글자 보기로 확인하세요.</p>'); } }
}
function goPage(n) { const r = S.reader; if (!r) return; r.page = n; viewRead(); }
let docFindT = 0;
async function runDocFind() {
  const r = S.reader, box = $('#rd-hits'); if (!r || !box) return;
  const pq = parseQuery(r.q || ''); if (!pq.terms.length) { box.innerHTML = ''; return; }
  const lib = await libLoad();
  const hits = searchLib(lib, pq, 30, r.id).sort((a, b) => a.page - b.page);
  if (!$('#rd-hits')) return;
  box.innerHTML = hits.length ? hits.map((h) => `<button class="pg-chip${h.page === r.page ? ' on' : ''}" data-act="rd-go" data-p="${h.page}">${h.page}</button>`).join('') : '<span class="sub">이 문헌에는 맞는 쪽이 없습니다.</span>';
}
function readerSelection() {
  const sel = window.getSelection(), box = $('#rd-text');
  if (!sel || sel.isCollapsed || !box || !box.contains(sel.anchorNode) || !box.contains(sel.focusNode)) return null;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  return text.length >= 2 ? { text, rect: sel.getRangeAt(0).getBoundingClientRect() } : null;
}
function selTool(s) {
  let t = $('#seltool');
  if (!s) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement('div'); t.id = 'seltool'; t.className = 'seltool'; t.innerHTML = '<button data-act="sel-card">카드에 담기</button><button data-act="sel-cite">인용 복사</button>'; document.body.appendChild(t); }
  const below = s.rect.bottom + 10 + 44 < window.innerHeight;
  t.style.top = `${Math.round(below ? s.rect.bottom + 10 : Math.max(8, s.rect.top - 52))}px`;
  t.style.left = `${Math.round(Math.min(window.innerWidth - 220, Math.max(8, s.rect.left + s.rect.width / 2 - 105)))}px`;
  t.dataset.text = s.text;
}
const citeText = (quote, d, page) => `${quote ? `“${quote}”\n` : ''}${footnote(d, page)}`;
async function addCard(quote, docId, page) {
  const p = S.project; if (!p) return null;
  const order = Math.max(0, ...projCards(p).map((c) => c.order || 0)) + 1;
  const c = { id: uid(), projectId: p.id, no: nextCardNo(p), docId: docId || null, page: page || 0, quote: quote || '', memo: '', order, createdAt: Date.now() };
  S.cards.push(c); await saveCard(c); paintSide();
  toast(`‘${p.title}’ 노트에 카드 ${c.no}로 담았습니다.`);
  return c;
}
Object.assign(ACT, {
  'rd-back': () => show(S.reader && VIEWS[S.reader.from] && S.reader.from !== 'read' ? S.reader.from : 'find'),
  'rd-prev': () => goPage(S.reader.page - 1),
  'rd-next': () => goPage(S.reader.page + 1),
  'rd-go': (el) => goPage(+el.dataset.p),
  'rd-mode': (el) => { S.settings.read = el.dataset.v; saveSettings(); viewRead(); },
  'rd-card': () => { const r = S.reader; if (r) addCard('', r.id, r.page); },
  'rd-cite': () => { const r = S.reader; if (r) copyText(footnote(docOf(r.id), r.page), '이 쪽의 각주를 복사했습니다.'); },
  'rd-facts': () => { if (S.reader) showFacts(S.reader.id); },
  'rd-judg': () => { if (S.reader) openJudgment(S.reader.id); },
  'doc-judg': (el) => openJudgment(el.closest('[data-id]').dataset.id),
  'rd-read': () => { if (S.reader) openReadCard(S.reader.id).then(() => {}); },
  'sel-card': async () => { const t = $('#seltool'), r = S.reader; if (t && r) { await addCard(t.dataset.text, r.id, r.page); selTool(null); window.getSelection().removeAllRanges(); } },
  'sel-cite': () => { const t = $('#seltool'), r = S.reader; if (t && r) { copyText(citeText(t.dataset.text, docOf(r.id), r.page), '인용문과 각주를 복사했습니다.'); selTool(null); } },
  'open-at': (el) => openDoc(el.dataset.id, +el.dataset.p || 1, []),
});
ON_CHANGE.push((t) => { if (t.id === 'rd-pg') { const n = parseInt(t.value, 10); if (n) goPage(n); return true; } return false; });

/* ---------------- 빠른 파악: 문헌에서 그대로 뽑은 것만 ---------------- */
async function showFacts(id) {
  const d = docOf(id); if (!d) return;
  const pg = await docPages(id); if (!pg) return;
  const f = pg.facts || {};
  const at = (p) => `<button class="linkish" data-act="open-at" data-id="${d.id}" data-p="${p}">${d.kind === 'pdf' ? `${p}쪽` : `${p}번째 부분`}</button>`;
  const ats = (list) => list.slice(0, 6).map(at).join(', ') + (list.length > 6 ? ` 외 ${list.length - 6}곳` : '');
  const sec = (h, body) => (body ? `<section class="fact"><h3>${h}</h3>${body}</section>` : '');
  const cites = d.blank ? [] : citationsIn(pg.pages);
  const rc = S.project && readFor(id);
  modal(`<h2>${esc(d.title)}</h2><p class="sub">${esc([d.author, d.year, d.venue].filter(Boolean).join(', ') || '저자·연도 미입력')} · 문헌에서 그대로 뽑은 내용입니다. 쪽을 누르면 그 쪽이 열립니다.</p>
    ${sec(`초록${f.abstract ? ` <span class="m">${at(f.abstract.p)}</span>` : ''}`, f.abstract ? `<p>${esc(f.abstract.text)}</p>` : '')}
    ${sec('주제어', f.keywords && f.keywords.length ? `<p class="chips-wrap">${f.keywords.map((k) => `<span class="chip">${esc(k)}</span>`).join('')}</p>` : '')}
    ${sec('목차', f.outline && f.outline.length ? `<ul class="toc">${f.outline.map((h) => `<li class="lv${h.lv || (h.top ? 1 : 2)}">${esc(h.t)} <span class="m">${at(h.p)}</span></li>`).join('')}</ul>` : '')}
    ${sec(`서론의 첫머리${f.intro ? ` <span class="m">${esc(f.intro.head)} · ${at(f.intro.p)}</span>` : ''}`, f.intro ? `<p>${esc(f.intro.text)}</p>` : '')}
    ${sec(`결론의 첫머리${f.conclusion ? ` <span class="m">${esc(f.conclusion.head)} · ${at(f.conclusion.p)}</span>` : ''}`, f.conclusion ? `<p>${esc(f.conclusion.text)}</p>` : '')}
    ${sec('다룬 법령·조문', f.laws && f.laws.length ? `<ul class="refs-list">${f.laws.slice(0, 30).map((x) => `<li><b>${esc(x.key)}</b> <span class="m">${x.n}회 · ${ats(x.pages)}</span></li>`).join('')}</ul>` : '')}
    ${sec('인용한 판례', f.cases && f.cases.length ? `<ul class="refs-list">${f.cases.slice(0, 30).map((x) => `<li><b>${esc(x.key)}</b> <span class="m">${esc(caseCourt(x.key))} · ${x.n}회 · ${ats(x.pages)}</span></li>`).join('')}</ul>` : '')}
    ${sec(`각주·참고문헌에서 읽은 인용 ${cites.length}편`, cites.length ? `<ul class="refs-list">${cites.slice(0, 40).map((c) => `<li>${esc(c.author)}, ${c.kind === 'book' ? `『${esc(c.title)}』` : `“${esc(c.title)}”`}</li>`).join('')}${cites.length > 40 ? `<li class="m">외 ${cites.length - 40}편</li>` : ''}</ul>` : '')}
    ${!f.abstract && !(f.outline || []).length && !(f.laws || []).length ? '<p class="find-none">이 문헌에서 목차·초록 같은 구조를 찾지 못했습니다.</p>' : ''}
    <div class="modal-foot"><button class="btn" data-close>닫기</button>${S.project ? `<button class="btn" data-act="facts-read" data-id="${d.id}">${rc ? '읽기 카드 고치기' : '읽기 카드 쓰기'}</button>` : ''}<button class="btn primary" data-act="open-at" data-id="${d.id}" data-p="1">열기</button></div>`);
}
ACT['facts-read'] = (el) => { closeModals(); openReadCard(el.dataset.id); };

/* ---------------- 노트 ---------------- */
function viewNotes() {
  const p = S.project; if (!p) return;
  ensureCardNos(p);
  const cards = projCards(p);
  view().innerHTML = `<div class="page">
    <div class="notes-head"><h1>노트</h1>
      <div class="tools"><button class="btn" data-act="card-new">${IC.plus} 메모 카드</button>${cards.length ? '<button class="btn primary" data-act="notes-hwpx">한글로 저장</button><button class="btn" data-act="notes-docx">Word</button><button class="btn" data-act="notes-md">마크다운</button>' : ''}</div></div>
    <p class="sub">읽기 화면에서 글을 골라 <b>카드에 담기</b>를 누르면 쪽수와 함께 여기에 모입니다. 카드 번호는 바뀌지 않으며, 집필에서 〔카드 n〕으로 본문에 넣으면 그 자리가 각주가 됩니다.</p>
    <details class="proj"${p.memo ? ' open' : ''}><summary>연구 메모</summary><label class="field"><span>확정한 것, 미결 쟁점, 떠오른 생각</span><textarea data-pf="memo" rows="5">${esc(p.memo || '')}</textarea></label></details>
    <div class="cards">${cards.map(cardHTML).join('') || '<p class="find-none">아직 카드가 없습니다. <b>찾기</b>에서 쪽을 열고, 글을 골라 <b>카드에 담기</b>를 누르세요.</p>'}</div></div>`;
}
function cardHTML(c) {
  const d = c.docId ? docOf(c.docId) : null;
  return `<article class="card" data-id="${c.id}">
    ${c.quote ? `<blockquote>“${esc(c.quote)}”</blockquote>` : ''}
    ${c.docId ? `<div class="src">${esc(footnote(d, c.page))}${d ? ` <button class="linkish" data-act="card-open">원문 ${esc(where(d, c.page).ui)}</button>` : ''}</div>` : ''}
    <label class="sr" for="memo-${c.id}">메모</label><textarea id="memo-${c.id}" data-card-memo="${c.id}" rows="2" placeholder="${c.docId ? '이 인용에 대한 내 생각' : '메모'}">${esc(c.memo || '')}</textarea>
    <div class="card-tools"><span class="n">카드 ${c.no}</span><button data-act="card-up" title="위로" aria-label="위로">↑</button><button data-act="card-down" title="아래로" aria-label="아래로">↓</button>${c.docId ? '<button data-act="card-cite">인용 복사</button>' : ''}<button data-act="card-del" class="del">지우기</button></div>
  </article>`;
}
const cardOf = (el) => { const a = el.closest('.card'); return a ? S.cards.find((x) => x.id === a.dataset.id) : null; };
function notesBlocks(p) {
  const cite = citer(), blocks = [{ t: 'title', text: p.title }, { t: 'subtitle', text: `${kdate()} 노트` }];
  for (const c of projCards(p)) {
    const d = c.docId ? docOf(c.docId) : null, note = d ? cite(d, c.page) : null;
    blocks.push({ t: 'h3', text: `카드 ${c.no}` });
    if (c.quote) blocks.push({ t: 'quote', text: `“${c.quote.replace(/\s+/g, ' ')}”${note ? '〔n:0〕' : ''}`, notes: note ? [note] : [] });
    if (c.memo && c.memo.trim()) blocks.push({ t: 'p', text: c.memo.trim() + (note && !c.quote ? '〔n:0〕' : ''), notes: note && !c.quote ? [note] : [] });
    else if (note && !c.quote) blocks.push({ t: 'p', text: `(${d.title} ${where(d, c.page).ui})〔n:0〕`, notes: [note] });
  }
  return blocks;
}
async function notesExport(kind) {
  const p = S.project; if (!projCards(p).length) { toast('저장할 카드가 없습니다.'); return; }
  const name = `${safeName(p.title, 'YO아이 노트')} 노트`, blocks = notesBlocks(p);
  if (kind === 'hwpx') {
    const skel = new Uint8Array(await (await fetch(new URL('./hwpx-skeleton.hwpx', import.meta.url))).arrayBuffer());
    download(`${name}.hwpx`, await buildHwpx(skel, { title: p.title, author: '안요환', blocks }), HWPX_MIME); return;
  }
  if (kind === 'md') {
    let n = 0; const foot = [];
    const md = blocks.slice(2).map((b) => { const t = String(b.text).replace(/〔n:(\d+)〕/g, (_, k) => { foot.push(b.notes[+k]); return `[^${++n}]`; }); return b.t === 'h3' ? `### ${t}` : b.t === 'quote' ? `> ${t}` : t; }).join('\n\n');
    download(`${name}.md`, `# ${p.title}\n\n${md}\n\n${foot.map((f, i) => `[^${i + 1}]: ${f}`).join('\n')}\n`, 'text/markdown;charset=utf-8'); return;
  }
  const sections = [];
  for (const b of blocks.slice(2)) {
    if (b.t === 'h3') { sections.push({ heading: b.text, md: '', notes: [] }); continue; }
    const s = sections[sections.length - 1], base = s.notes.length; s.notes.push(...(b.notes || []));
    s.md += (b.t === 'quote' ? '> ' : '') + String(b.text).replace(/〔n:(\d+)〕/g, (_, k) => `〔c${base + +k + 1}〕`) + '\n\n';
  }
  download(`${name}.docx`, buildDocx({ title: p.title, subtitle: `${kdate()} 노트`, sections, creator: '안요환' }), DOCX_MIME);
}
Object.assign(ACT, {
  'card-new': async () => { const nc = await addCard('', null, 0); viewNotes(); const ta = nc && $(`[data-card-memo="${nc.id}"]`); if (ta) ta.focus(); },
  'card-open': (el) => { const c = cardOf(el); if (c) openDoc(c.docId, c.page, []); },
  'card-cite': (el) => { const c = cardOf(el); if (c) copyText(citeText(c.quote, docOf(c.docId), c.page), '인용문과 각주를 복사했습니다.'); },
  'card-del': async (el) => {
    const c = cardOf(el); if (!c) return;
    const used = (S.project.outline || []).some((s) => (s.cards || []).includes(c.id) || new RegExp(`〔\\s*카드\\s*${c.no}\\s*〕`).test(s.text || '')) || S.project.arg.some((n) => (n.refs || []).some((r) => r.t === 'card' && r.id === c.id));
    if (!(await confirmBox(`카드 ${c.no}을(를) 지울까요?${used ? ' 이 카드는 논증 설계도나 집필에 연결되어 있어, 그 연결도 함께 사라집니다.' : ''}`, '지우기'))) return;
    S.cards = S.cards.filter((x) => x.id !== c.id); await DB.del('cards', c.id); touched(); redraw('notes'); paintSide();
  },
  'card-up': (el) => moveCard(el, -1), 'card-down': (el) => moveCard(el, 1),
  'notes-hwpx': () => notesExport('hwpx'), 'notes-docx': () => notesExport('docx'), 'notes-md': () => notesExport('md'),
});
async function moveCard(el, dir) {
  const c = cardOf(el), list = projCards(S.project), i = list.indexOf(c), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  list.forEach((x, k) => { x.order = k + 1; });
  [list[i].order, list[j].order] = [list[j].order, list[i].order];
  await saveCard(list[i]); await saveCard(list[j]); redraw('notes');
}
let memoT = 0;
ON_INPUT.push((t) => { const mid = t.dataset && t.dataset.cardMemo; if (!mid) return false; const c = S.cards.find((x) => x.id === mid); if (c) { c.memo = t.value; clearTimeout(memoT); memoT = setTimeout(() => saveCard(c), 400); } return true; });

/* ---------------- 서재 ---------------- */
function libStatusHTML() {
  const st = libStats(), f = S.folder, t = statusText();
  const folder = f ? `<b>${esc(f.name)}</b> · ${f.perm === 'granted' ? '연결됨(열 때마다 다시 읽음)' : f.perm === 'prompt' ? '‘다시 읽기’를 누르면 바뀐 내용을 맞춥니다' : '이번에 읽음(폴더가 바뀌면 다시 골라 주세요)'}`
    : S.settings.folderName ? `<b>${esc(S.settings.folderName)}</b> · 바뀐 내용을 맞추려면 폴더를 다시 고르세요` : '아직 없음';
  return `<div class="lib-line">연결된 폴더: ${folder}${S.settings.folderAt ? ` · 마지막 확인 ${kdt(S.settings.folderAt)}` : ''}</div>
    <div class="lib-line">문헌 ${st.n}개${st.ok ? ` · ${st.pages.toLocaleString()}쪽 · 본문 ${st.chars >= 10000 ? `약 ${Math.round(st.chars / 10000).toLocaleString()}만` : st.chars.toLocaleString()}자` : ''} · ${fmtSize(st.size)}${t ? ` · <b>${esc(t)}</b>` : ''}</div>
    ${OCR.run ? `<div class="lib-line"><b>스캔본 글자 읽는 중</b> ${OCR.done}/${OCR.total} · 「${esc(OCR.doc)}」 ${esc(OCR.page)} <button class="btn sm" data-act="ocr-stop">멈추기</button></div>`
      : scanned().length ? `<div class="lib-line warn">글자가 없는 스캔본 ${scanned().length}개는 아직 찾기에서 빠집니다. <button class="btn sm primary" data-act="ocr-all">글자 읽기(OCR)</button></div><div class="lib-line">글자 읽기는 이 컴퓨터 안에서 쪽마다 몇 초씩 걸립니다. 켜 두고 다른 일을 하세요.</div>` : ''}
    <div class="lib-line" id="store-line"></div>`;
}
async function paintStore() {
  const el = $('#store-line'); if (!el || !navigator.storage || !navigator.storage.estimate) return;
  try {
    const e = await navigator.storage.estimate(), kept = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    el.innerHTML = `이 컴퓨터의 저장 공간: ${fmtSize(e.usage || 0)} 사용${e.quota ? ` / ${fmtSize(e.quota)} 가능` : ''} · ${kept ? '브라우저가 임의로 지우지 않도록 보호됨' : '<button class="linkish" data-act="persist">브라우저가 임의로 지우지 않게 보호하기</button>'}`;
  } catch (err) { /* not available */ }
}
const LIB_FILTERS = [['all', '모두'], ['mine', '내 글'], ['read', '읽기 카드'], ['noinfo', '정보 미입력'], ['scan', '스캔본']];
const docMetaLine = (d) => {
  const c = d.cite || {}, kind = (CITE_KINDS.find((k) => k[0] === c.kind) || [])[1];
  return `${esc([d.author, d.year || c.date, d.venue && (d.venue + (c.vol ? ' ' + c.vol : ''))].filter(Boolean).join(', ') || '저자·연도 미입력')}${kind ? ` · ${kind}` : ''} · ${d.kind === 'pdf' ? `PDF${d.npages ? ` ${d.npages}쪽` : ''}` : d.kind === 'hwp' ? `한글${d.nnotes ? ` · 각주 ${d.nnotes}개` : ''}` : '텍스트'} · ${fmtSize(d.size || 0)}${+d.page1 > 1 ? ` · ${d.page1}면부터` : ''}`;
};
function docRow(d) {
  const rc = S.project && readFor(d.id);
  const state = d.blank ? (d.kind === 'pdf' && !d.textOnly ? ' · <b class="warn">스캔본</b> <button class="linkish" data-act="ocr-one">글자 읽기</button>' : ' · <b class="warn">글자 없음</b>') : !d.indexed ? ' · 읽는 중' : d.ocr ? ' · 글자 인식함' : '';
  return `<div class="doc-row" data-id="${d.id}">
    <div class="doc-main"><button class="doc-open" data-act="doc-open" title="${esc(d.title)}">${esc(d.title)}</button>
      <div class="m">${docMetaLine(d)}${state}${d.folder ? ` · <span title="${esc(d.folder)}">폴더</span>` : ''}${d.mine ? ` · <b class="tag">내 글</b>${excluded(d) ? ' <span class="tag gray" title="군사과학논집 게재 글이나 3인 이상 공저는 문체 기준과 자기표절 대조에서 뺍니다">기준 제외</span>' : ''}` : ''}</div></div>
    <div class="doc-tools">${d.isJudg ? '<button class="btn sm" data-act="doc-judg">판결 분석</button>' : ''}${d.indexed && !d.blank ? '<button class="btn sm" data-act="doc-facts">빠른 파악</button>' : ''}${S.project ? `<button class="btn sm${rc ? ' has' : ''}" data-act="doc-read">${rc ? '읽기 카드 ✓' : '읽기 카드'}</button>` : ''}<button class="btn sm${d.mine ? ' has' : ''}" data-act="doc-mine" aria-pressed="${d.mine ? 'true' : 'false'}" title="내가 쓴 글이면 켜세요">내 글</button><button class="btn sm" data-act="doc-edit">정보</button><button class="btn sm danger" data-act="doc-del" aria-label="지우기">지우기</button></div></div>`;
}
function filteredDocs() {
  const f = S.libF || 'all', q = String(S.libQ || '').toLowerCase().replace(/\s+/g, '');
  return S.docs.filter((d) => (f === 'all' || (f === 'mine' && d.mine) || (f === 'read' && S.project && readFor(d.id)) || (f === 'noinfo' && !d.author) || (f === 'scan' && d.blank))
    && (!q || `${d.title}${d.author}${d.venue}`.toLowerCase().replace(/\s+/g, '').includes(q))).sort((a, b) => b.addedAt - a.addedAt);
}
function paintDocList() { const el = $('#doc-list'); if (!el) return; const list = filteredDocs(); el.innerHTML = list.map(docRow).join('') || `<p class="find-none">${S.docs.length ? '맞는 문헌이 없습니다.' : '아직 문헌이 없습니다.'}</p>`; const c = $('#lib-count'); if (c) c.textContent = `${list.length}편`; }
function viewLibrary() {
  view().innerHTML = `<div class="page">
    <div class="notes-head"><h1>서재</h1></div>
    <div class="lib-box">
      <div class="lib-head"><b>폴더 통째로 넣기</b><span><button class="btn primary" data-act="folder">${S.folder || S.settings.folderName ? '다른 폴더 고르기' : '폴더 고르기'}</button><button class="btn" data-act="folder-sync" ${S.folder && S.folder.handle ? '' : 'hidden'}>다시 읽기</button></span></div>
      <p class="sub">폴더(하위 폴더 포함) 안의 PDF·한글(.hwp·.hwpx)·텍스트를 모두 넣고 모든 쪽의 글자를 읽어 둡니다. 문헌은 이 컴퓨터 안에만 있으며 어디로도 보내지 않습니다.</p>
      <div id="lib-status">${libStatusHTML()}</div>
      <input type="file" id="folder-in" webkitdirectory multiple class="sr" tabindex="-1">
    </div>
    <label class="drop" id="drop">파일 몇 개만 넣으려면 여기에 끌어 놓거나 <u>눌러서 고르세요</u><input type="file" id="files" accept=".pdf,.hwp,.hwpx,.docx,.txt,.md,application/pdf,text/plain" multiple class="sr"></label>
    <p class="sub">문헌의 <b>정보</b>에 종류·학술지·권호·발행기관·첫 쪽 번호를 적으면 각주가 박사학위논문 양식 그대로 만들어집니다. 첫 쪽에서 읽은 제안이 있으면 눌러서 넣을 수 있습니다(저절로 채우지는 않습니다). 내가 쓴 글은 <b>내 글</b>로 표시하세요.</p>
    <div class="lib-filter"><button class="btn sm" data-act="bulk-meta" title="정보가 빈 문헌의 첫 쪽에서 저자·학술지·권호·쪽을 읽어 제안합니다">정보 제안 한꺼번에</button><div class="chips-row">${LIB_FILTERS.map(([k, l]) => `<button class="chip${(S.libF || 'all') === k ? ' on' : ''}" data-act="lib-f" data-v="${k}">${l}</button>`).join('')}</div><label class="sr" for="lib-q">제목·저자로 거르기</label><input id="lib-q" type="search" placeholder="제목·저자로 거르기" value="${esc(S.libQ || '')}" autocomplete="off"><span class="m" id="lib-count"></span></div>
    <div class="doc-list" id="doc-list"></div></div>`;
  paintDocList(); paintStore();
}
async function editDoc(id) {
  const d = docOf(id); if (!d) return;
  const c = d.cite || {};
  let sug = {}; try { const pg = d.indexed && !d.blank ? await docPages(id) : null; if (pg) sug = guessMeta(pg.pages); } catch (e) { /* none */ }
  const F = [['title', '제목', d.title], ['author', '저자 (공저는 ·로: 홍길동·김철수)', d.author], ['kind', '종류', c.kind || (d.venue ? 'article' : '')], ['venue', '학술지·책·사이트 이름 (편저의 장이면 책 이름)', d.venue], ['vol', '권호 (예: 제50권 제1호, 제74집 통권 제○호)', c.vol], ['publisher', '발행기관·출판사·학위 수여 기관', c.publisher], ['date', '발행 연월 (예: 2024. 3.) 또는 연도', c.date || d.year], ['page1', 'PDF 1쪽에 인쇄된 학술지 쪽 번호 (앞에 표지가 없으면 논문의 첫 쪽)', d.page1], ['pages', '논문 쪽 범위 (참고문헌용, 예: 219-249)', c.pages], ['editor', '편자 (편저의 장만)', c.editor], ['url', '주소 (웹 자료)', c.url], ['checked', '확인한 날 (웹 자료, 예: 2025. 10. 7.)', c.checked]];
  const fields = F.map(([k, label, value]) => (k === 'kind' ? { label, type: 'select', value: value || '', options: [['', '(고르기)'], ...CITE_KINDS] } : { label, value: value || '' }));
  const cur = { title: d.title, author: d.author, venue: d.venue, vol: c.vol, publisher: c.publisher, date: c.date || d.year, page1: d.page1, pages: c.pages };
  const sugs = Object.entries({ title: sug.title, author: sug.author, venue: sug.venue, vol: sug.vol, publisher: sug.publisher, date: sug.date, page1: sug.page1, pages: sug.pages }).filter(([k, v]) => v && v !== cur[k]);
  const intro = sugs.length ? `<div class="sugs"><span class="m">첫 쪽에서 읽은 제안(누르면 넣음):</span>${sugs.map(([k, v]) => `<button class="chip" data-sug="${k}" data-v="${esc(v)}">${esc({ title: '제목', author: '저자', venue: '학술지', vol: '권호', publisher: '발행기관', date: '발행', page1: 'PDF 1쪽', pages: '쪽 범위' }[k])}: ${esc(v)}</button>`).join('')}</div>` : '';
  const v = await formBox('문헌 정보', fields, { intro: intro + '<p class="sub">각주 미리 보기는 저장한 뒤 노트·읽기 화면에서 확인하세요.</p>', onOpen: (m) => {
    $$('[data-sug]', m.el).forEach((b) => b.addEventListener('click', () => { const i = F.findIndex((x) => x[0] === b.dataset.sug); const inp = $('#fb' + i, m.el); if (inp) { inp.value = b.dataset.v; inp.focus(); } b.classList.add('on'); }));
  } });
  if (!v) return;
  const val = Object.fromEntries(F.map(([k], i) => [k, String(v[i] || '').trim()]));
  const full = await DB.get('docs', id); if (!full) return;
  full.title = val.title || d.title; full.author = val.author; full.venue = val.venue;
  full.page1 = /^\d+$/.test(val.page1) ? val.page1 : '';
  full.year = (val.date.match(/(?:19|20)\d{2}/) || [''])[0];
  full.cite = { kind: val.kind, vol: val.vol, publisher: val.publisher, date: val.date, pages: /^\d+\s*[-–~]\s*\d+$/.test(val.pages) ? val.pages.replace(/\s*[–~]\s*|\s*-\s*/, '-') : '', editor: val.editor, url: val.url, checked: val.checked };
  await DB.put('docs', full); Object.assign(d, docMeta(full)); touched();
  toast(`저장했습니다. 각주: ${footnote(d, 1)}`); paintDocList();
}
const rowDoc = (el) => { const r = el.closest('.doc-row'); return r ? r.dataset.id : ''; };
/* 정보 제안 한꺼번에: 비어 있는 칸만, 사용자가 고른 문헌에만 넣는다 */
async function bulkMeta() {
  const todo = S.docs.filter((d) => d.kind === 'pdf' && d.indexed && !d.blank && (!d.author || !d.venue || !d.page1));
  if (!todo.length) { toast('정보가 빈 PDF 문헌이 없습니다.'); return; }
  toast('첫 쪽들을 읽는 중…');
  const rows = [];
  for (const d of todo) {
    const pg = await docPages(d.id); if (!pg) continue;
    const g = guessMeta(pg.pages), c = d.cite || {}, fill = {};
    if (!d.author && g.author) fill.author = g.author;
    if (!d.venue && g.venue) fill.venue = g.venue;
    if (!c.vol && g.vol) fill.vol = g.vol;
    if (!c.date && !d.year && g.date) fill.date = g.date;
    if (!d.page1 && g.page1) fill.page1 = g.page1;
    if (!c.publisher && g.publisher) fill.publisher = g.publisher;
    if (!c.pages && g.pages) fill.pages = g.pages;
    if (!c.kind && g.venue && g.vol) fill.kind = 'article';
    if (Object.keys(fill).length) rows.push({ d, fill, title: g.title });
  }
  if (!rows.length) { toast('첫 쪽에서 읽어 낸 정보가 없습니다. 정보 버튼으로 직접 적어 주세요.'); return; }
  const L = { author: '저자', venue: '학술지', vol: '권호', publisher: '발행기관', date: '발행', page1: 'PDF 1쪽', pages: '쪽 범위', kind: '종류' };
  const m = modal(`<h2>정보 제안 ${rows.length}편</h2><p class="sub">각 문헌의 첫 쪽들(쪽 머리, 권호, 저자 줄)에서 읽은 것입니다. <b>비어 있는 칸만</b> 채우며, 체크한 문헌에만 넣습니다. 넣은 뒤에도 정보에서 고칠 수 있습니다.</p>
    <div class="pick">${rows.map((r, i) => `<label class="pick-row"><input type="checkbox" value="${i}" checked><span>${esc(r.d.title)}${r.title && r.title !== r.d.title ? `<small>첫 쪽의 제목: ${esc(r.title)}</small>` : ''}<small>${Object.entries(r.fill).map(([k, v]) => `${L[k]}: ${esc(k === 'kind' ? '학술지 논문' : v)}`).join(' · ')}</small></span></label>`).join('')}</div>
    <div class="modal-foot"><button class="btn" data-close>취소</button><button class="btn primary" id="bm-ok">체크한 문헌에 넣기</button></div>`);
  $('#bm-ok', m.el).addEventListener('click', async () => {
    let n = 0;
    for (const x of m.el.querySelectorAll('input:checked')) {
      const r = rows[+x.value], full = await DB.get('docs', r.d.id); if (!full) continue;
      full.cite = full.cite || {};
      if (r.fill.author) full.author = r.fill.author;
      if (r.fill.venue) full.venue = r.fill.venue;
      if (r.fill.page1) full.page1 = r.fill.page1;
      if (r.fill.vol) full.cite.vol = r.fill.vol;
      if (r.fill.publisher) full.cite.publisher = r.fill.publisher;
      if (r.fill.pages) full.cite.pages = r.fill.pages;
      if (r.fill.kind) full.cite.kind = r.fill.kind;
      if (r.fill.date) { full.cite.date = r.fill.date; full.year = (r.fill.date.match(/(?:19|20)\d{2}/) || [''])[0]; }
      await DB.put('docs', full); Object.assign(r.d, docMeta(full)); n++;
    }
    touched(); m.close(); paintDocList(); toast(`${n}편의 정보를 채웠습니다. 제목은 그대로 두었습니다(바꾸려면 정보에서).`);
  });
}
ACT['bulk-meta'] = () => bulkMeta();
Object.assign(ACT, {
  'lib-f': (el) => { S.libF = el.dataset.v; $$('[data-act="lib-f"]').forEach((b) => b.classList.toggle('on', b === el)); paintDocList(); },
  'doc-open': (el) => openDoc(rowDoc(el), 1, []),
  'doc-facts': (el) => showFacts(rowDoc(el)),
  'doc-read': (el) => openReadCard(rowDoc(el)).then(() => {}),
  'doc-edit': (el) => editDoc(rowDoc(el)),
  'doc-del': async (el) => { const id = rowDoc(el), d = docOf(id); if (!d) return; if (!(await confirmBox(`‘${d.title}’을(를) 서재에서 지울까요? 이 문헌을 가리키는 노트·읽기 카드는 남습니다.${d.folder ? ' 연결된 폴더에 파일이 남아 있으면 다음에 폴더를 읽을 때 다시 들어옵니다.' : ''}`, '지우기'))) return; await removeDoc(id); paintDocList(); paintSide(); },
  'ocr-all': () => ocrAll(null, ocrDone), 'ocr-one': (el) => ocrAll(rowDoc(el), ocrDone), 'ocr-stop': () => { OCR.stop = true; paintStatus(); },
  folder: async () => { await connectFolder(); redraw('library'); },
  'folder-sync': () => syncFolder(),
  persist: async () => { if (navigator.storage && navigator.storage.persist) { const ok = await navigator.storage.persist(); toast(ok ? '이 컴퓨터에서 YO아이의 저장소를 보호합니다.' : '브라우저가 보호 요청을 받지 않았습니다. YO아이를 설치하거나 자주 열면 보호될 수 있습니다.'); paintStore(); } },
});
function ocrDone(r) { if (r.fail.length) modal(`<h2>글자 읽기 결과</h2><p class="prose">${r.ok}개 문헌의 글자를 읽었습니다.${r.stopped ? ' 중간에 멈췄습니다.' : ''}</p><ul class="plain">${r.fail.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><div class="modal-foot"><button class="btn primary" data-close>닫기</button></div>`); else if (r.ok) toast(`${r.ok}개 문헌의 글자를 읽었습니다.`); }
ON_CHANGE.push((t) => {
  if (t.id === 'files') { const fs = Array.from(t.files); t.value = ''; addFiles(fs).then(() => { redraw('library'); paintSide(); }); return true; }
  if (t.id === 'folder-in') { const fs = Array.from(t.files); t.value = ''; if (fs.length) syncFolder(fs); return true; }
  return false;
});
document.addEventListener('dragover', (e) => { const d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', (e) => { const d = e.target.closest && e.target.closest('#drop'); if (d) d.classList.remove('over'); });
document.addEventListener('drop', async (e) => { const d = e.target.closest && e.target.closest('#drop'); if (!d) return; e.preventDefault(); d.classList.remove('over'); await addFiles(Array.from(e.dataTransfer.files)); redraw('library'); paintSide(); });
ACT['doc-mine'] = async (el) => {
  const id = rowDoc(el), d = docOf(id); if (!d) return;
  if (d.mine) { await updateDoc(id, { mine: false }); paintDocList(); return; }
  let exclude = d.exclude;
  if (!excluded(d) && d.indexed && !d.blank) { const pg = await docPages(id), hint = pg ? excludeHint(pg.pages) : ''; if (hint) exclude = await confirmBox(`이 글은 ${hint}로 보입니다. 내 글로 표시하되, 문체 기준과 자기표절 대조에서는 뺄까요?`, '빼기'); }
  await updateDoc(id, { mine: true, exclude: !!exclude }); paintDocList();
  toast(exclude ? '내 글로 표시했습니다. 문체 기준과 자기표절 대조에서는 뺍니다.' : '내 글로 표시했습니다.');
};

/* ---------------- 설정·사용법 ---------------- */
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
async function wipeAll() {
  S.wiped = true;
  try { closePdf(); } catch (e) { /* ignore */ }
  const del = (name) => new Promise((res) => { try { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = () => res(true); r.onblocked = () => res(false); } catch (e) { res(false); } });
  let blocked = !(await del('yoai'));
  try { if (indexedDB.databases) for (const d of await indexedDB.databases()) if (d.name && /^webllm/i.test(d.name)) blocked = !(await del(d.name)) || blocked; } catch (e) { /* ignore */ }
  try { for (const k of await caches.keys()) if (/^(yoai-|webllm)/i.test(k)) await caches.delete(k); } catch (e) { /* ignore */ }
  try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) if (/\/yoai\/$/.test(r.scope)) await r.unregister(); } catch (e) { /* ignore */ }
  for (const st of ['localStorage', 'sessionStorage']) { try { const sto = window[st]; for (const k of Object.keys(sto)) if (/^(yoai|door:yoai)/.test(k)) sto.removeItem(k); } catch (e) { /* ignore */ } }
  document.body.innerHTML = `<main class="wiped"><h1>YO아이를 이 컴퓨터에서 지웠습니다</h1><p>문헌·연구·카드·오프라인용 파일을 모두 지웠습니다. 백업 폴더에 저장된 백업 파일과 송공 기록은 그대로입니다.</p>${blocked ? '<p><b>다른 창에 YO아이가 열려 있으면 그 창을 닫아야 마저 지워집니다.</b></p>' : ''}<p>이 탭을 닫으세요.</p><p><a href="../">0128.kr로 돌아가기</a></p></main>`;
}
function oldChatsMd() {
  let out = '# YO아이 이전 AI 대화\n\n';
  for (const c of S.chats.slice().sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))) {
    out += `## ${c.title || '대화'} (${kdate(c.updatedAt)})\n\n`;
    for (const m of c.messages || []) {
      if (m.role === 'user') { out += `**질문** ${m.text || ''}\n\n`; continue; }
      const text = m.content ? (m.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('') : String(m.text || '').replace(/<think>[\s\S]*?<\/think>/g, '');
      out += `**답** ${text.trim()}\n\n`;
      if (m.sources && m.sources.length) out += m.sources.map((x, k) => `[${k + 1}] ${footnote(docOf(x.docId), x.page)}`).join('\n') + '\n\n';
    }
  }
  return out;
}
function openSettings() {
  const bd = S.backupDir, bname = bd ? bd.name : S.settings.backupName;
  const m = modal(`<h2>설정</h2>
    <label class="field"><span>테마</span><select id="s-theme">${[['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(([v, l]) => `<option value="${v}"${S.settings.theme === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>쪽을 열 때 기본 보기</span><select id="s-read"><option value="pdf"${S.settings.read === 'pdf' ? ' selected' : ''}>원문(PDF 그대로)</option><option value="text"${S.settings.read === 'text' ? ' selected' : ''}>글자(골라서 인용)</option></select></label>
    <h3 class="mh">자동 백업</h3>
    <p class="sub">${bname ? `백업 폴더: <b>${esc(bname)}</b>${S.settings.backupAt ? ` · 마지막 백업 ${kdt(S.settings.backupAt)}` : ''}${S.backupState === 'prompt' ? ' · <b class="warn">폴더 사용을 다시 허락해야 합니다</b>' : ''}. 바뀐 내용이 있으면 그 폴더에 <b>YO아이-백업-날짜.json</b>을 쓰고 최근 14일치를 남깁니다. 클라우드 동기화 폴더(OneDrive 등)를 고르면 다른 컴퓨터에도 남습니다.` : '백업 폴더를 정하면 연구·카드·논증·문헌 정보가 바뀔 때마다 그 폴더에 자동으로 백업합니다(Chrome·Edge). 문헌 파일 자체는 원래 폴더에 있으니 백업에 넣지 않습니다.'}</p>
    <div class="tools-row"><button class="btn" id="s-bdir">${bname ? '백업 폴더 바꾸기' : '백업 폴더 정하기'}</button>${bname ? '<button class="btn" id="s-bnow">지금 백업</button>' : ''}</div>
    <h3 class="mh">백업 파일</h3>
    <p class="sub"><b>기록 백업</b>은 연구·카드·논증·문헌 정보만, <b>전체 백업</b>은 폴더 밖에서 넣은 문헌 파일까지 담습니다. 불러오면 지금 기록에 없는 것만 더합니다.</p>
    <div class="tools-row"><button class="btn" id="s-json">기록 백업(.json)</button><button class="btn" id="s-zip">전체 백업(.zip)</button><label class="btn" style="cursor:pointer">백업 불러오기<input type="file" id="s-restore" accept=".json,.zip,application/json,application/zip" class="sr"></label></div>
    ${S.chats.length ? `<h3 class="mh">이전 AI 대화 ${S.chats.length}개</h3><p class="sub">AI 기능을 없애기 전의 대화가 남아 있습니다. 마크다운으로 받아 두거나 지울 수 있습니다.</p><div class="tools-row"><button class="btn" id="s-chats">마크다운으로 받기</button><button class="btn danger" id="s-chats-del">대화 지우기</button></div>` : ''}
    <h3 class="mh">컴퓨터에 설치</h3>
    <p class="sub">${installEvt ? '<button class="btn" id="install">YO아이를 앱으로 설치</button> ' : ''}Chrome·Edge 주소창 오른쪽의 설치 아이콘(또는 메뉴 → 앱 설치)으로 설치하면 바탕화면·시작 메뉴에서 창으로 열립니다. 한 번 연 뒤에는 인터넷 없이도 열립니다.</p>
    <h3 class="mh">잠금과 지우기</h3>
    <p class="sub">이 브라우저에 저장한 YO아이 자료를 모두 지웁니다: 문헌·연구·카드·폴더 연결·오프라인용 파일. 백업 폴더의 파일과 송공 기록은 그대로 둡니다.</p>
    <div class="tools-row"><button class="btn" id="relock">잠금 다시 걸기</button><button class="btn danger" id="wipe">YO아이 자료 모두 지우기</button></div>
    <div class="modal-foot"><button class="btn" data-close>닫기</button><button class="btn primary" id="save">저장</button></div>`);
  const on = (id, fn) => { const b = $(id, m.el); if (b) b.addEventListener('click', fn); };
  on('#save', async () => { Object.assign(S.settings, { theme: $('#s-theme', m.el).value, read: $('#s-read', m.el).value }); await saveSettings(); m.close(); toast('저장했습니다.'); });
  on('#s-bdir', async () => { if (await chooseBackupDir()) { m.close(); openSettings(); } });
  on('#s-bnow', async () => { const ok = await autoBackup(true); toast(ok ? '백업 폴더에 저장했습니다.' : '백업하지 못했습니다. 폴더 사용을 허락했는지 확인하세요.'); if (ok) { m.close(); openSettings(); } });
  on('#s-json', () => download(`YO아이-기록-${stamp()}.json`, JSON.stringify(backupData()), 'application/json'));
  on('#s-zip', async () => { toast('전체 백업을 만드는 중…'); download(`YO아이-전체-${stamp()}.zip`, await fullBackupZip(), 'application/zip'); });
  on('#s-chats', () => download(`YO아이-이전대화-${stamp()}.md`, oldChatsMd(), 'text/markdown;charset=utf-8'));
  on('#s-chats-del', async () => { if (!(await confirmBox(`이전 AI 대화 ${S.chats.length}개를 지울까요? 되돌릴 수 없습니다.`, '지우기'))) return; for (const c of S.chats) await DB.del('chats', c.id); S.chats = []; touched(); m.close(); openSettings(); });
  on('#wipe', async () => { if (!(await confirmBox('문헌·연구·카드가 이 컴퓨터에서 모두 지워집니다. 되돌릴 수 없습니다. 남기려면 먼저 백업을 받으세요. 지울까요?', '모두 지우기'))) return; m.close(); await wipeAll(); });
  on('#install', async () => { const e = installEvt; installEvt = null; try { await e.prompt(); } catch (err) { /* ignore */ } m.close(); });
  on('#relock', () => { window.Door.close('yoai'); toast('다음에 열 때 비밀번호를 다시 묻습니다.'); });
  $('#s-restore', m.el).addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = await restoreFrom(f); S.projects.forEach(ensureProject); toast(`불러왔습니다(새 항목 ${n}개).`); m.close(); paintShell(); } catch (err) { toast('불러오지 못했습니다: ' + err.message); }
  });
}
function openHelp() {
  modal(`<h2>YO아이 사용법</h2><div class="help">
    <p><b>흐름</b> — 아이디어 → 연구 질문 → 선행연구 읽기 → 논증 설계 → 집필 → 원고 점검 → 투고 → 심사 대응. 왼쪽 <b>지금 연구</b> 아래의 메뉴가 이 순서입니다. 무엇을 언제 했는지는 연구마다 <b>연구 일지</b>에 저절로 쌓입니다.</p>
    <p><b>1. 연구</b> — 떠오른 물음은 <b>아이디어 은행</b>에 담아 두고, 쓸 만하면 <b>연구로 만들기</b>를 누르세요. 연구마다 단계·투고 학술지·마감일을 적어 둡니다.</p>
    <p><b>2. 서재</b> — <b>폴더 고르기</b>로 문헌 폴더를 고르면 PDF·한글·텍스트를 모두 넣고 모든 쪽의 글자를 읽습니다(Chrome·Edge에서는 열 때마다 바뀐 파일을 맞춤). 문헌의 <b>정보</b>에 종류·학술지·권호·발행기관·첫 쪽을 적으면 각주가 정확해집니다. 내가 쓴 글은 <b>내 글</b>로 표시하세요(군사과학논집 게재 글과 3인 이상 공저는 문체 기준과 자기표절 대조에서 늘 뺍니다).</p>
    <p><b>3. 찾기</b> — 서재 전체에서 쪽 단위로 찾습니다. <b>판례 색인</b>은 서재 문헌에 나오는 사건번호를, <b>조문 색인</b>은 법령과 조문을 모아 어느 문헌의 몇 쪽인지 보여 줍니다. 법령 보기는 누를 때만 국가법령정보센터를 엽니다.</p>
    <p><b>4. 읽기</b> — <b>빠른 파악</b>은 목차·초록·서론과 결론의 첫머리·다룬 조문·판례·인용 문헌을 원문에서 그대로 뽑아 보여 줍니다. <b>읽기 카드</b>에는 그 글의 질문·주장·근거·방법·한계와 내 연구와의 관계를 적습니다. 글을 골라 <b>카드에 담기</b>를 누르면 노트 카드가 됩니다.</p>
    <p><b>판결 분석</b> — 판결문(PDF·한글·Word·텍스트 파일, 또는 붙여 넣은 전문)을 넣으면 <b>사실관계 · 소송의 경과 · 판결이유 · 쟁점</b>으로 나눈 초안을 만듭니다. 소송의 경과는 심급마다 ‘○○법원(원심)은 …’으로 적고 그 심급의 판결을 각주로 달며, 판결이유는 고른 문단을 그대로 잇고 건너뛴 곳에 [･･･]를 넣습니다. 쟁점은 판시사항·이유의 제목·‘~인지 여부’ 문장·‘~에 관한 법리 오해’·당사자의 주장에서 모읍니다. 판결문에 없는 것은 지어내지 않고 비워 둡니다. 고친 정리는 그 판결문의 기록으로 남고, 한글·Word로 내보내거나 노트 카드·판례 평석 연구로 옮길 수 있습니다.</p>
    <p><b>5. 논증 설계도</b> — 연구 질문을 고쳐 쓸 때마다 이전 질문과 이유가 남습니다. 핵심 주장마다 근거·예상 반론·재반론을 세우고, 근거에 카드·쪽·판례·조문을 연결합니다. 점검이 근거 없는 주장, 답하지 않은 반론, 한 문헌에만 기댄 근거, 비어 있는 차별성을 알려 줍니다.</p>
    <p><b>6. 선행연구 지도</b> — 읽기 카드를 동의·반박·보완으로 나눠 보고, 차별성 문장을 실제로 읽은 문헌에 연결합니다. <b>서재 인용망</b>은 서재 문헌들이 함께 인용하는데 서재에 없는 문헌, 곧 꼭 읽어야 할 문헌을 찾아 줍니다.</p>
    <p><b>7. 집필</b> — <b>내 논문 틀로 시작</b>하면 그동안의 논문 흐름으로 개요가 섭니다. 장·절에 주장과 카드를 배치하고 초고에 〔카드 n〕을 넣은 뒤 <b>내보내기</b>를 누르면 한글 파일(.hwpx)이 되고, 각주는 박사학위논문 양식(두 번째부터 ‘앞의 논문’)으로 달립니다.</p>
    <p><b>8. 원고 점검</b> — 한글 원고를 넣으면 인용문을 서재의 원문과 대조하고(쪽수·저자까지), 각주 양식, 표기 섞임, 개념 용어, 장마다의 반론 검토, 평소 문체와의 차이, 선행연구·내 글과 겹치는 문장을 찾습니다. 점검할 때마다 기록이 남아 원고가 나아진 과정이 보입니다.</p>
    <p><b>9. 심사 대응</b> — 심사의견을 붙여 넣으면 의견마다 칸이 생기고, 답과 수정 위치를 적어 수정대조표를 한글 파일로 냅니다. 의견을 예상 반론으로 옮겨 다음 논문에 대비하세요.</p>
    <p><b>10. 보관</b> — 모든 기록은 이 브라우저 안에만 있고, 로그인도 서버도 없습니다. 설정에서 <b>백업 폴더</b>를 정하면 날마다 자동으로 백업합니다.</p></div>
    <div class="modal-foot"><button class="btn primary" data-close>닫기</button></div>`);
}
Object.assign(ACT, {
  go: (el) => show(el.dataset.v),
  menu: () => { $('#side').classList.toggle('open'); $('.shell').classList.toggle('side-open', $('#side').classList.contains('open')); },
  scrim: () => closeSide(),
  close: () => { try { window.parent.postMessage({ type: 'yoai:close' }, location.origin); } catch (err) { /* ignore */ } },
  help: () => { closeSide(); openHelp(); },
  settings: () => { closeSide(); openSettings(); },
  'backup-dir': async () => { if (await chooseBackupDir()) show(S.view); },
});

/* ---------------- 이벤트 ---------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) { if (!e.target.closest('#seltool')) selTool(null); return; }
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  try { await fn(el, e); } catch (err) { console.error(err); toast('문제가 생겼습니다: ' + (err.message || err)); }
});
let pfT = 0;
document.addEventListener('input', (e) => {
  const t = e.target;
  const k = t.dataset && t.dataset.pf;
  if (k && S.project) { S.project[k] = t.value; clearTimeout(pfT); pfT = setTimeout(() => saveProject(S.project), 400); return; }
  for (const h of ON_INPUT) if (h(t)) return;
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'project-sel') { selectProject(t.value); return; }
  if (t.dataset && t.dataset.pf && S.project) { clearTimeout(pfT); saveProject(S.project); return; }
  for (const h of ON_CHANGE) if (h(t)) return;
});
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.key === 'Enter' && e.target.id === 'rd-pg') { e.preventDefault(); const n = parseInt(e.target.value, 10); if (n) goPage(n); return; }
  if (e.key === 'Enter' && e.target.id === 'idea-text' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); ACT['idea-add'](); return; }
  if (typing || $('.modal-wrap')) return;
  if (S.view === 'read' && S.reader && e.key === 'ArrowLeft') { e.preventDefault(); if (S.reader.page > 1) goPage(S.reader.page - 1); }
  else if (S.view === 'read' && S.reader && e.key === 'ArrowRight') { e.preventDefault(); goPage(S.reader.page + 1); }
  else if (e.key === '/') { e.preventDefault(); S.findTab = 'text'; if (S.view !== 'find') show('find'); else viewFind(); setTimeout(() => { const q = $('#q'); if (q) q.focus(); }, 30); }
});
const onSel = () => setTimeout(() => { if (S.view === 'read') selTool(readerSelection()); }, 10);
document.addEventListener('mouseup', onSel); document.addEventListener('touchend', onSel); document.addEventListener('keyup', (e) => { if (e.shiftKey) onSel(); });
document.addEventListener('scroll', () => selTool(null), true);
let rsT = 0;
addEventListener('resize', () => { if (S.view === 'read' && S.reader && $('#rd-canvas')) { clearTimeout(rsT); rsT = setTimeout(() => drawPage(S.reader.id, S.reader.page), 200); } });
addEventListener('pagehide', () => { if (S.backupDir) autoBackup(false); });
window.addEventListener('message', (e) => { if (e.origin !== location.origin || !e.data) return; if (e.data.type === 'yoai:save') { try { e.source.postMessage({ type: 'yoai:saved' }, location.origin); } catch (err) { /* ignore */ } } });

/* ---------------- 시작 ---------------- */
const OLD_MEMO = [['concepts', '핵심 개념 정의'], ['decided', '확정한 사항'], ['open', '미결 쟁점'], ['notes', '메모'], ['style', '문체 메모']];
function migrate(p) {
  ensureProject(p);
  const old = OLD_MEMO.filter(([k]) => p[k] && String(p[k]).trim());
  if (old.length) { p.memo = [p.memo, ...old.map(([k, l]) => `[${l}]\n${String(p[k]).trim()}`)].filter(Boolean).join('\n\n'); for (const [k] of OLD_MEMO) delete p[k]; return true; }
  return false;
}
async function start() {
  try { await DB.open(); S.persistent = true; } catch (e) { S.persistent = false; toast(e.message || '저장소를 열지 못했습니다.'); }
  if (S.persistent) {
    S.settings = { ...DEFAULTS, ...((await DB.get('kv', 'settings')) || {}) };
    S.projects = (await DB.all('projects')) || []; S.chats = (await DB.all('chats')) || []; S.cards = (await DB.all('cards')) || [];
    S.reads = (await DB.all('reads')) || []; S.ideas = (await DB.all('ideas')) || [];
    const all = (await DB.all('docs')) || []; S.docs = all.map(docMeta); for (const d of all) if (d.judg) JUDG.set(d.id, d.judg);
  }
  applyTheme();
  for (const p of S.projects) if (migrate(p)) await DB.put('projects', p);
  if (!S.projects.length) await newProject('새 연구 프로젝트');
  const last = S.persistent ? await DB.get('kv', 'lastProject') : null;
  S.project = S.projects.find((p) => p.id === last) || S.projects[0];
  for (const p of S.projects) ensureCardNos(p);
  S.view = S.docs.length ? 'home' : 'library';
  paintShell();
  if (!S.persistent) { toast('이 브라우저에서는 저장이 되지 않습니다(비공개 창 등).'); return; }
  try { const h = await DB.get('kv', 'folder'); if (h && h.queryPermission) { S.folder = { name: h.name, handle: h, perm: await h.queryPermission({ mode: 'read' }) }; paintStatus(); if (S.folder.perm === 'granted') setTimeout(() => syncFolder(), 600); } } catch (e) { /* no folder */ }
  try { const b = await DB.get('kv', 'backupDir'); if (b && b.queryPermission) { S.backupDir = b; setTimeout(() => autoBackup(false), 4000); } } catch (e) { /* no backup folder */ }
  setTimeout(() => indexLibrary(), 900);
}
function lockView() {
  const n = window.Door.len('yoai'); let pin = '', fails = 0, busy = false;
  $('#app').innerHTML = `<div class="lock"><div class="lock-card"><span class="mark lg">YO</span><h1>YO아이</h1><p>비밀번호를 입력하세요</p><div class="dots">${'<i></i>'.repeat(n)}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-d="${d}">${d}</button>`).join('')}<button class="fn" data-d="clr">지우기</button><button data-d="0">0</button><button class="fn" data-d="del" aria-label="한 글자 지우기">←</button></div>
    <label class="rm"><input type="checkbox" id="rm"> 이 기기에서 30일 동안 묻지 않기</label></div></div>`;
  const draw = () => $$('.dots i').forEach((el, i) => el.classList.toggle('on', i < pin.length));
  const press = (d) => {
    if (busy) return;
    if (d === 'del') pin = pin.slice(0, -1); else if (d === 'clr') pin = ''; else if (pin.length < n) pin += d;
    draw();
    if (pin.length === n) {
      busy = true;
      setTimeout(() => {
        if (window.Door.check('yoai', pin)) { window.Door.open('yoai', $('#rm').checked); document.removeEventListener('keydown', kd); start(); return; }
        fails++; pin = ''; draw(); const c = $('.lock-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
        if (fails >= 5) { $('.lock-card p').textContent = '잠시 후 다시 시도하세요'; setTimeout(() => { busy = false; fails = 0; $('.lock-card p').textContent = '비밀번호를 입력하세요'; }, 15000); } else busy = false;
      }, 30);
    }
  };
  $('.pad').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) press(b.dataset.d); });
  const kd = (e) => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
  document.addEventListener('keydown', kd);
}
window.YOAI = { S, addFiles, libLoad, docPages, show, openDoc, showFacts, ACT };
if (window.Door && window.Door.isOpen('yoai')) start(); else lockView();
