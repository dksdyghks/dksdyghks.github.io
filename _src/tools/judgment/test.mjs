// 판결문 분석기(yoai/judgment.js) 회귀 시험. 표본 판결문(가상의 당사자 ○○○)을 두 꼴로 읽는다:
// 붙여 넣은 글(문단마다 한 줄)과 PDF처럼 40자에서 줄이 꺾이고 쪽 번호·머리글이 붙은 글. 두 꼴의 결과가 같아야 하고, 아래 기대값과 맞아야 한다.
// 실행: node _src/tools/judgment/test.mjs   (판결문 밖의 정보를 지어내는 일이 없도록, 초안 문장은 판결문 속 문장과 대조한다)
import { analyzeJudgment, isJudgment, defaultEdit, judgmentItems, excerptOf, linkJudgments } from '../../site/yoai/judgment.js';
import fs from 'fs'; import { execFileSync } from 'child_process';
const dir = new URL('./fixtures/', import.meta.url).pathname;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const E = {
  sc_civil: { cite: '대법원 1993. 12. 10. 선고 93다12947 판결', stage: '상고심', result: '상고 기각', app: ['피고들'], facts: 3, lower: '서울고등법원 1993. 1. 15. 선고 92나36689 판결',
    drafts: { '제2심(원심)': /^서울고등법원\(원심\)은 위와 같은 사실관계를 바탕으로/, '제3심(대상 판결)': /^피고들이 상고하였으나, 대법원은 상고를 기각하였다\.$/ }, issues: [/불법원인급여에 관한 법리/], keyHas: [/민법 제746조에 의하면/] },
  sc_admin_db: { cite: '대법원 2019. 3. 28. 선고 2016두43176 판결', stage: '상고심', result: '상고 기각', app: ['피고'], facts: 1, lower: '부산고등법원 2016. 6. 3. 선고 2014누22861 판결',
    drafts: { '제2심(원심)': /^부산고등법원\(원심\)은 자본구조가/ }, issues: [/자금구조 변경이 감독명령의 대상이 되는지 여부/, /자금구조 유지의무가 인정되는지/], keyHas: [/종합적으로 고려하여 구체적 사안에 따라 개별적으로 판단하여야 한다/] },
  lower_civil: { cite: '서울중앙지방법원 2024. 6. 20. 선고 2023가합51234 판결', stage: '제1심', result: '청구 일부 인용', app: [], facts: 2, evidence: 1,
    drafts: { '제1심(대상 판결)': /^서울중앙지방법원은 원고의 청구를 일부 인용하였다\.$/ }, issues: [/이 사건 계약 해지의 적법 여부/, /\[원고 주장\]/, /\[피고 주장\]/], keyHas: [/책임 있는 사유로 인한 것이어야 한다/] },
  appeal_civil: { cite: '서울고등법원 2025. 2. 13. 선고 2024나2034567 판결', stage: '항소심', result: '항소 기각', app: ['원고'], facts: 0, lower: '서울중앙지방법원 2024. 6. 20. 선고 2023가합51234 판결',
    drafts: { '제2심(대상 판결)': /^원고가 항소하였으나, 서울고등법원은 제1심판결의 이유를 그대로 인용하여 항소를 기각하였다\.$/ }, issues: [], keyHas: [] },
  ccourt: { cite: '헌법재판소 2007. 6. 28. 선고 2004헌마644 전원재판부 결정', stage: '헌법재판', result: '헌법불합치', app: [], facts: 1, opinions: 1,
    drafts: { '헌법재판소(대상 결정)': /^헌법재판소는 헌법불합치 결정을 하였다\.$/ }, issues: [/선거권을 침해하는지 여부/, /제한되는 기본권/], keyHas: [/필요하고 불가피한 예외적인 경우에만/] },
  criminal: { cite: '대법원 2023. 3. 16. 선고 2022도12345 판결', stage: '상고심', result: '원심판결 파기환송', app: ['검사'], facts: 1, lower: '서울고등법원 2022. 8. 25. 선고 2021노1234 판결',
    drafts: { 제1심: /^제1심 법원은 이 사건 공소사실을 유죄로 인정하였다\.$/, '제2심(원심)': /^서울고등법원\(원심\)은 매매가격이 감정가에 근접하여/, '제3심(대상 판결)': /^검사가 상고하자, 대법원은 원심판결을 파기하고 사건을 서울고등법원에 환송하였다\.$/ }, issues: [/업무상배임죄의 재산상 손해에 관한 법리/], keyHas: [/재산상 실해 발생의 위험을 초래한 경우도 포함/] },
};
const strip = (a) => JSON.stringify({ ...a, facts: a.facts.map((x) => x.t), reasons: a.reasons.map((x) => [x.t, x.flags]), stages: a.stages.map((s) => [s.stage, s.citeText, s.draft]), outline: a.outline.map((o) => o.label), issues: a.issues.map((x) => x.text), evidence: a.evidence, factsFrom: '', head: { ...a.head }, stats: null });
for (const [name, x] of Object.entries(E)) {
  const flat = [fs.readFileSync(dir + name + '.txt', 'utf8')];
  const wrapped = JSON.parse(execFileSync('python3', [dir + 'wrap.py', dir + name + '.txt', 'head']).toString());
  const a = analyzeJudgment(flat), b = analyzeJudgment(wrapped);
  ok(strip(a).replace(/"p":\d+/g, '') === strip(b).replace(/"p":\d+/g, ''), `${name}: pasted and wrapped text read differently`);
  ok(isJudgment(flat) && a.ok, `${name}: not recognised as a judgment`);
  ok(a.cite === x.cite, `${name}: cite ${a.cite}`);
  ok(a.stage === x.stage, `${name}: stage ${a.stage}`);
  ok(a.result === x.result, `${name}: result ${a.result}`);
  ok(JSON.stringify(a.appellants) === JSON.stringify(x.app), `${name}: appellants ${a.appellants}`);
  ok(a.facts.length === x.facts, `${name}: facts ${a.facts.length}`);
  if (x.evidence) ok(a.evidence.length === x.evidence, `${name}: evidence ${a.evidence.length}`);
  if (x.opinions) ok(a.opinions.length === x.opinions, `${name}: opinions ${a.opinions.length}`);
  if (x.lower) ok(a.stages.some((s) => s.citeText === x.lower), `${name}: lower court ${a.stages.map((s) => s.citeText)}`);
  for (const [st, re] of Object.entries(x.drafts)) { const s = a.stages.find((y) => y.stage === st); ok(s && re.test(s.draft), `${name}: draft ${st}: ${s && s.draft}`); }
  for (const re of x.issues) ok(a.issues.some((i) => re.test(i.text)), `${name}: issue ${re}`);
  for (const re of x.keyHas) ok(a.key.some((k) => re.test(a.reasons[k].t)), `${name}: key paragraph ${re}`);
  // 초안은 판결문의 문장에서만 온다: 심급 초안의 본문(주어를 뺀 부분)은 판결문 안에 그대로 있어야 한다
  const whole = flat[0].replace(/\s+/g, ' ');
  for (const s of a.stages) if (s.draft && !s.me) { const body = s.draft.replace(/^.*?(\([^)]*\))?(은|는)\s/, '').replace(/[.]$/, '').replace(/였다$/, ''); ok(whole.includes(body.slice(0, Math.min(body.length, 60))), `${name}: draft not from the judgment: ${s.draft.slice(0, 60)}`); }
  const items = judgmentItems(a, defaultEdit(a));
  ok(items[0].text.includes(a.cite), `${name}: export heading`);
  const ex = excerptOf(a.reasons, a.key); ok(!a.key.length || (ex.startsWith('“') && ex.endsWith('”')), `${name}: excerpt quotes`);
}
// 심급 연결: 대법원 판결 + 서재의 원심(항소심)·제1심 판결 → 제1심 인용(원심 판결문 머리에서), 제1심 결과, 제1심 기초사실
{
  const rd = (n) => analyzeJudgment([fs.readFileSync(dir + n + '.txt', 'utf8')]);
  const top = rd('sc_from_appeal'), mid = rd('appeal_civil'), low = rd('lower_civil');
  const e = defaultEdit(top, linkJudgments(top, [{ id: 'm', a: mid }, { id: 'l', a: low }]));
  ok(e.stages[0].citeText === '서울중앙지방법원 2024. 6. 20. 선고 2023가합51234 판결' && e.stages[0].text === '서울중앙지방법원은 원고의 청구를 일부 인용하였다.', `link: first instance ${JSON.stringify(e.stages[0])}`);
  ok(e.facts.startsWith('가. 원고는 건설업을 영위하는 회사이고'), 'link: facts from the first-instance judgment');
  const lone = defaultEdit(top, linkJudgments(top, [{ id: 'l', a: low }]));
  ok(!lone.stages[0].citeText && !lone.facts, 'link: without the appeal judgment nothing is guessed');
}
// 판결문이 아닌 글(논문 표본)은 판결문으로 보지 않는다
ok(!isJudgment(['국문초록\n이 논문은 선거관리위원회의 독립성을 다룬다.\nⅠ. 서론\n1. 문제의 제기']), 'an article read as a judgment');
console.log(fails ? `FAILED ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
