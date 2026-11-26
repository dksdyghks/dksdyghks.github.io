// KCI (한국학술지인용색인, 한국연구재단) through 공공데이터포털: a journal's volume and issue table gives each issue's year and month.
// It fills a paper line that has its issue but not the month (공법학연구 제18권 제1호, 2017 → 2017. 2.), and the issue too
// when the journal put out one issue that year, or when the paper is among the journal's earliest articles the service lists
// (it gives a journal's first two hundred or so). Nothing is guessed: two journals of one name with no society to tell them
// apart, or an issue that is not in the table, leave the line as it was.
import * as api from './api.js?v=999a221565';
import * as store from './store.js?v=999a221565';
import { knownNames } from './cite.js?v=999a221565';

const SVC = 'B552540/KCIOpenApi/doiInfo/';
const DAY = 864e5;

// every KCI journal (kci-journals.json beside this file, made from the service's journal and publisher tables):
// [{ s: its id, k: its name, e: its English name, p: its publisher }]
let listP = null;
export function journals() {
  if (!listP) listP = fetch(new URL('./kci-journals.json', import.meta.url)).then((r) => (r.ok ? r.json() : [])).catch(() => { listP = null; return []; });
  return listP;
}
// their names, as a paper's first pages are read against them (cite.js: a journal KCI lists is told from other words), or
// null while the list cannot be had (offline: naming.js knows the commonest journals itself)
let namesP = null;
export function names() {
  if (!namesP) namesP = journals().then((l) => { if (!l.length) { namesP = null; return null; } return knownNames(l); });
  return namesP;
}
const key = (s) => String(s || '').normalize('NFKC').replace(/[\s·ㆍ・‧∙.,:;'"「」『』〈〉《》()[\]{}<>\-–—―~!?]/g, '').toLowerCase();
// the journal of this name (its society telling apart two of one name); none when it is not there or cannot be told apart
export async function journalOf(name, society) {
  const k = key(name);
  if (k.length < 2) return null;
  let c = (await journals()).filter((j) => key(j.k) === k || (j.e && key(j.e) === k));
  if (c.length > 1 && society) { const s = key(society); c = c.filter((j) => key(j.p) === s); }
  return c.length === 1 ? c[0] : null;
}

// a paper's whole record from KCI (by its OAI number o): the full abstract (Korean, then English), author affiliations, DOI.
// Kept on this device a month, so a paper opened again shows at once.
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, ' ');
const oaiText = (xml, tag) => { const m = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>').exec(xml || ''); return m ? unx(stripTags(m[1])) : ''; };
export async function record(o) {
  if (!o) return null;
  return kept('kci-rec:' + o, 30 * DAY, async () => {
    let xml = '';
    try { xml = await api.kciOai({ verb: 'GetRecord', metadataPrefix: 'oai_kci', identifier: 'oai:kci.go.kr:ARTI/' + o }); } catch (e) { return null; }
    if (!/<record>/.test(xml)) return null;
    const abs = [...xml.matchAll(/<abstract(?:\s+lang="(\w+)")?>([\s\S]*?)<\/abstract>/g)].map((m) => ({ lang: m[1] || 'original', t: unx(stripTags(m[2])) }));
    const ko = (abs.find((a) => a.lang === 'original') || abs[0] || {}).t || '';
    const en = (abs.find((a) => a.lang === 'english') || {}).t || '';
    const affs = [...xml.matchAll(/<affiliation>([\s\S]*?)<\/affiliation>/g)].map((m) => unx(stripTags(m[1]))).filter(Boolean);
    const doi = oaiText(xml, 'doi').replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');
    const cites = oaiText(xml, 'citation-count');
    return { ab: ko, abEn: en, affs: [...new Set(affs)], doi: /^10\./.test(doi) ? doi : '', cites: /^\d+$/.test(cites) ? Number(cites) : null };
  });
}

const unx = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const items = (xml, fields) => [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => Object.fromEntries(fields.map((f) => [f, unx((new RegExp(`<${f}>([^<]*)</${f}>`).exec(m[1]) || [])[1])])));
async function ask(op, params) {
  const xml = await api.publicDataText(SVC + op, params);
  if (!/<items>|<totalCount>0</.test(xml)) throw Object.assign(new Error('kci'), { code: 'unavailable' });
  return xml;
}
// kept on this device for a while: a journal's issues (a week), its earliest articles (a month)
async function kept(k, ttl, make) {
  const c = await store.get('kv', k).catch(() => null);
  if (c && c.v === 1 && Date.now() - c.at < ttl) return c.d;
  const d = await make();
  store.put('kv', k, { v: 1, at: Date.now(), d }).catch(() => {});
  return d;
}
// a journal's issues: [{ id, vol, no, ser, ym }] (ym: 200510)
export const issues = (sere) => kept('kci-iss:' + sere, 7 * DAY, async () => items(await ask('openApiD213List', { sereId: sere, pageNo: '1', recordCnt: '500' }), ['VOLISSEID', 'VOL', 'ISSE', 'SERNO', 'PUBIYRMON'])
  .map((x) => ({ id: x.VOLISSEID, vol: x.VOL, no: x.ISSE, ser: x.SERNO, ym: x.PUBIYRMON })).filter((x) => /^\d{6}$/.test(x.ym)));
// its earliest articles the service still gives (two pages of a hundred): [{ id, vi, t, sp, ep }]
const early = (sere) => kept('kci-art:' + sere, 30 * DAY, async () => {
  const out = [];
  for (const page of ['1', '2']) {
    let xml = '';
    try { xml = await ask('openApiD214List', { sereId: sere, pageNo: page, recordCnt: '100' }); } catch (e) { if (page === '1') throw e; break; }
    const rows = items(xml, ['ARTIID', 'VOLISSEID', 'KORTITLE', 'SPAGE', 'EPAGE']);
    out.push(...rows.map((x) => ({ id: x.ARTIID, vi: x.VOLISSEID, t: x.KORTITLE, sp: x.SPAGE, ep: x.EPAGE })));
    if (rows.length < 100) break;
  }
  return out;
});

// "제18권 제1호", "제18권 1호", "18권 1호", "Vol.18 No.1", "제511호", "통권 제22호" → { vol, no, ser }
export function volIss(s) {
  const t = String(s || '');
  const vol = (/(?:제\s*)?(\d+)\s*(?:권|집)|vol\.?\s*(\d+)/i.exec(t) || []).slice(1).find(Boolean) || '';
  const ser = (/통권\s*(?:제\s*)?(\d+)\s*호/.exec(t) || [])[1] || '';
  const no = (/(?:^|[^통권\d])(?:제\s*)?(\d+)\s*호|no\.?\s*(\d+)/i.exec(t.replace(/통권\s*(?:제\s*)?\d+\s*호/, '')) || []).slice(1).find(Boolean) || '';
  return vol || no || ser ? { vol, no, ser } : null;
}
const same = (a, b) => !!a && !!b && String(Number(a)) === String(Number(b));
// an issue of the table that is the one named; KCI keeps a single number now as 권 (VOL), now as 호 (ISSE)
function fits(x, w) {
  if (w.vol && w.no) return same(x.vol, w.vol) && same(x.no, w.no);
  if (w.vol) return x.vol ? same(x.vol, w.vol) && !x.no : same(x.no, w.vol);
  if (w.no) return x.no ? !x.vol && same(x.no, w.no) : same(x.vol, w.no);
  return !!w.ser && same(x.ser, w.ser);
}
// a journal numbering its issues in one run (행정법연구 제14호, 제15호 … several a year, kept by KCI as 권 only)
const oneRun = (all) => all.every((x) => !x.no) && all.some((x, i) => all.findIndex((y) => y.ym.slice(0, 4) === x.ym.slice(0, 4)) !== i);
// a journal whose 권 never changes in the table (사법: 권 1 throughout, its issues 제1호 … 제64호) is numbered by its 호 alone
const fixedVol = (all) => all.length >= 3 && all.every((x) => x.vol === all[0].vol) && all.some((x) => x.no) && new Set(all.map((x) => x.ym.slice(0, 4))).size >= 2;
// how the issue is written: 제V권 제N호, 제N호; a number kept only as 권 is written as 호 when the journal numbers its issues in one
// run, and not at all otherwise (it may be an annual 권, 집 or 호)
export function issueText(x, all = []) {
  const digits = (v) => !v || /^\d+$/.test(String(v).trim());
  if (!digits(x.vol) || !digits(x.no)) return '';   // 제1·2호, 특별호: not written (the line keeps what it had)
  if (x.no && (!x.vol || fixedVol(all))) return `제${Number(x.no)}호`;
  if (x.vol && x.no) return `제${Number(x.vol)}권 제${Number(x.no)}호`;
  return x.vol && oneRun(all) ? `제${Number(x.vol)}호` : '';
}
const titleKey = (t) => key(String(t || '').split(/\s[-–—―:]\s|:\s|\s―|―/)[0]).slice(0, 24);

// what KCI adds to a paper's line { journal, society, issue, date }: the issue and the month (date YYYY-MM), or null
export async function fill(info, title) {
  if (!info || !info.journal) return null;
  const j = await journalOf(info.journal, info.society);
  if (!j) return null;
  const all = await issues(j.s);
  if (!all.length) return null;
  const year = (/^(\d{4})/.exec(info.date || '') || [])[1] || '', month = (/^\d{4}-(\d{2})/.exec(info.date || '') || [])[1] || '';
  const want = volIss(info.issue);
  let hit = null;
  if (want) {
    const c = all.filter((x) => fits(x, want) && (!year || x.ym.startsWith(year)));
    if (c.length === 1) hit = c[0];
  } else if (year && month) {   // the month is known: the issue of that month
    const c = all.filter((x) => x.ym === year + month);
    if (c.length === 1) hit = c[0];
  } else if (year) {
    const c = all.filter((x) => x.ym.startsWith(year));
    if (c.length === 1) hit = c[0];
    else if (c.length > 1) {
      // among the journal's earliest articles? (only when that year is among theirs)
      const arts = await early(j.s).catch(() => []);
      const tk = titleKey(title);
      const m = tk.length >= 6 ? arts.filter((a) => { const ak = titleKey(a.t); return ak.length >= 6 && (ak === tk || (Math.min(ak.length, tk.length) >= 14 && ak.slice(0, 14) === tk.slice(0, 14))); }) : [];
      if (m.length === 1) hit = c.find((x) => x.id === m[0].vi) || null;
    }
  }
  if (!hit) return null;
  // an issue the line already names stays as it is written there (법학논고 제28집): only what is missing is added
  return { journal: j.k, society: j.p || '', issue: info.issue || issueText(hit, all), date: month ? info.date : `${hit.ym.slice(0, 4)}-${hit.ym.slice(4, 6)}` };
}
