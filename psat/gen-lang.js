/* 송공 — 언어논리: 명제 추론 · 참/거짓 진술 · 정언 논리 · 순서 추론 (generated, solver-checked) + 독해/논증 (hand-written) */
(function (G) {
  'use strict';
  const P = G.PSAT;
  const { josa, CIRC, esc } = P;
  const NAMES = ['甲', '乙', '丙', '丁', '戊'];
  const top = (n) => josa(n, '은/는');
  const subj = (n) => josa(n, '이/가');
  const andN = (a, b) => `${josa(a, '과/와')} ${b}`;

  /* ======================= 1. 명제 추론 ======================= */
  const PCTX = [
    { lead: (L) => `다음은 甲~${L}의 회의 참석 여부에 관한 진술이며, 모두 참이다.`, P: '참석한다', N: '참석하지 않는다', cP: '참석하면', cN: '참석하지 않으면', gP: '참석하고', gN: '참석하지 않고', aP: '참석하는', noun: '참석', y: '참석함', n: '참석하지 않음' },
    { lead: (L) => `A부서는 다음 주 출장자를 정하였다. 다음은 甲~${L}의 출장 여부에 관한 진술이며, 모두 참이다.`, P: '출장을 간다', N: '출장을 가지 않는다', cP: '출장을 가면', cN: '출장을 가지 않으면', gP: '출장을 가고', gN: '출장을 가지 않고', aP: '출장을 가는', noun: '출장', y: '출장 감', n: '출장 가지 않음' },
    { lead: (L) => `B위원회는 甲~${L} 가운데 위원을 선발하였다. 다음은 선발 결과에 관한 진술이며, 모두 참이다.`, P: '선발된다', N: '선발되지 않는다', cP: '선발되면', cN: '선발되지 않으면', gP: '선발되고', gN: '선발되지 않고', aP: '선발되는', noun: '선발', y: '선발됨', n: '선발되지 않음' },
    { lead: (L) => `C위원회의 한 안건 표결에서 위원 甲~${L}의 찬성 여부에 관한 진술은 다음과 같으며, 모두 참이다.`, P: '찬성한다', N: '찬성하지 않는다', cP: '찬성하면', cN: '찬성하지 않으면', gP: '찬성하고', gN: '찬성하지 않고', aP: '찬성하는', noun: '찬성', y: '찬성함', n: '찬성하지 않음' },
    { lead: (L) => `D연구소는 새 연구과제에 참여할 연구원을 정하였다. 다음은 甲~${L}의 참여 여부에 관한 진술이며, 모두 참이다.`, P: '참여한다', N: '참여하지 않는다', cP: '참여하면', cN: '참여하지 않으면', gP: '참여하고', gN: '참여하지 않고', aP: '참여하는', noun: '참여', y: '참여함', n: '참여하지 않음' },
    { lead: (L) => `다음은 甲~${L}의 이번 자격시험 응시 여부에 관한 진술이며, 모두 참이다.`, P: '응시한다', N: '응시하지 않는다', cP: '응시하면', cN: '응시하지 않으면', gP: '응시하고', gN: '응시하지 않고', aP: '응시하는', noun: '응시', y: '응시함', n: '응시하지 않음' },
  ];
  function propText(c, X, N) {
    const a = N[c.a], b = N[c.b];
    switch (c.t) {
      case 'IMP': {
        const cons = c.sb ? (c.sa ? `${b}도 ${X.P}` : `${top(b)} ${X.P}`) : `${top(b)} ${X.N}`;
        return `${subj(a)} ${c.sa ? X.cP : X.cN} ${cons}.`;
      }
      case 'NAND': return `${andN(a, b)} 중 적어도 한 명은 ${X.N}.`;
      case 'OR': return `${andN(a, b)} 중 적어도 한 명은 ${X.P}.`;
      case 'XOR': return `${andN(a, b)} 중 정확히 한 명만 ${X.P}.`;
      case 'EQ': return `${andN(a, b)}의 ${X.noun} 여부는 같다.`;
      case 'LIT': return `${top(a)} ${c.sa ? X.P : X.N}.`;
      case 'AND': return c.sa === c.sb ? `${josa(andN(a, b), '은/는')} 모두 ${c.sa ? X.P : X.N}.` : `${top(a)} ${c.sa ? X.gP : X.gN} ${top(b)} ${c.sb ? X.P : X.N}.`;
      case 'CNT': return `${X.aP} 사람은 ${c.mode === 'eq' ? `정확히 ${c.k}명이다` : c.mode === 'ge' ? `${c.k}명 이상이다` : `${c.k}명 이하이다`}.`;
    }
    return '';
  }
  function propFn(c) {
    switch (c.t) {
      case 'IMP': return (m) => m[c.a] !== c.sa || m[c.b] === c.sb;
      case 'NAND': return (m) => !(m[c.a] && m[c.b]);
      case 'OR': return (m) => m[c.a] || m[c.b];
      case 'XOR': return (m) => m[c.a] !== m[c.b];
      case 'EQ': return (m) => m[c.a] === m[c.b];
      case 'LIT': return (m) => m[c.a] === c.sa;
      case 'AND': return (m) => m[c.a] === c.sa && m[c.b] === c.sb;
      case 'CNT': return (m) => { const k = m.filter(Boolean).length; return c.mode === 'eq' ? k === c.k : c.mode === 'ge' ? k >= c.k : k <= c.k; };
    }
    return () => true;
  }
  const LAB = ['가', '나', '다', '라', '마', '바'];
  /* human-style deduction: propagate forced values constraint by constraint; branch on a pivot when stuck */
  function explainProp(cs, N, X) {
    const n = N.length, lines = [];
    const lit = (v, val) => `${top(N[v])} ${val ? X.P : X.N}`;
    const canSat = (c, asg) => {
      const free = []; for (let i = 0; i < n; i++) if (asg[i] === undefined) free.push(i);
      for (let m = 0; m < (1 << free.length); m++) { const full = asg.slice(); free.forEach((v, j) => { full[v] = !!((m >> j) & 1); }); if (c.f(full)) return true; }
      return false;
    };
    function propagate(asg, ind) {
      let changed = true;
      while (changed) {
        changed = false;
        for (let ci = 0; ci < cs.length; ci++) {
          if (!canSat(cs[ci], asg)) return { contra: ci };
          for (let v = 0; v < n; v++) {
            if (asg[v] !== undefined) continue;
            const a = asg.slice(); a[v] = true; const okT = canSat(cs[ci], a);
            const b = asg.slice(); b[v] = false; const okF = canSat(cs[ci], b);
            if (okT && okF) continue;
            if (!okT && !okF) return { contra: ci };
            asg[v] = okT; lines.push({ ind, h: `진술 (${LAB[ci]})에 따라 ${esc(lit(v, okT))}.` }); changed = true;
          }
        }
      }
      return { asg };
    }
    const models = [], labels = [];
    let firstPivot = null;
    function solve(asg, ind, depth, label) {
      const res = propagate(asg, ind);
      if (res.contra !== undefined) { lines.push({ ind, h: `그런데 이러면 진술 (${LAB[res.contra]})를 만족할 수 없으므로 <b>이 경우는 성립하지 않는다</b>.` }); return; }
      const free = []; for (let i = 0; i < n; i++) if (asg[i] === undefined) free.push(i);
      if (!free.length) { models.push(asg.slice()); labels.push(label); lines.push({ ind, k: 'ok', h: `모든 진술을 만족한다. → <b>${N.map((nm, i) => `${nm}${asg[i] ? '○' : '×'}`).join(' ')}</b>` }); return; }
      if (depth > 3) return;
      const cnt = free.map((v) => cs.filter((c) => c.a === v || c.b === v).length);
      const pivot = free[cnt.indexOf(Math.max(...cnt))];
      if (firstPivot === null) firstPivot = { pivot, pre: lines.length };
      [true, false].forEach((val, k) => {
        const lab = label ? `${label}-${k + 1}` : `${k + 1}`;
        lines.push({ ind, k: 'case', h: `[경우 ${lab}] ${esc(lit(pivot, val))}고 가정하면` });
        const a = asg.slice(); a[pivot] = val;
        solve(a, ind + 1, depth + 1, lab);
      });
    }
    solve(Array(n).fill(undefined), 0, 0, '');
    const forcedFirst = lines.length && /^진술 \(/.test(lines[0].h);
    const intro = forcedFirst
      ? '<b>출발점</b> 다른 진술과 관계없이 곧바로 확정되는 것부터 찾는다.'
      : `<b>출발점</b> 곧바로 확정되는 사람이 없으므로, 진술에 가장 많이 등장하는 ${josa(N[firstPivot ? firstPivot.pivot : 0], '을/를')} 기준으로 경우를 나눈다.`;
    lines.unshift({ ind: 0, h: intro });
    return { lines, models, labels: labels.map((l) => (l ? `경우 ${l}` : '확정')) };
  }
  function genProp(r, lv) {
    const X = r.pick(PCTX);
    const n = lv === 1 ? 4 : lv === 3 ? 5 : r.pick([4, 5, 5]);
    const N = NAMES.slice(0, n);
    const all = [];
    for (let m = 0; m < (1 << n); m++) all.push(N.map((_, i) => !!((m >> i) & 1)));
    const sig = (f) => all.map((m) => (f(m) ? 1 : 0)).join('');
    for (let attempt = 0; attempt < 300; attempt++) {
      const k = n === 5 ? r.int(4, 5) : r.int(3, 4);
      const cs = [];
      let guard = 0;
      while (cs.length < k && guard++ < 60) {
        const t = r.weighted([{ t: 'IMP', w: 46 }, { t: 'NAND', w: 12 }, { t: 'OR', w: 12 }, { t: 'XOR', w: 8 }, { t: 'EQ', w: 8 }, { t: 'LIT', w: cs.some((c) => c.t === 'LIT') ? 0 : 6 }, { t: 'CNT', w: cs.some((c) => c.t === 'CNT') ? 0 : 8 }]).t;
        const [a, b] = r.sample([...Array(n).keys()], 2);
        const c = { t, a, b, sa: r.chance(0.6), sb: r.chance(0.6) };
        if (t === 'CNT') { c.mode = r.pick(['eq', 'eq', 'ge', 'le']); c.k = r.int(1, n - 1); }
        c.f = propFn(c); c.sig = sig(c.f);
        if (!c.sig.includes('0') || !c.sig.includes('1') || cs.some((x) => x.sig === c.sig)) continue;
        cs.push(c);
      }
      const models = all.filter((m) => cs.every((c) => c.f(m)));
      if (models.length < (lv === 3 ? 2 : 1) || models.length > (lv === 1 ? 2 : n === 5 ? (lv === 3 ? 3 : 2) : 3)) continue;
      if (cs.some((c, i) => all.filter((m) => cs.every((d, j) => j === i || d.f(m))).length === models.length)) continue;
      // candidate options
      const prem = new Set(cs.map((c) => c.sig));
      const pool = [];
      const push = (c) => { c.f = propFn(c); c.sig = sig(c.f); if (!c.sig.includes('0') || prem.has(c.sig)) return; c.text = propText(c, X, N); if (!pool.some((p) => p.sig === c.sig || p.text === c.text)) pool.push(c); };
      for (let a = 0; a < n; a++) {
        push({ t: 'LIT', a, sa: true }); push({ t: 'LIT', a, sa: false });
        for (let b = 0; b < n; b++) {
          if (a === b) continue;
          for (const sa of [true, false]) for (const sb of [true, false]) { push({ t: 'IMP', a, b, sa, sb }); if (a < b) push({ t: 'AND', a, b, sa, sb }); }
          if (a < b) { push({ t: 'OR', a, b }); push({ t: 'NAND', a, b }); push({ t: 'EQ', a, b }); push({ t: 'XOR', a, b }); }
        }
      }
      for (let kk = 1; kk < n; kk++) push({ t: 'CNT', mode: 'eq', k: kk });
      pool.forEach((c) => { const v = models.map(c.f); c.nec = v.every(Boolean); c.never = !v.some(Boolean); c.failAt = v.findIndex((x) => !x); });
      const nec = pool.filter((c) => c.nec);
      const contingent = pool.filter((c) => !c.nec && !c.never);
      const never = pool.filter((c) => c.never);
      if (!nec.length || contingent.length + never.length < 4) continue;
      const nonLit = nec.filter((c) => c.t !== 'LIT');
      const right = r.pick(nonLit.length && r.chance(0.75) ? nonLit : nec);
      const wrong = [];
      const byType = (arr) => r.shuffle(arr).sort((x, y) => (x.t === right.t) - (y.t === right.t));
      for (const c of byType(contingent)) { if (wrong.length >= (models.length > 1 ? 3 : 2)) break; if (!wrong.some((w) => w.t === c.t && r.chance(0.6))) wrong.push(c); }
      for (const c of byType(never.concat(contingent))) { if (wrong.length >= 4) break; if (!wrong.includes(c)) wrong.push(c); }
      if (wrong.length < 4) continue;
      const opts = r.shuffle([right, ...wrong.slice(0, 4)]);
      const answer = opts.indexOf(right);
      const L = N[n - 1];
      const forced = N.map((nm, i) => [nm, models[0][i], models.every((m) => m[i] === models[0][i])]).filter((x) => x[2]);
      const groups = []; for (const [nm, v] of forced) { const g = groups.find((x) => x.v === v); if (g) g.names.push(nm); else groups.push({ v, names: [nm] }); }
      const forcedText = groups.map((g, i) => `${g.names.join('·')}${P.pp(g.names[g.names.length - 1], '은/는')} ${i < groups.length - 1 ? (g.v ? X.gP : X.gN) : (g.v ? X.P : X.N)}`).join(', ');
      const ex = explainProp(cs, N, X);
      const sameModels = ex.models.length === models.length && ex.models.every((m) => models.some((x) => x.every((v, i) => v === m[i])));
      if (!sameModels) continue; // the narrative must reach exactly the models the solver found
      const explain = [
        { t: 'steps', items: ex.lines },
        { t: 'p', h: `정리하면 모든 진술을 만족하는 경우는 다음 ${models.length}가지${models.length === 1 ? '뿐이다' : '이다'}.` },
        { t: 'table', head: ['경우', ...N], rows: ex.models.map((m, i) => [ex.labels[i], ...m.map((v) => (v ? '○' : '×'))]), note: `○: ${X.y}, ×: ${X.n}` },
      ];
      if (forcedText) explain.push({ t: 'p', h: `${models.length > 1 ? '모든 경우에 공통으로 ' : ''}${esc(forcedText)}.` });
      explain.push({ t: 'ox', items: opts.map((c) => { const fi = ex.models.findIndex((m) => !c.f(m)); return { ok: c.nec, v: c.nec ? '반드시 참이다' : c.never ? '항상 거짓이다' : '반드시 참이라고 할 수 없다', why: c.nec ? `${models.length === 1 ? '확정된 경우에서' : `${ex.labels.join('·')} 모두에서`} 참이다.` : c.never ? `${models.length === 1 ? '확정된 경우에서' : '어느 경우에서도'} 거짓이다.` : `${ex.labels[fi]}에서 거짓이다.` }; }) });
      return {
        type: '논리 · 명제 추론',
        stem: '다음 글의 내용이 참일 때, 반드시 참인 것은?',
        body: [{ t: 'passage', h: `${esc(X.lead(L))}<ul class="cond lab">${cs.map((c, i) => `<li><span class="lb">(${LAB[i]})</span> ${esc(propText(c, X, N))}</li>`).join('')}</ul>` }],
        options: opts.map((c) => esc(c.text)),
        answer, explain,
      };
    }
    return null;
  }

  /* ======================= 2. 참/거짓 진술 (한 사람이 범인) ======================= */
  const LCTX = [
    { event: '회의실 화분이 깨진', who: '화분을 깨뜨린', did: '화분을 깨뜨렸다', didnt: '화분을 깨뜨리지 않았다' },
    { event: '냉장고에 있던 마지막 케이크가 사라진', who: '케이크를 먹은', did: '케이크를 먹었다', didnt: '케이크를 먹지 않았다' },
    { event: '공용 프린터가 고장 난', who: '프린터를 고장 낸', did: '프린터를 고장 냈다', didnt: '프린터를 고장 내지 않았다' },
    { event: '회의 자료 원본이 사라진', who: '자료를 가져간', did: '자료를 가져갔다', didnt: '자료를 가져가지 않았다' },
    { event: '사무실 에어컨이 밤새 켜져 있던', who: '에어컨을 켜 둔', did: '에어컨을 켜 두었다', didnt: '에어컨을 켜 두지 않았다' },
  ];
  function genLiar(r, lv) {
    const X = r.pick(LCTX);
    const N = NAMES.slice();
    const k = lv === 1 ? 1 : lv === 3 ? 2 : r.pick([1, 2]);
    for (let attempt = 0; attempt < 400; attempt++) {
      const st = N.map((sp) => {
        const others = N.filter((x) => x !== sp);
        const t = r.weighted([{ t: 'acc', w: 3 }, { t: 'deny', w: 2 }, { t: 'self', w: 2 }, { t: 'liar', w: lv === 1 ? 0 : lv === 3 ? 3 : 2 }, { t: 'truth', w: lv === 1 ? 0 : lv === 3 ? 1.6 : 1 }, { t: 'either', w: 1.5 }]).t;
        const [x, y] = r.sample(others, 2);
        if (t === 'acc') return { t, x, text: `“${subj(x)} ${X.did}.”`, f: (c) => c === x };
        if (t === 'deny') return { t, x, text: `“${top(x)} ${X.didnt}.”`, f: (c) => c !== x };
        if (t === 'self') return { t, text: `“나는 ${X.didnt}.”`, f: (c) => c !== sp };
        if (t === 'liar') return { t, x, text: `“${top(x)} 거짓말을 하고 있다.”`, f: (c, L) => L.includes(x) };
        if (t === 'truth') return { t, x, text: `“${x}의 말은 사실이다.”`, f: (c, L) => !L.includes(x) };
        return { t, x, y, text: `“${andN(x, y)} 중 한 명이 ${X.did}.”`, f: (c) => c === x || c === y };
      });
      const subsets = [];
      for (let m = 0; m < 32; m++) subsets.push(N.filter((_, i) => (m >> i) & 1));
      const consistent = (c, L) => N.every((p, i) => st[i].f(c, L) === !L.includes(p));
      const sols = [];
      for (const c of N) for (const L of subsets) if (L.length === k && consistent(c, L)) sols.push({ c, L });
      if (sols.length !== 1) continue;
      if (st.filter((s) => s.t === 'liar' || s.t === 'truth').length > 2) continue;
      const sol = sols[0];
      const mode = k === 1 ? r.pick(['culprit', 'liar', 'pair']) : 'culprit';
      let options, answer, stem;
      if (mode === 'culprit') { stem = `${X.who} 사람은?`; options = N.slice(); answer = N.indexOf(sol.c); }
      else if (mode === 'liar') { stem = '거짓을 진술한 사람은?'; options = N.slice(); answer = N.indexOf(sol.L[0]); }
      else {
        stem = `${X.who} 사람과 거짓을 진술한 사람을 바르게 짝지은 것은?`;
        const right = `${sol.c}, ${sol.L[0]}`;
        const cand = new Set([right]);
        while (cand.size < 5) cand.add(`${r.pick(N)}, ${r.pick(N)}`);
        options = r.shuffle([...cand]); answer = options.indexOf(right);
        options = options.map((o) => o.replace(', ', ' — '));
      }
      const rows = N.map((c) => {
        const ok = subsets.filter((L) => consistent(c, L));
        const desc = ok.length ? ok.map((L) => (L.length ? `${L.join('·')}(${L.length}명)` : '없음(0명)')).join(', ') : '모순 발생';
        return [`${c}`, desc, ok.some((L) => L.length === k) ? '조건 충족' : '×'];
      });
      return {
        type: '논리 · 참/거짓 진술',
        stem: `다음 글의 내용이 참일 때, ${stem}`,
        body: [{ t: 'passage', h: `${esc(`어느 사무실에서 ${X.event} 일이 있었다. 甲~戊 다섯 명 중 한 명이 ${X.who} 사람이며, 다섯 명은 다음과 같이 진술하였다. 이 가운데 ${k}명의 진술만 거짓이다.`)}<ul class="cond">${st.map((s, i) => `<li>${N[i]}: ${esc(s.text)}</li>`).join('')}</ul>` }],
        options, answer,
        explain: [
          { t: 'p', h: `${X.who.replace(/ㄴ$/, '')} 사람을 한 명씩 가정하고, 진술끼리 모순 없이 성립하려면 누가 거짓을 말해야 하는지 따져 본다.` },
          { t: 'table', head: [`${X.who} 사람으로 가정`, '거짓을 말한 사람', `거짓 ${k}명`], rows },
          { t: 'p', h: `조건(거짓 진술 ${k}명)을 만족하는 경우는 하나뿐이다. 이 경우 각 진술의 참·거짓을 확인하면 다음과 같다.` },
          { t: 'list', items: N.map((p, i) => `${p}: ${esc(st[i].text)} → ${sol.L.includes(p) ? '<b>거짓</b>' : '참'}`) },
          { t: 'p', h: `따라서 ${esc(`${X.who} 사람은 ${sol.c}이고, 거짓을 진술한 사람은 ${sol.L.join('·')}이다.`)}` },
        ],
      };
    }
    return null;
  }

  /* ======================= 3. 정언 논리 (숨은 전제 · 반드시 참) ======================= */
  const THEMES = [
    { S: '법학 전공자', M: '토론 동아리 회원', P: '장학생' },
    { S: '신입 직원', M: '보안 연수 이수자', P: '전산 담당자' },
    { S: '이번 학기 수강생', M: '과제 제출자', P: '우수 학생' },
    { S: '위원회 위원', M: '공청회 참석자', P: '보고서 작성자' },
    { S: '외교관 후보자', M: '외국어 우수자', P: '해외 연수 대상자' },
    { S: '공모전 참가자', M: '예선 통과자', P: '수상자' },
    { S: '연구원', M: '국제 학회 발표자', P: '논문 저자' },
    { S: '자원봉사자', M: '안전 교육 이수자', P: '현장 투입 인원' },
    { S: '사관생도', M: '비행 훈련 이수자', P: '조종 특기자' },
    { S: '정책 담당자', M: '데이터 분석 교육 이수자', P: '평가위원' },
  ];
  const BIT = { S: 1, M: 2, P: 4 };
  const evalS = (s, w) => {
    const has = (pred) => { for (let t = 0; t < 8; t++) if ((w >> t) & 1 && pred(t)) return true; return false; };
    const X = BIT[s.x], Y = BIT[s.y];
    if (s.q === 'A') return !has((t) => (t & X) && !(t & Y));
    if (s.q === 'E') return !has((t) => (t & X) && (t & Y));
    if (s.q === 'I') return has((t) => (t & X) && (t & Y));
    return has((t) => (t & X) && !(t & Y));
  };
  const nonEmpty = (w) => ['S', 'M', 'P'].every((k) => { for (let t = 0; t < 8; t++) if ((w >> t) & 1 && t & BIT[k]) return true; return false; });
  const entails = (prem, c, ei) => { for (let w = 0; w < 256; w++) { if (ei && !nonEmpty(w)) continue; if (prem.every((p) => evalS(p, w)) && !evalS(c, w)) return false; } return true; };
  const counter = (prem, c) => { const ws = []; for (let w = 1; w < 256; w++) if (nonEmpty(w) && prem.every((p) => evalS(p, w)) && !evalS(c, w)) ws.push(w); ws.sort((a, b) => popc(a) - popc(b)); return ws[0]; };
  const popc = (x) => { let k = 0; while (x) { k += x & 1; x >>= 1; } return k; };
  const S_ = (q, x, y) => ({ q, x, y });
  const FORMS = [
    { p: [S_('A', 'M', 'P'), S_('A', 'S', 'M')], c: S_('A', 'S', 'P'), ex: '모든 {S|은/는} {M}이고, 모든 {M|은/는} {P}이므로, {S|은/는} 모두 {P}이다.' },
    { p: [S_('E', 'M', 'P'), S_('A', 'S', 'M')], c: S_('E', 'S', 'P'), ex: '모든 {S|은/는} {M}인데, 어떤 {M}도 {P|이/가} 아니므로, 어떤 {S}도 {P|이/가} 아니다.' },
    { p: [S_('A', 'M', 'P'), S_('I', 'S', 'M')], c: S_('I', 'S', 'P'), ex: '어떤 {S|은/는} {M}이고, {M|은/는} 모두 {P}이므로, 그 사람은 {S}이면서 {P}이다.' },
    { p: [S_('E', 'M', 'P'), S_('I', 'S', 'M')], c: S_('O', 'S', 'P'), ex: '어떤 {S|은/는} {M}인데, 어떤 {M}도 {P|이/가} 아니므로, 그 사람은 {S}이지만 {P|이/가} 아니다.' },
    { p: [S_('E', 'P', 'M'), S_('A', 'S', 'M')], c: S_('E', 'S', 'P'), ex: '모든 {S|은/는} {M}인데, 어떤 {P}도 {M|이/가} 아니므로, 어떤 {S}도 {P|이/가} 아니다.' },
    { p: [S_('A', 'P', 'M'), S_('E', 'S', 'M')], c: S_('E', 'S', 'P'), ex: '{P|은/는} 모두 {M}인데 어떤 {S}도 {M|이/가} 아니다. {S|이/가} {P}라면 {M}이어야 하므로, 어떤 {S}도 {P|이/가} 아니다.' },
    { p: [S_('E', 'P', 'M'), S_('I', 'S', 'M')], c: S_('O', 'S', 'P'), ex: '어떤 {S|은/는} {M}인데, 어떤 {P}도 {M|이/가} 아니므로, 그 사람은 {S}이지만 {P|이/가} 아니다.' },
    { p: [S_('A', 'P', 'M'), S_('O', 'S', 'M')], c: S_('O', 'S', 'P'), ex: '{P|은/는} 모두 {M}인데 어떤 {S|은/는} {M|이/가} 아니다. 그 사람은 {P}일 수 없으므로, 어떤 {S|은/는} {P|이/가} 아니다.' },
    { p: [S_('I', 'M', 'P'), S_('A', 'M', 'S')], c: S_('I', 'S', 'P'), ex: '어떤 {M|은/는} {P}이고, {M|은/는} 모두 {S}이므로, 그 사람은 {S}이면서 {P}이다.' },
    { p: [S_('A', 'M', 'P'), S_('I', 'M', 'S')], c: S_('I', 'S', 'P'), ex: '어떤 {M|은/는} {S}이고, {M|은/는} 모두 {P}이므로, 그 사람은 {S}이면서 {P}이다.' },
    { p: [S_('O', 'M', 'P'), S_('A', 'M', 'S')], c: S_('O', 'S', 'P'), ex: '어떤 {M|은/는} {P|이/가} 아닌데, {M|은/는} 모두 {S}이므로, 그 사람은 {S}이지만 {P|이/가} 아니다.' },
    { p: [S_('E', 'M', 'P'), S_('I', 'M', 'S')], c: S_('O', 'S', 'P'), ex: '어떤 {M|은/는} {S}인데, 어떤 {M}도 {P|이/가} 아니므로, 그 사람은 {S}이지만 {P|이/가} 아니다.' },
    { p: [S_('A', 'P', 'M'), S_('E', 'M', 'S')], c: S_('E', 'S', 'P'), ex: '{P|은/는} 모두 {M}인데 어떤 {M}도 {S|이/가} 아니므로, 어떤 {P}도 {S|이/가} 아니다. 곧 어떤 {S}도 {P|이/가} 아니다.' },
    { p: [S_('I', 'P', 'M'), S_('A', 'M', 'S')], c: S_('I', 'S', 'P'), ex: '어떤 {P|은/는} {M}이고, {M|은/는} 모두 {S}이므로, 그 사람은 {S}이면서 {P}이다.' },
    { p: [S_('E', 'P', 'M'), S_('I', 'M', 'S')], c: S_('O', 'S', 'P'), ex: '어떤 {M|은/는} {S}인데, 어떤 {P}도 {M|이/가} 아니므로, 그 사람은 {S}이지만 {P|이/가} 아니다.' },
  ];
  const fill = (tpl, T) => tpl.replace(/\{([SMP])(?:\|([^}]+))?\}/g, (_, k, pair) => (pair ? josa(T[k], pair) : T[k]));
  const sText = (s, T) => {
    const X = T[s.x], Y = T[s.y];
    if (s.q === 'A') return `모든 ${top(X)} ${Y}이다.`;
    if (s.q === 'E') return `어떤 ${X}도 ${subj(Y)} 아니다.`;
    if (s.q === 'I') return `어떤 ${top(X)} ${Y}이다.`;
    return `어떤 ${top(X)} ${subj(Y)} 아니다.`;
  };
  const typeDesc = (t, T) => {
    const pos = ['S', 'M', 'P'].filter((k) => t & BIT[k]).map((k) => T[k]);
    const neg = ['S', 'M', 'P'].filter((k) => !(t & BIT[k])).map((k) => T[k]);
    const core = pos.length === 1 ? pos[0] : pos.length === 2 ? `${pos[0]}이면서 ${pos[1]}` : pos.length === 3 ? `${pos[0]}이면서 ${pos[1]}이고 ${pos[2]}` : '';
    const negp = neg.length === 1 ? `${subj(neg[0])} 아닌` : neg.length === 2 ? `${neg[0]}도 ${neg[1]}도 아닌` : '어느 쪽에도 속하지 않는';
    if (!neg.length) return `${core}인 사람`;
    if (!pos.length) return `${negp} 사람`;
    return `${core}이지만 ${negp} 사람`;
  };
  const worldDesc = (w, T) => { const ts = []; for (let t = 0; t < 8; t++) if ((w >> t) & 1) ts.push(typeDesc(t, T)); return ts; };
  function genSyll(r) {
    const T = r.pick(THEMES);
    const F = r.pick(FORMS);
    const mode = r.pick(['hidden', 'hidden', 'must']);
    const variants = (s) => {
      const out = [];
      for (const q of ['A', 'E', 'I', 'O']) for (const [x, y] of [[s.x, s.y], [s.y, s.x]]) out.push(S_(q, x, y));
      return out;
    };
    const key = (s) => s.q + s.x + s.y;
    if (mode === 'hidden') {
      const hideIdx = r.int(0, 1);
      const shown = F.p[1 - hideIdx], hidden = F.p[hideIdx];
      const cands = [...variants(hidden), ...variants(F.c)];
      const ok = (o) => entails([shown, o], F.c, false);
      const invalidEI = (o) => !entails([shown, o], F.c, true) && !entails([o], F.c, true);
      const wrong = r.shuffle(cands.filter((o) => key(o) !== key(hidden) && invalidEI(o)));
      const uniq = []; for (const o of wrong) if (!uniq.some((u) => key(u) === key(o))) uniq.push(o);
      if (!ok(hidden) || uniq.length < 4) return null;
      const opts = r.shuffle([hidden, ...uniq.slice(0, 4)]);
      const answer = opts.indexOf(hidden);
      return {
        type: '논리 · 숨은 전제',
        stem: '다음 논증의 결론을 이끌어내기 위해 추가해야 할 전제로 가장 적절한 것은?',
        body: [{ t: 'passage', h: `<p>(전제) ${esc(sText(shown, T))}</p><p>(전제) ( &nbsp; &nbsp; &nbsp; )</p><p>(결론) ${esc(sText(F.c, T))}</p>` }],
        options: opts.map((o) => esc(sText(o, T))),
        answer,
        explain: [
          { t: 'p', h: `<b>${P.cj(answer, '을/를')}</b> 추가하면 ${esc(fill(F.ex, T))} 따라서 결론이 반드시 참이 된다.` },
          { t: 'ox', items: opts.map((o, i) => { if (i === answer) return { ok: true, v: '결론이 반드시 도출된다', why: esc(fill(F.ex, T)) }; const w = counter([shown, o], F.c); return { ok: false, v: '결론이 반드시 도출되지는 않는다', why: `반례: 다음과 같은 사람들만 있다고 하자. ${worldDesc(w, T).map(esc).join(' / ')}. 이때 두 전제는 모두 참이지만 결론은 거짓이다.` }; }) },
        ],
      };
    }
    // must be true
    const cands = variants(F.c);
    const right = F.c;
    const wrong = r.shuffle(cands.filter((o) => key(o) !== key(right) && !entails(F.p, o, true)));
    if (wrong.length < 4) return null;
    const opts = r.shuffle([right, ...wrong.slice(0, 4)]);
    const answer = opts.indexOf(right);
    return {
      type: '논리 · 정언 추론',
      stem: '다음 글의 내용이 참일 때, 반드시 참인 것은?',
      body: [{ t: 'passage', h: `<ul class="cond">${F.p.map((s) => `<li>${esc(sText(s, T))}</li>`).join('')}</ul>` }],
      options: opts.map((o) => esc(sText(o, T))),
      answer,
      explain: [
        { t: 'p', h: `${esc(fill(F.ex, T))} 따라서 <b>${P.cj(answer, '이/가')}</b> 반드시 참이다.` },
        { t: 'ox', items: opts.map((o, i) => { if (i === answer) return { ok: true, v: '반드시 참이다', why: esc(fill(F.ex, T)) }; const w = counter(F.p, o); return { ok: false, v: '반드시 참이라고 할 수 없다', why: `반례: 다음과 같은 사람들만 있다고 하자. ${worldDesc(w, T).map(esc).join(' / ')}. 이때 글의 두 진술은 참이지만 이 선지는 거짓이다.` }; }) },
      ],
    };
  }

  /* ======================= 4. 순서 추론 ======================= */
  const OCTX = {
    lead: '甲~戊 다섯 명이 회의 장소에 한 명씩 차례로 도착하였다. 도착 순서에 관하여 다음 사실이 알려져 있다.',
    before: (c) => `${top(c.a)} ${c.b}보다 먼저 도착하였다.`,
    imm: (c) => `${top(c.b)} ${c.a} 바로 다음에 도착하였다.`,
    adj: (c) => `${josa(andN(c.a, c.b), '은/는')} 연이어 도착하였다.`,
    notAdj: (c) => `${josa(andN(c.a, c.b), '은/는')} 연이어 도착하지 않았다.`,
    gap: (c) => `${andN(c.a, c.b)} 사이에 정확히 ${c.k}명이 도착하였다.`,
    notEnds: (c) => `${top(c.a)} 첫 번째로도, 마지막으로도 도착하지 않았다.`,
    notPos: (c) => `${top(c.a)} ${ORD[c.p]}로 도착하지 않았다.`,
    pos: (c) => `${top(c.a)} ${ORD[c.p]}로 도착하였다.`,
  };
  const ORD = ['', '첫 번째', '두 번째', '세 번째', '네 번째', '다섯 번째', '여섯 번째'];
  const NAMES6 = ['甲', '乙', '丙', '丁', '戊', '己'];
  /* narrate the narrowing: apply the most restrictive condition first, list the arrangements once few remain */
  P.narrateOrder = function (z, names, label, ctxText) {
    const all = P.perms(names.slice()).map((perm) => { const m = {}; perm.forEach((x, i) => { m[x] = i + 1; }); return m; });
    let pool = all, left = z.cs.map((c, i) => ({ c, i })); const items = [];
    items.push(`가능한 ${josa(label, '은/는')} 처음 ${all.length}가지이다.`);
    while (left.length) {
      left.sort((x, y) => pool.filter(x.c.f).length - pool.filter(y.c.f).length);
      const { c, i } = left.shift();
      pool = pool.filter(c.f);
      const show = pool.length <= 4 ? ` 남는 것: ${pool.map((m) => Object.keys(m).sort((a, b) => m[a] - m[b]).join('')).join(', ')}` : '';
      items.push(`조건 (${LAB[i]}) 「${esc(ctxText(c))}」를 적용하면 ${pool.length}가지가 남는다.${show}`);
    }
    return items;
  };
  const ORDER_OPT = (names) => ({ at: (p) => ORD[p], word: '순서', lab: LAB, show: (a) => `도착 순서: ${a.join(' → ')}` });
  function genOrder(r, lv) {
    const names = lv === 1 ? NAMES : lv === 3 ? NAMES6 : (r.chance(0.5) ? NAMES6 : NAMES);
    const z = P.orderPuzzle(r, names.slice(), OCTX);
    if (!z) return null;
    const K = names.length;
    const sol = P.solveOrder(names, z.cs, ORDER_OPT(names));
    if (!sol || sol.arrangement.join('') !== z.hidden.join('')) return null;
    if (lv === 1 ? sol.cases === 3 : lv === 3 ? sol.cases !== 3 : (sol.cases === 0 && !r.chance(0.15))) return null;   // most puzzles need one split into 2~3 cases, as in the real exam
    const mode = r.pick(['slot', 'must']);
    let stem, options, answer, verdicts = null;
    if (mode === 'slot') {
      const p = r.int(1, K);
      stem = `다음 글의 내용이 참일 때, ${ORD[p]}로 도착한 사람은?`;
      const pool = names.filter((x) => x !== z.hidden[p - 1]);
      options = r.shuffle([z.hidden[p - 1], ...r.sample(pool, 4)]).sort((a, b) => names.indexOf(a) - names.indexOf(b));
      answer = options.indexOf(z.hidden[p - 1]);
      verdicts = [`따라서 ${ORD[p]}로 도착한 사람은 <b>${z.hidden[p - 1]}</b>이다.`];
    } else {
      const stmts = [];
      for (const nm of names) for (let p = 1; p <= K; p++) stmts.push({ text: `${top(nm)} ${ORD[p]}로 도착하였다.`, truth: z.H[nm] === p, why: `${top(nm)} ${ORD[z.H[nm]]}로 도착하였다.` });
      for (const a of names) for (const b of names) if (a !== b) stmts.push({ text: `${top(a)} ${b} 바로 다음에 도착하였다.`, truth: z.H[a] === z.H[b] + 1, why: `${top(a)} ${ORD[z.H[a]]}, ${top(b)} ${ORD[z.H[b]]}로 도착하였다.` });
      const given = new Set(z.text);
      const t = r.shuffle(stmts.filter((s) => s.truth && !given.has(s.text)));
      const f = r.shuffle(stmts.filter((s) => !s.truth && !given.has(s.text)));
      if (!t.length || f.length < 4) return null;
      const opts = r.shuffle([t[0], ...f.slice(0, 4)]);
      stem = '다음 글의 내용이 참일 때, 반드시 참인 것은?';
      options = opts.map((s) => esc(s.text)); answer = opts.indexOf(t[0]);
      verdicts = { t: 'ox', items: opts.map((s) => ({ ok: s.truth, v: s.truth ? '참이다' : '거짓이다', why: s.truth ? `확정된 도착 순서에서 ${esc(s.why).replace(/\.$/, '')}.` : esc(s.why) })) };
    }
    const steps = sol.lines.map((l, i) => ({ ind: l.ind, h: (i === 0 ? '<b>출발점</b> ' : '') + l.h, k: l.k }));
    return {
      type: '논리 · 순서 추론',
      stem,
      body: [{ t: 'passage', h: `${esc(OCTX.lead.replace('甲~戊 다섯 명', K === 6 ? '甲~己 여섯 명' : '甲~戊 다섯 명'))}<ul class="cond lab">${z.text.map((s, i) => `<li><span class="lb">(${LAB[i]})</span> ${esc(s)}</li>`).join('')}</ul>` }],
      options, answer,
      explain: [
        { t: 'steps', items: steps },
        { t: 'table', head: ['순서', ...names.map((_, i) => `${i + 1}`)], rows: [['도착', ...z.hidden]] },
        Array.isArray(verdicts) ? { t: 'p', h: verdicts[0] } : verdicts,
      ],
    };
  }

  /* ======================= 5. 논증 강화·약화 (비교 연구형 인과 논증) =======================
     A comparison shows the group with policy X has a higher Y, and the author concludes X raises Y.
     Each statement type has one fixed logical role, so the key is decided by the type, never by wording luck. */
  const ADOM = [
    { unit: '지역', actor: 'A도', x: '공공도서관 야간 개방', y: '청소년 독서량', yHi: '더 많았다', yAdj: '많은', yUp: '늘린다', yUpN: '늘리는', yRose: '늘었고', did: '공공도서관을 야간에 개방한', didnt: '개방하지 않은', ev: '야간 개방', adopt: '야간 개방을 먼저 시작하는', z: '가구 소득 수준', zHi: '더 높았다', zEffect: '가구 소득 수준이 높을수록 청소년 독서량이 많다는 사실은 잘 알려져 있다', dose: '주당 야간 개방 시간', doseHi: '길수록', mech: '야간에 도서관을 찾아 책을 빌리는 청소년이 크게 늘어난 것', irr: ['야간 개방에 드는 운영비는 지역마다 달랐다.', 'A도는 야간 개방을 모든 지역으로 확대할 계획이다.'] },
    { unit: '도시', actor: 'B부', x: '버스 전용차로', y: '버스 이용객 수', yHi: '더 많았다', yAdj: '많은', yUp: '늘린다', yUpN: '늘리는', yRose: '늘었고', did: '버스 전용차로를 설치한', didnt: '설치하지 않은', ev: '전용차로 설치', adopt: '전용차로를 먼저 설치하는', z: '인구 밀도', zHi: '더 높았다', zEffect: '인구 밀도가 높을수록 버스 이용객이 많다는 사실은 잘 알려져 있다', dose: '전용차로의 총길이', doseHi: '길수록', mech: '출퇴근 시간대 버스의 평균 운행 시간이 크게 줄어든 것', irr: ['전용차로 설치 공사 기간은 도시마다 달랐다.', 'B부는 내년에 전용차로 설치 지침을 개정할 예정이다.'] },
    { unit: '자치단체', actor: 'C연구원', x: '주민참여예산제', y: '지방행정에 대한 주민 신뢰도', yHi: '더 높았다', yAdj: '높은', yUp: '높인다', yUpN: '높이는', yRose: '높아졌고', did: '주민참여예산제를 운영한', didnt: '운영하지 않은', ev: '제도 운영', adopt: '주민참여예산제를 먼저 도입하는', z: '주민의 평균 교육 수준', zHi: '더 높았다', zEffect: '주민의 교육 수준이 높을수록 지방행정 신뢰도가 높다는 사실은 잘 알려져 있다', dose: '주민참여예산의 규모', doseHi: '클수록', mech: '예산 심의 과정을 주민에게 공개하는 횟수가 늘고, 이를 알고 있는 주민일수록 신뢰도가 높은 것', irr: ['주민참여예산제의 명칭은 자치단체마다 조금씩 달랐다.', 'C연구원은 같은 주제로 후속 연구를 할 계획이다.'] },
    { unit: '기관', actor: 'D처', x: '유연근무제', y: '직원 업무 성과 평가 점수', yHi: '더 높았다', yAdj: '높은', yUp: '높인다', yUpN: '높이는', yRose: '높아졌고', did: '유연근무제를 도입한', didnt: '도입하지 않은', ev: '유연근무제 도입', adopt: '유연근무제를 먼저 도입하는', z: '직원의 평균 경력', zHi: '더 길었다', zEffect: '경력이 길수록 업무 성과 평가 점수가 높다는 사실은 잘 알려져 있다', dose: '유연근무제 활용률', doseHi: '높을수록', mech: '출퇴근 시간이 줄어 직원들의 피로도가 낮아진 것', irr: ['유연근무제의 세부 운영 방식은 기관마다 달랐다.', 'D처는 유연근무제 안내 책자를 새로 만들 예정이다.'] },
    { unit: '학교', actor: 'E교육청', x: '아침 운동 프로그램', y: '학생 체력 평가 점수', yHi: '더 높았다', yAdj: '높은', yUp: '높인다', yUpN: '높이는', yRose: '높아졌고', did: '아침 운동 프로그램을 운영한', didnt: '운영하지 않은', ev: '프로그램 운영', adopt: '아침 운동 프로그램을 먼저 도입하는', z: '학교 체육 시설 수준', zHi: '더 높았다', zEffect: '체육 시설이 좋을수록 학생들의 체력 평가 점수가 높다는 사실은 잘 알려져 있다', dose: '주당 아침 운동 시간', doseHi: '길수록', mech: '프로그램에 참여한 학생들의 심폐 지구력이 향상된 것', irr: ['아침 운동 프로그램의 이름은 학교마다 달랐다.', 'E교육청은 프로그램 운영 매뉴얼을 배포할 계획이다.'] },
    { unit: '기관', actor: 'F부', x: '전자민원 창구', y: '민원 처리 만족도', yHi: '더 높았다', yAdj: '높은', yUp: '높인다', yUpN: '높이는', yRose: '높아졌고', did: '전자민원 창구를 도입한', didnt: '도입하지 않은', ev: '창구 도입', adopt: '전자민원 창구를 먼저 도입하는', z: '민원 담당 인력의 규모', zHi: '더 컸다', zEffect: '담당 인력이 많을수록 민원 처리 만족도가 높다는 사실은 잘 알려져 있다', dose: '전자민원 이용률', doseHi: '높을수록', mech: '민원 처리 기간이 크게 단축된 것', irr: ['전자민원 창구의 화면 구성은 기관마다 달랐다.', 'F부는 전자민원 창구의 이름을 공모할 예정이다.'] },
    { unit: '지역', actor: 'G시', x: '청년 주거비 지원', y: '청년 인구 순유입', yHi: '더 많았다', yAdj: '많은', yUp: '늘린다', yUpN: '늘리는', yRose: '늘었고', did: '청년 주거비를 지원한', didnt: '지원하지 않은', ev: '지원 시작', adopt: '청년 주거비 지원을 먼저 시작하는', z: '일자리 증가율', zHi: '더 높았다', zEffect: '일자리가 늘어나는 지역일수록 청년 인구가 많이 유입된다는 사실은 잘 알려져 있다', dose: '1인당 지원 금액', doseHi: '클수록', mech: '지원을 받은 청년들의 주거비 부담이 실제로 줄어든 것', irr: ['청년 주거비 지원의 신청 서식은 지역마다 달랐다.', 'G시는 지원 사업의 홍보 영상을 제작할 예정이다.'] },
    { unit: '학교', actor: 'H교육청', x: '방과후 독서 지도', y: '학생 국어 성취도', yHi: '더 높았다', yAdj: '높은', yUp: '높인다', yUpN: '높이는', yRose: '높아졌고', did: '방과후 독서 지도를 실시한', didnt: '실시하지 않은', ev: '독서 지도 실시', adopt: '방과후 독서 지도를 먼저 시작하는', z: '학부모의 평균 학력', zHi: '더 높았다', zEffect: '학부모의 학력이 높을수록 학생의 국어 성취도가 높다는 사실은 잘 알려져 있다', dose: '주당 독서 지도 시간', doseHi: '길수록', mech: '독서 지도를 받은 학생들의 월평균 독서량이 늘어난 것', irr: ['독서 지도에 쓰인 도서 목록은 학교마다 달랐다.', 'H교육청은 독서 지도 교사 연수를 계획하고 있다.'] },
    { unit: '지역', actor: 'I청', x: '방범용 CCTV 확충', y: '주민의 야간 체감 안전도', yHi: '더 높았다', yAdj: '높은', yUp: '높인다', yUpN: '높이는', yRose: '높아졌고', did: '방범용 CCTV를 확충한', didnt: '확충하지 않은', ev: 'CCTV 확충', adopt: 'CCTV를 먼저 확충하는', z: '가로등 설치 밀도', zHi: '더 높았다', zEffect: '가로등이 많을수록 주민의 야간 체감 안전도가 높다는 사실은 잘 알려져 있다', dose: '인구 1천 명당 CCTV 대수', doseHi: '많을수록', mech: 'CCTV가 설치된 골목에서 밤에 다니는 주민 수가 늘어난 것', irr: ['CCTV 구매 단가는 지역마다 달랐다.', 'I청은 CCTV 관제 요원 채용 공고를 낼 예정이다.'] },
    { unit: '지역', actor: 'J시', x: '공공 체육관 무료 개방', y: '주민 생활체육 참여율', yHi: '더 높았다', yAdj: '높은', yUp: '높인다', yUpN: '높이는', yRose: '높아졌고', did: '공공 체육관을 무료로 개방한', didnt: '개방하지 않은', ev: '무료 개방', adopt: '체육관 무료 개방을 먼저 시작하는', z: '공원 면적 비율', zHi: '더 높았다', zEffect: '공원이 넓을수록 주민의 생활체육 참여율이 높다는 사실은 잘 알려져 있다', dose: '주당 무료 개방 시간', doseHi: '길수록', mech: '체육관 이용자 가운데 처음으로 규칙적인 운동을 시작한 주민이 많았던 것', irr: ['체육관의 운영 위탁 기관은 지역마다 달랐다.', 'J시는 체육관 이용 안내 책자를 새로 만들 예정이다.'] },
  ];
  const ATYPE = {
    CONF: { eff: -1, text: (d) => `${d.did} ${top(d.unit)} ${d.didnt} ${d.unit}보다 원래 ${subj(d.z)} ${d.zHi}. 그리고 ${d.zEffect}.` },
    REV: { eff: -1, text: (d) => `원래 ${subj(d.y)} ${d.yAdj} ${d.unit}일수록 ${d.adopt} 경향이 있었다.` },
    PRE: { eff: -1, text: (d) => `${d.ev} 전에도 ${d.did} ${d.unit}의 ${top(d.y)} ${d.didnt} ${d.unit}보다 지금과 비슷한 정도로 ${d.yHi}` + '.' },
    PAR: { eff: -1, text: (d) => `${d.did} ${d.unit}에서 ${top(d.y)} ${d.ev} 전과 후에 거의 차이가 없었다.` },
    DOSE: { eff: 1, text: (d) => `${d.did} ${d.unit} 가운데에서도 ${subj(d.dose)} ${d.doseHi} ${subj(d.y)} ${d.yHi}` + '.' },
    BA: { eff: 1, text: (d) => `${d.did} ${d.unit}에서는 ${d.ev} 후 ${subj(d.y)} 뚜렷하게 ${d.yRose}, 같은 기간 ${d.didnt} ${d.unit}의 ${d.y}에는 변화가 없었다.` },
    SIM: { eff: 1, text: (d) => `${d.ev} 전에는 두 집단의 ${josa(d.y, '과/와')} ${subj(d.z)} 거의 같았다.` },
    MECH: { eff: 1, text: (d) => `${d.did} ${d.unit}에서 ${subj(d.mech)} 확인되었다.` },
    IRR: { eff: 0, text: (d, r) => r.pick(d.irr) },
  };
  const AWHY = {
    CONF: (d) => `${subj(d.z)} ${d.y}에 영향을 주는데, ${d.did} ${d.unit}의 ${subj(d.z)} 원래 더 높았다면 두 집단의 ${d.y} 차이는 ${d.x}의 효과가 아니라 ${d.z}의 차이 때문일 수 있다(제3의 원인).`,
    REV: (d) => `${d.y}${josa(d.y, '이/가').slice(d.y.length)} 원래 ${d.yAdj} 곳이 먼저 ${d.x}${josa(d.x, '을/를').slice(d.x.length)} 택했다면, ${d.x} 때문에 ${d.y}의 차이가 생긴 것이 아니라 ${d.y}의 차이 때문에 ${d.x}의 시행 여부가 갈린 것일 수 있다(인과 방향의 역전).`,
    PRE: (d) => `차이가 ${d.ev} 전부터 이미 같은 크기로 있었다면, 지금의 차이를 ${d.x}의 효과로 볼 근거가 사라진다.`,
    PAR: (d) => `${d.did} 곳에서조차 ${d.y}${josa(d.y, '이/가').slice(d.y.length)} 달라지지 않았다면, ${d.x}${josa(d.x, '이/가').slice(d.x.length)} ${d.y}${josa(d.y, '을/를').slice(d.y.length)} ${d.yUp}는 결론과 맞지 않는다.`,
    DOSE: (d) => `${d.x}의 정도(${d.dose})가 클수록 ${d.y}도 커지는 비례 관계는 ${d.x}${josa(d.x, '이/가').slice(d.x.length)} 원인이라는 해석을 뒷받침한다.`,
    BA: (d) => `시행한 곳에서만 시행 뒤 ${d.y}${josa(d.y, '이/가').slice(d.y.length)} 달라지고 시행하지 않은 곳은 그대로였다면, 변화가 ${d.x}와 함께 나타났다는 점에서 인과 해석을 뒷받침한다.`.replace(`${d.x}와 함께`, `${josa(d.x, '과/와')} 함께`),
    SIM: (d) => `시행 전에 두 집단의 ${josa(d.y, '과/와')} ${subj(d.z)} 같았다면, 시행 뒤의 차이를 원래의 차이나 ${josa(d.z, '으로/로')} 설명하기 어려워져 ${d.x}의 효과라는 해석이 힘을 얻는다.`,
    MECH: (d) => `${d.x}${josa(d.x, '이/가').slice(d.x.length)} ${d.y}${josa(d.y, '을/를').slice(d.y.length)} ${d.yUpN} 구체적인 경로가 실제로 확인되었으므로 결론을 뒷받침한다.`,
    IRR: (d) => `${d.x}${josa(d.x, '이/가').slice(d.x.length)} ${d.y}에 영향을 주는지와는 관계가 없는 사실이다.`,
  };
  function genArg(r, lv) {
    const d = r.pick(ADOM);
    const mode = lv === 3 ? r.pick(['eval', 'eval', 'weaken', 'strengthen']) : r.pick(['weaken', 'strengthen', 'weaken', 'strengthen', 'eval']);
    const n = mode === 'eval' || lv === 3 ? 4 : 3;
    const W = ['CONF', 'REV', 'PRE', 'PAR'], Sx = ['DOSE', 'BA', 'SIM', 'MECH'];
    const want = mode === 'weaken' ? -1 : 1;
    for (let attempt = 0; attempt < 40; attempt++) {
      let types;
      if (mode === 'eval') types = r.sample(W.concat(Sx, ['IRR']), n);
      else {
        const nTrue = r.int(1, n - 1);
        const good = r.sample(mode === 'weaken' ? W : Sx, nTrue);
        const bad = r.sample((mode === 'weaken' ? Sx : W).concat(['IRR']), n - nTrue);
        types = r.shuffle(good.concat(bad));
      }
      if (types.filter((t) => t === 'IRR').length > 1) continue;
      const items = types.map((t) => {
        const eff = ATYPE[t].eff, base = ATYPE[t].text(d, r);
        if (mode !== 'eval') return { t, eff, text: base, truth: eff === want };
        const claim = eff === 0 ? r.pick([1, -1]) : (r.chance(0.6) ? eff : -eff);
        return { t, eff, claim, text: `${base} 이는 위 결론을 ${claim > 0 ? '강화' : '약화'}한다.`, truth: claim === eff };
      });
      const nT = items.filter((x) => x.truth).length;
      if (nT === 0 || nT === items.length) continue;
      const labels = P.BOGI.slice(0, n);
      const trueSet = labels.filter((_, i) => items[i].truth);
      const { options, answer } = P.comboOptions(r, labels, trueSet);
      const stem = mode === 'weaken' ? '다음 글의 결론을 약화하는 것만을 <보기>에서 모두 고르면?'
        : mode === 'strengthen' ? '다음 글의 결론을 강화하는 것만을 <보기>에서 모두 고르면?'
        : '다음 글의 논증에 대한 평가로 적절한 것만을 <보기>에서 모두 고르면?';
      const effWord = (e) => (e < 0 ? '약화한다' : e > 0 ? '강화한다' : '강화하지도 약화하지도 않는다');
      return {
        type: '논증 · 강화/약화',
        stem,
        body: [{ t: 'passage', h: `<p>${esc(d.actor)}${P.pp(d.actor, '은/는')} ${esc(d.unit)}별 자료를 분석하였다. 그 결과 ${esc(d.did)} ${esc(d.unit)}의 ${esc(subj(d.y))} ${esc(d.didnt)} ${esc(d.unit)}보다 ${esc(d.yHi)}. ${esc(d.actor)}${P.pp(d.actor, '은/는')} 이를 근거로 ${esc(subj(d.x))} ${esc(josa(d.y, '을/를'))} ${esc(d.yUp)}고 결론지었다.</p>` },
          { t: 'box', title: '보기', items: items.map((x, i) => `${labels[i]}. ${esc(x.text)}`) }],
        options, answer,
        explain: [
          { t: 'p', h: `<b>논증 구조</b> 근거는 ‘${esc(d.did)} ${esc(d.unit)}의 ${esc(d.y)}${P.pp(d.y, '이/가')} ${esc(d.yHi.replace(/다$/, '다'))}’는 <u>상관관계</u>이고, 결론은 ‘${esc(subj(d.x))} ${esc(josa(d.y, '을/를'))} ${esc(d.yUp)}’는 <u>인과관계</u>이다. 이런 논증은 다른 원인(교란 요인)·인과 방향의 역전·시행 전부터의 차이·변화 없음이 드러나면 약화되고, 비례 관계·시행 전후 변화·시행 전 두 집단의 동질성·작동 경로가 확인되면 강화된다.` },
          { t: 'bx', items: items.map((x, i) => ({ label: labels[i], text: esc(x.text), ok: x.truth, v: mode === 'eval' ? (x.truth ? '적절하다' : '적절하지 않다') : effWord(x.eff), why: `${esc(AWHY[x.t](d))} 따라서 결론을 ${effWord(x.eff)}${mode === 'eval' ? ` (보기는 ‘${x.claim > 0 ? '강화' : '약화'}한다’고 하였다)` : ''}.` })) },
          { t: 'p', h: `따라서 ${mode === 'eval' ? '적절한' : mode === 'weaken' ? '약화하는' : '강화하는'} 것은 ${trueSet.join(', ')}이므로 정답은 <b>${CIRC[answer]}</b>이다.` },
        ],
      };
    }
    return null;
  }

  P.addGen('lang', 'L-prop', '논리 · 명제 추론', 3, genProp, true);
  P.addGen('lang', 'L-liar', '논리 · 참/거짓 진술', 2, genLiar, true);
  P.addGen('lang', 'L-syll', '논리 · 정언 논리', 2.4, genSyll);
  P.addGen('lang', 'L-order', '논리 · 순서 추론', 2, genOrder, true);
  P.addGen('lang', 'L-arg', '논증 · 강화/약화', 3, genArg, true);
})(typeof window !== 'undefined' ? window : globalThis);
