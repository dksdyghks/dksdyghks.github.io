/* 송공 — 자료해석: 표 해석(옳은 것/옳지 않은 것/<보기>) · 매칭 · 계산 (generated; every statement's truth is computed) */
(function (G) {
  'use strict';
  const P = G.PSAT;
  const { josa, CIRC, esc, fmt } = P;
  const top = (n) => josa(n, '은/는');
  const subj = (n) => josa(n, '이/가');

  /* ---------- table themes: entities × years ---------- */
  const THEMES = [
    { title: '지역별 1인 가구 비율', unit: '%', kind: 'pct', noun: '지역', ents: ['A시', 'B시', 'C도', 'D도', 'E도'], lo: 18, hi: 34, drift: [0.3, 1.8], noise: 0.9, measure: '1인 가구 비율', hiW: '높' },
    { title: '연령대별 투표율', unit: '%', kind: 'pct', noun: '연령대', ents: ['20대', '30대', '40대', '50대', '60대 이상'], lo: 52, hi: 84, drift: [-2.5, 3], noise: 2.2, measure: '투표율', hiW: '높' },
    { title: '대학별 졸업생 취업률', unit: '%', kind: 'pct', noun: '대학', ents: ['A대', 'B대', 'C대', 'D대', 'E대'], lo: 55, hi: 78, drift: [-1.5, 2], noise: 1.6, measure: '취업률', hiW: '높' },
    { title: '국가별 수출액', unit: '억 달러', kind: 'amt', noun: '국가', ents: ['갑국', '을국', '병국', '정국', '무국'], lo: 180, hi: 1400, g: [-0.07, 0.15], measure: '수출액', hiW: '많' },
    { title: '부처별 연구개발 예산', unit: '억 원', kind: 'amt', noun: '부처', ents: ['A부', 'B부', 'C부', 'D부', 'E부'], lo: 300, hi: 2600, g: [-0.05, 0.13], measure: '예산', hiW: '많' },
    { title: '공항별 국제선 여객 수', unit: '만 명', kind: 'amt', noun: '공항', ents: ['가공항', '나공항', '다공항', '라공항', '마공항'], lo: 40, hi: 900, g: [-0.1, 0.22], measure: '여객 수', hiW: '많' },
    { title: '품목별 수입량', unit: '천 톤', kind: 'amt', noun: '품목', ents: ['밀', '옥수수', '대두', '쌀', '보리'], lo: 80, hi: 1200, g: [-0.08, 0.11], measure: '수입량', hiW: '많' },
    { title: '권역별 신재생에너지 발전량', unit: 'GWh', kind: 'amt', noun: '권역', ents: ['수도권', '충청권', '호남권', '영남권', '강원권'], lo: 900, hi: 7800, g: [-0.04, 0.2], measure: '발전량', hiW: '많' },
  ];
  function makeData(T, r, lv, shape) {
    const startY = r.pick([2020, 2021]);
    const ny = shape ? shape.ny : lv === 1 ? 4 : lv === 3 ? 5 : r.pick([4, 5]);
    const years = Array.from({ length: ny }, (_, i) => startY + i);
    const nE = shape ? shape.nE : lv === 1 ? 4 : lv === 3 ? 5 : r.pick([4, 5]);
    const ents = T.ents.slice(0, nE);
    const v = {};
    for (const e of ents) {
      const row = [];
      let x = r.float(T.lo, T.hi);
      for (let i = 0; i < ny; i++) {
        if (i > 0) x = T.kind === 'pct' ? x + r.float(T.drift[0], T.drift[1]) + r.float(-T.noise, T.noise) : x * (1 + r.float(T.g[0], T.g[1]));
        row.push(T.kind === 'pct' ? P.round(Math.min(95, Math.max(5, x)), 1) : Math.max(10, Math.round(x)));
      }
      v[e] = row;
    }
    for (const e of ents) for (let i = 1; i < ny; i++) if (v[e][i] === v[e][i - 1]) return null;
    return { T, years, ents, v, d: T.kind === 'pct' ? 1 : 0 };
  }
  const val = (D, x) => fmt(x, D.d);
  const unitTxt = (D) => D.T.unit;
  const diffUnit = (D) => (D.T.kind === 'pct' ? '%p' : D.T.unit);
  const series = (D, e) => D.v[e].map((x) => val(D, x)).join(' → ');
  const yi = (D, y) => D.years.indexOf(y);

  /* quick ways to get p% of a total without a calculator (the skill PSAT rewards) */
  function pctTip(D, tot, p) {
    const t10 = tot / 10, t = (x) => val(D, x);
    const base = `전체 ${t(tot)}의 10%는 소수점을 한 자리 옮긴 ${fmt(t10, 1)}`;
    switch (p) {
      case 10: return { tip: base, v: t10 };
      case 20: case 30: case 40: return { tip: `${base}이므로 ${p}%는 그 ${p / 10}배인 ${fmt(t10 * p / 10, 1)}`, v: t10 * p / 10 };
      case 15: return { tip: `${base}, 5%는 그 절반인 ${fmt(t10 / 2, 1)}이므로 15%는 ${fmt(t10 * 1.5, 1)}`, v: t10 * 1.5 };
      case 25: return { tip: `25%는 전체의 4분의 1이므로 ${t(tot)} ÷ 4 = ${fmt(tot / 4, 1)}`, v: tot / 4 };
      case 35: return { tip: `${base}이므로 35%는 30%(${fmt(t10 * 3, 1)})와 5%(${fmt(t10 / 2, 1)})의 합인 ${fmt(t10 * 3.5, 1)}`, v: t10 * 3.5 };
      case 45: return { tip: `45%는 절반(${fmt(tot / 2, 1)})에서 5%(${fmt(t10 / 2, 1)})를 뺀 ${fmt(tot * 0.45, 1)}`, v: tot * 0.45 };
      case 50: return { tip: `50%는 전체의 절반인 ${fmt(tot / 2, 1)}`, v: tot / 2 };
      default: return { tip: `전체의 1%는 ${fmt(tot / 100, 2)}이므로 ${p}%는 ${fmt(tot * p / 100, 1)}`, v: tot * p / 100 };
    }
  }
  /* statement generators: each returns {k, text, truth, why} or null (null when too close to call).
     why = the numbers read from the table, the quickest valid check, and the conclusion */
  const ST = {
    mono(D, r) {
      const e = r.pick(D.ents); const s = D.v[e];
      const inc = s.every((x, i) => i === 0 || x > s[i - 1]);
      const dec = s.every((x, i) => i === 0 || x < s[i - 1]);
      const dir = inc ? 'inc' : dec ? 'dec' : r.pick(['inc', 'inc', 'dec']);
      const truth = dir === 'inc' ? inc : dec;
      const bad = s.findIndex((x, i) => i > 0 && (dir === 'inc' ? x <= s[i - 1] : x >= s[i - 1]));
      const why = truth
        ? `${e}: ${series(D, e)}. 매년 전년보다 ${dir === 'inc' ? '크므로 매년 증가' : '작으므로 매년 감소'}하였다.`
        : `${e}: ${series(D, e)}. ${D.years[bad]}년에 ${val(D, s[bad - 1])}에서 ${josa(val(D, s[bad]), '으로/로')} ${dir === 'inc' ? '줄었으므로 매년 증가한 것은 아니다' : '늘었으므로 매년 감소한 것은 아니다'}.`;
      return { k: 'mono', text: `${e}의 ${top(D.T.measure)} 매년 ${dir === 'inc' ? '증가' : '감소'}하였다.`, truth, why };
    },
    growthTop(D, r, lv) {
      const e = r.pick(D.ents); const s = D.v[e];
      const g = s.slice(1).map((x, i) => (D.T.kind === 'pct' ? x - s[i] : (x - s[i]) / s[i] * 100));
      const sorted = g.slice().sort((a, b) => b - a);
      if (sorted[0] - sorted[1] < (D.T.kind === 'pct' ? 0.3 : lv === 3 ? 0.4 : 1.0)) return null;
      const best = g.indexOf(sorted[0]);
      const claim = r.chance(0.5) ? best : r.int(0, g.length - 1);
      const y = D.years[claim + 1];
      const pct = D.T.kind === 'pct';
      const label = pct ? '전년 대비 증가폭' : '전년 대비 증가율';
      const rows = g.map((x, i) => (pct ? `${D.years[i + 1]}년 ${val(D, s[i + 1])} − ${val(D, s[i])} = ${x < 0 ? '−' : ''}${fmt(Math.abs(x), 1)}%p` : `${D.years[i + 1]}년 (${val(D, s[i + 1])} − ${val(D, s[i])}) ÷ ${val(D, s[i])} ≈ ${x < 0 ? '−' : ''}${fmt(Math.abs(x), 1)}%`)).join('; ');
      const tip = pct ? '' : ' (증가율은 증가량을 ‘전년 값’으로 나눈 값이므로, 증가량이 비슷하면 전년 값이 작은 해가 더 크다.)';
      return { k: 'growthTop', text: `${e}의 ${D.T.measure} ${josa(label, '이/가')} 가장 큰 해는 ${y}년이다.`, truth: claim === best, why: `${e}의 ${label}: ${rows}. 가장 큰 해는 ${D.years[best + 1]}년이다.${tip}` };
    },
    ratio(D, r, lv) {
      if (D.T.kind !== 'amt') return null;
      const y = r.pick(D.years); const i = yi(D, y);
      const [a, b] = r.sample(D.ents, 2);
      const [x1, x2] = D.v[a][i] >= D.v[b][i] ? [a, b] : [b, a];
      const ratio = D.v[x1][i] / D.v[x2][i];
      const [lo, hi] = lv === 3 ? [0.02, 0.12] : [0.05, 0.4];
      const ks = [1.5, 2, 2.5, 3, 4].filter((k) => Math.abs(ratio - k) / k >= lo && Math.abs(ratio - k) / k <= hi);
      if (!ks.length) return null;
      const k = r.pick(ks);
      const big = D.v[x1][i], small = D.v[x2][i], prod = small * k;
      return { k: 'ratio', text: `${y}년 ${x1}의 ${top(D.T.measure)} ${x2}의 ${k}배 이상이다.`, truth: ratio >= k, why: `${y}년 ${x1} ${val(D, big)}, ${x2} ${val(D, small)}. 나눗셈 대신 작은 쪽에 ${josa(String(k), '을/를')} 곱하면 ${val(D, small)} × ${k} = ${fmt(prod, 1)}${big >= prod ? `이고 ${josa(`${x1}(${val(D, big)})`, '은/는')} 이보다 크므로 ${k}배 이상이다` : `인데 ${josa(`${x1}(${val(D, big)})`, '은/는')} 이보다 작으므로 ${k}배에 못 미친다`}(정확히는 ${fmt(ratio, 2)}배).` };
    },
    gapAtLeast(D, r, lv) {
      if (D.T.kind !== 'pct') return null;
      const y = r.pick(D.years); const i = yi(D, y);
      const [a, b] = r.sample(D.ents, 2);
      const gap = Math.abs(D.v[a][i] - D.v[b][i]);
      const cands = [2, 3, 5, 8, 10, 12, 15].filter((d) => Math.abs(gap - d) >= (lv === 3 ? 0.2 : 0.4) && Math.abs(gap - d) <= (lv === 3 ? 2 : 6));
      if (!cands.length) return null;
      const d = r.pick(cands);
      return { k: 'gap', text: `${y}년 ${josa(a, '과/와')} ${b}의 ${D.T.measure} 차이는 ${d}%p 이상이다.`, truth: gap >= d, why: `${y}년 ${a} ${val(D, D.v[a][i])}%, ${b} ${val(D, D.v[b][i])}%이므로 차이는 ${fmt(gap, 1)}%p이므로 ${d}%p${gap >= d ? ' 이상이다' : '에 못 미친다'}. (비율끼리의 차이는 %가 아니라 %p로 나타낸다.)` };
    },
    share(D, r, lv) {
      if (D.T.kind !== 'amt') return null;
      const y = r.pick(D.years); const i = yi(D, y);
      const e = r.pick(D.ents);
      const tot = P.sum(D.ents.map((x) => D.v[x][i]));
      const sh = D.v[e][i] / tot * 100;
      const cands = [10, 15, 20, 25, 30, 35, 40, 45, 50].filter((p) => Math.abs(sh - p) >= (lv === 3 ? 0.3 : 0.6) && Math.abs(sh - p) <= (lv === 3 ? 3 : 8));
      if (!cands.length) return null;
      const p = r.pick(cands);
      const tp = pctTip(D, tot, p);
      return { k: 'share', text: `${y}년 ${e}의 ${top(D.T.measure)} 전체의 ${p}% 이상이다.`, truth: sh >= p, why: `${y}년 전체 합계는 ${D.ents.map((x) => val(D, D.v[x][i])).join(' + ')} = ${val(D, tot)}${unitTxt(D)}이다. ${tp.tip}이다. ${top(e)} ${josa(val(D, D.v[e][i]), '으로/로')} 이보다 ${sh >= p ? '크므로' : '작으므로'} ${p}%${sh >= p ? ' 이상이다' : '에 못 미친다'}(정확히는 ${fmt(sh, 1)}%).` };
    },
    topEntity(D, r) {
      const y = r.pick(D.years); const i = yi(D, y);
      const sorted = D.ents.slice().sort((a, b) => D.v[b][i] - D.v[a][i]);
      const v1 = D.v[sorted[0]][i], v2 = D.v[sorted[1]][i];
      if ((v1 - v2) / v2 < 0.01) return null;
      const claim = r.chance(0.5) ? sorted[0] : r.pick(sorted.slice(1, 3));
      return { k: 'top', text: `${y}년 ${josa(D.T.measure, '이/가')} 가장 ${D.T.hiW}은 ${D.T.noun}${josa(D.T.noun, '은/는').slice(D.T.noun.length)} ${claim}이다.`, truth: claim === sorted[0], why: `${y}년 값을 큰 순서로 놓으면 ${sorted.map((x) => `${x} ${val(D, D.v[x][i])}`).join(' > ')}이다. 가장 ${D.T.hiW}은 ${D.T.noun}${josa(D.T.noun, '은/는').slice(D.T.noun.length)} ${sorted[0]}이다.` };
    },
    changeCmp(D, r) {
      const [i1, i2] = r.chance(0.5) ? [0, D.years.length - 1] : (() => { const a = r.int(0, D.years.length - 2); return [a, r.int(a + 1, D.years.length - 1)]; })();
      const [a, b] = r.sample(D.ents, 2);
      const d1 = D.v[a][i2] - D.v[a][i1], d2 = D.v[b][i2] - D.v[b][i1];
      const margin = D.T.kind === 'pct' ? 0.3 : Math.max(3, 0.02 * (Math.abs(d1) + Math.abs(d2)));
      if (Math.abs(d1 - d2) < margin) return null;
      const word = D.T.kind === 'pct' ? '증가폭' : '증가량';
      const sg = (x) => `${x >= 0 ? '+' : '−'}${fmt(Math.abs(x), D.d)}${diffUnit(D)}`;
      return { k: 'chg', text: `${D.years[i1]}년 대비 ${D.years[i2]}년 ${D.T.measure}의 ${top(word)} ${subj(a)} ${b}보다 크다.`, truth: d1 > d2, why: `${a}: ${val(D, D.v[a][i1])} → ${val(D, D.v[a][i2])} (${sg(d1)}), ${b}: ${val(D, D.v[b][i1])} → ${val(D, D.v[b][i2])} (${sg(d2)}). ${word}은 ${d1 > d2 ? `${a}가 더 크다` : `${b}가 더 크다`}.${(d1 < 0 || d2 < 0) ? ` (감소한 경우의 ${top(word)} 음수로 본다.)` : ''}`.replace(`${a}가 더`, `${subj(a)} 더`).replace(`${b}가 더`, `${subj(b)} 더`) };
    },
    totalFirst(D, r) {
      if (D.T.kind !== 'amt') return null;
      const tot = D.years.map((_, i) => P.sum(D.ents.map((e) => D.v[e][i])));
      const order = tot.map((x, i) => i).filter((i) => i > 0 && tot[i] > tot[i - 1] && tot.slice(0, i).every((t) => t < tot[i]));
      if (!order.length) return null;
      const i = r.pick(order);
      const lo = Math.max(...tot.slice(0, i)), hi = tot[i];
      const step = Math.pow(10, Math.max(1, Math.floor(Math.log10(hi)) - 1));
      const N = Math.ceil((lo + 1) / step) * step;
      if (!(N > lo && N < hi) || (hi - N) / hi < 0.003 || (N - lo) / lo < 0.003) return null;
      const firstIdx = tot.findIndex((t) => t > N);
      const claimIdx = r.chance(0.55) ? firstIdx : r.pick(tot.map((_, j) => j).filter((j) => j !== firstIdx));
      return { k: 'total', text: `조사 대상 ${D.T.noun} 전체의 ${D.T.measure} 합계가 처음으로 ${josa(fmt(N, 0) + unitTxt(D), '을/를')} 넘은 해는 ${D.years[claimIdx]}년이다.`, truth: claimIdx === firstIdx, why: `연도별 합계: ${tot.map((t, j) => `${D.years[j]}년 ${fmt(t, 0)}`).join(', ')}. ${fmt(N, 0)}${unitTxt(D)}을 처음 넘은 해는 ${D.years[firstIdx]}년이다.`.replace(`${fmt(N, 0)}${unitTxt(D)}을`, josa(fmt(N, 0) + unitTxt(D), '을/를')) };
    },
  };
  const KINDS = Object.keys(ST);
  /* the same statements read off a grouped bar chart (values printed on the bars, as in the exam booklet) */
  function chartBlock(D) {
    return { t: 'chart', kind: 'bar', caption: D.T.title, unit: `(단위: ${D.T.unit})`, cats: D.years.map((y) => `${y}년`), series: D.ents.map((e) => ({ name: e, v: D.v[e].slice() })), dec: D.d };
  }
  function genChart(r, lv) {
    const T = r.pick(THEMES);
    const D = makeData(T, r, lv, { nE: lv === 1 ? 3 : lv === 3 ? 4 : r.pick([3, 4]), ny: 4 }); if (!D) return null;
    const years = `${D.years[0]}~${D.years[D.years.length - 1]}년`;
    if (r.chance(0.5)) {
      const pol = r.pick(['right', 'right', 'wrong']);
      const sel = pickStatements(D, r, pol === 'right' ? 1 : 4, pol === 'right' ? 4 : 1, lv); if (!sel) return null;
      const key = pol === 'right' ? sel.t[0] : sel.f[0];
      const opts = r.shuffle([...sel.t, ...sel.f]);
      return {
        type: '자료해석 · 그래프 해석',
        stem: `다음 <그림>은 ${years} ${T.title}에 관한 자료이다. 이에 대한 설명으로 ${pol === 'right' ? '옳은' : '옳지 않은'} 것은?`,
        body: [chartBlock(D)],
        options: opts.map((s) => esc(s.text)), answer: opts.indexOf(key),
        explain: [{ t: 'p', h: '그래프의 막대 위 숫자를 표로 옮겨 읽으면 계산이 빨라진다. 필요한 값만 골라 적는다.' }, { t: 'ox', items: opts.map((s) => ({ ok: s.truth, v: s.truth ? '옳다' : '옳지 않다', why: esc(s.why) })) }],
      };
    }
    const nT = r.int(1, 3);
    const sel = pickStatements(D, r, nT, 4 - nT, lv); if (!sel) return null;
    const items = r.shuffle([...sel.t, ...sel.f]);
    const labels = P.BOGI.slice(0, 4);
    const trueSet = labels.filter((_, i) => items[i].truth);
    const { options, answer } = P.comboOptions(r, labels, trueSet);
    return {
      type: '자료해석 · 그래프 해석',
      stem: `다음 <그림>은 ${years} ${T.title}에 관한 자료이다. 이에 대한 <보기>의 설명으로 옳은 것만을 모두 고르면?`,
      body: [chartBlock(D), { t: 'box', title: '보기', items: items.map((s, i) => `${labels[i]}. ${esc(s.text)}`) }],
      options, answer,
      explain: [{ t: 'bx', items: items.map((s, i) => ({ label: labels[i], text: esc(s.text), ok: s.truth, v: s.truth ? '옳다' : '옳지 않다', why: esc(s.why) })) }, { t: 'p', h: `따라서 옳은 것은 ${trueSet.join(', ')}이므로 정답은 <b>${CIRC[answer]}</b>이다.` }],
    };
  }
  function tableBlock(D) {
    return { t: 'table', caption: `${D.T.title}`, unit: `(단위: ${D.T.unit})`, head: [D.T.noun, ...D.years.map((y) => `${y}`)], rows: D.ents.map((e) => [e, ...D.v[e].map((x) => val(D, x))]), num: true };
  }
  const EASY = ['mono', 'topEntity', 'gapAtLeast', 'changeCmp', 'totalFirst'], HARD = ['ratio', 'share', 'growthTop', 'changeCmp', 'ratio', 'share'];
  function pickStatements(D, r, nTrue, nFalse, lv) {
    const pool = [];
    const kinds = lv === 1 ? EASY : lv === 3 ? KINDS.concat(HARD) : KINDS;
    for (let k = 0; k < 160 && pool.length < 40; k++) {
      const s = ST[r.pick(kinds)](D, r, lv);
      if (s && !pool.some((p) => p.text === s.text)) pool.push(s);
    }
    const t = r.shuffle(pool.filter((s) => s.truth)), f = r.shuffle(pool.filter((s) => !s.truth));
    const take = (arr, n, used) => { const out = []; for (const s of arr) { if (out.length >= n) break; if (out.filter((o) => o.k === s.k).length + used.filter((o) => o.k === s.k).length < 2) out.push(s); } return out; };
    const a = take(t, nTrue, []); const b = take(f, nFalse, a);
    if (a.length < nTrue || b.length < nFalse) return null;
    return { t: a, f: b };
  }
  function genTable(r, lv) {
    const T = r.pick(THEMES); const D = makeData(T, r, lv); if (!D) return null;
    const pol = r.pick(['right', 'right', 'wrong']);
    const sel = pickStatements(D, r, pol === 'right' ? 1 : 4, pol === 'right' ? 4 : 1, lv); if (!sel) return null;
    const key = pol === 'right' ? sel.t[0] : sel.f[0];
    const opts = r.shuffle([...sel.t, ...sel.f]);
    const answer = opts.indexOf(key);
    return {
      type: '자료해석 · 표 해석',
      stem: `다음 <표>는 ${D.years[0]}~${D.years[D.years.length - 1]}년 ${T.title}에 관한 자료이다. 이에 대한 설명으로 ${pol === 'right' ? '옳은' : '옳지 않은'} 것은?`,
      body: [tableBlock(D)],
      options: opts.map((s) => esc(s.text)), answer,
      explain: [{ t: 'ox', items: opts.map((s) => ({ ok: s.truth, v: s.truth ? '옳다' : '옳지 않다', why: esc(s.why) })) }],
    };
  }
  function genTableBogi(r, lv) {
    const T = r.pick(THEMES); const D = makeData(T, r, lv); if (!D) return null;
    const nT = r.int(1, 3);
    const sel = pickStatements(D, r, nT, 4 - nT, lv); if (!sel) return null;
    const items = r.shuffle([...sel.t, ...sel.f]);
    const labels = P.BOGI.slice(0, 4);
    const trueSet = labels.filter((_, i) => items[i].truth);
    const { options, answer } = P.comboOptions(r, labels, trueSet);
    return {
      type: '자료해석 · 표 해석',
      stem: `다음 <표>는 ${D.years[0]}~${D.years[D.years.length - 1]}년 ${T.title}에 관한 자료이다. 이에 대한 <보기>의 설명으로 옳은 것만을 모두 고르면?`,
      body: [tableBlock(D), { t: 'box', title: '보기', items: items.map((s, i) => `${labels[i]}. ${esc(s.text)}`) }],
      options, answer,
      explain: [{ t: 'bx', items: items.map((s, i) => ({ label: labels[i], text: esc(s.text), ok: s.truth, v: s.truth ? '옳다' : '옳지 않다', why: esc(s.why) })) }, { t: 'p', h: `따라서 옳은 것은 ${trueSet.join(', ')}이므로 정답은 <b>${CIRC[answer]}</b>이다.` }],
    };
  }

  /* ---------- 매칭: 조건으로 A~D 식별 ---------- */
  const MTHEMES = [
    { what: '국가', names: ['동국', '서국', '남국', '북국'], a: { name: '인구', unit: '만 명', lo: 300, hi: 9000, dec: 0 }, b: { name: 'GDP', unit: '억 달러', lo: 800, hi: 30000, dec: 0 }, gen: (pop, r) => Math.round(pop * r.float(3000, 72000) / 10000), d: { name: '1인당 GDP', unit: '달러', f: (x, y) => y * 10000 / x, dec: 0, hi: '높' } },
    { what: '도시', names: ['가시', '나시', '다시', '라시'], a: { name: '인구', unit: '만 명', lo: 20, hi: 400, dec: 0 }, b: { name: '면적', unit: 'km²', lo: 100, hi: 1600, dec: 0 }, gen: (pop, r) => Math.max(40, Math.round(pop * 10000 / r.float(400, 16000))), d: { name: '인구밀도', unit: '명/km²', f: (x, y) => x * 10000 / y, dec: 0, hi: '높' } },
    { what: '대학', names: ['甲대학', '乙대학', '丙대학', '丁대학'], a: { name: '재학생 수', unit: '명', lo: 3000, hi: 30000, dec: 0 }, b: { name: '전임교원 수', unit: '명', lo: 120, hi: 1300, dec: 0 }, gen: (st, r) => Math.max(60, Math.round(st / r.float(14, 42))), d: { name: '교원 1인당 학생 수', unit: '명', f: (x, y) => x / y, dec: 1, hi: '많' } },
  ];
  function genMatch(r) {
    const M = r.pick(MTHEMES);
    const rows = ['A', 'B', 'C', 'D'];
    const A = {}, B = {};
    for (const k of rows) { A[k] = Math.round(r.float(M.a.lo, M.a.hi)); B[k] = M.gen ? M.gen(A[k], r) : Math.round(r.float(M.b.lo, M.b.hi)); }
    const Dv = {}; for (const k of rows) Dv[k] = M.d.f(A[k], B[k]);
    const dv = rows.map((k) => Dv[k]).sort((a, b) => a - b);
    for (let i = 1; i < 4; i++) if ((dv[i] - dv[i - 1]) / dv[i - 1] < 0.04) return null;
    const hidden = r.shuffle(M.names); // hidden[i] = name of rows[i]
    const nameOf = (perm, row) => perm[rows.indexOf(row)];
    const rowOf = (perm, nm) => rows[perm.indexOf(nm)];
    const perms = P.perms(M.names.slice());
    const clueMakers = [
      () => { const best = rows.slice().sort((x, y) => Dv[y] - Dv[x])[0]; const nm = nameOf(hidden, best); return { text: `${M.d.name}${P.pp(M.d.name, '이/가')} 가장 ${M.d.hi}은 ${M.what}${P.pp(M.what, '은/는')} ${nm}이다.`, f: (perm) => rowOf(perm, nm) === best }; },
      () => { const worst = rows.slice().sort((x, y) => Dv[x] - Dv[y])[0]; const nm = nameOf(hidden, worst); return { text: `${M.d.name}${P.pp(M.d.name, '이/가')} 가장 ${M.d.hi === '높' ? '낮' : '적'}은 ${M.what}${P.pp(M.what, '은/는')} ${nm}이다.`, f: (perm) => rowOf(perm, nm) === worst }; },
      () => { const [x, y] = r.sample(rows, 2); const [p, q] = A[x] >= A[y] ? [x, y] : [y, x]; const ratio = A[p] / A[q]; const ks = [1.5, 2, 3].filter((k) => ratio >= k * 1.04); if (!ks.length) return null; const k = ks[ks.length - 1]; const np = nameOf(hidden, p), nq = nameOf(hidden, q); return { text: `${np}의 ${top(M.a.name)} ${nq}의 ${k}배 이상이다.`, f: (perm) => { const rp = rowOf(perm, np), rq = rowOf(perm, nq); return A[rp] >= k * A[rq]; } }; },
      () => { const [x, y] = r.sample(rows, 2); const [p, q] = Dv[x] > Dv[y] ? [x, y] : [y, x]; const np = nameOf(hidden, p), nq = nameOf(hidden, q); return { text: `${np}의 ${top(M.d.name)} ${nq}보다 ${M.d.hi === '높' ? '높다' : '많다'}.`, f: (perm) => Dv[rowOf(perm, np)] > Dv[rowOf(perm, nq)] }; },
      () => { const [x, y, z] = r.sample(rows, 3); const s = B[x] + B[y]; if (Math.abs(s - B[z]) / B[z] < 0.05) return null; const big = s > B[z]; const nx = nameOf(hidden, x), ny = nameOf(hidden, y), nz = nameOf(hidden, z); return { text: `${josa(nx, '과/와')} ${ny}의 ${M.b.name} 합은 ${nz}의 ${M.b.name}보다 ${big ? '크다' : '작다'}.`, f: (perm) => { const sum = B[rowOf(perm, nx)] + B[rowOf(perm, ny)]; return big ? sum > B[rowOf(perm, nz)] : sum < B[rowOf(perm, nz)]; } }; },
    ];
    let clues = [], cand = perms.slice(), guard = 0;
    while (cand.length > 1 && guard++ < 60) {
      const c = r.pick(clueMakers)(); if (!c || clues.some((x) => x.text === c.text)) continue;
      const next = cand.filter(c.f); if (next.length === cand.length) continue;
      clues.push(c); cand = next;
    }
    if (cand.length !== 1) return null;
    for (const c of r.shuffle(clues.slice())) { const rest = clues.filter((x) => x !== c); if (perms.filter((p) => rest.every((x) => x.f(p))).length === 1) clues = rest; }
    if (clues.length < 2 || clues.length > 4) return null;
    const right = hidden;
    const others = perms.filter((p) => p.join() !== right.join()).map((p) => ({ p, miss: clues.filter((c) => !c.f(p)).length })).sort((x, y) => x.miss - y.miss || r.next() - 0.5);
    const opts = r.shuffle([right, ...others.slice(0, 4).map((o) => o.p)]);
    const answer = opts.findIndex((p) => p.join() === right.join());
    const fmtA = (x) => fmt(x, M.a.dec), fmtB = (x) => fmt(x, M.b.dec), fmtD = (x) => fmt(x, M.d.dec);
    return {
      type: '자료해석 · 매칭',
      stem: `다음 <표>는 4개 ${M.what}의 ${josa(M.a.name, '과/와')} ${M.b.name}에 관한 자료이다. <표>와 <조건>을 근거로 A~D에 해당하는 ${josa(M.what, '을/를')} 바르게 나열한 것은?`,
      body: [
        { t: 'table', caption: `${M.what}별 ${M.a.name}와 ${M.b.name}`.replace(`${M.a.name}와`, josa(M.a.name, '과/와')), head: [M.what, `${M.a.name}(${M.a.unit})`, `${M.b.name}(${M.b.unit})`], rows: rows.map((k) => [k, fmtA(A[k]), fmtB(B[k])]), num: true },
        { t: 'box', title: '조건', items: clues.map((c) => `○ ${esc(c.text)}`) },
      ],
      options: opts.map((p) => p.map((nm, i) => `${rows[i]} ${nm}`).join(' · ')),
      answer,
      explain: [
        { t: 'table', caption: `${M.d.name} 계산`, head: [M.what, M.a.name, M.b.name, M.d.name], rows: rows.map((k) => [k, fmtA(A[k]), fmtB(B[k]), fmtD(Dv[k])]), num: true },
        { t: 'ox', items: opts.map((p) => { const bad = clues.filter((c) => !c.f(p)); return { ok: !bad.length, v: bad.length ? '조건에 어긋난다' : '모든 조건을 만족한다', why: bad.length ? bad.map((c) => `「${esc(c.text)}」`).join(', ') + (bad.length > 1 ? '를 만족하지 않는다.' : '를 만족하지 않는다.') : '위 계산표의 값과 모든 조건이 일치한다.' }; }) },
      ],
    };
  }

  /* ---------- 계산: 연속 증가율 ---------- */
  function genCompound(r) {
    let a, b;
    for (let k = 0; k < 50; k++) { a = r.int(-12, 25); b = r.int(-12, 25); if (a !== 0 && b !== 0 && (a * b) % 10 === 0 && a !== b) break; }
    if ((a * b) % 10 !== 0) return null;
    const subject = r.pick([['甲국의 수출액', '억 달러', 400, 900], ['A시의 관광객 수', '만 명', 120, 600], ['B사의 매출액', '억 원', 300, 2500], ['C군의 인구', '명', 30000, 90000]]);
    const [what, unit, lo, hi] = subject;
    const y0 = r.int(2021, 2023);
    const base = Math.round(r.float(lo, hi));
    const exact = a + b + a * b / 100; // percent, exact to 0.1
    const ans = P.round(exact, 1);
    const no = P.numOptions(r, ans, [a + b, (a + b) / 2, a + b - a * b / 100, Math.max(a, b), ans + 2, ans - 2], r.pick([0.5, 1, 1.5]), 0.3, 1);
    if (!no) return null;
    const vals = no.vals;
    const sgn = (x) => (x >= 0 ? `${x}% 증가` : `${-x}% 감소`);
    return {
      type: '자료해석 · 계산',
      stem: `다음 <표>는 ${y0 + 1}~${y0 + 2}년 ${what}의 전년 대비 증감률에 관한 자료이다. ${y0 + 2}년 ${what}의 ${y0}년 대비 증감률은?`,
      body: [{ t: 'table', caption: `${what}의 전년 대비 증감률`, unit: `(${y0}년 ${what}: ${fmt(base, 0)}${unit})`, head: ['연도', `${y0 + 1}`, `${y0 + 2}`], rows: [['전년 대비 증감률', sgn(a), sgn(b)]] }],
      options: vals.map((x) => (x >= 0 ? `${fmt(x, 1)}% 증가` : `${fmt(-x, 1)}% 감소`)),
      answer: no.answer,
      explain: [
        { t: 'p', h: `증감률은 더하는 것이 아니라 곱해서 누적한다. (1 ${a >= 0 ? '+' : '−'} ${Math.abs(a) / 100}) × (1 ${b >= 0 ? '+' : '−'} ${Math.abs(b) / 100}) = ${fmt(1 + exact / 100, 4)}이므로, ${y0}년 대비 ${y0 + 2}년에는 <b>${ans >= 0 ? `${fmt(ans, 1)}% 증가` : `${fmt(-ans, 1)}% 감소`}</b>하였다.` },
        { t: 'p', h: `실제 값으로 확인하면 ${fmt(base, 0)} → ${fmt(base * (1 + a / 100), 2)} → ${fmt(base * (1 + a / 100) * (1 + b / 100), 2)}${unit}이다. 두 증감률을 단순히 더한 ${a + b >= 0 ? `${a + b}% 증가` : `${-(a + b)}% 감소`}는 오답이다.` },
      ],
    };
  }

  /* ---------- 계산: 가중평균 ---------- */
  function genWeighted(r) {
    const ctx = r.pick([
      { org: 'A기관', title: '지점별 직원 수와 평균 근속연수', groups: ['서울', '부산', '대구', '광주'], n: '직원 수(명)', m: '평균 근속연수(년)', whole: '전체 직원의 평균 근속연수', unit: '년', mlo: 4, mhi: 14 },
      { org: 'A고등학교 1학년', title: '반별 학생 수와 평균 점수', groups: ['1반', '2반', '3반', '4반'], n: '학생 수(명)', m: '평균 점수(점)', whole: '전체 학생의 평균 점수', unit: '점', mlo: 55, mhi: 90 },
      { org: 'A기관', title: '부서별 인원과 월평균 초과근무시간', groups: ['기획', '인사', '재무', '홍보'], n: '인원(명)', m: '월평균 초과근무(시간)', whole: '전체 인원의 월평균 초과근무시간', unit: '시간', mlo: 6, mhi: 30 },
    ]);
    const k = r.pick([3, 4]);
    const totals = [100, 200, 250, 400, 500];
    for (let attempt = 0; attempt < 80; attempt++) {
      const N = r.pick(totals);
      const cuts = []; let left = N;
      for (let i = 0; i < k - 1; i++) { const c = r.int(Math.max(5, Math.round(left * 0.15)), Math.round(left * 0.6)); cuts.push(c); left -= c; }
      if (left < 5) continue;
      cuts.push(left);
      const ms = cuts.map(() => P.round(r.float(ctx.mlo, ctx.mhi), 1));
      const S = P.sum(cuts.map((c, i) => c * ms[i]));
      const avg = S / N;
      if (Math.abs(P.round(avg, 2) - avg) > 1e-9) continue;
      const simple = P.sum(ms) / k;
      if (Math.abs(simple - avg) < 0.15) continue;
      const ans = P.round(avg, 2);
      const no = P.numOptions(r, ans, [simple, avg + 0.25, avg - 0.25, Math.max(...ms) - (Math.max(...ms) - avg) / 2, P.sum(ms.map((m, i) => m * (i + 1))) / (k * (k + 1) / 2)], r.pick([0.2, 0.3, 0.4]), 0.08, 2);
      if (!no) continue;
      const vals = no.vals;
      return {
        type: '자료해석 · 계산',
        stem: `다음 <표>는 ${ctx.org}의 ${ctx.title}에 관한 자료이다. ${ctx.org} ${josa(ctx.whole, '은/는')}?`,
        body: [{ t: 'table', caption: ctx.title, head: ['구분', ...ctx.groups.slice(0, k)], rows: [[ctx.n, ...cuts.map((c) => fmt(c, 0))], [ctx.m, ...ms.map((m) => fmt(m, 1))]], num: true }],
        options: vals.map((v) => `${fmt(v, 2)}${ctx.unit}`),
        answer: no.answer,
        explain: [
          { t: 'p', h: `전체 평균은 집단별 평균을 인원수로 가중하여 구한다. (${cuts.map((c, i) => `${c}×${fmt(ms[i], 1)}`).join(' + ')}) ÷ ${N} = ${fmt(S, 1)} ÷ ${N} = <b>${fmt(ans, 2)}${ctx.unit}</b>.` },
          { t: 'p', h: `집단별 평균을 단순 평균한 ${fmt(simple, 2)}${ctx.unit}은 인원 차이를 무시한 값이므로 오답이다.` },
        ],
      };
    }
    return null;
  }

  /* ---------- 계산: 집행률 최고·최저 ---------- */
  function genExec(r) {
    const depts = r.pick([['기획', '인사', '홍보', '연구', '총무'], ['교육', '복지', '안전', '환경', '문화'], ['A사업', 'B사업', 'C사업', 'D사업', 'E사업']]);
    for (let attempt = 0; attempt < 60; attempt++) {
      const rows = depts.map((d) => { const b = r.int(12, 95) * 10; const rate = r.float(0.78, 0.97); return { d, b, e: Math.round(b * rate) }; });
      rows.forEach((x) => { x.rate = x.e / x.b * 100; });
      const s = rows.slice().sort((a, b) => b.rate - a.rate);
      if (s[0].rate - s[1].rate < 0.3 || s[3].rate - s[4].rate < 0.3) continue;
      const maxE = rows.slice().sort((a, b) => b.e - a.e)[0];
      const right = `${s[0].d}, ${s[4].d}`;
      const pool = new Set([right, `${maxE.d}, ${s[4].d}`, `${s[1].d}, ${s[4].d}`, `${s[0].d}, ${s[3].d}`, `${s[1].d}, ${s[3].d}`, `${s[4].d}, ${s[0].d}`]);
      const opts = r.shuffle([...pool].filter((x) => x === right || !x.split(', ').every((v, i, a) => a.indexOf(v) !== i))).slice(0, 5);
      if (!opts.includes(right)) { opts[0] = right; }
      if (new Set(opts).size < 5) continue;
      return {
        type: '자료해석 · 계산',
        stem: ((u) => `다음 <표>는 2025년 A기관의 ${u}별 예산 집행 현황이다. 예산 집행률이 가장 높은 ${josa(u, '과/와')} 가장 낮은 ${josa(u, '을/를')} 바르게 짝지은 것은?`)(depts[0].endsWith('사업') ? '사업' : '부서'),
        body: [{ t: 'table', caption: '2025년 예산 집행 현황', unit: '(단위: 백만 원)', head: ['구분', '예산', '집행액'], rows: rows.map((x) => [x.d, fmt(x.b, 0), fmt(x.e, 0)]), num: true, note: '집행률(%) = 집행액 ÷ 예산 × 100' }],
        options: opts.map((o) => o.replace(', ', ' — ')),
        answer: opts.indexOf(right),
        explain: [
          { t: 'table', head: ['구분', '집행률'], rows: s.map((x) => [x.d, `${fmt(x.rate, 2)}%`]), num: true },
          { t: 'p', h: `집행률이 가장 높은 것은 ${s[0].d}(${fmt(s[0].rate, 2)}%), 가장 낮은 것은 ${s[4].d}(${fmt(s[4].rate, 2)}%)이다. ${maxE.d !== s[0].d ? `집행액 자체가 가장 큰 ${josa(maxE.d, '과/와')} 혼동하지 않도록 비율로 비교해야 한다.` : '집행액이 아니라 예산 대비 비율로 비교한다.'}` },
        ],
      };
    }
    return null;
  }

  /* ---------- 계산: %p 와 % ---------- */
  function genPoint(r) {
    const ctx = r.pick([['A시 투표율', 'B시 투표율'], ['甲국 고용률', '乙국 고용률'], ['C대학 취업률', 'D대학 취업률']]);
    for (let k = 0; k < 60; k++) {
      const a = r.int(40, 80) * 1, b = a + r.pick([2, 3, 4, 5, 6, 8, 10, 12]) * (r.chance(0.8) ? 1 : -1);
      const rate = (b - a) / a * 100;
      if (Math.abs(P.round(rate, 1) - rate) > 1e-9) continue;
      const pts = b - a;
      const up = pts > 0;
      const ans = `${up ? '증가율' : '감소율'}은 ${fmt(Math.abs(rate), 1)}%이다.`;
      const wrongs = [`${up ? '증가율' : '감소율'}은 ${Math.abs(pts)}%이다.`, `${up ? '증가폭' : '감소폭'}은 ${fmt(Math.abs(rate), 1)}%p이다.`, `${up ? '증가폭' : '감소폭'}은 ${Math.abs(pts)}%이다.`, `${up ? '증가율' : '감소율'}은 ${fmt(Math.abs(pts) / b * 100, 1)}%이다.`];
      if (new Set([ans, ...wrongs]).size < 5) continue;
      const opts = r.shuffle([ans, ...wrongs]);
      return {
        type: '자료해석 · 계산',
        stem: `${ctx[0]}이 ${a}%에서 ${b}%로 변하였다. 이에 대한 설명으로 옳은 것은?`.replace(`${ctx[0]}이`, josa(ctx[0], '이/가')),
        body: [],
        options: opts, answer: opts.indexOf(ans),
        explain: [{ t: 'p', h: `변화폭은 두 비율의 차이로 ${Math.abs(pts)}%p이고, 변화율은 기준값 대비 비율로 ${Math.abs(pts)} ÷ ${a} × 100 = <b>${fmt(Math.abs(rate), 1)}%</b>이다. 비율의 차이는 %p로, 비율의 변화율은 %로 나타낸다.` }],
      };
    }
    return null;
  }

  P.addGen('data', 'D-table', '자료해석 · 표 해석', 4, genTable, true);
  P.addGen('data', 'D-bogi', '자료해석 · 표 해석', 3, genTableBogi, true);
  P.addGen('data', 'D-match', '자료해석 · 매칭', 2, genMatch);
  P.addGen('data', 'D-comp', '자료해석 · 계산', 1.2, genCompound);
  P.addGen('data', 'D-wavg', '자료해석 · 계산', 1.2, genWeighted);
  P.addGen('data', 'D-exec', '자료해석 · 계산', 1.2, genExec);
  P.addGen('data', 'D-pt', '자료해석 · 계산', 0.8, genPoint);
  P.addGen('data', 'D-chart', '자료해석 · 그래프 해석', 3, genChart, true);
})(typeof window !== 'undefined' ? window : globalThis);
