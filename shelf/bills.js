// 국회 계류 법안: the bills now before the National Assembly that would amend a law (열린국회정보, through the server), each
// with its gist and the articles it would change, read from its 제안이유 및 주요내용 — so an article shows the bills that touch it.
// The server keeps what it read: the first look at a law with many bills (공직선거법, about 300) fills in over half a minute,
// every later look (on any device) is at once; this device keeps the last answer too, for six hours.
import * as api from './api.js?v=3dab24bfa8';
import * as store from './store.js?v=3dab24bfa8';

const V = 1, FRESH = 6 * 3600e3;
const mem = new Map();     // law → { seen, d }: the last answer, this session
const walks = new Map();   // law → { p, fns }: the asking in progress (one at a time for a law), and who wants each step

// the answer as it stands — { law, at, total, missing, rows } — handed to onStep at once (what this device has) and after each
// call while the server is still reading; resolves to the last answer (or one kept here, marked stale, when the server is out
// of reach), and fails only when there is nothing at all
export function pending(law, onStep) {
  const w = walks.get(law);
  if (w) { if (onStep) { w.fns.add(onStep); const m = mem.get(law); if (m) onStep(m.d); } return w.p; }
  const fns = new Set(onStep ? [onStep] : []);
  const tell = (d) => { for (const f of fns) { try { f(d); } catch (e) { /* a view that is gone */ } } };
  const p = (async () => {
    let kept = mem.get(law);
    if (!kept) { const k = await store.get('kv', 'bills:' + law).catch(() => null); kept = k && k.v === V && k.d ? k : null; }
    if (kept) { mem.set(law, kept); tell(kept.d); if (!kept.d.missing && Date.now() - kept.seen < FRESH) return kept.d; }
    let d = null, last = -1;
    try {
      for (let i = 0; i < 25; i++) {
        d = await api.bills(law);
        mem.set(law, { seen: Date.now(), d }); tell(d);
        if (!d.missing) break;   // all read
        if (d.missing === last) { d = { ...d, stalled: true }; mem.set(law, { seen: Date.now(), d }); tell(d); break; }   // none read this time: as it is
        last = d.missing;
      }
    } catch (e) {
      if (d) return d;
      if (kept) return { ...kept.d, stale: true };
      throw e;
    }
    store.put('kv', 'bills:' + law, { v: V, seen: Date.now(), d }).catch(() => {});
    return d;
  })().finally(() => walks.delete(law));
  walks.set(law, { p, fns });
  return p;
}

export const artKey = (art, sub) => (sub ? `${art}의${sub}` : String(art));
export const touching = (d, art, sub) => (d && d.rows ? d.rows.filter((x) => x.arts && x.arts.includes(artKey(art, sub))) : []);
// "24의2" → { art: 24, sub: 2 }
export const artOf = (k) => { const m = /^(\d+)(?:의(\d+))?$/.exec(k); return m ? { art: Number(m[1]), sub: m[2] ? Number(m[2]) : 0 } : null; };
export const one = (x) => api.bill(x.no, x.id);   // { summary, minutes: [{ kind, sess, dgr, date, url }] }

export const dateText = (d) => { const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(d || '')); return m ? `${m[1]}. ${+m[2]}. ${+m[3]}.` : ''; };
// "김영배의원 등 10인" → "김영배 의원 등 10인"; 정부 and 위원장 as they are
export const byText = (x) => String(x.by || '').replace(/(\S)의원/, '$1 의원');
// how a paper cites it: 「공직선거법 일부개정법률안」(김영배 의원 대표발의, 의안번호 2222931, 2026. 11. 18.)
export function cite(x) {
  const lead = /^(.+?)\s*의원(?:\s*등\s*\d+\s*인)?$/.exec(x.by || '');
  const who = lead ? `${lead[1]} 의원 대표발의` : x.kind === '정부' ? '정부 제출' : x.by ? `${x.by} 제안` : '';
  return `「${x.name}」(${[who, `의안번호 ${x.no}`, dateText(x.date)].filter(Boolean).join(', ')})`;
}
// how far it has gone, in the committee's name: 행정안전위원회 상정 (once 상정, the 검토보고서 exists), 법제사법위원회 회부, …
export function stepText(x) {
  if (!x.step || x.step === '접수') return '접수';
  const m = /^(위원회|법사위)\s*(.+)$/.exec(x.step);
  if (!m) return x.step;
  return `${m[1] === '법사위' ? '법제사법위원회' : x.cmt || '소관 위원회'} ${m[2]}`;
}
// the laws the Assembly amends: 법률 and the Constitution, not a 시행령, 시행규칙 or 규칙
export const byAssembly = (name) => /(?:법|법률)$/.test(String(name || '').replace(/\s+/g, '')) && !/시행령|시행규칙/.test(name || '');
// the bill's page at 의안정보시스템: its text, 비용추계서, and once taken up in committee, the 검토보고서
export const likms = (x) => `https://likms.assembly.go.kr/bill/billDetail.do?billId=${encodeURIComponent(x.id)}`;
