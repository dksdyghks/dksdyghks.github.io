/* PSAT 연습장 — core: seeded RNG, Korean particles, formatting, dates, combination options, ordering puzzles.
   Every generator returns a question object; PSAT.check() rejects anything malformed before it is shown. */
(function (G) {
  'use strict';
  const P = G.PSAT = G.PSAT || {};
  P.gens = P.gens || {};      // subject -> [{id, label, w, fn}]
  P.bank = P.bank || {};      // subject -> [question]

  /* ---------- seeded random ---------- */
  P.rng = function (seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r = {
      next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      shuffle: (arr) => { const x = arr.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; },
      sample: (arr, k) => r.shuffle(arr).slice(0, k),
      weighted: (items) => { const tot = items.reduce((s, it) => s + it.w, 0); let x = next() * tot; for (const it of items) { if ((x -= it.w) < 0) return it; } return items[items.length - 1]; },
      float: (lo, hi) => lo + next() * (hi - lo),
    };
    return r;
  };
  P.newSeed = function () {
    try { const a = new Uint32Array(1); (G.crypto || require('crypto').webcrypto).getRandomValues(a); return a[0] || 1; }
    catch (e) { return (Math.random() * 4294967295) >>> 0 || 1; }
  };

  /* ---------- Korean particles (조사) ---------- */
  const HANJA = { '甲': '갑', '乙': '을', '丙': '병', '丁': '정', '戊': '무', '己': '기', '庚': '경', '辛': '신' };
  const LATIN = { A: '이', B: '비', C: '씨', D: '디', E: '이', F: '프', G: '지', H: '치', I: '이', J: '이', K: '이', L: '엘', M: '엠', N: '엔', O: '오', P: '피', Q: '큐', R: '알', S: '스', T: '티', U: '유', V: '이', W: '유', X: '스', Y: '이', Z: '트' };
  const DIGIT = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  function lastSyl(word) {
    // a trailing parenthetical only supplements the word before it, so the particle follows that word: 13일(화)이, 국회(國會)는
    const s = String(word).replace(/<[^>]*>/g, '').replace(/\s*\([^()]*\)\s*$/u, '').replace(/[\s)\]』」’”'"·.,%]+$/u, (m) => (m.includes('%') ? '%' : ''));
    const ch = s.slice(-1);
    if (ch === '%') return '트';
    if (HANJA[ch]) return HANJA[ch];
    if (/[0-9]/.test(ch)) return DIGIT[+ch];
    if (/[A-Za-z]/.test(ch)) return LATIN[ch.toUpperCase()];
    return ch;
  }
  function batchim(word) {
    const c = lastSyl(word).charCodeAt(0);
    if (!(c >= 0xAC00 && c <= 0xD7A3)) return { has: false, rieul: false };
    const j = (c - 0xAC00) % 28;
    return { has: j !== 0, rieul: j === 8 };
  }
  /* josa('甲', '이/가') -> '甲이';  josa('국회', '은/는') -> '국회는' ; first form = after a final consonant */
  /* particle after a circled option number: ①일 ②이 ③삼 ④사 ⑤오 */
  P.cj = function (i, pair) { const [withB, without] = pair.split('/'); return P.CIRC[i] + ([true, false, true, false, false][i] ? withB : without); };
  P.josa = function (word, pair) {
    const b = batchim(word);
    if (pair === '으로/로') return word + (b.has && !b.rieul ? '으로' : '로');
    const [withB, without] = pair.split('/');
    return word + (b.has ? withB : without);
  };
  P.pp = function (word, pair) { return P.josa(word, pair).slice(String(word).length); };

  /* ---------- formatting ---------- */
  P.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  P.CIRC = ['①', '②', '③', '④', '⑤'];
  P.BOGI = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ'];
  P.round = (x, d) => { const f = Math.pow(10, d); return Math.round((x + (x >= 0 ? 1 : -1) * 1e-9) * f) / f; };
  P.fmt = (x, d = 0) => Number(P.round(x, d)).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  P.won = (x) => P.fmt(x, 0) + '원';
  P.sum = (a) => a.reduce((s, x) => s + x, 0);

  /* ---------- dates (UTC, so the viewer's time zone never shifts a day) ---------- */
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  P.D = {
    make: (y, m, d) => new Date(Date.UTC(y, m - 1, d)),
    add: (dt, n) => new Date(dt.getTime() + n * 86400000),
    wd: (dt) => dt.getUTCDay(),
    wdName: (dt) => WD[dt.getUTCDay()],
    md: (dt) => `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일`,
    mdw: (dt) => `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일(${WD[dt.getUTCDay()]})`,
    ymd: (dt) => `${dt.getUTCFullYear()}년 ${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일`,
    same: (a, b) => a.getTime() === b.getTime(),
    key: (dt) => dt.toISOString().slice(0, 10),
  };
  P.WD = WD;

  /* ---------- <보기> combination options: exactly one equals the true set ---------- */
  P.comboOptions = function (rng, labels, trueSet) {
    const n = labels.length;
    const all = [];
    for (let m = 1; m < (1 << n); m++) all.push(labels.filter((_, i) => m >> i & 1));
    const key = (s) => s.join(',');
    const target = key(trueSet);
    const near = all.filter((s) => key(s) !== target && Math.abs(s.length - trueSet.length) <= 1);
    const far = all.filter((s) => key(s) !== target && !near.includes(s));
    const order = (s) => s.length * 100 + s.reduce((acc, l) => acc * 7 + labels.indexOf(l) + 1, 0) / Math.pow(7, s.length);
    const build = () => {
      const picks = rng.shuffle(near).slice(0, 4);
      for (const s of rng.shuffle(far)) { if (picks.length >= 4) break; picks.push(s); }
      const opts = [trueSet, ...picks];
      opts.sort((a, b) => order(a) - order(b));
      return opts;
    };
    // the answer should be equally likely at ①~⑤ (as in the real exam), so aim for a random position first
    const want = rng.int(0, 4);
    let opts = build();
    for (let k = 0; k < 300 && opts.findIndex((s) => key(s) === target) !== want; k++) {
      const cand = build();
      if (cand.findIndex((s) => key(s) === target) === want) { opts = cand; break; }
      if (k > 150) { // widen: allow any distractors
        const pool = rng.shuffle(all.filter((s) => key(s) !== target)).slice(0, 4);
        const o2 = [trueSet, ...pool].sort((a, b) => order(a) - order(b));
        if (o2.findIndex((s) => key(s) === target) === want) { opts = o2; break; }
      }
    }
    return { options: opts.map((s) => s.join(', ')), answer: opts.findIndex((s) => key(s) === target) };
  };

  /* ---------- numeric options in ascending order with the answer at a random position ----------
     traps: plausible wrong values (common mistakes); step: spacing for filler values; minGap: smallest allowed gap */
  P.numOptions = function (r, ans, traps, step, minGap, dec) {
    const pos = r.int(0, 4);
    const ok = (v, list) => list.every((x) => Math.abs(x - v) >= minGap);
    const below = [], above = [];
    for (const t of r.shuffle(traps)) { const v = P.round(t, dec); if (Math.abs(v - ans) < minGap) continue; (v < ans ? below : above).push(v); }
    const pickSide = (arr, need, dir) => {
      const out = [];
      for (const v of arr) { if (out.length >= need) break; if (ok(v, out.concat([ans]))) out.push(v); }
      let k = 1;
      while (out.length < need && k < 40) { const v = P.round(ans + dir * step * (k + r.int(0, 1) * 0.5), dec); if (ok(v, out.concat([ans])) && (dir > 0 ? v > ans : v < ans)) out.push(v); k++; }
      return out;
    };
    const lo = pickSide(below, pos, -1), hi = pickSide(above, 4 - pos, 1);
    if (lo.length !== pos || hi.length !== 4 - pos) return null;
    const vals = [...lo, ans, ...hi].sort((a, b) => a - b);
    return { vals, answer: vals.indexOf(ans) };
  };

  /* ---------- date options in calendar order with the answer at a random position ----------
     traps: dates that come from typical mistakes; fill: other plausible dates (both sides of the answer) */
  P.dateOptions = function (r, ans, traps, fill) {
    const pos = r.int(0, 4);
    const uniq = (arr) => { const out = []; for (const d of arr) if (d && !P.D.same(d, ans) && !out.some((o) => P.D.same(o, d))) out.push(d); return out; };
    const before = uniq(r.shuffle(traps).concat(r.shuffle(fill))).filter((d) => d < ans);
    const after = uniq(r.shuffle(traps).concat(r.shuffle(fill))).filter((d) => d > ans);
    const trapFirst = (arr) => arr.sort((a, b) => (traps.some((t) => t && P.D.same(t, b)) - traps.some((t) => t && P.D.same(t, a))));
    trapFirst(before); trapFirst(after);
    if (before.length < pos || after.length < 4 - pos) return null;
    const opts = [...before.slice(0, pos), ans, ...after.slice(0, 4 - pos)].sort((a, b) => a - b);
    return { opts, answer: opts.findIndex((d) => P.D.same(d, ans)) };
  };

  /* ---------- question validation: no malformed item ever reaches the screen ---------- */
  P.check = function (q) {
    if (!q || !Array.isArray(q.options) || q.options.length !== 5) return false;
    if (!(q.answer >= 0 && q.answer < 5)) return false;
    const plain = q.options.map((o) => String(o).replace(/<[^>]*>/g, '').trim());
    if (new Set(plain).size !== 5 || plain.some((o) => !o)) return false;
    const blob = JSON.stringify(q);
    if (/undefined|NaN|Infinity|\[object/.test(blob)) return false;
    if (!q.stem || !q.explain || !q.explain.length) return false;
    return true;
  };

  /* ---------- ordering puzzles (arrival order, seats, presentation order) ---------- */
  function perms(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((x, i) => { for (const p of perms(arr.slice(0, i).concat(arr.slice(i + 1)))) out.push([x, ...p]); });
    return out;
  }
  P.perms = perms;
  /* ctx: {before(a,b), imm(a,b), adj(a,b), notAdj(a,b), gap(a,b,k), notEnds(a), notPos(a,p), pos(a,p), slot(p) } -> sentences */
  P.orderPuzzle = function (rng, names, ctx) {
    const n = names.length;
    const all = perms(names.slice());
    for (let attempt = 0; attempt < 60; attempt++) {
      const hidden = rng.pick(all);
      const posOf = (perm) => { const m = {}; perm.forEach((x, i) => { m[x] = i + 1; }); return m; };
      const H = posOf(hidden);
      const mk = () => {
        const t = rng.weighted([{ k: 'before', w: 3 }, { k: 'imm', w: 2 }, { k: 'adj', w: 1.2 }, { k: 'notAdj', w: 1 }, { k: 'gap', w: 1.5 }, { k: 'notEnds', w: 1 }, { k: 'notPos', w: 1 }, { k: 'pos', w: 0.35 }]).k;
        const [a, b] = rng.sample(names, 2);
        if (t === 'before') { const [x, y] = H[a] < H[b] ? [a, b] : [b, a]; return { t, a: x, b: y, f: (p) => p[x] < p[y], key: `B${x}${y}` }; }
        if (t === 'imm') { const x = hidden.find((nm) => H[nm] === H[a] - 1); if (!x) return null; return { t, a: x, b: a, f: (p) => p[a] === p[x] + 1, key: `I${x}${a}` }; }
        if (t === 'adj') { const x = hidden.find((nm) => Math.abs(H[nm] - H[a]) === 1); if (!x) return null; const s = [a, x].sort(); return { t, a: s[0], b: s[1], f: (p) => Math.abs(p[s[0]] - p[s[1]]) === 1, key: `A${s}` }; }
        if (t === 'notAdj') { if (Math.abs(H[a] - H[b]) === 1) return null; const s = [a, b].sort(); return { t, a: s[0], b: s[1], f: (p) => Math.abs(p[s[0]] - p[s[1]]) !== 1, key: `N${s}` }; }
        if (t === 'gap') { const k = Math.abs(H[a] - H[b]) - 1; if (k < 1) return null; const s = [a, b].sort(); return { t, a: s[0], b: s[1], k, f: (p) => Math.abs(p[s[0]] - p[s[1]]) - 1 === k, key: `G${s}${k}` }; }
        if (t === 'notEnds') { if (H[a] === 1 || H[a] === n) return null; return { t, a, f: (p) => p[a] !== 1 && p[a] !== n, key: `E${a}` }; }
        if (t === 'notPos') { const q = rng.int(1, n); if (q === H[a]) return null; return { t, a, p: q, f: (p) => p[a] !== q, key: `X${a}${q}` }; }
        if (t === 'pos') { return { t, a, p: H[a], f: (p) => p[a] === H[a], key: `P${a}` }; }
        return null;
      };
      const cs = [];
      let sols = all.map(posOf);
      let guard = 0;
      while (sols.length > 1 && guard++ < 80) {
        const c = mk();
        if (!c || cs.some((x) => x.key === c.key)) continue;
        const next = sols.filter(c.f);
        if (next.length === sols.length) continue;
        cs.push(c); sols = next;
      }
      if (sols.length !== 1) continue;
      // prune redundant constraints (random order) while keeping a unique solution
      for (const c of rng.shuffle(cs.slice())) {
        const rest = cs.filter((x) => x !== c);
        const s = all.map(posOf).filter((p) => rest.every((x) => x.f(p)));
        if (s.length === 1) cs.splice(cs.indexOf(c), 1);
      }
      if (cs.length < 3 || cs.length > 6) continue;
      if (cs.filter((c) => c.t === 'pos').length > 1) continue;
      const ordered = rng.shuffle(cs);
      // narrowing trace for the explanation
      const trace = []; let pool = all.map(posOf);
      for (const c of ordered) { pool = pool.filter(c.f); trace.push(pool.length); }
      return { hidden, H, cs: ordered, trace, text: ordered.map((c) => ctx[c.t](c)) };
    }
    return null;
  };

  /* ---------- human-style solver for ordering / seating puzzles ----------
     Solves the way a person does: take the starting point (a fixed position or a tight block), propagate forced
     placements, split into 2~3 cases only when stuck, and close each case by a contradiction or a full arrangement.
     opt: {at(p) -> '세 번째' | '3번 자리', word: '순서' | '자리', lab: ['가',...], txt(c) -> sentence}
     returns {lines:[{ind,h}], cases, pre, solved, arrangement} or null when the puzzle needs more than one split. */
  P.solveOrder = function (names, cs, opt) {
    const K = names.length, LAB = opt.lab, at = opt.at, J = P.josa;
    const lb = (c) => `(${LAB[cs.indexOf(c)]})`;
    const unary = (c) => c.t === 'pos' || c.t === 'notPos' || c.t === 'notEnds';
    const parts = (c) => (unary(c) ? [c.a] : [c.a, c.b]);
    const holds = (c, pos) => parts(c).every((x) => pos[x] != null) ? c.f(pos) : null;
    const unaryOK = (x, p) => cs.every((c) => !(unary(c) && c.a === x) || c.f({ [x]: p }));
    const firstUnaryBlock = (x, p) => cs.find((c) => unary(c) && c.a === x && !c.f({ [x]: p }));
    const free = (st) => { const out = []; for (let p = 1; p <= K; p++) if (!st.occ[p]) out.push(p); return out; };
    const clone = (st) => ({ pos: Object.assign({}, st.pos), occ: st.occ.slice() });
    const fix = (st, x, p) => { st.pos[x] = p; st.occ[p] = x; };
    // local test: can x stand at p given what is fixed? returns the first constraint that forbids it, or null
    function blocker(st, x, p) {
      for (const c of cs) {
        if (!parts(c).includes(x)) continue;
        const pos = Object.assign({}, st.pos, { [x]: p });
        if (unary(c)) { if (!c.f(pos)) return c; continue; }
        const y = c.a === x ? c.b : c.a;
        if (pos[y] != null) { if (!c.f(pos)) return c; continue; }
        let ok = false;
        for (let q = 1; q <= K && !ok; q++) if (!st.occ[q] && q !== p && unaryOK(y, q) && c.f(Object.assign({}, pos, { [y]: q }))) ok = true;
        if (!ok) return c;
      }
      return null;
    }
    const possible = (st, x) => free(st).filter((p) => !blocker(st, x, p));
    const atS = opt.atS || at;
    const blockersAll = (st, x, p) => cs.filter((c) => parts(c).includes(x) && blockerOne(st, x, p, c));
    function blockerOne(st, x, p, c) {
      const pos = Object.assign({}, st.pos, { [x]: p });
      if (unary(c)) return !c.f(pos);
      const y = c.a === x ? c.b : c.a;
      if (pos[y] != null) return !c.f(pos);
      for (let q = 1; q <= K; q++) if (!st.occ[q] && q !== p && unaryOK(y, q) && c.f(Object.assign({}, pos, { [y]: q }))) return false;
      return true;
    }
    // why x cannot stand at p because of binary constraint c (partner not fixed): where the partner would have to go
    function partnerWhy(st, x, p, c) {
      if (unary(c)) return '';
      const y = c.a === x ? c.b : c.a;
      if (st.pos[y] != null) return '';
      const pos = Object.assign({}, st.pos, { [x]: p });
      const G = []; for (let q = 1; q <= K; q++) if (q !== p && c.f(Object.assign({}, pos, { [y]: q }))) G.push(q);
      if (!G.length) return `그러면 ${J(y, '이/가')} 올 ${J(opt.word, '이/가')} 없다`;
      const parts2 = G.map((g) => (st.occ[g] ? `${atS(g)}에는 이미 ${J(st.occ[g], '이/가')} 있다` : `${J(atS(g), '은/는')} 조건 ${lb(firstUnaryBlock(y, g))}에 어긋난다`));
      return `그러면 ${J(y, '이/가')} ${G.map(atS).join(' 또는 ')}에 와야 하는데 ${parts2.join(', ')}`;
    }
    // explain why x has only place p: group the excluded places by the constraint that rules them out (greedy cover)
    function onlyPlaceText(st, x, p) {
      const fr = free(st), ex = fr.filter((q) => q !== p);
      const cover = new Map();
      for (const q of ex) cover.set(q, blockersAll(st, x, q));
      const used = []; let left = ex.slice();
      while (left.length) {
        let best = null, bestN = -1;
        for (const c of cs) { const n = left.filter((q) => cover.get(q).includes(c)).length; if (n > bestN) { best = c; bestN = n; } }
        const qs = left.filter((q) => cover.get(q).includes(best));
        used.push({ c: best, qs }); left = left.filter((q) => !qs.includes(q));
      }
      if (used.length === 1) {
        const u = used[0];
        if (u.qs.length === 1) { const pw = partnerWhy(st, x, u.qs[0], u.c); return `남은 ${opt.word} ${fr.map(atS).join('·')} 중 ${J(atS(u.qs[0]), '은/는')} 조건 ${lb(u.c)}에 어긋나므로${pw ? `(${pw})` : ''} ${J(x, '은/는')} ${at(p)}이다.`; }
        return `조건 ${lb(u.c)}에 따라 ${J(x, '은/는')} ${at(p)}이다.`;
      }
      const head = used[0], restU = used.slice(1);
      const allow = fr.filter((q) => !head.qs.includes(q));
      const tail = restU.map((u) => `조건 ${lb(u.c)}에 따라 ${J(u.qs.map(atS).join('·'), '은/는')} 될 수 없으므로${u.qs.length === 1 && partnerWhy(st, x, u.qs[0], u.c) ? `(${partnerWhy(st, x, u.qs[0], u.c)})` : ''}`).join(', ');
      return `조건 ${lb(head.c)}에 따라 ${J(x, '은/는')} ${allow.map(atS).join(' 또는 ')}에만 올 수 있고, ${tail} ${J(x, '은/는')} ${at(p)}이다.`;
    }
    function excludedText(st, x, allowed) {
      const ex = free(st).filter((q) => !allowed.includes(q));
      if (!ex.length) return '';
      const cover = new Map(); for (const q of ex) cover.set(q, blockersAll(st, x, q));
      const used = []; let left = ex.slice();
      while (left.length) {
        let best = null, bestN = -1;
        for (const c of cs) { const n = left.filter((q) => cover.get(q).includes(c)).length; if (n > bestN) { best = c; bestN = n; } }
        const qs = left.filter((q) => cover.get(q).includes(best));
        used.push({ c: best, qs }); left = left.filter((q) => !qs.includes(q));
      }
      return `${J(x, '은/는')} ${used.map((u) => `조건 ${lb(u.c)}에 따라 ${u.qs.map(atS).join('·')}`).join(', ')}에 올 수 없으므로, `;
    }
    function noPlaceText(st, x) {
      const fr = free(st);
      if (fr.length === 1) { const q = fr[0], c = blocker(st, x, q), pw = partnerWhy(st, x, q, c); return `그런데 남은 ${at(q)}에 ${J(x, '이/가')} 오면 조건 ${lb(c)}에 어긋나므로${pw ? `(${pw})` : ''} <b>이 경우는 성립하지 않는다</b>.`; }
      return `그런데 ${J(x, '은/는')} 남은 ${opt.word} ${fr.map((q) => { const c = blocker(st, x, q); const pw = partnerWhy(st, x, q, c); return `${atS(q)}(조건 ${lb(c)}에 어긋남${pw ? `: ${pw}` : ''})`; }).join(', ')} 중 어디에도 올 수 없으므로 <b>이 경우는 성립하지 않는다</b>.`;
    }
    const arr = (pos) => names.slice().sort((a, b) => pos[a] - pos[b]);
    // propagate forced placements; lines are pushed with indentation ind
    function propagate(st, lines, ind) {
      for (let guard = 0; guard < 40; guard++) {
        for (const c of cs) if (holds(c, st.pos) === false) { lines.push({ ind, h: `그런데 이러면 조건 ${lb(c)}에 어긋나므로 <b>이 경우는 성립하지 않는다</b>.` }); return 'contra'; }
        const open = names.filter((x) => st.pos[x] == null);
        if (!open.length) return 'solved';
        let moved = false;
        // R1 fixed position
        for (const c of cs) if (c.t === 'pos' && st.pos[c.a] == null) {
          if (st.occ[c.p]) { lines.push({ ind, h: `그런데 ${at(c.p)}에는 이미 ${J(st.occ[c.p], '이/가')} 있어 조건 ${lb(c)}에 어긋나므로 <b>이 경우는 성립하지 않는다</b>.` }); return 'contra'; }
          fix(st, c.a, c.p); lines.push({ ind, h: `조건 ${lb(c)}에 따라 ${J(c.a, '은/는')} ${at(c.p)}이다.`, k: 'fix' }); moved = true; break;
        }
        if (moved) continue;
        // R2 a block whose one end is fixed
        for (const c of cs) {
          if (unary(c) || c.t === 'before' || c.t === 'notAdj') continue;
          const [a, b] = [c.a, c.b];
          const fa = st.pos[a] != null, fb = st.pos[b] != null;
          if (fa === fb) continue;
          const x = fa ? a : b, y = fa ? b : a;
          const geo = []; for (let q = 1; q <= K; q++) if (q !== st.pos[x] && c.f(Object.assign({}, st.pos, { [y]: q }))) geo.push(q);
          const ok = geo.filter((q) => !st.occ[q] && unaryOK(y, q));
          if (!ok.length) {
            const why = geo.map((g) => (st.occ[g] ? `${atS(g)}에는 이미 ${J(st.occ[g], '이/가')} 있다` : `${J(atS(g), '은/는')} 조건 ${lb(firstUnaryBlock(y, g))}에 어긋난다`));
            lines.push({ ind, h: geo.length ? `그런데 조건 ${lb(c)}에 따라 ${J(y, '은/는')} ${geo.map(atS).join(' 또는 ')}에 와야 하는데 ${why.join(', ')}. 따라서 <b>이 경우는 성립하지 않는다</b>.` : `그런데 조건 ${lb(c)}를 만족하는 ${y}의 ${J(opt.word, '이/가')} 없으므로 <b>이 경우는 성립하지 않는다</b>.` });
            return 'contra';
          }
          if (ok.length === 1) {
            const q = ok[0];
            const why = geo.filter((g) => g !== q).map((g) => (st.occ[g] ? `${at(g)}에는 이미 ${J(st.occ[g], '이/가')} 있다` : `${J(at(g), '은/는')} 조건 ${lb(firstUnaryBlock(y, g))}에 어긋난다`));
            fix(st, y, q);
            lines.push({ ind, h: `조건 ${lb(c)}에 따라 ${J(y, '은/는')} ${at(q)}이다.${why.length ? ` (${why.join('; ')})` : ''}`, k: 'fix' });
            moved = true; break;
          }
        }
        if (moved) continue;
        // R3 a person with exactly one place left
        for (const x of open) {
          const fr = free(st), ps = possible(st, x);
          if (!ps.length) { lines.push({ ind, h: noPlaceText(st, x) }); return 'contra'; }
          if (ps.length === 1) {
            const p = ps[0];
            if (fr.length === 1) lines.push({ ind, h: `남은 ${at(p)}에는 ${J(x, '이/가')} 온다.`, k: 'fix' });
            else lines.push({ ind, h: onlyPlaceText(st, x, p), k: 'fix' });
            fix(st, x, p); moved = true; break;
          }
        }
        if (moved) continue;
        // R4 a place only one person can take
        for (const p of free(st)) {
          const who = open.filter((x) => possible(st, x).includes(p));
          if (!who.length) { lines.push({ ind, h: `그런데 ${at(p)}에 올 수 있는 사람이 없으므로 <b>이 경우는 성립하지 않는다</b>.` }); return 'contra'; }
          if (who.length === 1) { fix(st, who[0], p); lines.push({ ind, h: `${at(p)}에 올 수 있는 사람은 ${who[0]}뿐이므로 ${J(who[0], '은/는')} ${at(p)}이다.`, k: 'fix' }); moved = true; break; }
        }
        if (moved) continue;
        return 'stuck';
      }
      return 'stuck';
    }
    const lines = [], st = { pos: {}, occ: [] };
    const first = propagate(st, lines, 0);
    const pre = lines.length;
    if (first === 'contra') return null;
    if (first === 'solved') return { lines, cases: 0, pre, arrangement: arr(st.pos) };
    // split on the tightest block or person
    const choices = [];
    for (const c of cs) {
      if (unary(c) || c.t === 'before' || c.t === 'notAdj') continue;
      if (st.pos[c.a] != null || st.pos[c.b] != null) continue;
      const pl = [];
      for (const pa of free(st)) for (const pb of free(st)) if (pa !== pb && unaryOK(c.a, pa) && unaryOK(c.b, pb) && c.f({ [c.a]: pa, [c.b]: pb })) pl.push([[c.a, pa], [c.b, pb]]);
      choices.push({ c, pl, block: true });
    }
    for (const x of names) if (st.pos[x] == null) choices.push({ x, pl: possible(st, x).map((p) => [[x, p]]), block: false });
    const good = choices.filter((ch) => ch.pl.length >= 2).sort((u, v) => u.pl.length - v.pl.length || (v.block - u.block));
    if (!good.length) return null;
    const ch = good[0];
    if (ch.pl.length > 3) return null;
    const plText = (pl) => pl.map(([x, p]) => `${J(x, '이/가')} ${at(p)}`).join(', ');
    const nums = ['', '', '두', '세'];
    if (ch.block) {
      const [a, b] = [ch.c.a, ch.c.b];
      // unary conditions that remove some geometric placements of the block
      const fr = free(st), geo = [];
      for (const pa of fr) for (const pb of fr) if (pa !== pb && ch.c.f({ [a]: pa, [b]: pb })) geo.push([pa, pb]);
      const un = [];
      for (const [pa, pb] of geo) if (!(unaryOK(a, pa) && unaryOK(b, pb))) { const u = firstUnaryBlock(a, pa) || firstUnaryBlock(b, pb); if (u && !un.includes(u)) un.push(u); }
      lines.push({ ind: 0, h: `조건 ${lb(ch.c)}${un.length ? `와 ${un.map(lb).join('·')}` : ''}에 따라 (${a}, ${b})의 ${J(opt.word, '은/는')} ${ch.pl.map((pl) => `(${pl.map(([, p]) => atS(p)).join(', ')})`).join(', ')}의 ${nums[ch.pl.length]} 가지가 가능하다. 경우를 나누어 본다.`, k: 'split' });
    } else {
      const allowed = ch.pl.map((pl) => pl[0][1]);
      const ex = free(st).filter((q) => !allowed.includes(q));
      lines.push({ ind: 0, h: `${J(ch.x, '이/가')} 올 수 있는 ${J(opt.word, '을/를')} 따져 보면 다음과 같다.`, k: 'split' });
      for (const q of ex) { const c = blocker(st, ch.x, q), pw = partnerWhy(st, ch.x, q, c); lines.push({ ind: 1, h: `${atS(q)}: 조건 ${lb(c)}에 어긋난다.${pw ? ` (${pw})` : ''}` }); }
      lines.push({ ind: 0, h: `따라서 ${J(ch.x, '은/는')} ${allowed.map(atS).join(', ')} 중 하나이다. 경우를 나누어 본다.`, k: 'split' });
    }
    let solved = null, nSolved = 0;
    for (let i = 0; i < ch.pl.length; i++) {
      const s2 = clone(st);
      let bad = false;
      for (const [x, p] of ch.pl[i]) { if (s2.occ[p]) bad = true; fix(s2, x, p); }
      if (bad) return null;
      lines.push({ ind: 0, h: `[경우 ${i + 1}] ${plText(ch.pl[i])}인 경우`, k: 'case' });
      const res = propagate(s2, lines, 1);
      if (res === 'stuck') return null;
      if (res === 'solved') { nSolved++; solved = s2; lines.push({ ind: 1, h: `<b>모든 조건을 만족한다.</b> (${opt.show(arr(s2.pos))})`, k: 'ok' }); }
    }
    if (nSolved !== 1) return null;
    return { lines, cases: ch.pl.length, pre, arrangement: arr(solved.pos) };
  };

  /* ---------- registry helpers ---------- */
  P.addGen = function (subject, id, label, w, fn, leveled) { (P.gens[subject] = P.gens[subject] || []).push({ id, label, w, fn, leveled: !!leveled }); };
  P.addBank = function (subject, items) {
    const list = (P.bank[subject] = P.bank[subject] || []);
    for (const q of items) {
      q.subject = subject; q.src = q.exam ? 'exam' : 'bank';
      if (!P.check(q)) { if (P.debug) throw new Error('bank item failed check: ' + q.id); continue; }
      if (list.some((x) => x.id === q.id)) { if (P.debug) throw new Error('duplicate bank id: ' + q.id); continue; }
      list.push(q);
    }
  };

  /* run one generator with retries; the id encodes generator + seed so a question can be recreated */
  P.LEVELS = ['', '기본', '실전', '심화'];
  P.make = function (subject, gen, seed, lv) {
    const level = lv === 1 || lv === 3 ? lv : 2;
    for (let k = 0; k < 40; k++) {
      const s = (seed + k * 2654435761) >>> 0;
      let q = null;
      try { q = gen.fn(P.rng(s), level); } catch (e) { q = null; if (P.debug) throw e; }
      if (q && P.check(q)) { q.id = `${gen.id}:${s}${level === 2 ? '' : ':' + level}`; q.subject = subject; q.type = gen.label; q.src = 'gen'; q.lv = gen.leveled ? level : 0; return q; }
    }
    return null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
