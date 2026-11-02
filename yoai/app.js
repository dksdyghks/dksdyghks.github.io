/* 요AI — a research desk for public law. Claude through the official Anthropic SDK, called from this browser with the
   researcher's own API key (kept only in this browser). Prior studies live in a local library and are sent as PDF
   documents with citations on, so every claim can be traced to a page; web search checks statutes and cases. */
import Anthropic, { AuthenticationError, PermissionDeniedError, RateLimitError, APIConnectionError, APIUserAbortError, BadRequestError, NotFoundError, InternalServerError, APIError } from './anthropic-sdk.js';
import { renderMarkdown } from './md.js';

const EMBED = window.parent !== window;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const MODELS = {
  'claude-opus-5-5': { name: 'Opus 5.5', note: '기본 · 깊은 분석', in: 4, out: 20, cw: 5, cr: 0.2, webTools: 'new' },
  'claude-fable-5-1': { name: 'Fable 5.1', note: '최상위 성능 · 비용 약 2.5배', in: 10, out: 50, cw: 12.5, cr: 0.25, webTools: 'basic' },
  'claude-sonnet-5-5': { name: 'Sonnet 5.5', note: '빠르고 저렴', in: 2, out: 10, cw: 2.5, cr: 0.2, webTools: 'new' },
};
const EFFORTS = [['medium', '보통'], ['high', '깊게'], ['xhigh', '아주 깊게'], ['max', '최대']];
const DEFAULTS = { model: 'claude-opus-5-5', effort: 'high', web: true, showThinking: true, theme: 'auto', tier: 'complex' };
/* 무료 모드: inside claude.ai the page asks Claude through the viewer's own claude.ai account (no API key, no per-use bill) */
let SAMPLE = null;
const FREE_URL = 'https://claude.ai/artifact/LGhVvFbWdiRQCYtsUqQqsS';
async function detectFree() { try { if (window.claude && typeof window.claude.use === 'function') SAMPLE = await window.claude.use('sample'); } catch (e) { SAMPLE = null; } }
const FREE_NOTE = `

# 이번 환경
- 웹 검색을 쓸 수 없다. [검색 확인] 표시는 쓰지 않는다. 법령·판례·문헌은 첨부 문헌에서 확인한 경우에만 [첨부 문헌]으로 표시하고, 그 밖의 조문 번호·판례 사건번호·선고일은 [검증 필요]를 붙이거나 쓰지 않는다.
- 첨부 문헌을 근거로 할 때는 (문헌 번호·제목, ○쪽) 형식으로 쪽수를 밝힌다. 본문의 〔○쪽〕 표시가 쪽의 시작이다.
- 첨부 문헌의 일부만 실려 있으면 read_pages 도구로 필요한 쪽을 읽은 뒤 답한다.`;

/* ---------------- the researcher's principles (system prompt) ---------------- */
const SYSTEM = `당신은 ‘요AI’이다. 한국 헌법·행정법(공법)을 연구하는 독립 연구자 안요환 박사의 연구를 돕는 학술 연구 보조자이다. 질문에 답하는 데 그치지 않고, 연구문제를 세우고, 선행연구와 자료를 검토하고, 논증을 세우고, 글을 완성하는 연구의 전 과정을 지원한다.

# 여섯 가지 원칙
1. 전문성: 한국 헌법·행정법의 법리(기본권 심사구조, 과잉금지원칙, 평등심사, 법률유보·의회유보, 행정행위론, 행정절차, 행정소송·행정심판, 국가배상, 지방자치, 선거·정당 법제, 입법절차와 입법평가 등)와 법학 연구방법론(법해석론, 입법론, 비교법, 판례 분석, 법정책 분석)에 근거하여 답한다.
2. 정확성: 실제로 확인된 법령·판례·문헌만 근거로 제시한다.
   - 연구자가 첨부한 문헌을 근거로 할 때에는 그 문헌의 해당 부분을 인용한다.
   - 법령 조문은 웹 검색·열람이 가능하면 현행 조문과 시행일을 확인한다(국가법령정보센터 law.go.kr 우선). 확인하지 못하면 그렇다고 밝힌다.
   - 판례·헌법재판소 결정은 법원, 선고일, 사건번호를 확인한 경우에만 적는다. 확신할 수 없는 사건번호나 날짜는 쓰지 않고, 기억에 의존한 내용에는 [검증 필요]를 붙인다.
   - 존재하지 않는 문헌, 판례, 조문, 통계를 만들어 내지 않는다. 모르면 모른다고 말한다.
3. 비판적 분석: 학설과 판례를 나열하는 데 그치지 않고 각 견해의 전제·논거·한계를 짚으며, 논증이 약한 지점을 구체적으로 논증한다.
4. 독창성: 선행연구가 충분히 다루지 않은 쟁점, 판례와 학설이 어긋나는 틈, 입법의 공백을 찾아 새로운 연구 방향과 연구질문을 근거와 함께 제안한다.
5. 일관성: 연구문제·개념 정의·결론이 처음부터 끝까지 맞물리게 한다. 아래 ‘연구 프로젝트’의 연구문제와 개념 정의를 따르며, 이와 어긋나는 서술이 필요하면 어긋남을 명시한다.
6. 연구자 통제: 검증되지 않은 논증을 사실처럼 확정하지 않는다. 학술적 판단이 갈리는 지점에서는 선택지와 각 선택의 대가를 제시하고, 최종 판단은 연구자에게 맡긴다.

# 근거 표시
판단의 근거가 달라지는 단위(문장이나 단락)마다 끝에 다음 표시 중 하나를 붙인다. 과도하게 반복하지 않는다.
- [첨부 문헌] 연구자가 첨부한 자료에서 확인한 내용
- [검색 확인] 이번 답변에서 웹으로 확인한 내용
- [일반 법리] 교과서 수준에서 확립되어 다툼이 없는 법리
- [추론] 요AI의 분석·해석·평가
- [검증 필요] 기억에 의존했거나 확인하지 못한 내용 — 연구자가 반드시 원문을 확인해야 함

# 문체
연구자의 논문 문체를 따른다. 간결한 학술 문어체(‘~이다’, ‘~라고 할 것이다’, ‘~로 보인다’)로 쓰고, 과장과 수사를 배제하며 판단의 근거를 먼저 밝힌다. 국내 공법학계의 표준 용어를 쓰고, 한 글 안에서 같은 개념은 같은 용어로 쓴다. 조문은 「법률명」 제○조 제○항 제○호, 판례는 대법원 ○○○○. ○. ○. 선고 ○○두○○○○ 판결, 헌법재판소 ○○○○. ○. ○. ○○헌마○○○ 결정의 형식으로 적되, 확인된 경우에만 적는다. 외국 법제나 문헌을 다룰 때에는 원어 용어를 괄호로 병기한다. 아래에 연구자의 문체 샘플이 있으면 그 문장 호흡과 어휘 선택을 따른다.

# 답변 구조
- 간단한 질문에는 간단히 답한다.
- 깊은 분석이 필요하면 쟁점 정리 → 현행 법제·판례 → 학설 → 비판적 검토 → 대안·입법론 → 남은 과제를 기본 골격으로 하되, 질문에 맞게 줄이거나 바꾼다.
- 분석형 답변의 끝에는 ‘연구자 판단이 필요한 지점’을 2~4개 짧게 적는다.
- 비교가 필요하면 표를 쓴다.`;

/* ---------------- research workflows (shortcuts) ---------------- */
const FLOWS = [
  { id: 'rq', name: '연구문제 구조화', desc: '문제의식을 연구질문·범위·방법·기여로 정리', tpl: '다음 문제의식을 학술논문의 연구문제로 구조화해 주세요.\n\n[문제의식]\n{{입력}}\n\n다음 순서로 정리해 주세요: (1) 문제의 배경과 문제의식 (2) 주된 연구질문과 하위 연구질문 (3) 검토 범위와 제외 범위 (4) 연구방법 (5) 예상되는 학문적·실무적 기여 (6) 선행연구와 비교할 때 차별성이 있을 수 있는 지점과, 그 차별성을 확인하기 위해 찾아봐야 할 자료.' },
  { id: 'lit', name: '선행연구 지도', desc: '첨부 문헌의 요지·방법·결론·한계와 연구 공백', tpl: '첨부한 선행연구들을 검토해 주세요.\n\n1. 문헌별로 연구질문, 연구방법, 핵심 논거, 결론, 한계를 표로 정리하고, 각 항목에 해당 쪽을 인용해 주세요.\n2. 문헌들 사이에서 견해가 갈리는 지점과 그 이유를 분석해 주세요.\n3. 이 문헌들이 충분히 다루지 않은 쟁점(연구 공백)을 3~5개 찾고, 각각에 대해 새로운 연구질문을 제안해 주세요.\n\n[연구자의 관심사]\n{{입력}}' },
  { id: 'case', name: '판례 평석', desc: '사안·판시·쟁점·비판적 평석·의의', tpl: '다음 판례(결정)에 대한 평석을 작성해 주세요. 사건번호와 판시사항은 웹에서 원문을 확인한 뒤 인용해 주세요.\n\n[판례]\n{{입력}}\n\n구성: (1) 사안의 개요 (2) 판시사항과 결정 요지(다수의견·별개의견·반대의견 구분) (3) 쟁점의 정리 (4) 비판적 검토 — 법리의 정합성, 선례와의 관계, 학설의 평가 (5) 판례의 의의와 남은 과제.' },
  { id: 'const', name: '헌법적 논증', desc: '제한되는 기본권·심사기준·과잉금지·평등', tpl: '다음 법률(조항 또는 제도)의 위헌 여부를 논증해 주세요.\n\n[심사 대상]\n{{입력}}\n\n구성: (1) 제한되는 기본권과 그 보호영역 (2) 심사기준의 선택과 그 이유(엄격/완화) (3) 과잉금지원칙 네 단계(목적의 정당성, 방법의 적정성, 피해의 최소성, 법익의 균형성) (4) 필요하면 평등원칙 심사 (5) 결론과 예상되는 반론, 그에 대한 재반론. 관련 헌법재판소 결정은 확인된 것만 인용해 주세요.' },
  { id: 'bill', name: '입법개선안', desc: '문제 진단 → 대안 비교 → 조문 대비표', tpl: '다음 문제에 대한 입법개선안을 제시해 주세요.\n\n[문제]\n{{입력}}\n\n구성: (1) 현행 법제의 규율 구조와 문제점 진단(현행 조문은 웹에서 확인) (2) 가능한 입법 대안 2~3가지와 각각의 장단점, 헌법적 쟁점 (3) 권고안 (4) 개정 조문 대비표(현행 | 개정안 | 개정 이유) (5) 시행에 필요한 경과규정과 하위법령 정비 사항.' },
  { id: 'counter', name: '반론 검토', desc: '내 주장에 대한 가장 강한 반론과 재반론', tpl: '다음 주장에 대해 심사위원이나 반대 학설의 입장에서 제기할 수 있는 가장 강한 반론 5개를 제시하고, 각각에 대한 재반론과 내 논증을 보완할 방법을 알려 주세요. 반론의 강도 순으로 정렬해 주세요.\n\n[주장]\n{{입력}}' },
  { id: 'verify', name: '인용 검증', desc: '글 속 법령·판례·문헌 인용을 웹으로 대조', tpl: '다음 글에 나오는 모든 법령 조문, 판례·결정, 문헌 인용을 하나씩 웹에서 확인해 표로 정리해 주세요. 열: 인용 | 확인 결과(일치 / 불일치 / 확인 불가) | 확인한 출처 | 비고(정정할 내용). 확인하지 못한 것은 확인 불가로 두고 추측하지 마세요.\n\n[글]\n{{입력}}' },
  { id: 'edit', name: '학술 문체 교정', desc: '논리 흐름·용어 일관성·문장 교정', tpl: '다음 글을 학술논문 문체로 교정해 주세요. 내용은 바꾸지 말고, (1) 교정한 글 (2) 주요 수정 사항과 이유(논리 흐름, 용어 일관성, 문장 호흡, 근거 제시 방식) 순서로 보여 주세요.\n\n[글]\n{{입력}}' },
  { id: 'sum', name: '문헌 요약', desc: '첨부 문헌의 장별 요약과 핵심 논거', tpl: '첨부 문헌을 요약해 주세요. (1) 한 문단 요지 (2) 장·절별 요약(쪽수 인용) (3) 핵심 논거와 그 근거 (4) 이 문헌을 내 연구에 인용할 때 유의할 점.\n\n[내 연구와의 관련성]\n{{입력}}' },
];
const CHAINS = [
  { id: 'plan', name: '연구계획서 초안', desc: '연구문제 구조화 → 선행연구 검토 → 연구계획서', steps: [
    '다음 문제의식을 연구문제로 구조화해 주세요(배경, 주·하위 연구질문, 범위, 방법, 기여).\n\n{{입력}}',
    '방금 정리한 연구문제를 기준으로, 첨부한 선행연구(첨부가 없다면 웹 검색으로 확인할 수 있는 국내 선행연구)를 검토하여 연구 공백과 이 연구의 차별성을 논증해 주세요. 확인하지 못한 문헌은 쓰지 마세요.',
    '지금까지의 내용을 바탕으로 연구계획서 초안을 작성해 주세요: 연구의 필요성 → 연구 목적과 질문 → 선행연구 검토와 차별성 → 연구 내용(장별 구성) → 연구 방법 → 기대효과. 마지막에 연구자가 결정해야 할 사항을 정리해 주세요.',
  ] },
  { id: 'case2', name: '판례 평석 → 반론 검토', desc: '평석 작성 후 그 평석에 대한 반론까지', steps: [
    '다음 판례(결정)에 대한 평석을 작성해 주세요. 사건번호와 판시사항은 웹에서 확인해 주세요.\n\n{{입력}}',
    '방금 작성한 평석의 핵심 주장에 대해 가장 강한 반론 5개와 재반론을 제시하고, 평석을 보완할 수정안을 제안해 주세요.',
  ] },
];

/* ---------------- storage ---------------- */
const DB = (() => {
  let db = null;
  const open = () => new Promise((res, rej) => {
    const req = indexedDB.open('yoai', 1);
    req.onupgradeneeded = () => { const d = req.result; for (const s of ['projects', 'chats', 'docs']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); };
    req.onsuccess = () => { db = req.result; res(db); }; req.onerror = () => rej(req.error);
  });
  const run = (st, mode, fn) => new Promise((res, rej) => { if (!db) { res(undefined); return; } let out; const t = db.transaction(st, mode); const r = fn(t.objectStore(st)); if (r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); });
  return { open, get: (s, k) => run(s, 'readonly', (o) => o.get(k)), all: (s) => run(s, 'readonly', (o) => o.getAll()), put: (s, v, k) => run(s, 'readwrite', (o) => (k === undefined ? o.put(v) : o.put(v, k))), del: (s, k) => run(s, 'readwrite', (o) => o.delete(k)), ready: () => !!db };
})();
const S = { settings: { ...DEFAULTS }, projects: [], chats: [], docs: [], project: null, chat: null, attach: [], busy: null, ctxOpen: false, persistent: false };
const store = (k) => { try { return k === 'local' ? localStorage : sessionStorage; } catch (e) { return null; } };
const KEY = 'yoai.key';
function getKey() { for (const k of ['session', 'local']) { try { const v = store(k) && store(k).getItem(KEY); if (v) return v; } catch (e) { /* ignore */ } } return ''; }
function setKey(v, remember) { try { store('local').removeItem(KEY); store('session').removeItem(KEY); } catch (e) { /* ignore */ } if (!v) return; try { (remember ? store('local') : store('session')).setItem(KEY, v); } catch (e) { /* ignore */ } }
async function saveSettings() { applyTheme(); try { await DB.put('kv', S.settings, 'settings'); } catch (e) { /* ignore */ } }
const saveProject = (p) => { p.updatedAt = Date.now(); return DB.put('projects', p).catch(() => {}); };
const saveChat = (c) => { c.updatedAt = Date.now(); return DB.put('chats', c).catch((e) => toast('대화를 저장하지 못했습니다: ' + e.message)); };
function applyTheme() { const r = document.documentElement; if (S.settings.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.settings.theme); }

let toastT = 0;
function toast(m) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------------- documents ---------------- */
const b64cache = new Map();
function toBase64(buf) { const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
async function docBlock(id) {
  const d = await DB.get('docs', id); if (!d) return null;
  const meta = [d.author, d.year, d.venue].filter(Boolean).join(', ');
  if (d.kind === 'pdf') {
    if (!b64cache.has(id)) b64cache.set(id, toBase64(d.bytes));
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64cache.get(id) }, title: d.title, ...(meta ? { context: meta } : {}), citations: { enabled: true } };
  }
  return { type: 'document', source: { type: 'text', media_type: 'text/plain', data: d.text }, title: d.title, ...(meta ? { context: meta } : {}), citations: { enabled: true } };
}
async function addFiles(files) {
  let n = 0;
  for (const f of files) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (f.size > 30 * 1024 * 1024) { toast(`${f.name}: 30MB를 넘는 파일은 넣을 수 없습니다.`); continue; }
    const title = f.name.replace(/\.[^.]+$/, '');
    const doc = { id: uid(), title, author: '', year: '', venue: '', size: f.size, addedAt: Date.now() };
    if (ext === 'pdf' || f.type === 'application/pdf') { doc.kind = 'pdf'; doc.bytes = await f.arrayBuffer(); }
    else if (['txt', 'md', 'text'].includes(ext) || f.type.startsWith('text/')) { doc.kind = 'text'; doc.text = await f.text(); }
    else { toast(`${f.name}: PDF나 텍스트 파일만 넣을 수 있습니다.`); continue; }
    await DB.put('docs', doc); S.docs.push(doc); n++;
  }
  if (n) toast(`서재에 ${n}개 문헌을 넣었습니다.`);
  return n;
}
let pdfjsP = null;
async function pdfText(bytes) {
  if (!pdfjsP) pdfjsP = import('./pdf.js').then((m) => { m.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.js', import.meta.url).href; return m; });
  const pdfjs = await pdfjsP;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); const tc = await pg.getTextContent(); pages.push(tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : '')).join('').replace(/[ \t]+\n/g, '\n').trim()); }
  return pages;
}
const chunkText = (t) => { const out = []; for (let i = 0; i < t.length; i += 3000) out.push(t.slice(i, i + 3000)); return out.length ? out : ['']; };
async function docPages(id) {
  const d = await DB.get('docs', id); if (!d) return null;
  if (!d.pages) { d.pages = d.kind === 'pdf' ? await pdfText(d.bytes) : chunkText(d.text || ''); await DB.put('docs', d); }
  return { id, title: d.title, meta: [d.author, d.year, d.venue].filter(Boolean).join(', '), pages: d.pages };
}
const docTitle = (id) => { const d = S.docs.find((x) => x.id === id); return d ? d.title : '(삭제된 문헌)'; };
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

/* ---------------- request building ---------------- */
function projectText(p) {
  if (!p) return '';
  const f = (label, v) => (v && v.trim() ? `- ${label}: ${v.trim()}` : '');
  const lines = [f('연구문제', p.question), f('핵심 개념 정의', p.concepts), f('연구자가 확정한 사항(이 판단을 전제로 삼는다)', p.decided), f('미결 쟁점', p.open), f('메모', p.notes)].filter(Boolean);
  let out = lines.length ? `# 연구 프로젝트: ${p.title}\n${lines.join('\n')}` : '';
  if (p.style && p.style.trim()) out += `${out ? '\n\n' : ''}# 연구자의 문체 샘플(내용이 아니라 문장 호흡과 어휘를 따를 것)\n${p.style.trim()}`;
  return out;
}
async function apiMessages(chat) {
  const out = [];
  for (const m of chat.messages) {
    if (m.role === 'user') {
      const content = [];
      for (const id of m.docs || []) { const b = await docBlock(id); if (b) content.push(b); }
      content.push({ type: 'text', text: m.text });
      out.push({ role: 'user', content });
    } else if (m.role === 'assistant' && m.api !== false && m.content && m.content.length) out.push({ role: 'assistant', content: m.content });
  }
  return out;
}
function tools() {
  if (!S.settings.web) return undefined;
  const basic = (MODELS[S.settings.model] || {}).webTools === 'basic';
  return [
    { type: basic ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: 8 },
    { type: basic ? 'web_fetch_20250910' : 'web_fetch_20260209', name: 'web_fetch', max_uses: 8, citations: { enabled: true } },
  ];
}
function client() { return new Anthropic({ apiKey: getKey(), dangerouslyAllowBrowser: true, maxRetries: 2 }); }
function cost(usage, model) {
  const M = MODELS[model] || MODELS['claude-opus-5-5'];
  if (!usage) return 0;
  return ((usage.input_tokens || 0) * M.in + (usage.cache_creation_input_tokens || 0) * M.cw + (usage.cache_read_input_tokens || 0) * M.cr + (usage.output_tokens || 0) * M.out) / 1e6
    + ((usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0) * 0.01;
}
function addUsage(a, b) { if (!b) return a; const o = { ...(a || {}) }; for (const k of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) o[k] = (o[k] || 0) + (b[k] || 0); const ws = (b.server_tool_use && b.server_tool_use.web_search_requests) || 0; o.server_tool_use = { web_search_requests: ((o.server_tool_use && o.server_tool_use.web_search_requests) || 0) + ws }; return o; }

/* ---------------- one turn: stream, continue paused turns, store the full content ---------------- */
async function runTurnFree() {
  const chat = S.chat; if (!chat || S.busy) return;
  const ac = new AbortController();
  const msg = { id: uid(), role: 'assistant', content: [], model: 'claude.ai', free: true, at: Date.now(), live: true };
  chat.messages.push(msg);
  S.busy = { ac, msg };
  paintThread(); paintComposer();
  try {
    const ids = [...new Set(chat.messages.flatMap((m) => m.docs || []))];
    const docs = []; for (const id of ids) { const d = await docPages(id); if (d) docs.push(d); }
    const LIMIT = 150000; let used = 0, docText = '';
    docs.forEach((d, i) => {
      const total = d.pages.reduce((n, t) => n + t.length, 0);
      const header = `【문헌 ${i + 1}】 ${d.title}${d.meta ? ` (${d.meta})` : ''} — 총 ${d.pages.length}쪽`;
      if (used + total <= LIMIT) { used += total; docText += `\n\n${header}\n${d.pages.map((t, k) => `〔${k + 1}쪽〕\n${t}`).join('\n')}`; }
      else { const head = d.pages.slice(0, 2).map((t, k) => `〔${k + 1}쪽〕\n${t}`).join('\n'); used += head.length; docText += `\n\n${header} — 분량이 많아 1~2쪽만 실었다. 나머지 쪽은 read_pages 도구로 읽을 것.\n${head}`; }
    });
    const pt = projectText(S.project);
    const intro = `${SYSTEM}${FREE_NOTE}${pt ? `\n\n${pt}` : ''}${docText ? `\n\n# 첨부 문헌${docText}` : ''}\n\n# 연구자의 요청\n`;
    const turns = [];
    for (const m of chat.messages) {
      if (m === msg) break;
      if (m.role === 'user') turns.push({ role: 'user', content: m.text });
      else if (m.role === 'assistant' && m.api !== false) { const t = (m.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''); if (t) turns.push({ role: 'assistant', content: t }); }
    }
    const merged = [];
    for (const t of turns) { const last = merged[merged.length - 1]; if (last && last.role === t.role) last.content += `\n\n${t.content}`; else merged.push({ ...t }); }
    if (merged.length && merged[0].role === 'user') merged[0].content = intro + merged[0].content;
    const tools = docs.length ? [{
      name: 'read_pages', description: '첨부 문헌의 특정 쪽 본문을 읽는다. doc은 문헌 번호(1부터), from과 to는 쪽 번호이며 한 번에 최대 15쪽까지 읽는다.',
      inputSchema: { type: 'object', properties: { doc: { type: 'integer' }, from: { type: 'integer' }, to: { type: 'integer' } }, required: ['doc', 'from', 'to'] },
      execute: ({ doc, from, to }) => { const d = docs[(doc | 0) - 1]; if (!d) throw new Error('그런 번호의 문헌이 없습니다.'); const a = Math.max(1, from | 0), z = Math.min(d.pages.length, to | 0, a + 14); return d.pages.slice(a - 1, z).map((t, k) => `〔${a + k}쪽〕\n${t}`).join('\n') || '(해당 쪽에 글자가 없습니다)'; },
    }] : undefined;
    let pending = 0;
    const res = await SAMPLE(merged, { modelTier: S.settings.tier || 'complex', signal: ac.signal, cache: false, ...(tools ? { tools } : {}), onText: ({ text }) => { msg.content = [{ type: 'text', text }]; if (!pending) pending = requestAnimationFrame(() => { pending = 0; paintLive(msg); }); } });
    msg.content = [{ type: 'text', text: (res && res.text) || '' }];
    if (res && res.truncated) msg.notice = '답변이 길이 한도에서 멈췄습니다. “이어서 써 주세요”라고 보내면 계속합니다.';
  } catch (e) {
    msg.api = false;
    const code = e && e.code;
    if (e && e.text) msg.content = [{ type: 'text', text: e.text }];
    msg.notice = ac.signal.aborted ? '중단했습니다. 이 답변은 다음 질문의 맥락에 포함되지 않습니다.'
      : code === 'not_granted' ? '이 페이지가 Claude에 질문하도록 허용되지 않았습니다. 페이지의 권한 메뉴에서 허용한 뒤 다시 보내 주세요.'
      : code === 'rate_limited' ? 'claude.ai 사용량 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.'
      : `답변을 받지 못했습니다: ${(e && e.message) || e}`;
  } finally {
    msg.live = false; S.busy = null;
    if (!chat.title || chat.title === '새 대화') chat.title = (chat.messages.find((m) => m.role === 'user') || {}).text?.slice(0, 40) || '새 대화';
    await saveChat(chat);
    paintThread(); paintComposer(); paintSide();
  }
}
async function runTurn() {
  if (SAMPLE) return runTurnFree();
  const chat = S.chat; if (!chat || S.busy) return;
  const ac = new AbortController();
  const msg = { id: uid(), role: 'assistant', content: [], model: S.settings.model, at: Date.now(), usage: null, live: true };
  chat.messages.push(msg);
  S.busy = { ac, msg };
  paintThread(); paintComposer();
  const cl = client();
  let parts = [];
  try {
    const base = await apiMessages({ messages: chat.messages.filter((m) => m !== msg) });
    const sys = [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }];
    const pt = projectText(S.project); if (pt) sys.push({ type: 'text', text: pt });
    const bytes = JSON.stringify(base).length;
    if (bytes > 30 * 1024 * 1024) throw new Error('첨부 문헌이 너무 커서(요청 32MB 한도) 보낼 수 없습니다. 일부 문헌을 빼고 새 대화에서 시도해 주세요.');
    for (let round = 0; round < 6; round++) {
      const params = {
        model: S.settings.model, max_tokens: 64000,
        thinking: { type: 'adaptive', display: S.settings.showThinking ? 'summarized' : 'omitted' },
        output_config: { effort: S.settings.effort },
        system: sys,
        messages: parts.length ? base.concat([{ role: 'assistant', content: parts }]) : base,
        cache_control: { type: 'ephemeral' },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      };
      const t = tools(); if (t) params.tools = t;
      const stream = cl.beta.messages.stream(params, { signal: ac.signal });
      const prior = parts.slice();
      let pending = 0;
      stream.on('streamEvent', (ev, snap) => {
        msg.content = prior.concat(snap.content || []);
        if (!pending) pending = requestAnimationFrame(() => { pending = 0; paintLive(msg); });
      });
      const final = await stream.finalMessage();
      parts = prior.concat(final.content);
      msg.content = parts; msg.usage = addUsage(msg.usage, final.usage); msg.model = final.model || msg.model;
      msg.stop = final.stop_reason;
      if (final.stop_reason === 'refusal') { msg.notice = `안전 정책에 따라 답변이 거절되었습니다${final.stop_details && final.stop_details.category ? ` (분류: ${final.stop_details.category})` : ''}. 질문을 바꾸어 다시 시도해 주세요.`; break; }
      if (final.stop_reason !== 'pause_turn') break;
    }
    if (msg.stop === 'max_tokens') msg.notice = '답변이 길이 한도에서 멈췄습니다. “이어서 써 주세요”라고 보내면 계속합니다.';
  } catch (e) {
    msg.api = false;
    if (e instanceof APIUserAbortError || ac.signal.aborted) msg.notice = '중단했습니다. 이 답변은 다음 질문의 맥락에 포함되지 않습니다.';
    else if (e instanceof AuthenticationError) msg.notice = 'API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.';
    else if (e instanceof PermissionDeniedError) msg.notice = '이 API 키로는 선택한 모델이나 기능을 쓸 수 없습니다. 설정에서 모델을 바꾸거나 콘솔에서 권한을 확인해 주세요.';
    else if (e instanceof RateLimitError) msg.notice = '요청 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.';
    else if (e instanceof BadRequestError) msg.notice = `요청이 거부되었습니다: ${e.message}`;
    else if (e instanceof NotFoundError) msg.notice = '선택한 모델을 찾을 수 없습니다. 설정에서 다른 모델을 골라 주세요.';
    else if (e instanceof InternalServerError) msg.notice = `Anthropic 서버 오류(${e.status})입니다. 잠시 후 다시 시도해 주세요.`;
    else if (e instanceof APIConnectionError) msg.notice = '네트워크에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.';
    else if (e instanceof APIError) msg.notice = `API 오류(${e.status || ''}): ${e.message}`;
    else msg.notice = e.message || String(e);
    if (msg.content.length && !(e instanceof APIUserAbortError)) msg.content = msg.content.filter((b) => b.type === 'text');
  } finally {
    msg.live = false; S.busy = null;
    if (!chat.title || chat.title === '새 대화') chat.title = (chat.messages.find((m) => m.role === 'user') || {}).text?.slice(0, 40) || '새 대화';
    await saveChat(chat);
    paintThread(); paintComposer(); paintSide();
  }
}
async function send(text, opts = {}) {
  text = (text || '').trim();
  if (!text || S.busy) return;
  if (!SAMPLE && !getKey()) { openSettings(true); return; }
  if (!S.chat) await newChat();
  S.chat.messages.push({ id: uid(), role: 'user', text, docs: S.attach.slice(), at: Date.now() });
  S.attach = [];
  const ta = $('#input'); if (ta && !opts.keepInput) { ta.value = ''; autoGrow(ta); }
  await saveChat(S.chat);
  await runTurn();
}
async function runChain(chain, input) {
  for (let i = 0; i < chain.steps.length; i++) {
    const prompt = chain.steps[i].replace('{{입력}}', input || '(입력 없음)');
    await send(`[${chain.name} ${i + 1}/${chain.steps.length}]\n${prompt}`);
    const last = S.chat && S.chat.messages[S.chat.messages.length - 1];
    if (!last || last.api === false || last.notice) { toast('연쇄 작업을 멈췄습니다.'); return; }
  }
  toast(`‘${chain.name}’을(를) 마쳤습니다.`);
}

/* ---------------- rendering an answer ---------------- */
const VTAGS = [['첨부 문헌', 'doc'], ['검색 확인', 'web'], ['일반 법리', 'law'], ['추론', 'inf'], ['검증 필요', 'chk']];
function answerParts(content) {
  let md = '', thinking = '';
  const cites = [], acts = [];
  const citeKey = (c) => (c.url ? c.url : `${c.document_title || c.document_index}|${c.start_page_number || c.start_char_index || ''}`);
  for (const b of content || []) {
    if (b.type === 'thinking' && b.thinking) thinking += (thinking ? '\n\n' : '') + b.thinking;
    else if (b.type === 'text') {
      md += b.text;
      if (b.citations && b.citations.length) {
        const nums = [];
        for (const c of b.citations) {
          let i = cites.findIndex((x) => citeKey(x) === citeKey(c));
          if (i < 0) { cites.push(c); i = cites.length - 1; }
          if (!nums.includes(i + 1)) nums.push(i + 1);
        }
        md += nums.map((n) => `〔c${n}〕`).join('');
      }
    } else if (b.type === 'server_tool_use') {
      const q = b.input && (b.input.query || b.input.url);
      if (q) acts.push(`${b.name === 'web_fetch' ? '열람' : '검색'}: ${q}`);
    } else if (b.type === 'fallback') acts.push(`모델 전환: ${(b.from_ || b.from || {}).model || ''} → ${(b.to || {}).model || ''}`);
  }
  let html = renderMarkdown(md);
  html = html.replace(/〔c(\d+)〕/g, (_, n) => `<sup class="cite"><a href="#" data-n="${n}" aria-label="출처 ${n}">${n}</a></sup>`);
  for (const [t, cls] of VTAGS) html = html.split(`[${t}]`).join(`<span class="tag-v ${cls}">${t}</span>`);
  return { html, thinking, cites, acts };
}
function citeHTML(c, n) {
  const where = c.start_page_number ? `${c.start_page_number}${c.end_page_number && c.end_page_number - 1 > c.start_page_number ? `–${c.end_page_number - 1}` : ''}쪽` : '';
  const title = c.title || c.document_title || '문헌';
  const head = c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(title)}</a>` : `<b>${esc(title)}</b>${where ? ` · ${where}` : ''}`;
  const q = c.cited_text ? ` <span class="q">“${esc(c.cited_text.length > 160 ? c.cited_text.slice(0, 160) + '…' : c.cited_text)}”</span>` : '';
  return `<li id="cite-${n}">${head}${q}</li>`;
}
function assistantHTML(m, idx) {
  const p = answerParts(m.content);
  const M = MODELS[m.model] || { name: m.model || '' };
  const usage = m.free ? '무료 모드 · claude.ai' : m.usage ? `${M.name} · 약 $${cost(m.usage, m.model).toFixed(3)}` : (m.model ? M.name : '');
  return `<div class="msg ai" data-i="${idx}">
    <div class="ai-head"><span class="mark">요</span><span>요AI</span></div>
    ${p.acts.length ? `<div class="activity">${p.acts.map((a) => `<span class="act" title="${esc(a)}">${esc(a)}</span>`).join('')}</div>` : ''}
    ${p.thinking && S.settings.showThinking ? `<details class="think"><summary>사고 과정 요약</summary><div>${esc(p.thinking)}</div></details>` : ''}
    <div class="answer${m.live ? ' cursor' : ''}">${p.html || (m.live ? '' : '')}</div>
    ${p.cites.length ? `<div class="sources"><b>출처</b><ol>${p.cites.map((c, i) => citeHTML(c, i + 1)).join('')}</ol></div>` : ''}
    ${m.notice ? `<div class="notice-line">${esc(m.notice)}</div>` : ''}
    ${m.live ? '' : `<div class="ai-foot"><button data-act="copy" data-i="${idx}">복사</button><button data-act="decide" data-i="${idx}" title="선택한 문장을 프로젝트의 ‘확정 사항’에 추가">확정 사항에 추가</button>${idx === S.chat.messages.length - 1 ? '<button data-act="regen">다시 생성</button>' : ''}<span class="meta">${esc(usage)}</span></div>`}
  </div>`;
}
function userHTML(m) {
  const att = (m.docs || []).length ? `<div class="att">${m.docs.map((id) => `<span class="doc-chip"><b>${esc(docTitle(id))}</b></span>`).join('')}</div>` : '';
  return `<div class="msg user"><div class="bubble">${att}${esc(m.text)}</div></div>`;
}

/* ---------------- shell ---------------- */
const IC = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4v16H5zM10 4h4v16h-4z"/><path d="M15.5 5.5l3.8-1 3 15.5-3.8 1z"/></svg>',
  ctx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M14 4v16"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/></svg>',
};
function paintShell() {
  $('#app').innerHTML = `<div class="shell${S.ctxOpen ? ' ctx-open' : ''}">
    <aside class="side" id="side"></aside>
    <section class="main">
      <div class="topbar"><button class="icon menu-btn" data-act="menu" aria-label="메뉴">${IC.menu}</button><div class="title" id="title"></div>
        <button class="icon" data-act="library" title="서재" aria-label="서재">${IC.lib}</button>
        <button class="icon${S.ctxOpen ? ' on' : ''}" data-act="ctx" title="연구 프로젝트 맥락" aria-label="연구 프로젝트 맥락">${IC.ctx}</button>
        ${EMBED ? `<button class="icon" data-act="close" title="닫기" aria-label="닫기">${IC.close}</button>` : ''}</div>
      <div class="thread" id="thread"><div class="thread-in" id="thread-in"></div></div>
      <div class="composer" id="composer"></div>
    </section>
    <aside class="ctx" id="ctx"></aside><div class="scrim" data-act="scrim"></div></div>`;
  paintSide(); paintThread(); paintComposer(); paintCtx();
}
function paintSide() {
  const el = $('#side'); if (!el) return;
  const chats = S.chats.filter((c) => c.projectId === (S.project && S.project.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  el.innerHTML = `<div class="side-top"><span class="mark">요</span><div class="brand">요AI<small>공법 연구 보조</small></div></div>
    <div class="side-sec"><div class="side-label"><span>연구 프로젝트</span><button class="icon" style="width:26px;height:26px" data-act="new-project" title="새 프로젝트" aria-label="새 프로젝트">${IC.plus}</button></div>
      <select id="project-sel" aria-label="연구 프로젝트">${S.projects.map((p) => `<option value="${p.id}"${S.project && p.id === S.project.id ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</select></div>
    <button class="new-chat" data-act="new-chat">${IC.plus} 새 대화</button>
    <div class="side-label" style="padding-left:16px">대화</div>
    <div class="side-list">${chats.map((c) => `<button class="chat-link${S.chat && c.id === S.chat.id ? ' on' : ''}" data-act="open-chat" data-id="${c.id}" title="${esc(c.title)}">${esc(c.title || '새 대화')}</button>`).join('') || '<p style="font-size:.75rem;color:var(--muted);padding:6px 10px">아직 대화가 없습니다.</p>'}</div>
    <div class="side-foot"><button class="side-btn" data-act="library">${IC.lib} 서재 <span style="margin-left:auto;font-size:.75rem;color:var(--muted)">${S.docs.length}</span></button><button class="side-btn" data-act="help">${IC.help} 사용법</button><button class="side-btn" data-act="settings">${IC.gear} 설정</button></div>`;
  const t = $('#title'); if (t) t.textContent = S.chat ? S.chat.title || '새 대화' : (S.project ? S.project.title : '요AI');
}
function paintThread() {
  const el = $('#thread-in'); if (!el) return;
  if (!S.chat || !S.chat.messages.length) {
    el.innerHTML = `<div class="empty"><h1>무엇을 연구할까요?</h1><p class="lead">질문을 입력하거나, 아래 작업을 고르세요. 선행연구 PDF는 서재에 넣어 두고 질문할 때 첨부하면, 답변이 쪽수와 함께 인용합니다.</p>
      <div class="flows">${FLOWS.slice(0, 6).map((f) => `<button class="flow" data-act="flow" data-id="${f.id}"><b>${esc(f.name)}</b><span>${esc(f.desc)}</span></button>`).join('')}</div>
      <div class="principles"><b>요AI의 원칙</b> — 확인된 법령·판례·문헌만 근거로 삼고, 근거마다 [첨부 문헌] [검색 확인] [일반 법리] [추론] [검증 필요]를 붙입니다. 검증되지 않은 논증은 확정하지 않으며, 판단이 갈리는 지점은 선택지로 제시하고 결정은 연구자에게 남깁니다.</div></div>`;
    return;
  }
  el.innerHTML = S.chat.messages.map((m, i) => (m.role === 'user' ? userHTML(m) : assistantHTML(m, i))).join('');
  const th = $('#thread'); th.scrollTop = th.scrollHeight;
}
function paintLive(m) {
  const node = $(`.msg.ai[data-i="${S.chat.messages.indexOf(m)}"]`);
  if (!node) { paintThread(); return; }
  const th = $('#thread'); const atBottom = th.scrollHeight - th.scrollTop - th.clientHeight < 80;
  node.outerHTML = assistantHTML(m, S.chat.messages.indexOf(m));
  if (atBottom) th.scrollTop = th.scrollHeight;
}
function paintComposer() {
  const el = $('#composer'); if (!el) return;
  const keep = $('#input') ? $('#input').value : '';
  const M = MODELS[S.settings.model];
  el.innerHTML = `<div class="comp-in">
      ${S.attach.length ? `<div class="comp-att">${S.attach.map((id) => `<span class="doc-chip"><b>${esc(docTitle(id))}</b><button data-act="unattach" data-id="${id}" aria-label="첨부 빼기">×</button></span>`).join('')}</div>` : ''}
      <label class="sr" for="input">질문</label><textarea id="input" rows="2" placeholder="질문이나 지시를 입력하세요. Enter 보내기 · Shift+Enter 줄바꿈 · / 작업 목록"></textarea>
      <div class="comp-bar">
        <button class="pill" data-act="attach">문헌 첨부${S.attach.length ? ` ${S.attach.length}` : ''}</button>
        <button class="pill" data-act="flows">작업</button>
        ${SAMPLE ? `<span class="pill"><label class="sr" for="tier">분석 깊이</label><select id="tier">${[['default', '보통'], ['complex', '깊게']].map(([v, l]) => `<option value="${v}"${(S.settings.tier || 'complex') === v ? ' selected' : ''}>깊이: ${l}</option>`).join('')}</select></span>` : `<button class="pill${S.settings.web ? ' on' : ''}" data-act="web" aria-pressed="${S.settings.web}">웹 검색 ${S.settings.web ? '켬' : '끔'}</button>
        <span class="pill"><label class="sr" for="effort">분석 깊이</label><select id="effort">${EFFORTS.map(([v, l]) => `<option value="${v}"${S.settings.effort === v ? ' selected' : ''}>깊이: ${l}</option>`).join('')}</select></span>
        <span class="pill"><label class="sr" for="model">모델</label><select id="model">${Object.entries(MODELS).map(([id, m]) => `<option value="${id}"${S.settings.model === id ? ' selected' : ''}>${m.name}</option>`).join('')}</select></span>`}
        ${S.busy ? '<button class="send stop" data-act="stop">중단</button>' : '<button class="send" data-act="send">보내기</button>'}
      </div></div>
    <p class="hint">${SAMPLE ? '무료 모드 · claude.ai 계정으로 동작 · 웹 검색 없음' : esc(M ? `${M.name} · ${M.note}` : '')} · 답변은 연구 보조 자료이며 최종 판단은 연구자가 합니다.</p>`;
  const ta = $('#input'); ta.value = keep; autoGrow(ta);
}
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.4) + 'px'; }
function paintCtx() {
  const el = $('#ctx'); if (!el) return;
  const p = S.project; if (!p) { el.innerHTML = ''; return; }
  const f = (k, label, hint, rows) => `<label class="field"><span>${label}${hint ? ` <small>${hint}</small>` : ''}</span><textarea data-pf="${k}" rows="${rows || 3}">${esc(p[k] || '')}</textarea></label>`;
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between"><h2>연구 프로젝트</h2><button class="icon" data-act="ctx" aria-label="패널 닫기" title="닫기">${IC.close}</button></div><p class="sub">여기 적은 내용은 이 프로젝트의 모든 대화에 전제로 들어갑니다. AI는 제안만 하고, ‘확정 사항’은 연구자가 정합니다.</p>
    <label class="field"><span>프로젝트 이름</span><input data-pf="title" value="${esc(p.title)}"></label>
    ${f('question', '연구문제', '', 3)}${f('concepts', '핵심 개념 정의', '용어를 일관되게', 3)}${f('decided', '연구자가 확정한 사항', '답변의 전제', 4)}${f('open', '미결 쟁점', '', 3)}${f('notes', '메모', '', 2)}${f('style', '문체 샘플', '내 논문 문단 1~2개', 4)}
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-act="export-chat">이 대화 저장(.md)</button><button class="btn danger" data-act="del-project">프로젝트 삭제</button></div>`;
}

/* ---------------- modals ---------------- */
function modal(html, onClose) {
  const w = document.createElement('div'); w.className = 'modal-wrap'; w.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener('keydown', key); if (onClose) onClose(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  w.addEventListener('click', (e) => { if (e.target === w || e.target.closest('[data-close]')) close(); });
  return { el: w, close };
}
function openLibrary(selecting) {
  const rows = () => S.docs.slice().sort((a, b) => b.addedAt - a.addedAt).map((d) => `<div class="doc-row">${selecting ? `<input type="checkbox" data-pick="${d.id}" ${S.attach.includes(d.id) ? 'checked' : ''} aria-label="${esc(d.title)} 첨부">` : '<span></span>'}
      <div><div class="t" title="${esc(d.title)}">${esc(d.title)}</div><div class="m">${esc([d.author, d.year, d.venue].filter(Boolean).join(', ') || '저자·연도 미입력')} · ${d.kind === 'pdf' ? 'PDF' : '텍스트'} ${fmtSize(d.size || 0)}</div></div>
      <div style="display:flex;gap:4px"><button class="btn" data-edit="${d.id}">정보</button><button class="btn danger" data-del="${d.id}">삭제</button></div></div>`).join('') || '<p class="sub" style="margin:8px 0">아직 문헌이 없습니다.</p>';
  const m = modal(`<h2>서재</h2><p class="sub">선행연구 PDF와 자료를 이 브라우저에 보관합니다(서버에 올리지 않습니다). ${selecting ? '이번 질문에 첨부할 문헌을 고르세요.' : ''}</p>
    <label class="drop" id="drop">PDF·텍스트 파일을 여기에 끌어 놓거나 <u>눌러서 고르세요</u><input type="file" id="files" accept=".pdf,.txt,.md,application/pdf,text/plain" multiple class="sr"></label>
    <div id="docs">${rows()}</div>
    <div class="modal-foot">${selecting ? '<button class="btn primary" data-close>첨부하기</button>' : '<button class="btn" data-close>닫기</button>'}</div>`, () => { paintComposer(); paintSide(); });
  const refresh = () => { $('#docs', m.el).innerHTML = rows(); };
  const drop = $('#drop', m.el);
  $('#files', m.el).addEventListener('change', async (e) => { await addFiles(Array.from(e.target.files)); refresh(); });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => { e.preventDefault(); drop.classList.remove('over'); await addFiles(Array.from(e.dataTransfer.files)); refresh(); });
  m.el.addEventListener('change', (e) => { const id = e.target.dataset && e.target.dataset.pick; if (!id) return; if (e.target.checked) { if (!S.attach.includes(id)) S.attach.push(id); } else S.attach = S.attach.filter((x) => x !== id); });
  m.el.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]'), ed = e.target.closest('[data-edit]');
    if (del) { const id = del.dataset.del; if (!(await confirmBox('이 문헌을 서재에서 지울까요? 이미 나눈 대화에서는 ‘삭제된 문헌’으로 표시되고, 다음 질문부터 맥락에서 빠집니다.', '지우기'))) return; await DB.del('docs', id); S.docs = S.docs.filter((d) => d.id !== id); S.attach = S.attach.filter((x) => x !== id); b64cache.delete(id); refresh(); }
    if (ed) { const d = S.docs.find((x) => x.id === ed.dataset.edit); if (!d) return; const v = await formBox('문헌 정보', [{ label: '제목', value: d.title }, { label: '저자', value: d.author }, { label: '연도', value: d.year }, { label: '학술지·출처', value: d.venue }]); if (!v) return; Object.assign(d, { title: v[0].trim() || d.title, author: v[1].trim(), year: v[2].trim(), venue: v[3].trim() }); const full = await DB.get('docs', d.id); await DB.put('docs', { ...full, title: d.title, author: d.author, year: d.year, venue: d.venue }); refresh(); }
  });
}
function openFlows() {
  const m = modal(`<h2>작업</h2><p class="sub">입력창에 쓴 내용이 작업의 ‘입력’으로 들어갑니다. 고른 작업은 입력창에 채워지니, 확인하고 보내세요. ‘자동 연쇄’는 여러 단계를 차례로 실행합니다.</p>
    <div class="flow-list">${FLOWS.map((f) => `<button class="flow-item" data-flow="${f.id}"><b>${esc(f.name)}</b><span>${esc(f.desc)}</span></button>`).join('')}${CHAINS.map((c) => `<button class="flow-item chain" data-chain="${c.id}"><b>${esc(c.name)}</b><span>${esc(c.desc)}</span></button>`).join('')}</div>
    <div class="modal-foot"><button class="btn" data-close>닫기</button></div>`);
  m.el.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-flow]'), c = e.target.closest('[data-chain]');
    if (f) { useFlow(f.dataset.flow); m.close(); }
    if (c) { const ch = CHAINS.find((x) => x.id === c.dataset.chain); const input = $('#input').value.trim(); if (!input && !(await confirmBox('입력창이 비어 있습니다. 그대로 실행할까요?', '실행'))) return; m.close(); $('#input').value = ''; runChain(ch, input); }
  });
}
function useFlow(id) {
  const f = FLOWS.find((x) => x.id === id); if (!f) return;
  const ta = $('#input'); const cur = ta.value.replace(/^\/\S*\s*/, '').trim();
  ta.value = f.tpl.replace('{{입력}}', cur || '(여기에 내용을 적어 주세요)'); autoGrow(ta); ta.focus();
  const at = ta.value.indexOf('(여기에 내용을 적어 주세요)'); if (at >= 0) ta.setSelectionRange(at, at + '(여기에 내용을 적어 주세요)'.length);
}
function openSettings(needKey) {
  const k = getKey();
  const m = modal(`<h2>설정</h2><p class="sub">API 키는 이 브라우저에만 저장되며 Anthropic API로만 전송됩니다.</p>
    <label class="field"><span>Anthropic API 키 <small>console.anthropic.com → API Keys</small></span><input id="key" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(k)}"></label>
    <label style="display:flex;gap:6px;align-items:center;font-size:.8125rem;margin:-4px 0 12px"><input type="checkbox" id="remember" ${k && store('local') && store('local').getItem(KEY) ? 'checked' : ''}> 이 기기에 기억하기 (끄면 이 창을 닫을 때 지워짐)</label>
    <label class="field"><span>기본 모델</span><select id="s-model">${Object.entries(MODELS).map(([id, mm]) => `<option value="${id}"${S.settings.model === id ? ' selected' : ''}>${mm.name} — ${mm.note} (입력 $${mm.in} · 출력 $${mm.out} / 100만 토큰)</option>`).join('')}</select></label>
    <label class="field"><span>기본 분석 깊이</span><select id="s-effort">${EFFORTS.map(([v, l]) => `<option value="${v}"${S.settings.effort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label style="display:flex;gap:6px;align-items:center;font-size:.8125rem;margin:0 0 8px"><input type="checkbox" id="s-think" ${S.settings.showThinking ? 'checked' : ''}> 답변 위에 사고 과정 요약 보이기</label>
    <label class="field"><span>테마</span><select id="s-theme">${[['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(([v, l]) => `<option value="${v}"${S.settings.theme === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <p class="sub">거절 대비: 안전 분류기가 답변을 거절하면 서버가 자동으로 다른 모델로 이어서 답하도록 설정해 두었습니다(server-side fallback).</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="backup">대화·프로젝트 백업(.json)</button><label class="btn" style="cursor:pointer">백업 불러오기<input type="file" id="restore" accept=".json,application/json" class="sr"></label><button class="btn" id="relock">잠금 다시 걸기</button><button class="btn danger" id="forget">키 지우기</button></div>
    <div class="modal-foot"><button class="btn" data-close>닫기</button><button class="btn primary" id="save">저장</button></div>`);
  if (needKey) setTimeout(() => $('#key', m.el).focus(), 50);
  $('#save', m.el).addEventListener('click', async () => {
    const v = $('#key', m.el).value.trim();
    if (v && !/^sk-ant-/.test(v)) { toast('API 키는 sk-ant- 로 시작합니다.'); return; }
    setKey(v, $('#remember', m.el).checked);
    Object.assign(S.settings, { model: $('#s-model', m.el).value, effort: $('#s-effort', m.el).value, showThinking: $('#s-think', m.el).checked, theme: $('#s-theme', m.el).value });
    await saveSettings(); m.close(); paintComposer(); paintThread(); toast('저장했습니다.');
  });
  $('#forget', m.el).addEventListener('click', () => { setKey(''); $('#key', m.el).value = ''; toast('키를 지웠습니다.'); });
  $('#relock', m.el).addEventListener('click', () => { window.Door.close('yoai'); toast('다음에 열 때 비밀번호를 다시 묻습니다.'); });
  $('#backup', m.el).addEventListener('click', () => { const data = { app: 'yoai', v: 1, exportedAt: new Date().toISOString(), projects: S.projects, chats: S.chats, docs: S.docs.map((d) => ({ id: d.id, title: d.title, author: d.author, year: d.year, venue: d.venue })) }; saveFile(`yoai-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json'); toast('백업 파일을 저장했습니다. (문헌 파일 자체는 포함되지 않습니다)'); });
  $('#restore', m.el).addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (d.app !== 'yoai') throw new Error('요AI 백업 파일이 아닙니다.');
      for (const p of d.projects || []) { if (!S.projects.some((x) => x.id === p.id)) { S.projects.push(p); await DB.put('projects', p); } }
      for (const c of d.chats || []) { if (!S.chats.some((x) => x.id === c.id)) { S.chats.push(c); await DB.put('chats', c); } }
      toast('불러왔습니다.'); m.close(); paintShell();
    } catch (err) { toast('불러오지 못했습니다: ' + err.message); }
  });
}
function openHelp() {
  modal(`<h2>요AI 사용법</h2><div style="font-size:.875rem;line-height:1.85;color:var(--ink-2)">
    <p><b>1. 무료 모드와 API 모드</b> — <b>무료 모드</b>는 claude.ai 안에서 열리며 선생님의 Claude 구독 계정으로 동작합니다(추가 요금 없음, 웹 검색 없음, PDF는 글자를 뽑아 쪽수와 함께 읽음). <b>API 모드</b>는 0128.kr에서 Anthropic API 키를 넣어 쓰며, 웹 검색과 PDF 원문 쪽수 인용까지 되지만 쓴 만큼 요금이 나갑니다(답변마다 대략의 비용 표시). 두 모드는 저장 공간이 따로이므로, 옮길 때는 설정의 백업 파일을 쓰세요.</p>
    <p><b>2. 연구 프로젝트</b> — 왼쪽에서 프로젝트를 만들고, 오른쪽 ‘연구 프로젝트’ 칸에 연구문제·개념 정의·확정 사항·미결 쟁점·문체 샘플을 적어 두면 그 프로젝트의 모든 대화가 이를 전제로 답합니다. 답변에서 동의하는 문장을 드래그한 뒤 <b>확정 사항에 추가</b>를 누르면 확정 사항으로 옮겨집니다.</p>
    <p><b>3. 서재와 첨부</b> — 선행연구 PDF를 서재에 넣어 두고, 질문할 때 <b>문헌 첨부</b>로 고릅니다. 답변은 해당 쪽을 인용하며, 출처 번호를 누르면 인용 문장이 보입니다. 첨부한 문헌은 같은 대화의 다음 질문에도 계속 쓰입니다.</p>
    <p><b>4. 작업</b> — <b>작업</b> 버튼이나 입력창 맨 앞의 <b>/</b>로 연구문제 구조화, 선행연구 지도, 판례 평석, 헌법적 논증, 입법개선안, 반론 검토, 인용 검증, 문체 교정, 문헌 요약을 바로 불러옵니다. ‘자동 연쇄’는 여러 단계를 차례로 실행합니다.</p>
    <p><b>5. 근거 표시</b> — [첨부 문헌] [검색 확인] [일반 법리] [추론] [검증 필요]로 근거의 성격을 구분합니다. 특히 [검증 필요]는 반드시 원문을 확인하세요.</p>
    <p><b>6. 깊이와 모델</b> — 깊이는 ‘깊게’가 기본입니다. 결정적인 논증에는 ‘최대’나 Fable 5.1을 쓰고, 가벼운 질문에는 ‘보통’이나 Sonnet 5.5가 빠르고 저렴합니다. 웹 검색을 켜면 법령·판례를 확인하며 답합니다.</p>
    <p><b>7. 보관</b> — 대화·프로젝트·문헌은 이 브라우저에 저장됩니다. 설정에서 백업 파일을 받아 두세요. 대화는 오른쪽 패널에서 마크다운 파일로 저장할 수 있습니다.</p></div>
    <div class="modal-foot"><button class="btn primary" data-close>닫기</button></div>`);
}
function confirmBox(text, okLabel) {
  return new Promise((res) => {
    const m = modal(`<h2>확인</h2><p style="font-size:.875rem;color:var(--ink-2);line-height:1.7">${esc(text)}</p><div class="modal-foot"><button class="btn" data-close>취소</button><button class="btn primary" id="cb-ok">${esc(okLabel || '확인')}</button></div>`, () => res(false));
    $('#cb-ok', m.el).addEventListener('click', () => { res(true); m.close(); });
  });
}
function formBox(title, fields) {
  return new Promise((res) => {
    const m = modal(`<h2>${esc(title)}</h2>${fields.map((f, i) => `<label class="field"><span>${esc(f.label)}</span><input id="fb${i}" value="${esc(f.value || '')}" autocomplete="off"></label>`).join('')}<div class="modal-foot"><button class="btn" data-close>취소</button><button class="btn primary" id="fb-ok">저장</button></div>`, () => res(null));
    const done = () => { const out = fields.map((_, i) => $('#fb' + i, m.el).value); res(out); m.close(); };
    $('#fb-ok', m.el).addEventListener('click', done);
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.isComposing) { e.preventDefault(); done(); } });
    setTimeout(() => { const f = $('#fb0', m.el); if (f) f.focus(); }, 30);
  });
}
async function saveFile(name, text, type) {
  try { if (window.claude && typeof window.claude.use === 'function') { const dl = await window.claude.use('downloads'); if (dl) { await dl.save({ filename: name, data: new Blob([text], { type }) }); return; } } }
  catch (e) { if (e && e.code === 'declined') return; }
  download(name, text, type);
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
function chatMarkdown(c) {
  let out = `# ${c.title}\n\n`;
  for (const m of c.messages) {
    if (m.role === 'user') out += `## 질문\n\n${(m.docs || []).length ? `첨부: ${m.docs.map(docTitle).join(', ')}\n\n` : ''}${m.text}\n\n`;
    else { const p = answerParts(m.content); const tmp = document.createElement('div'); tmp.innerHTML = p.html; out += `## 요AI\n\n${tmp.innerText.trim()}\n\n`; if (p.cites.length) out += p.cites.map((x, i) => `${i + 1}. ${x.title || x.document_title || ''}${x.start_page_number ? ` ${x.start_page_number}쪽` : ''}${x.url ? ` <${x.url}>` : ''}${x.cited_text ? ` — “${x.cited_text.slice(0, 200)}”` : ''}`).join('\n') + '\n\n'; }
  }
  return out;
}

/* ---------------- projects & chats ---------------- */
async function newProject(title) {
  const p = { id: uid(), title: title || '새 연구 프로젝트', question: '', concepts: '', decided: '', open: '', notes: '', style: '', createdAt: Date.now(), updatedAt: Date.now() };
  S.projects.push(p); await saveProject(p); return p;
}
async function newChat() {
  const c = { id: uid(), projectId: S.project.id, title: '새 대화', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  S.chats.push(c); S.chat = c; await saveChat(c); paintSide(); paintThread(); return c;
}
function selectProject(id) { S.project = S.projects.find((p) => p.id === id) || S.projects[0]; S.chat = S.chats.filter((c) => c.projectId === S.project.id).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null; DB.put('kv', S.project.id, 'lastProject').catch(() => {}); paintSide(); paintThread(); paintCtx(); }

/* ---------------- events ---------------- */
document.addEventListener('click', async (e) => {
  const cite = e.target.closest('sup.cite a');
  if (cite) { e.preventDefault(); const li = cite.closest('.msg').querySelector(`#cite-${cite.dataset.n}`); if (li) { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1400); } return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'send') send($('#input').value);
  else if (act === 'stop') { if (S.busy) S.busy.ac.abort(); }
  else if (act === 'attach') openLibrary(true);
  else if (act === 'unattach') { S.attach = S.attach.filter((x) => x !== el.dataset.id); paintComposer(); }
  else if (act === 'flows') openFlows();
  else if (act === 'flow') useFlow(el.dataset.id);
  else if (act === 'web') { S.settings.web = !S.settings.web; saveSettings(); paintComposer(); }
  else if (act === 'library') openLibrary(false);
  else if (act === 'settings') openSettings(false);
  else if (act === 'help') openHelp();
  else if (act === 'ctx') { S.ctxOpen = !S.ctxOpen; $('.shell').classList.toggle('ctx-open', S.ctxOpen); el.classList.toggle('on', S.ctxOpen); }
  else if (act === 'menu') { $('#side').classList.toggle('open'); $('.shell').classList.toggle('side-open', $('#side').classList.contains('open')); }
  else if (act === 'scrim') { $('#side').classList.remove('open'); S.ctxOpen = false; $('.shell').classList.remove('ctx-open', 'side-open'); }
  else if (act === 'new-chat') { if (S.busy) return; await newChat(); $('#side').classList.remove('open'); $('#input') && $('#input').focus(); }
  else if (act === 'open-chat') { if (S.busy) return; S.chat = S.chats.find((c) => c.id === el.dataset.id); $('#side').classList.remove('open'); paintSide(); paintThread(); }
  else if (act === 'new-project') { const v = await formBox('새 연구 프로젝트', [{ label: '프로젝트 이름', value: '' }]); const t = v && v[0].trim(); if (!t) return; const p = await newProject(t); selectProject(p.id); S.ctxOpen = true; paintShell(); }
  else if (act === 'del-project') { if (S.projects.length < 2) { toast('프로젝트가 하나뿐이면 지울 수 없습니다.'); return; } if (!(await confirmBox(`‘${S.project.title}’ 프로젝트와 그 대화를 모두 지울까요? 되돌릴 수 없습니다.`, '지우기'))) return; for (const c of S.chats.filter((x) => x.projectId === S.project.id)) await DB.del('chats', c.id); S.chats = S.chats.filter((x) => x.projectId !== S.project.id); await DB.del('projects', S.project.id); S.projects = S.projects.filter((p) => p.id !== S.project.id); selectProject(S.projects[0].id); paintShell(); }
  else if (act === 'copy') { const m = S.chat.messages[+el.dataset.i]; const tmp = document.createElement('div'); tmp.innerHTML = answerParts(m.content).html; try { await navigator.clipboard.writeText(tmp.innerText); toast('복사했습니다.'); } catch (err) { toast('복사하지 못했습니다.'); } }
  else if (act === 'decide') { const sel = String(window.getSelection() || '').trim(); if (!sel) { toast('답변에서 확정할 문장을 드래그해 선택한 뒤 누르세요.'); return; } S.project.decided = `${S.project.decided ? S.project.decided.trim() + '\n' : ''}- ${sel}`; await saveProject(S.project); paintCtx(); toast('확정 사항에 추가했습니다.'); }
  else if (act === 'regen') { const last = S.chat.messages[S.chat.messages.length - 1]; if (last && last.role === 'assistant') { S.chat.messages.pop(); await saveChat(S.chat); runTurn(); } }
  else if (act === 'export-chat') { if (!S.chat) { toast('저장할 대화가 없습니다.'); return; } saveFile(`${(S.chat.title || '요AI').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 40)}.md`, chatMarkdown(S.chat), 'text/markdown'); }
  else if (act === 'close') { try { window.parent.postMessage({ type: 'yoai:close' }, location.origin); } catch (err) { /* ignore */ } }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'project-sel') selectProject(e.target.value);
  if (e.target.id === 'effort') { S.settings.effort = e.target.value; saveSettings(); }
  if (e.target.id === 'model') { S.settings.model = e.target.value; saveSettings(); paintComposer(); }
  if (e.target.id === 'tier') { S.settings.tier = e.target.value; saveSettings(); }
});
let ctxT = 0;
document.addEventListener('input', (e) => {
  if (e.target.id === 'input') { autoGrow(e.target); if (e.target.value === '/') openFlows(); }
  const k = e.target.dataset && e.target.dataset.pf;
  if (k && S.project) { S.project[k] = e.target.value; clearTimeout(ctxT); ctxT = setTimeout(() => { saveProject(S.project); if (k === 'title') paintSide(); }, 400); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(e.target.value); }
});
window.addEventListener('message', (e) => { if (e.origin !== location.origin || !e.data) return; if (e.data.type === 'yoai:save') { try { e.source.postMessage({ type: 'yoai:saved' }, location.origin); } catch (err) { /* ignore */ } } });

/* ---------------- start ---------------- */
function keyCard() {
  const free = FREE_URL.startsWith('https://') ? `<div class="free-box"><b>무료로 쓰기</b><p>claude.ai에 로그인되어 있으면 추가 요금 없이 요AI를 쓸 수 있습니다. 새 탭에서 열립니다. (무료 모드에서는 웹 검색이 빠지고, PDF는 글자를 뽑아 읽습니다.)</p><button class="btn primary" id="free-open">무료 모드로 열기</button></div><p class="or">또는 API 키로 쓰기 — 웹 검색과 PDF 원문 쪽수 인용까지</p>` : '';
  return `<div class="keycard">${free}<h1>${free ? 'API 모드' : '요AI를 시작하려면 API 키가 필요합니다'}</h1>
    <ol><li>console.anthropic.com에 로그인해 <b>API Keys</b>에서 키를 만듭니다(결제 수단 등록 필요).</li><li>아래에 붙여 넣습니다. 키는 이 브라우저에만 저장되고 Anthropic API로만 전송됩니다.</li><li>요금은 쓴 만큼 청구됩니다. 답변마다 대략의 비용이 표시됩니다.</li></ol>
    <input id="k0" type="password" placeholder="sk-ant-…" autocomplete="off"><label style="display:flex;gap:6px;align-items:center;font-size:.8125rem"><input type="checkbox" id="r0" checked> 이 기기에 기억하기</label>
    <div class="modal-foot"><button class="btn primary" id="k0save">시작하기</button></div></div>`;
}
async function start() {
  await detectFree();
  try { await DB.open(); S.persistent = true; } catch (e) { S.persistent = false; }
  if (S.persistent) {
    S.settings = { ...DEFAULTS, ...((await DB.get('kv', 'settings')) || {}) };
    S.projects = (await DB.all('projects')) || []; S.chats = (await DB.all('chats')) || [];
    S.docs = ((await DB.all('docs')) || []).map((d) => ({ id: d.id, title: d.title, author: d.author, year: d.year, venue: d.venue, kind: d.kind, size: d.size, addedAt: d.addedAt }));
  }
  applyTheme();
  if (!S.projects.length) await newProject('기본 프로젝트');
  const last = S.persistent ? await DB.get('kv', 'lastProject') : null;
  S.project = S.projects.find((p) => p.id === last) || S.projects[0];
  S.chat = S.chats.filter((c) => c.projectId === S.project.id).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  if (!SAMPLE && !getKey()) {
    $('#app').innerHTML = keyCard();
    const fo = $('#free-open'); if (fo) fo.addEventListener('click', () => window.open(FREE_URL, '_blank', 'noopener'));
    $('#k0save').addEventListener('click', () => { const v = $('#k0').value.trim(); if (!/^sk-ant-/.test(v)) { toast('API 키는 sk-ant- 로 시작합니다.'); return; } setKey(v, $('#r0').checked); paintShell(); });
    return;
  }
  paintShell();
  if (!S.persistent) toast('이 브라우저에서는 대화가 저장되지 않습니다(비공개 창 등).');
}
function lockView() {
  const n = window.Door.len('yoai'); let pin = '', fails = 0, busy = false;
  $('#app').innerHTML = `<div class="lock"><div class="lock-card"><span class="mark" style="width:44px;height:44px;font-size:20px;margin:0 auto">요</span><h1>요AI</h1><p>비밀번호를 입력하세요</p><div class="dots">${'<i></i>'.repeat(n)}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-d="${d}">${d}</button>`).join('')}<button class="fn" data-d="clr">지우기</button><button data-d="0">0</button><button class="fn" data-d="del">←</button></div>
    <label style="display:inline-flex;gap:6px;align-items:center;margin-top:12px;font-size:.75rem;color:var(--muted)"><input type="checkbox" id="rm"> 이 기기에서 30일 동안 묻지 않기</label></div></div>`;
  const draw = () => $$('.dots i').forEach((el, i) => el.classList.toggle('on', i < pin.length));
  const press = (d) => { if (busy) return; if (d === 'del') pin = pin.slice(0, -1); else if (d === 'clr') pin = ''; else if (pin.length < n) pin += d; draw();
    if (pin.length === n) { busy = true; setTimeout(() => { if (window.Door.check('yoai', pin)) { window.Door.open('yoai', $('#rm').checked); document.removeEventListener('keydown', kd); start(); return; } fails++; pin = ''; draw(); const c = $('.lock-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); if (fails >= 5) { setTimeout(() => { busy = false; fails = 0; }, 15000); return; } busy = false; }, 20); } };
  $('.pad').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) press(b.dataset.d); });
  const kd = (e) => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
  document.addEventListener('keydown', kd);
}
window.YOAI = { S, send, runTurn, answerParts };
if (window.Door && window.Door.isOpen('yoai')) start(); else lockView();
