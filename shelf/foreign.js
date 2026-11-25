// 비교법 원문: foreign election laws in their own words, from their official sources through the server (일본 e-Gov 法令API,
// 미국 govinfo — the U.S. Code's yearly edition, 캐나다 Justice Laws), read here into one shape — parts, and in each its articles
// with their paragraphs — so they open like the Korean laws: the whole law by its parts, one article at a time, found by number.
// Kept on this device for a week (each source changes far less often).
import * as api from './api.js';
import * as store from './store.js';

export const LAWS = [
  { id: 'jp-koshoku', country: '일본', name: '公職選挙法', ko: '일본 공직선거법', cite: '公職選挙法', kind: 'egov', page: 'https://laws.e-gov.go.jp/law/325AC1000000100', src: 'e-Gov 法令検索' },
  { id: 'jp-seiji', country: '일본', name: '政治資金規正法', ko: '일본 정치자금규정법', cite: '政治資金規正法', kind: 'egov', page: 'https://laws.e-gov.go.jp/law/323AC1000000194', src: 'e-Gov 法令検索' },
  { id: 'us-title52', country: '미국', name: '52 U.S.C. Voting and Elections', ko: '미국 연방법전 제52편 (선거)', cite: '52 U.S.C.', kind: 'uscode', page: 'https://uscode.house.gov/browse/prelim@title52&edition=prelim', src: 'govinfo (U.S. Code)' },
  { id: 'ca-elections', country: '캐나다', name: 'Canada Elections Act', ko: '캐나다 선거법', cite: 'Canada Elections Act', kind: 'justice', page: 'https://laws-lois.justice.gc.ca/eng/acts/E-2.01/', src: 'Justice Laws Website' },
];
export const byId = (id) => LAWS.find((l) => l.id === id) || null;

// what is asked: one of these laws, and perhaps an article of it ("일본 공직선거법 제129조의2", "公職選挙法 129条",
// "52 U.S.C. 30106", "FECA § 30106", "Canada Elections Act s. 16.1", "캐나다 선거법 16조")
const NAMES = [
  ['jp-koshoku', /^(?:일본\s*공직선거법|公職選挙法|公選法)/i],
  ['jp-seiji', /^(?:일본\s*정치자금(?:규정|규제)법|政治資金規正法)/i],
  ['us-title52', /^(?:미국\s*(?:연방\s*)?(?:선거법|연방법전(?:\s*제?\s*52\s*편)?)|52\s*U\.?\s*S\.?\s*C\.?|FECA|HAVA|NVRA)/i],
  ['ca-elections', /^(?:캐나다\s*선거법|Canada\s+Elections\s+Act)/i],
];
const KANJI = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function kanjiNum(s) {   // 百二十九 → 129
  let total = 0, cur = 0;
  for (const ch of String(s)) {
    if (ch in KANJI) cur = cur * 10 + KANJI[ch];
    else if (ch === '十' || ch === '百' || ch === '千') { const unit = ch === '十' ? 10 : ch === '百' ? 100 : 1000; total += (cur || 1) * unit; cur = 0; }
  }
  return total + cur;
}
export function query(q) {
  const t = String(q || '').trim();
  for (const [id, re] of NAMES) {
    const m = re.exec(t);
    if (!m) continue;
    // the article only: a paragraph or item after it (第一項, 제2항 제3호, (a)(9), subsection (2)) is let go
    const rest = t.slice(m[0].length).trim().replace(/\s*(?:第[〇一二三四五六七八九十百千\d]+[項号].*|제\s*\d+\s*[항호].*|(?:\([0-9a-zA-Z]{1,4}\))+|,?\s*(?:sub)?(?:section|para(?:graph)?)\s*\(?[0-9a-z.]+\)?.*)$/i, '').trim();
    if (!rest) return { id, art: null };
    let a = null;
    if (id.startsWith('jp')) {
      const k = /^(?:제\s*)?(\d+)\s*조(?:\s*의\s*(\d+))?$|^(?:第\s*)?(\d+)\s*条(?:の\s*(\d+))?$|^第([〇一二三四五六七八九十百千]+)条(?:の([〇一二三四五六七八九十百千]+))?$/.exec(rest);
      if (k) a = k[1] ? k[1] + (k[2] ? '_' + k[2] : '') : k[3] ? k[3] + (k[4] ? '_' + k[4] : '') : kanjiNum(k[5]) + (k[6] ? '_' + kanjiNum(k[6]) : '');
    } else if (id === 'us-title52') {
      const k = /^(?:§+\s*|sec(?:tion)?\.?\s*)?(\d{5})$/i.exec(rest);
      if (k) a = k[1];
    } else {
      const k = /^(?:s(?:ection)?\.?\s*|제\s*)?(\d+(?:\.\d+)?)\s*(?:조)?$/i.exec(rest);
      if (k) a = k[1];
    }
    return a ? { id, art: a } : null;
  }
  return null;
}

/* ---------- reading each source into { title, asOf, parts: [{ head, arts: [{ key, label, cap, paras }] }] } ---------- */
const clean = (s) => String(s || '').replace(/[ \t　]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

// e-Gov 法令API v2: the law as a tree of { tag, attr, children }
function egov(d) {
  const text = (n) => (typeof n === 'string' ? n : n && n.children ? n.children.map(text).join('') : '');
  const kids = (n, tag) => ((n && n.children) || []).filter((c) => c && c.tag === tag);
  const one = (n, tag) => kids(n, tag)[0];
  const parts = [];
  let part = null;
  // an item and the ones under it (号, its イロハ, …), each on its own line, set in by its depth
  const items = (n, depth) => ((n && n.children) || []).filter((c) => c && /^(Item|Subitem\d+)$/.test(c.tag)).flatMap((it) => {
    const title = text(one(it, 'ItemTitle') || one(it, it.tag + 'Title')), body = text(one(it, 'ItemSentence') || one(it, it.tag + 'Sentence'));
    return [`${' '.repeat(depth)}${clean(title)} ${clean(body)}`.trimEnd(), ...items(it, depth + 1)];
  });
  const article = (a) => {
    const num = (a.attr && a.attr.Num) || '';
    const paras = kids(a, 'Paragraph').map((p) => {
      const lead = clean(text(one(p, 'ParagraphNum')));
      return [`${lead ? lead + ' ' : ''}${clean(text(one(p, 'ParagraphSentence')))}`, ...items(p, 1)].join('\n');
    });
    return { key: num, label: clean(text(one(a, 'ArticleTitle'))), cap: clean(text(one(a, 'ArticleCaption'))).replace(/^（(.*)）$/, '$1'), paras };
  };
  const walk = (n, heads) => {
    for (const c of (n && n.children) || []) {
      if (!c || typeof c === 'string') continue;
      if (/^(Part|Chapter|Section|Subsection|Division)$/.test(c.tag)) {
        const h = clean(text(one(c, c.tag + 'Title')));
        const next = c.tag === 'Part' || c.tag === 'Chapter' ? [h] : [...heads, h];
        walk(c, next);
      } else if (c.tag === 'Article') {
        const head = heads.filter(Boolean).join(' · ');
        if (!part || part.head !== head) { part = { head, arts: [] }; parts.push(part); }
        part.arts.push(article(c));
      }
    }
  };
  const law = d.law_full_text, body = one(law, 'LawBody');
  walk(one(body, 'MainProvision'), []);
  const ri = d.revision_info || {};
  return { title: clean(text(one(body, 'LawTitle'))) || ri.law_title || '', asOf: ri.amendment_enforcement_date || '', num: clean(text(one(law, 'LawNum'))), parts };
}

// Justice Laws XML (Canada): headings and sections in the Body, each section with its subsections and paragraphs
function justice(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const own = (el, tag) => [...el.children].find((c) => c.localName === tag);
  const words = (el) => (el ? clean(el.textContent) : '');
  const lines = (el, depth) => {
    const out = [];
    for (const c of el.children) {
      const tag = c.localName;
      if (tag === 'Text') { const lab = own(el, 'Label'); if (depth > 0 || !out.length) out.push(`${' '.repeat(Math.max(0, depth - 1))}${lab && depth > 0 && !out.length ? words(lab) + ' ' : ''}${words(c)}`); }
      else if (/^(Subsection|Paragraph|Subparagraph|Clause|Subclause|Definition|ContinuedSectionSubsection|ContinuedParagraph|ContinuedDefinition)$/.test(tag)) out.push(...lines(c, depth + 1));
      else if (tag === 'Repealed') out.push(words(c));
    }
    return out;
  };
  const body = doc.getElementsByTagName('Body')[0];
  const parts = [];
  let head = '', part = null;
  for (const c of body ? body.children : []) {
    if (c.localName === 'Heading') {
      // the act's parts (PART 1 Electoral Rights …) group its sections; the headings within a part do not
      if (Number(c.getAttribute('level') || 1) <= 1) head = [words(own(c, 'Label')), words(own(c, 'TitleText'))].filter(Boolean).join(' ');
    } else if (c.localName === 'Section') {
      if (!part || part.head !== head) { part = { head, arts: [] }; parts.push(part); }
      const label = words(own(c, 'Label'));
      part.arts.push({ key: label, label: `s. ${label}`, cap: words(own(c, 'MarginalNote')), paras: lines(c, 0).filter(Boolean) });
    }
  }
  const st = doc.documentElement;
  return { title: words(doc.getElementsByTagName('ShortTitle')[0]) || 'Canada Elections Act', asOf: st.getAttribute('lims:current-date') || st.getAttribute('lims:pit-date') || '', num: 'S.C. 2000, c. 9', parts };
}

// the U.S. Code as govinfo prints a title (HTML): its chapters and sections, the statute's own words only (not the notes)
function uscode(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const parts = [];
  let chapter = '', sub = '', part = null, art = null, inStatute = false;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 8) {
      const c = n.nodeValue.trim();
      if (c === 'field-start:statute') inStatute = true;
      else if (c === 'field-end:statute') inStatute = false;
      continue;
    }
    const cls = n.className || '', t = clean(n.textContent);
    if (/\bchapter-head\b/.test(cls)) { chapter = t; sub = ''; }
    else if (/\bsubchapter-head\b/.test(cls)) sub = t;
    else if (/\bsection-head\b/.test(cls)) {
      const m = /^§\s*(\d{5}[a-z]?(?:-\d+)?)\.?\s*(.*)$/.exec(t);
      const head = [chapter, sub].filter(Boolean).join(' · ');
      if (!part || part.head !== head) { part = { head, arts: [] }; parts.push(part); }
      art = m ? { key: m[1], label: `§ ${m[1]}`, cap: m[2].replace(/\.$/, ''), paras: [] } : { key: t, label: t, cap: '', paras: [] };
      part.arts.push(art);
    } else if (art && inStatute && /^(h4|p)$/i.test(n.tagName) && /(subsection|paragraph|subparagraph|clause)-head|statutory-body/.test(cls)) {
      const depth = Number((/statutory-body-(\d)em/.exec(cls) || [])[1] || 0);
      if (t) art.paras.push(`${' '.repeat(depth)}${t}`);
    }
  }
  const through = (/currentthrough:(\d{8})/.exec(html) || [])[1] || '';
  return { title: clean((doc.querySelector('.usc-title-head') || {}).textContent || 'Title 52 — Voting and Elections'), asOf: through ? `${through.slice(0, 4)}-${through.slice(4, 6)}-${through.slice(6, 8)}` : '', num: '52 U.S.C.', parts: parts.filter((p) => p.arts.length) };
}

const READ = { egov: (t) => egov(JSON.parse(t)), justice, uscode };
const V = 1, FRESH = 7 * 864e5;
const mem = new Map();
// the law, read: at once from this device when kept, else from its source (kept for a week; an old copy when the source is out of reach)
export async function load(id) {
  const law = byId(id);
  if (!law) throw Object.assign(new Error('nolaw'), { code: 'nolaw' });
  if (mem.has(id)) return mem.get(id);
  const kept = await store.get('kv', 'foreign:' + id).catch(() => null);
  if (kept && kept.v === V && Date.now() - kept.at < FRESH) { mem.set(id, kept.d); return kept.d; }
  try {
    const d = READ[law.kind](await api.foreignText(id));
    if (!d.parts.length) throw Object.assign(new Error('empty'), { code: 'unavailable' });
    store.put('kv', 'foreign:' + id, { v: V, at: Date.now(), d }).catch(() => {});
    mem.set(id, d);
    return d;
  } catch (e) {
    if (kept && kept.v === V) { mem.set(id, kept.d); return kept.d; }
    throw e;
  }
}
export const arts = (d) => d.parts.flatMap((p) => p.arts.map((a) => ({ ...a, part: p.head })));
// an article by its key ('129_2', '30106', '16.1')
export const find = (d, key) => arts(d).find((a) => a.key === String(key)) || null;
// how a paper cites it: 公職選挙法 第百二十九条, 52 U.S.C. § 30106, Canada Elections Act, s. 16.1
export function cite(law, a) {
  if (law.kind === 'egov') return `${law.cite} ${a.label}`;
  if (law.kind === 'uscode') return `${law.cite} § ${a.key}`;
  return `${law.cite}, S.C. 2000, c. 9, s. ${a.key}`;
}
// how it is asked for again (the query that opens it)
export const ask = (law, a) => (law.kind === 'egov' ? `${law.cite} ${a.key.replace(/_(\d+)/, '条の$1').replace(/^(\d+)$/, '$1条')}` : law.kind === 'uscode' ? `52 U.S.C. ${a.key}` : `Canada Elections Act s. ${a.key}`);
export const parse = (kind, text) => READ[kind](text);   // (for the checks)
