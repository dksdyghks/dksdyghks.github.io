/* 송공 — 상황판단: 법조문 · 일정 · 기한 · 요금 · 선발 · 리그전 · 자리 배치 · 지원금 (generated; every answer computed) */
(function (G) {
  'use strict';
  const P = G.PSAT;
  const { josa, CIRC, esc, fmt, D } = P;
  const top = (n) => josa(n, '은/는');
  const NAMES = ['甲', '乙', '丙', '丁', '戊'];
  const pickYear = (r) => r.int(2026, 2031);

  /* ======================= 법조문 ======================= */
  /* Each template returns {law (html), situation, pool: [{text, truth, why}]}; the question takes 1 true + 4 false or 4 true + 1 false */
  function lawFacility(r) {
    const d1 = r.pick([5, 7, 10, 14]), d2 = r.pick([2, 3, 5]), rr = r.pick([50, 60, 70, 80]);
    const fee = r.pick([200000, 300000, 450000, 600000, 800000]);
    const y = pickYear(r), m = r.int(3, 11), dd = r.int(8, 26);
    const use = D.make(y, m, dd);
    const dl = D.add(use, -d1), cancelDl = D.add(use, -d2);
    const law = `<p><b>제1조(사용허가)</b> ① 공공시설을 사용하려는 자는 사용일 ${d1}일 전까지 시장에게 사용허가를 신청하여야 한다.<br>② 시장은 다음 각 호의 어느 하나에 해당하는 경우에는 사용허가를 하지 아니할 수 있다.<br>1. 공공질서를 해칠 우려가 있는 경우<br>2. 시설의 보존에 지장을 줄 우려가 있는 경우</p>`
      + `<p><b>제2조(사용료)</b> ① 사용허가를 받은 자는 사용일 전날까지 사용료를 납부하여야 한다.<br>② 다음 각 호의 어느 하나에 해당하는 경우에는 사용료를 면제한다.<br>1. 국가나 지방자치단체가 공용으로 사용하는 경우<br>2. 비영리법인이 공익 목적으로 사용하는 경우로서 시장이 인정하는 경우</p>`
      + `<p><b>제3조(사용료의 반환)</b> 이미 납부한 사용료는 반환하지 아니한다. 다만, 다음 각 호의 경우에는 해당 금액을 반환한다.<br>1. 사용자의 책임 없는 사유로 사용하지 못한 경우: 사용료 전액<br>2. 사용자가 사용일 ${d2}일 전까지 사용 취소를 신청한 경우: 사용료의 100분의 ${rr}</p>`;
    const sit = `甲은 ${D.ymd(use)}에 공공시설을 사용하려고 한다. 사용료는 ${fmt(fee)}원이다.`;
    const early = D.add(dl, -r.int(0, 3)), late = D.add(dl, r.int(1, 3));
    const cOk = D.add(cancelDl, -r.int(0, 2)), cLate = D.add(cancelDl, r.int(1, Math.max(1, d2 - 1)));
    const part = fee * rr / 100;
    const appRule = `제1조 제1항에 따라 사용일 ${d1}일 전까지 신청해야 한다. 사용일 ${D.md(use)}에서 ${d1}일을 빼면 ${D.md(dl)}이므로 신청 기한은 ${D.md(dl)}이다.`;
    const cancelRule = `제3조 제2호에 따라 사용일 ${d2}일 전까지 취소를 신청해야 사용료의 100분의 ${rr}을 돌려받는다. 사용일 ${D.md(use)}에서 ${d2}일을 빼면 ${D.md(cancelDl)}이므로 취소 기한은 ${D.md(cancelDl)}이다.`;
    const pool = [
      { text: `甲은 ${D.md(early)}에 사용허가를 신청할 수 있다.`, truth: true, why: `${appRule} ${top(D.md(early))} ${P.D.same(early, dl) ? '바로 그 기한 당일이다(‘까지’는 그날을 포함한다).' : '기한 전이다.'}` },
      { text: `甲은 ${D.md(late)}에 사용허가를 신청하여도 된다.`, truth: false, why: `${appRule} ${top(D.md(late))} 기한이 지난 뒤이다.` },
      { text: `사용료를 납부한 甲이 ${D.md(cOk)}에 사용 취소를 신청하면 ${fmt(part)}원을 돌려받는다.`, truth: true, why: `${cancelRule} ${top(D.md(cOk))} ${P.D.same(cOk, cancelDl) ? '기한 당일이므로' : '기한 전이므로'} 반환 대상이다. 반환액은 ${fmt(fee)}원 × 100분의 ${rr} = ${fmt(part)}원이다.` },
      { text: `사용료를 납부한 甲이 ${D.md(cLate)}에 사용 취소를 신청하면 ${fmt(part)}원을 돌려받는다.`, truth: false, why: `${cancelRule} ${top(D.md(cLate))} 기한이 지난 뒤이고, 사용자의 책임 없는 사유(제1호)도 아니므로 제3조 본문에 따라 반환받지 못한다.` },
      { text: `사용료를 납부한 甲이 폭우로 시설이 침수되어 사용하지 못하면 ${fmt(fee)}원을 돌려받는다.`, truth: true, why: `폭우로 인한 침수는 사용자의 책임 없는 사유이므로 제3조 제1호에 따라 사용료 전액 ${fmt(fee)}원을 돌려받는다.` },
      { text: `사용료를 납부한 甲이 폭우로 시설이 침수되어 사용하지 못하면 ${fmt(part)}원만 돌려받는다.`, truth: false, why: `사용자의 책임 없는 사유로 사용하지 못한 경우이므로 제3조 제1호에 따라 전액 ${fmt(fee)}원을 돌려받는다. 100분의 ${rr}만 돌려받는 것은 사용자가 스스로 취소한 경우(제2호)이다.` },
      { text: '시장은 공공질서를 해칠 우려가 있는 경우 반드시 사용허가를 하지 않아야 한다.', truth: false, why: '제1조 제2항은 “사용허가를 하지 아니할 수 있다”고 규정한다. 허가 여부는 시장의 재량이므로 ‘반드시’ 거부해야 하는 것은 아니다.' },
      { text: '비영리법인이 공익 목적으로 사용하는 경우에는 시장의 인정이 없어도 사용료가 면제된다.', truth: false, why: '제2조 제2항 제2호는 비영리법인이 공익 목적으로 사용하는 경우 가운데 ‘시장이 인정하는 경우’에만 사용료를 면제한다.' },
      { text: '국가가 공용으로 사용하는 경우에는 사용료가 면제된다.', truth: true, why: '제2조 제2항 제1호는 국가나 지방자치단체가 공용으로 사용하는 경우 사용료를 면제한다고 규정한다.' },
      { text: '사용허가를 받은 자는 사용일 당일에 사용료를 납부하여도 된다.', truth: false, why: '제2조 제1항에 따라 사용료는 사용일 ‘전날까지’ 납부하여야 하므로 당일 납부는 허용되지 않는다.' },
    ];
    return { type: '상황판단 · 법조문', law, sit, pool, note: '※ ‘n일 전’은 해당 날짜에서 n일을 뺀 날을 말하며, ‘까지’는 그날을 포함한다.' };
  }
  function lawInfo(r) {
    const d = r.pick([7, 10, 14]), e = r.pick([7, 10, 15]);
    const y = pickYear(r), m = r.int(2, 11), dd = r.int(3, 20);
    const req = D.make(y, m, dd);
    const due = D.add(req, d), ext = D.add(due, e);
    const law = `<p><b>제1조(정보공개 청구)</b> 누구든지 공공기관에 정보의 공개를 청구할 수 있다.</p>`
      + `<p><b>제2조(공개 여부의 결정)</b> ① 공공기관은 청구를 받은 날부터 ${d}일 이내에 공개 여부를 결정하여야 한다.<br>② 부득이한 사유로 제1항의 기간 이내에 결정할 수 없을 때에는 그 기간이 끝나는 날의 다음 날부터 기산하여 ${e}일의 범위에서 한 차례 연장할 수 있다. 이 경우 연장 사실과 사유를 청구인에게 지체 없이 문서로 통지하여야 한다.</p>`
      + `<p><b>제3조(비공개 대상)</b> 공공기관은 다음 각 호의 정보를 공개하지 아니할 수 있다.<br>1. 다른 법률에서 비밀로 정한 정보<br>2. 공개될 경우 개인의 사생활을 침해할 우려가 있는 정보</p>`
      + `<p><b>제4조(비용 부담)</b> ① 정보 공개에 드는 비용은 청구인이 부담한다.<br>② 공개를 청구한 정보의 사용 목적이 공공복리의 유지·증진을 위하여 필요하다고 인정되는 경우에는 제1항의 비용을 감면할 수 있다.</p>`;
    const sit = `甲은 ${D.ymd(req)}에 A공공기관에 정보의 공개를 청구하였다.`;
    const day1 = D.add(req, 1), late1 = D.add(due, r.int(1, 3)), late2 = D.add(ext, r.int(1, 4));
    const dueWhy = `제2조 제1항과 ※에 따라 청구를 받은 다음 날인 ${D.md(day1)}을 1일째로 세면 ${d}일째 되는 날은 ${D.md(due)}이다.`;
    const extWhy = `제2조 제2항에 따라 기간이 끝나는 날(${D.md(due)})의 다음 날부터 ${e}일의 범위에서 한 차례 연장할 수 있다. ${D.md(D.add(due, 1))}을 1일째로 세면 ${e}일째 되는 날은 ${D.md(ext)}이다.`;
    const pool = [
      { text: `A공공기관이 기간을 연장하지 않는다면 ${D.md(due)}까지 공개 여부를 결정하여야 한다.`, truth: true, why: `${dueWhy} 따라서 연장하지 않으면 ${D.md(due)}까지 결정하여야 한다.` },
      { text: `부득이한 사유가 없다면 A공공기관은 ${D.md(late1)}까지 공개 여부를 결정하면 된다.`, truth: false, why: `${dueWhy} 부득이한 사유가 없으면 연장할 수 없으므로 기한은 ${D.md(due)}이고, ${top(D.md(late1))} 이를 넘긴다.` },
      { text: `기간을 연장하더라도 A공공기관은 늦어도 ${D.md(ext)}까지는 공개 여부를 결정하여야 한다.`, truth: true, why: `${extWhy} 따라서 ${josa(D.md(ext), '이/가')} 가장 늦은 기한이다.` },
      { text: `기간을 연장하면 A공공기관은 ${D.md(late2)}까지 공개 여부를 결정할 수 있다.`, truth: false, why: `${extWhy} 연장하더라도 ${josa(D.md(ext), '을/를')} 넘을 수 없으므로 ${D.md(late2)}까지 미룰 수는 없다.` },
      { text: 'A공공기관은 결정 기간을 두 차례 연장할 수 있다.', truth: false, why: '제2조 제2항은 ‘한 차례’ 연장할 수 있다고 규정한다.' },
      { text: '기간을 연장하는 경우 A공공기관은 그 사실과 사유를 甲에게 구두로 알리면 된다.', truth: false, why: '제2조 제2항 후단에 따라 연장 사실과 사유는 지체 없이 ‘문서로’ 통지하여야 한다.' },
      { text: '기간을 연장하는 경우 A공공기관은 그 사실과 사유를 甲에게 문서로 알려야 한다.', truth: true, why: '제2조 제2항 후단은 연장 사실과 사유를 청구인에게 지체 없이 문서로 통지하도록 규정한다.' },
      { text: '개인의 사생활을 침해할 우려가 있는 정보는 반드시 공개하지 않아야 한다.', truth: false, why: '제3조는 “공개하지 아니할 수 있다”고 규정한다. 비공개 여부는 공공기관의 재량이므로 ‘반드시’ 비공개해야 하는 것은 아니다.' },
      { text: '정보 공개에 드는 비용은 원칙적으로 공공기관이 부담한다.', truth: false, why: '제4조 제1항에 따라 정보 공개에 드는 비용은 청구인이 부담한다.' },
      { text: '정보의 사용 목적이 공공복리의 유지·증진을 위하여 필요하다고 인정되면 비용을 감면할 수 있다.', truth: true, why: '제4조 제2항이 그대로 규정하는 내용이다.' },
    ];
    return { type: '상황판단 · 법조문', law, sit, pool, note: '※ 기간은 청구를 받은 날의 다음 날부터 계산한다.' };
  }
  function lawSubsidy(r) {
    const yrs = r.pick([2, 3]), rr = r.pick([30, 50, 70]), mult = r.pick([2, 3]);
    const amt = r.pick([1000, 1500, 2000, 3000]);
    const inMonths = r.int(4, yrs * 12 - 4), outMonths = yrs * 12 + r.int(2, 10);
    const misuse = r.pick([200, 300, 400, 500]);
    const part = amt * rr / 100;
    const law = `<p><b>제1조(보조금의 환수)</b> ① 시장은 보조금을 받은 자가 다음 각 호의 어느 하나에 해당하면 해당 금액을 환수하여야 한다.<br>1. 거짓이나 그 밖의 부정한 방법으로 보조금을 받은 경우: 보조금 전액<br>2. 보조금을 받은 날부터 ${yrs}년 이내에 폐업한 경우: 보조금의 100분의 ${rr}<br>3. 보조금을 지급 목적 외의 용도로 사용한 경우: 목적 외로 사용한 금액</p>`
      + `<p>② 시장은 제1항 제1호에 해당하는 자에게 환수 금액의 ${mult}배 이내의 제재부가금을 부과할 수 있다.</p>`;
    const sit = `甲은 A시로부터 창업 보조금 ${fmt(amt)}만 원을 받았다.`;
    const mo = (n) => (n % 12 === 0 ? `${n / 12}년` : n < 12 ? `${n}개월` : `${Math.floor(n / 12)}년 ${n % 12}개월`);
    const pool = [
      { text: `甲이 보조금을 받은 지 ${mo(inMonths)} 만에 폐업하면 A시는 ${fmt(part)}만 원을 환수하여야 한다.`, truth: true, why: `제1조 제1항 제2호에 따라 보조금을 받은 날부터 ${yrs}년 이내에 폐업하면 보조금의 100분의 ${rr}을 환수한다. ${top(mo(inMonths))} ${yrs}년 이내이므로 ${fmt(amt)}만 원 × 100분의 ${rr} = ${fmt(part)}만 원을 환수하여야 한다.` },
      { text: `甲이 보조금을 받은 지 ${mo(outMonths)} 만에 폐업하면 A시는 ${fmt(part)}만 원을 환수하여야 한다.`, truth: false, why: `제1조 제1항 제2호의 환수 사유는 보조금을 받은 날부터 ${yrs}년 이내의 폐업이다. ${top(mo(outMonths))} ${yrs}년이 지난 뒤이므로 이 사유로 환수하지 않는다.` },
      { text: `甲이 보조금 중 ${fmt(misuse)}만 원을 지급 목적 외의 용도로 사용하면 A시는 ${fmt(misuse)}만 원을 환수하여야 한다.`, truth: true, why: `제1조 제1항 제3호에 따라 목적 외로 사용한 금액, 즉 ${fmt(misuse)}만 원을 환수하여야 한다.` },
      { text: `甲이 보조금 중 ${fmt(misuse)}만 원을 지급 목적 외의 용도로 사용하면 A시는 ${fmt(amt)}만 원 전액을 환수하여야 한다.`, truth: false, why: `제1조 제1항 제3호의 환수 금액은 ‘목적 외로 사용한 금액’인 ${fmt(misuse)}만 원이다. 전액 환수는 부정한 방법으로 받은 경우(제1호)이다.` },
      { text: '甲이 부정한 방법으로 보조금을 받았다면 A시는 보조금 전액을 환수하여야 한다.', truth: true, why: `제1조 제1항 제1호에 따라 부정한 방법으로 받은 경우에는 보조금 전액(${fmt(amt)}만 원)을 환수하여야 한다.` },
      { text: '甲이 부정한 방법으로 보조금을 받았다면 A시는 반드시 제재부가금을 부과하여야 한다.', truth: false, why: '제1조 제2항은 제재부가금을 “부과할 수 있다”고 규정하므로 부과 여부는 시장의 재량이다.' },
      { text: `甲이 부정한 방법으로 보조금을 받았다면 A시는 최대 ${fmt(amt * mult)}만 원의 제재부가금을 부과할 수 있다.`, truth: true, why: `부정 수급이면 제1조 제1항 제1호에 따라 전액 ${fmt(amt)}만 원을 환수하고, 제2항에 따라 그 ${mult}배인 ${fmt(amt * mult)}만 원 이내에서 제재부가금을 부과할 수 있다.` },
      { text: `甲이 부정한 방법으로 보조금을 받았다면 A시는 ${fmt(amt * (mult + 1))}만 원의 제재부가금을 부과할 수 있다.`, truth: false, why: `제재부가금의 한도는 환수 금액 ${fmt(amt)}만 원의 ${mult}배인 ${fmt(amt * mult)}만 원이다. ${fmt(amt * (mult + 1))}만 원은 한도를 넘는다.` },
      { text: `甲이 부정한 방법으로 보조금을 받았다면 A시는 ${fmt(part)}만 원만 환수하면 된다.`, truth: false, why: `부정한 방법으로 받은 경우는 제1조 제1항 제1호에 따라 보조금 전액(${fmt(amt)}만 원)을 환수하여야 한다.` },
    ];
    return { type: '상황판단 · 법조문', law, sit, pool, note: '' };
  }
  /* 위원회: 제척된 위원은 그 안건의 재적에서 빠진다는 점이 정족수를 바꾼다 (재적 짝수일 때만 차이가 난다) */
  function lawCommittee(r) {
    const R = r.pick([8, 10, 12]);
    const term = r.pick([2, 3]);
    const [fn, fd, ft] = r.pick([[1, 3, '3분의 1'], [1, 4, '4분의 1']]);
    const callMin = Math.ceil((R * fn) / fd);
    const Rx = R - 1, quorumX = Math.floor(Rx / 2) + 1, quorumAll = Math.floor(R / 2) + 1;
    const att = r.int(quorumX, Rx);
    const yes = r.int(Math.max(1, Math.floor(att / 2) - 1), Math.min(att, Math.floor(att / 2) + 2));
    const no = att - yes, passed = yes * 2 > att, tie = yes * 2 === att;
    const law = `<p><b>제1조(구성)</b> ① 위원회는 위원장 1명을 포함한 ${R}명의 위원으로 구성한다.<br>② 위원의 임기는 ${term}년으로 하되, 한 차례만 연임할 수 있다.</p>`
      + `<p><b>제2조(회의)</b> ① 위원회의 회의는 위원장이 소집한다. 다만, 재적위원 ${ft} 이상이 요구하는 경우에는 위원장은 지체 없이 회의를 소집하여야 한다.<br>② 위원회는 재적위원 과반수의 출석으로 개의하고, 출석위원 과반수의 찬성으로 의결한다.<br>③ 위원장은 표결권을 가지며, 가부동수인 경우에는 부결된 것으로 본다.</p>`
      + `<p><b>제3조(제척)</b> 위원은 자기와 이해관계가 있는 안건의 심의·의결에 참여할 수 없다. 이 경우 그 위원은 해당 안건에 관하여 재적위원 수에 산입하지 아니한다.</p>`;
    const sit = `A위원회는 위원장을 포함한 ${R}명의 위원으로 구성되어 있다. 안건 X를 심의하는 회의에서 위원 甲은 안건 X와 이해관계가 있어 참여하지 않았고, 나머지 위원 중 ${att}명이 출석하였다. 표결 결과 찬성 ${yes}명, 반대 ${no}명이었다.`;
    const callVal = (R * fn) / fd;
    const callWhy = Number.isInteger(callVal)
      ? `제2조 제1항 단서에 따라 재적위원 ${R}명의 ${ft}인 ${callVal}명 이상이 요구하면 위원장은 지체 없이 소집하여야 한다.`
      : `제2조 제1항 단서에 따라 재적위원 ${R}명의 ${ft}은 약 ${fmt(callVal, 1)}명이므로, 이를 넘는 가장 작은 인원인 ${callMin}명 이상이 요구하면 위원장은 지체 없이 소집하여야 한다.`;
    const quorumWhy = `제3조 후단에 따라 甲은 안건 X에 관하여 재적위원 수에 산입하지 않으므로 재적위원은 ${Rx}명이고, 개의하려면 그 과반수인 ${quorumX}명 이상이 출석해야 한다.`;
    const pool = [
      { text: `재적위원 ${callMin}명이 회의 소집을 요구하면 위원장은 지체 없이 회의를 소집하여야 한다.`, truth: true, why: callWhy },
      { text: `재적위원 ${callMin - 1}명이 회의 소집을 요구하면 위원장은 지체 없이 회의를 소집하여야 한다.`, truth: false, why: `${callWhy} ${callMin - 1}명으로는 부족하다.` },
      { text: `위원은 최장 ${term * 2}년까지 재임할 수 있다.`, truth: true, why: `제1조 제2항에 따라 임기 ${term}년에 한 차례만 연임할 수 있으므로 최장 ${term} + ${term} = ${term * 2}년이다.` },
      { text: `위원은 최장 ${term * 3}년까지 재임할 수 있다.`, truth: false, why: `연임은 한 차례만 가능하므로 최장 ${term * 2}년이다.` },
      { text: '안건 X는 가결되었다.', truth: passed, why: `제2조 제2항에 따라 출석위원 ${att}명의 과반수, 즉 ${Math.floor(att / 2) + 1}명 이상이 찬성해야 가결된다. 찬성은 ${yes}명이므로 ${passed ? '가결되었다' : '가결되지 않았다'}.${tie ? ' 찬성과 반대가 같은 가부동수이므로 제2조 제3항에 따라서도 부결된 것으로 본다.' : ''}` },
      { text: `안건 X를 심의하는 회의는 위원 ${quorumX}명이 출석하면 개의할 수 있다.`, truth: true, why: `${quorumWhy} (甲을 재적에 넣어 ${R}명으로 계산하면 ${quorumAll}명이 필요하다고 잘못 판단하게 된다.)` },
      { text: `안건 X를 심의하는 회의는 위원 ${quorumX - 1}명이 출석하면 개의할 수 있다.`, truth: false, why: `${quorumWhy} ${quorumX - 1}명으로는 개의할 수 없다.` },
      { text: '가부동수인 경우에는 위원장이 결정권을 가진다.', truth: false, why: '제2조 제3항에 따라 가부동수는 부결된 것으로 본다. 위원장은 표결권을 가질 뿐 결정권은 없다.' },
      { text: '위원장도 안건에 대한 표결권을 가진다.', truth: true, why: '제2조 제3항 전단이 그대로 규정하는 내용이다.' },
      { text: '안건과 이해관계가 있는 위원은 그 안건의 의결에는 참여할 수 없지만 심의에는 참여할 수 있다.', truth: false, why: '제3조에 따라 이해관계가 있는 위원은 그 안건의 ‘심의·의결’ 모두에 참여할 수 없다.' },
    ];
    return { type: '상황판단 · 법조문', law, sit, pool, note: '' };
  }
  /* 기탁금 반환: ‘이상’과 ‘미만’의 경계값, 선거일 전 사퇴 */
  function lawDeposit(r) {
    const dep = r.pick([1000, 1500, 2000]);
    const [full, half] = r.pick([[15, 10], [20, 10]]);
    const V = r.pick([100000, 120000, 160000, 200000, 250000]);
    const p2 = full === 15 ? r.pick([15, 15, 18, 22]) : r.pick([20, 20, 24]);
    const p3 = full === 15 ? r.pick([10, 10, 12, 13]) : r.pick([10, 10, 14, 17]);
    const p4 = r.int(4, 9);
    const p1 = 100 - p2 - p3 - p4;
    const v = (p) => (V * p) / 100;
    const back = (p, win) => (win || p >= full ? dep : p >= half ? dep / 2 : 0);
    const C = [['甲', p1, true], ['乙', p2, false], ['丙', p3, false], ['丁', p4, false]];
    const total = C.reduce((sum, [, p, w]) => sum + back(p, w), 0);
    const law = `<p><b>제1조(기탁금)</b> 후보자등록을 신청하는 사람은 기탁금 ${fmt(dep)}만 원을 납부하여야 한다.</p>`
      + `<p><b>제2조(기탁금의 반환)</b> ① 기탁금은 다음 각 호의 구분에 따른 금액을 선거일 후 30일 이내에 기탁자에게 반환한다.<br>1. 후보자가 당선되거나 유효투표총수의 100분의 ${full} 이상을 득표한 경우: 기탁금 전액<br>2. 후보자가 유효투표총수의 100분의 ${half} 이상 100분의 ${full} 미만을 득표한 경우: 기탁금의 100분의 50<br>② 제1항에도 불구하고 후보자가 선거일 전에 사퇴한 경우에는 기탁금을 반환하지 아니한다.</p>`;
    const sit = `A선거구에는 甲~戊 5명이 후보자로 등록하였고, 모두 기탁금을 납부하였다. 戊는 선거일 전에 사퇴하였다. 선거 결과 유효투표총수는 ${fmt(V)}표였으며, 甲 ${fmt(v(p1))}표(당선), 乙 ${fmt(v(p2))}표, 丙 ${fmt(v(p3))}표, 丁 ${fmt(v(p4))}표를 얻었다.`;
    const line = `유효투표총수 ${fmt(V)}표의 100분의 ${josa(String(full), '은/는')} ${fmt(v(full))}표, 100분의 ${josa(String(half), '은/는')} ${fmt(v(half))}표이다.`;
    const desc = (nm, p, w) => (w ? `${nm}은 당선되었으므로 전액` : p >= full ? `${nm}의 득표(${fmt(v(p))}표)는 ${fmt(v(full))}표 이상${p === full ? '(정확히 같으므로 ‘이상’에 포함)' : ''}이므로 전액` : p >= half ? `${nm}의 득표(${fmt(v(p))}표)는 ${fmt(v(half))}표 이상 ${fmt(v(full))}표 미만${p === half ? '(정확히 같으므로 ‘이상’에 포함)' : ''}이므로 100분의 50` : `${nm}의 득표(${fmt(v(p))}표)는 ${fmt(v(half))}표 미만이므로 반환 없음`);
    const half2 = `${fmt(dep / 2)}만 원`;
    const pool = [
      { text: `乙은 기탁금 전액을 반환받는다.`, truth: true, why: `${line} ${desc('乙', p2, false)}을 반환받는다.` },
      { text: `乙은 기탁금의 100분의 50만 반환받는다.`, truth: false, why: `${line} ${desc('乙', p2, false)}을 반환받는다.` },
      { text: `丙은 ${half2}을 반환받는다.`, truth: true, why: `${line} ${desc('丙', p3, false)}, 즉 ${half2}을 반환받는다.` },
      { text: '丙은 기탁금을 반환받지 못한다.', truth: false, why: `${line} ${desc('丙', p3, false)}을 반환받는다.` },
      { text: '丁은 기탁금을 반환받지 못한다.', truth: true, why: `${line} ${desc('丁', p4, false)}이다.` },
      { text: `丁은 ${half2}을 반환받는다.`, truth: false, why: `${line} ${desc('丁', p4, false)}이다.` },
      { text: '戊는 기탁금을 반환받지 못한다.', truth: true, why: '戊는 선거일 전에 사퇴하였으므로 제2조 제2항에 따라 반환받지 못한다.' },
      { text: '戊는 득표가 없으므로 기탁금의 100분의 50만 반환받는다.', truth: false, why: '선거일 전에 사퇴한 후보자에게는 제2조 제2항에 따라 기탁금을 반환하지 않는다.' },
      { text: `후보자들이 반환받는 기탁금의 합은 ${fmt(total)}만 원이다.`, truth: true, why: `甲 ${fmt(dep)} + 乙 ${fmt(back(p2))} + 丙 ${fmt(back(p3))} + 丁 ${fmt(back(p4))} + 戊 0 = ${fmt(total)}만 원이다.` },
      { text: `후보자들이 반환받는 기탁금의 합은 ${fmt(total + dep / 2)}만 원이다.`, truth: false, why: `甲 ${fmt(dep)} + 乙 ${fmt(back(p2))} + 丙 ${fmt(back(p3))} + 丁 ${fmt(back(p4))} + 戊 0 = ${fmt(total)}만 원이다.` },
    ];
    return { type: '상황판단 · 법조문', law, sit, pool, note: '' };
  }
  /* 이의신청 기간: ‘안 날부터’와 ‘있은 날부터’ 두 기한 중 먼저 끝나는 날이 마감이다 */
  function lawAppeal(r) {
    const [a, b] = r.pick([[30, 90], [60, 180], [90, 180], [30, 180]]);
    const y = pickYear(r);
    const d0 = D.make(y, r.int(1, 5), r.int(1, 28));
    const k = r.chance(0.5) ? r.int(1, b - a - 1) : r.int(b - a + 1, b - 1);   // 안 날: 처분 후 k일
    const d1 = D.add(d0, k);
    const byKnow = D.add(d1, a), byAct = D.add(d0, b);
    const last = byKnow < byAct ? byKnow : byAct, bind = byKnow < byAct ? 'know' : 'act';
    const s = D.add(d1, r.int(1, Math.max(1, Math.round((last - d1) / 86400000) - 1)));   // 甲이 실제로 신청한 날(기한 안)
    const dec = D.add(s, 30), decExt = D.add(s, 60);
    const law = `<p><b>제1조(이의신청)</b> ① 처분에 이의가 있는 자는 처분이 있음을 안 날부터 ${a}일 이내에 처분청에 이의신청을 하여야 한다.<br>② 처분이 있은 날부터 ${b}일이 지나면 제1항에도 불구하고 이의신청을 할 수 없다.</p>`
      + `<p><b>제2조(결정)</b> ① 처분청은 이의신청을 받은 날부터 30일 이내에 결정하여야 한다.<br>② 부득이한 사유로 제1항의 기간 이내에 결정할 수 없을 때에는 30일의 범위에서 한 차례 연장할 수 있다.</p>`;
    const sit = `A시는 ${D.ymd(d0)}에 甲에게 영업정지 처분을 하였고, 甲은 ${D.md(d1)}에 처분이 있음을 알았다. 甲은 ${D.md(s)}에 이의신청을 하였다.`;
    const lastWhy = `처분이 있음을 안 날(${D.md(d1)})부터 ${a}일째는 ${D.md(byKnow)}, 처분이 있은 날(${D.md(d0)})부터 ${b}일째는 ${D.md(byAct)}이다. 두 기한 중 먼저 오는 ${josa(D.md(last), '이/가')} 마지막 날이다.`;
    const late = D.add(last, r.int(1, 3));
    const pool = [
      { text: `甲은 ${D.md(last)}에도 이의신청을 할 수 있었다.`, truth: true, why: lastWhy },
      { text: `甲은 ${D.md(late)}에도 이의신청을 할 수 있었다.`, truth: false, why: `${lastWhy} ${top(D.md(late))} 그 뒤이다.` },
      bind === 'act'
        ? { text: `甲은 처분이 있음을 안 날부터 ${a}일째 되는 ${D.md(byKnow)}에도 이의신청을 할 수 있었다.`, truth: false, why: `${lastWhy} 처분이 있은 날부터 ${b}일이 먼저 지나므로 제1조 제2항에 따라 ${D.md(byKnow)}에는 신청할 수 없다.` }
        : { text: `甲은 처분이 있은 날부터 ${b}일째 되는 ${D.md(byAct)}에도 이의신청을 할 수 있었다.`, truth: false, why: `${lastWhy} 처분이 있음을 안 날부터 ${a}일이 먼저 지나므로 제1조 제1항에 따라 ${D.md(byAct)}에는 신청할 수 없다.` },
      { text: `A시가 결정 기간을 연장하지 않는다면 ${D.md(dec)}까지 결정하여야 한다.`, truth: true, why: `제2조 제1항에 따라 이의신청을 받은 ${D.md(s)}부터 30일째 되는 ${D.md(dec)}까지 결정하여야 한다(※ 첫날은 넣지 않는다).` },
      { text: `A시가 결정 기간을 연장하지 않는다면 ${D.md(D.add(dec, r.int(1, 5)))}까지 결정하면 된다.`, truth: false, why: `연장하지 않으면 기한은 ${D.md(s)}부터 30일째인 ${D.md(dec)}이다.` },
      { text: `A시가 결정 기간을 연장하더라도 ${D.md(D.add(decExt, r.int(1, 6)))}까지 결정을 미룰 수는 없다.`, truth: true, why: `연장은 30일의 범위에서 한 차례만 가능하므로 가장 늦은 기한은 ${D.md(dec)}에서 30일 뒤인 ${D.md(decExt)}이다. 그보다 뒤로는 미룰 수 없다.` },
      { text: 'A시는 결정 기간을 두 차례 연장할 수 있다.', truth: false, why: '제2조 제2항에 따라 연장은 한 차례만 할 수 있다.' },
      { text: `甲이 ${D.md(s)}에 한 이의신청은 기간 안에 한 것이다.`, truth: true, why: `${lastWhy} ${top(D.md(s))} 그 전이므로 기간 안이다.` },
      { text: `甲이 이의신청을 할 수 있는 기간은 ${D.md(d0)}부터 계산한다.`, truth: false, why: `제1조 제1항의 기간은 처분이 있음을 ‘안 날’(${D.md(d1)})부터, 제2항의 기간은 처분이 ‘있은 날’(${D.md(d0)})부터 계산한다. 두 기간을 모두 지켜야 한다.` },
    ];
    return { type: '상황판단 · 법조문', law, sit, pool, note: '※ 기간을 계산할 때에는 첫날을 넣지 않는다. 예컨대 ‘3월 1일부터 10일’의 마지막 날은 3월 11일이다.' };
  }
  function genLaw(r) {
    const L = r.pick([lawFacility, lawInfo, lawSubsidy, lawCommittee, lawDeposit, lawAppeal])(r);
    const pol = r.pick(['right', 'right', 'wrong']);
    const t = r.shuffle(L.pool.filter((x) => x.truth)), f = r.shuffle(L.pool.filter((x) => !x.truth));
    const sel = pol === 'right' ? [t[0], ...f.slice(0, 4)] : [f[0], ...t.slice(0, 4)];
    if (sel.length < 5 || sel.some((x) => !x)) return null;
    const key = sel[0];
    const opts = r.shuffle(sel);
    const answer = opts.indexOf(key);
    return {
      type: L.type,
      stem: `다음 글과 <상황>을 근거로 판단할 때 ${pol === 'right' ? '옳은' : '옳지 않은'} 것은?`,
      body: [{ t: 'law', h: L.law + (L.note ? `<p class="lawnote">${L.note}</p>` : '') }, { t: 'box', title: '상황', items: [esc(L.sit)], plain: true }],
      options: opts.map((x) => esc(x.text)), answer,
      explain: [{ t: 'ox', items: opts.map((x) => ({ ok: x.truth, v: x.truth ? '옳다' : '옳지 않다', why: esc(x.why) })) }],
    };
  }

  /* ======================= 일정: N번째 강좌일 ======================= */
  const PATTERNS = [{ d: [2, 4], t: '화요일과 목요일' }, { d: [1, 3], t: '월요일과 수요일' }, { d: [1, 3, 5], t: '월요일·수요일·금요일' }, { d: [3, 5], t: '수요일과 금요일' }, { d: [2, 5], t: '화요일과 금요일' }];
  function genSessions(r) {
    const y = pickYear(r), m = r.int(3, 9);
    const pat = r.pick(PATTERNS);
    const N = r.int(12, 22);
    const start = D.make(y, m, 1);
    const regular = []; let cur = start;
    while (regular.length < N + 12) { if (pat.d.includes(D.wd(cur))) regular.push(cur); cur = D.add(cur, 1); }
    const nClose = r.int(1, 3);
    const closes = r.sample(regular.slice(1, N), nClose).sort((a, b) => a - b);
    const isClose = (x) => closes.some((c) => D.same(c, x));
    const sessions = regular.filter((x) => !isClose(x)).slice(0, N);
    const ans = sessions[N - 1];
    const naive = regular[N - 1];
    const after = regular.filter((x) => !isClose(x));
    const traps = [naive, after[N - 2], after[N], regular[N - 1 + nClose + 1]];
    const fill = after.slice(Math.max(0, N - 6), N + 6);
    const dop = P.dateOptions(r, ans, traps, fill);
    if (!dop) return null;
    const { opts, answer } = dop;
    const byMonth = {}; let k = 0;
    for (const x of regular) { if (k >= N) break; const key = `${x.getUTCMonth() + 1}월`; const tag = isClose(x) ? `${x.getUTCDate()}일(휴강)` : `${x.getUTCDate()}일(${++k})`; (byMonth[key] = byMonth[key] || []).push(tag); }
    return {
      type: '상황판단 · 일정',
      stem: `다음 글을 근거로 판단할 때, ${N}번째 강좌가 열리는 날은?`,
      body: [{ t: 'passage', h: `<p>A문화센터의 강좌는 ${y}년 ${m}월 1일 이후 매주 ${pat.t}에 열린다. 강좌는 ${m}월 1일 이후 처음 열리는 날부터 시작하여 총 ${N}회 열리며, 휴강일에는 열리지 않고 그 회차는 다음 강좌일로 미뤄진다.</p><p>휴강일은 ${closes.map((c) => D.mdw(c)).join(', ')}이며, 휴강일이 아니면 공휴일에도 강좌가 열린다.</p><p>※ ${y}년 ${m}월 1일은 ${D.wdName(start)}요일이다.</p>` }],
      options: opts.map((x) => D.mdw(x)), answer,
      explain: [
        { t: 'p', h: `강좌일을 차례로 세면 다음과 같다(괄호 안은 회차).` },
        { t: 'list', items: Object.entries(byMonth).map(([mo, xs]) => `${mo}: ${xs.join(', ')}`) },
        { t: 'p', h: `따라서 ${N}번째 강좌는 <b>${D.mdw(ans)}</b>에 열린다. 휴강일을 고려하지 않으면 ${D.mdw(naive)}로 잘못 계산하게 된다.` },
      ],
    };
  }

  /* ======================= 기한: 처리기간(평일만 산입) ======================= */
  function genDeadline(r) {
    const y = pickYear(r), m = r.int(1, 11), dd = r.int(2, 24);
    let rec = D.make(y, m, dd);
    while ([0, 6].includes(D.wd(rec))) rec = D.add(rec, 1);
    const n = r.pick([5, 7, 10, 14]);
    const span = []; let cur = D.add(rec, 1);
    while (span.length < n + 8) { if (![0, 6].includes(D.wd(cur))) span.push(cur); cur = D.add(cur, 1); }
    const hol = r.sample(span.slice(1, n), r.int(1, 2)).sort((a, b) => a - b);
    const isHol = (x) => hol.some((h) => D.same(h, x));
    const counted = []; cur = D.add(rec, 1);
    while (counted.length < n) { if (![0, 6].includes(D.wd(cur)) && !isHol(cur)) counted.push(cur); cur = D.add(cur, 1); }
    const ans = counted[n - 1];
    const calendar = D.add(rec, n);
    const noHol = span[n - 1];
    const inclFirst = (() => { const c = [rec]; let x = D.add(rec, 1); while (c.length < n) { if (![0, 6].includes(D.wd(x)) && !isHol(x)) c.push(x); x = D.add(x, 1); } return c[n - 1]; })();
    const weekdays = []; for (let x = D.add(ans, -9); x <= D.add(ans, 9); x = D.add(x, 1)) if (![0, 6].includes(D.wd(x)) && !isHol(x)) weekdays.push(x);
    const dop = P.dateOptions(r, ans, [calendar, noHol, inclFirst].filter((x) => ![0, 6].includes(D.wd(x))), weekdays);
    if (!dop) return null;
    const opts = dop.opts;
    return {
      type: '상황판단 · 기한',
      stem: '다음 글을 근거로 판단할 때, 甲의 민원이 늦어도 처리되어야 하는 날은?',
      body: [{ t: 'passage', h: `<p>A기관은 민원을 접수한 날의 다음 날부터 계산하여 ${n}일 이내에 처리하여야 한다. 이때 토요일·일요일과 A기관의 휴무일은 기간에 산입하지 않는다.</p><p>甲은 ${D.ymd(rec)}(${D.wdName(rec)})에 민원을 접수하였다. 이 기간 중 A기관의 휴무일은 ${hol.map((h) => D.mdw(h)).join(', ')}이며, 그 밖의 휴일은 고려하지 않는다.</p>` }],
      options: opts.map((x) => D.mdw(x)), answer: dop.answer,
      explain: [
        { t: 'p', h: `접수 다음 날부터 토·일요일과 휴무일을 빼고 세면 다음과 같다.` },
        { t: 'list', items: [counted.map((x, i) => `${i + 1}일째 ${D.mdw(x)}`).join(', ')] },
        { t: 'p', h: `따라서 처리 기한은 <b>${D.mdw(ans)}</b>이다. 달력상 ${n}일을 더하면 ${D.mdw(calendar)}, 휴무일을 빼지 않으면 ${josa(D.mdw(noHol), '이/가')} 되어 틀린다.` },
      ],
    };
  }

  /* ======================= 요금제 비교 ======================= */
  function genPlans(r) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const useMin = r.int(15, 40) * 10, useGB = r.int(5, 22);
      const plans = ['가', '나', '다', '라'].map((nm) => {
        const unlimitedCall = r.chance(0.35), unlimitedData = r.chance(0.2);
        return {
          nm, base: r.int(29, 66) * 1000,
          call: unlimitedCall ? Infinity : r.pick([100, 200, 300]), data: unlimitedData ? Infinity : r.pick([3, 5, 6, 8, 10, 12, 15]),
          perMin: r.pick([100, 120, 150, 200]), perGB: r.pick([2000, 2500, 3000, 4000, 5000]),
        };
      });
      const disc = r.pick(plans); disc.disc = r.pick([10, 20, 25, 30]);
      const cost = (p, withDisc) => p.base * (withDisc && p.disc ? (100 - p.disc) / 100 : 1) + Math.max(0, useMin - p.call) * p.perMin + Math.max(0, useGB - p.data) * p.perGB;
      const c = plans.map((p) => ({ p, v: cost(p, true), v0: cost(p, false) }));
      const s = c.slice().sort((a, b) => a.v - b.v);
      if (s[1].v - s[0].v < 500) continue;
      const s0 = c.slice().sort((a, b) => a.v0 - b.v0);
      const right = `${s[0].p.nm}, ${fmt(s[0].v)}원`;
      const pool = [right, `${s0[0].p.nm}, ${fmt(s0[0].v0)}원`, `${s[0].p.nm}, ${fmt(s[0].v0)}원`, `${s[1].p.nm}, ${fmt(s[1].v)}원`, `${s[2].p.nm}, ${fmt(s[2].v)}원`, `${s[0].p.nm}, ${fmt(s[0].v + 2000)}원`];
      const uniq = [...new Set(pool)];
      if (uniq.length < 5) continue;
      const opts = r.shuffle([right, ...r.shuffle(uniq.filter((x) => x !== right)).slice(0, 4)]);
      const cell = (x, u) => (x === Infinity ? '무제한' : `${x}${u}`);
      return {
        type: '상황판단 · 비용 계산',
        stem: '다음 글을 근거로 판단할 때, 甲이 선택할 요금제와 그 요금을 바르게 짝지은 것은?',
        body: [
          { t: 'passage', h: `<p>甲은 다음 달 통화 ${useMin}분, 데이터 ${useGB}GB를 사용할 예정이며, 월 요금이 가장 적은 요금제를 선택하려 한다. 기본 제공량을 넘으면 초과 요금이 부과된다.</p>` },
          { t: 'table', caption: '요금제별 조건', head: ['요금제', '기본료', '기본 제공(통화/데이터)', '초과 요금(1분/1GB)'], rows: plans.map((p) => [p.nm, `${fmt(p.base)}원`, `${cell(p.call, '분')} / ${cell(p.data, 'GB')}`, `${p.call === Infinity ? '—' : fmt(p.perMin) + '원'} / ${p.data === Infinity ? '—' : fmt(p.perGB) + '원'}`]) },
          { t: 'passage', h: `<p>※ ${disc.nm} 요금제는 인터넷 결합 시 기본료를 ${disc.disc}% 할인하며, 甲은 결합 조건을 충족한다.</p>` },
        ],
        options: opts.map((x) => x.replace(', ', ' — ')), answer: opts.indexOf(right),
        explain: [
          { t: 'table', head: ['요금제', '계산', '월 요금'], rows: c.map(({ p, v }) => [p.nm, `${fmt(p.base)}${p.disc ? `×${(100 - p.disc) / 100}` : ''}${p.call !== Infinity && useMin > p.call ? ` + ${useMin - p.call}분×${p.perMin}` : ''}${p.data !== Infinity && useGB > p.data ? ` + ${useGB - p.data}GB×${fmt(p.perGB)}` : ''}`, `${fmt(v)}원`]) },
          { t: 'p', h: `가장 저렴한 것은 <b>${s[0].p.nm} 요금제(${fmt(s[0].v)}원)</b>이다.${s0[0].p !== s[0].p ? ` 할인을 빠뜨리면 ${s0[0].p.nm} 요금제를 고르게 된다.` : ''}` },
        ],
      };
    }
    return null;
  }

  /* ======================= 선발 ======================= */
  function genSelect(r) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const [w1, w2] = r.pick([[40, 60], [50, 50], [60, 40], [30, 70]]);
      const cutOn = r.pick(['면접', '서류']); const cut = r.pick([60, 70]);
      const C = NAMES.map((nm) => ({ nm, a: r.int(55, 100), b: r.int(50, 100) }));
      C.forEach((c) => { c.s = (c.a * w1 + c.b * w2) / 100; c.out = (cutOn === '면접' ? c.b : c.a) < cut; });
      if (C.filter((c) => c.out).length !== 1) continue;
      if (new Set(C.map((c) => c.s)).size < 5) continue;
      const outC = C.find((c) => c.out);
      const ok = C.filter((c) => !c.out).sort((x, y) => y.s - x.s || y.b - x.b);
      if (ok[1].s === ok[2].s && ok[1].b === ok[2].b) continue;
      const all = C.slice().sort((x, y) => y.s - x.s || y.b - x.b);
      if (!all.slice(0, 2).includes(outC)) continue; // the cutoff must matter
      const pair = (x) => x.map((c) => c.nm).sort((p, q) => NAMES.indexOf(p) - NAMES.indexOf(q)).join(', ');
      const right = pair(ok.slice(0, 2));
      const plain = C.slice().sort((x, y) => (y.a + y.b) - (x.a + x.b));
      const traps = [pair(all.slice(0, 2)), pair(plain.slice(0, 2)), pair([outC, ok[0]]), pair([ok[0], ok[2]]), pair([ok[1], ok[2]])];
      const everyPair = []; for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) everyPair.push(`${NAMES[i]}, ${NAMES[j]}`);
      const uniq = [...new Set([...r.shuffle(traps), ...r.shuffle(everyPair)])].filter((x) => x !== right);
      const opts = r.shuffle([right, ...uniq.slice(0, 4)]);
      return {
        type: '상황판단 · 규칙 적용',
        stem: '다음 글을 근거로 판단할 때, 최종 합격자 2명을 바르게 짝지은 것은?',
        body: [
          { t: 'passage', h: `<p>A기관은 甲~戊 중 2명을 선발한다. 서류 점수와 면접 점수를 ${w1} : ${w2}의 비율로 가중 합산하여 총점이 높은 순으로 선발하되, ${cutOn} 점수가 ${cut}점 미만인 사람은 총점과 관계없이 선발하지 않는다. 총점이 같으면 면접 점수가 높은 사람을 선발한다.</p>` },
          { t: 'table', caption: '지원자별 점수', unit: '(단위: 점)', head: ['지원자', '서류', '면접'], rows: C.map((c) => [c.nm, `${c.a}`, `${c.b}`]), num: true },
        ],
        options: opts, answer: opts.indexOf(right),
        explain: [
          { t: 'table', head: ['지원자', '총점', '비고'], rows: C.map((c) => [c.nm, fmt(c.s, 1), c.out ? `${cutOn} ${cut}점 미만 — 선발 제외` : '']), num: true },
          { t: 'p', h: `${outC.nm}의 총점(${fmt(outC.s, 1)})은 높지만 ${cutOn} 점수가 ${cut}점 미만이므로 제외된다. 나머지 중 총점 상위 2명은 <b>${right}</b>이다.` },
        ],
      };
    }
    return null;
  }

  /* ======================= 리그전 ======================= */
  // a team's record (승·무·패) in one full set of results, and every record its points allow
  const recText = (w, d, l) => [w ? `${w}승` : '', d ? `${d}무` : '', l ? `${l}패` : ''].filter(Boolean).join(' ');
  function recordsOfPts(p) { const out = []; for (let w = 0; w <= 3; w++) for (let d = 0; d + w <= 3; d++) if (3 * w + d === p) out.push(recText(w, d, 3 - w - d)); return out; }
  // all 729 result sets of a 4-team round robin, grouped by the final points they produce
  const LEAGUE = (() => {
    const T = ['A', 'B', 'C', 'D'];
    const games = [['A', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D'], ['C', 'D']];
    const ptsOf = (res) => { const p = { A: 0, B: 0, C: 0, D: 0 }; games.forEach(([x, y], i) => { if (res[i] === 'W') p[x] += 3; else if (res[i] === 'L') p[y] += 3; else { p[x] += 1; p[y] += 1; } }); return p; };
    const byKey = new Map();
    for (let m = 0; m < 729; m++) {
      const res = []; let x = m; for (let i = 0; i < 6; i++) { res.push('WDL'[x % 3]); x = Math.floor(x / 3); }
      const p = ptsOf(res), k = T.map((t) => p[t]).join(',');
      if (!byKey.has(k)) byKey.set(k, { pts: p, cons: [] });
      byKey.get(k).cons.push(res);
    }
    const classes = Array.from(byKey.values()).map((c) => ({ ...c, distinct: new Set(Object.values(c.pts)).size === 4 }));
    return { T, games, classes };
  })();
  function genLeague(r, lv) {
    const { T, games, classes } = LEAGUE;
    const recOf = (o, t) => { let w = 0, d = 0, l = 0; games.forEach(([x, y], i) => { if (x !== t && y !== t) return; const res = o[i]; if (res === 'D') d++; else if ((res === 'W') === (x === t)) w++; else l++; }); return recText(w, d, l); };
    // 기본: every team's points differ (the results are then always unique); 실전: at most two result sets; 심화: two to four
    const pool = classes.filter((c) => (lv === 1 ? c.distinct : lv === 3 ? c.cons.length >= 2 && c.cons.length <= 4 : c.cons.length <= 2));
    for (let attempt = 0; attempt < 80; attempt++) {
      const cls = r.pick(pool);
      const pts = cls.pts, cons = cls.cons, vals = Object.values(pts);
      if (P.sum(vals) === 18 && lv !== 1 && r.chance(0.7)) continue; // a league with no draw is the easiest kind
      const facts = [];
      games.forEach(([x, y], i) => {
        facts.push({ text: `${top(x)} ${josa(y, '을/를')} 이겼다.`, f: (o) => o[i] === 'W' });
        facts.push({ text: `${top(y)} ${josa(x, '을/를')} 이겼다.`, f: (o) => o[i] === 'L' });
        facts.push({ text: `${josa(x, '과/와')} ${top(y)} 비겼다.`, f: (o) => o[i] === 'D' });
      });
      const draws = (o) => o.filter((x) => x === 'D').length;
      for (let k = 0; k <= 3; k++) facts.push({ text: `무승부 경기는 ${k}경기이다.`, f: (o) => draws(o) === k });
      for (const t of T) facts.push({ text: `${top(t)} 한 번도 지지 않았다.`, f: (o) => games.every(([x, y], i) => !((x === t && o[i] === 'L') || (y === t && o[i] === 'W'))) });
      const nec = facts.filter((f) => cons.every(f.f)), not = facts.filter((f) => !cons.every(f.f));
      const notPossible = not.filter((f) => cons.some(f.f)), impossible = not.filter((f) => !cons.some(f.f));
      if (!nec.length || not.length < 4) continue;
      const right = r.pick(nec.filter((f) => !/무승부 경기는/.test(f.text)).length && r.chance(0.75) ? nec.filter((f) => !/무승부 경기는/.test(f.text)) : nec);
      const wrong = r.shuffle(notPossible).slice(0, 2).concat(r.shuffle(impossible)).slice(0, 4);
      if (wrong.length < 4) continue;
      const opts = r.shuffle([right, ...wrong]);
      const totalPts = P.sum(vals);
      return {
        type: '상황판단 · 리그전 추론',
        stem: '다음 글을 근거로 판단할 때, 반드시 옳은 것은?',
        body: [{ t: 'passage', h: `<p>A~D 네 팀이 서로 한 번씩 경기하는 리그전을 치렀다. 이기면 승점 3점, 비기면 1점, 지면 0점을 얻는다.</p><p>최종 승점은 A팀 ${pts.A}점, B팀 ${pts.B}점, C팀 ${pts.C}점, D팀 ${pts.D}점이다.</p>` }],
        options: opts.map((f) => esc(f.text)), answer: opts.indexOf(right),
        explain: [
          { t: 'p', h: `모두 6경기이므로 무승부가 없다면 승점 합은 18점이다. 무승부 한 경기마다 합이 1점씩 줄어드는데, 실제 합은 ${totalPts}점이므로 무승부는 ${18 - totalPts}경기이다.` },
          { t: 'p', h: `각 팀은 3경기를 치르므로 승점만으로 승·무·패를 좁힐 수 있다(승×3 + 무×1 = 승점, 승+무+패 = 3).` },
          { t: 'list', items: T.map((t) => { const recs = [...new Set(cons.map((o) => recOf(o, t)))]; return `${t}팀 ${pts[t]}점 → ${recs.length === 1 ? `<b>${recs[0]}</b>` : recs.join(' 또는 ')}${recordsOfPts(pts[t]).length > recs.length ? ` (승점만으로는 ${recordsOfPts(pts[t]).join(' 또는 ')}이지만, 무승부가 ${18 - totalPts}경기라는 점과 맞춰 보면 ${recs.join(' 또는 ')}${recs.length === 1 ? '뿐이다' : '이다'})` : ''}`; }) },
          { t: 'p', h: `이 승·무·패를 모두 만족하도록 6경기의 결과를 맞추면 다음 ${cons.length}가지${cons.length === 1 ? '로 확정된다' : '이다'}.` },
          { t: 'table', head: ['경기', ...cons.map((_, i) => `경우 ${i + 1}`)], rows: games.map(([x, y], i) => [`${x}–${y}`, ...cons.map((o) => (o[i] === 'W' ? `${x} 승` : o[i] === 'L' ? `${y} 승` : '무'))]) },
          { t: 'ox', items: opts.map((f) => { const all = cons.every(f.f), some = cons.some(f.f); return { ok: all, v: all ? '반드시 옳다' : some ? '반드시 옳다고 할 수 없다' : '옳지 않다', why: all ? `${cons.length === 1 ? '확정된 결과' : `${cons.length}가지 경우 모두`}에서 성립한다.` : some ? `경우 ${cons.findIndex((o) => !f.f(o)) + 1}에서는 성립하지 않는다.` : `어느 경우에서도 성립하지 않는다.` }; }) },
        ],
      };
    }
    return null;
  }

  /* ======================= 자리 배치 ======================= */
  const SEAT = {
    before: (c) => `${top(c.a)} ${c.b}보다 왼쪽에 앉는다.`,
    imm: (c) => `${top(c.a)} ${c.b}의 바로 왼쪽에 앉는다.`,
    adj: (c) => `${josa(`${josa(c.a, '과/와')} ${c.b}`, '은/는')} 이웃하여 앉는다.`,
    notAdj: (c) => `${josa(`${josa(c.a, '과/와')} ${c.b}`, '은/는')} 이웃하여 앉지 않는다.`,
    gap: (c) => `${josa(c.a, '과/와')} ${c.b} 사이에는 정확히 ${c.k}명이 앉는다.`,
    notEnds: (c) => `${top(c.a)} 양 끝 자리에 앉지 않는다.`,
    notPos: (c) => `${top(c.a)} ${c.p}번 자리에 앉지 않는다.`,
    pos: (c) => `${top(c.a)} ${c.p}번 자리에 앉는다.`,
  };
  function genSeat(r, lv) {
    r.next(); r.next(); r.next();   // a different random path from 순서 추론, so one seed never yields the same puzzle in both subjects
    const ctx = { ...SEAT, imm: (c) => `${top(c.a)} ${c.b}의 바로 왼쪽에 앉는다.` };
    const six = ['甲', '乙', '丙', '丁', '戊', '己'];
    const names = lv === 1 ? NAMES.slice() : lv === 3 ? six : (r.chance(0.5) ? six : NAMES.slice());
    const K = names.length;
    const z = P.orderPuzzle(r, names.slice(), ctx);
    if (!z) return null;
    const LAB = ['가', '나', '다', '라', '마', '바'];
    const sol = P.solveOrder(names, z.cs, { at: (p) => `${p}번 자리`, atS: (p) => `${p}번`, word: '자리', lab: LAB, show: (a) => a.map((x, i) => `${i + 1}번 ${x}`).join(', ') });
    if (!sol || sol.arrangement.join('') !== z.hidden.join('')) return null;
    if (lv === 1 ? sol.cases === 3 : lv === 3 ? sol.cases !== 3 : (sol.cases === 0 && !r.chance(0.15))) return null;
    const p = r.int(1, K);
    const others = names.filter((x) => x !== z.hidden[p - 1]);
    const options = r.shuffle([z.hidden[p - 1], ...r.sample(others, 4)]).sort((a, b) => names.indexOf(a) - names.indexOf(b));
    const steps = sol.lines.map((l, i) => ({ ind: l.ind, h: (i === 0 ? '<b>출발점</b> ' : '') + l.h, k: l.k }));
    return {
      type: '상황판단 · 자리 배치',
      stem: `다음 글을 근거로 판단할 때, ${p}번 자리에 앉는 사람은?`,
      body: [{ t: 'passage', h: `<p>${K === 6 ? '甲~己 여섯' : '甲~戊 다섯'} 명이 왼쪽부터 1번~${K}번으로 번호가 매겨진 일렬의 자리에 한 명씩 앉는다. 자리 배치는 다음 조건을 모두 만족한다.</p><ul class="cond lab">${z.text.map((s, i) => `<li><span class="lb">(${LAB[i]})</span> ${esc(s)}</li>`).join('')}</ul>` }],
      options, answer: options.indexOf(z.hidden[p - 1]),
      explain: [
        { t: 'steps', items: steps },
        { t: 'table', head: ['자리', ...names.map((_, i) => `${i + 1}`)], rows: [['앉는 사람', ...z.hidden]] },
        { t: 'p', h: `따라서 ${p}번 자리에는 <b>${josa(z.hidden[p - 1], '이/가')}</b> 앉는다.` },
      ],
    };
  }

  /* ======================= 지원금 ======================= */
  function genRent(r) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const ageCap = r.pick([34, 39]), yrsCap = r.pick([2, 3]), rate = r.pick([40, 50]), rateM = rate + r.pick([20, 30]), cap = r.pick([50, 60, 80]), months = 12;
      const C = NAMES.map((nm) => ({ nm, age: r.int(26, 44), m: r.int(6, 48), rent: r.int(6, 22) * 10, market: r.chance(0.4) }));
      C.forEach((c) => { c.ok = c.age <= ageCap && c.m <= yrsCap * 12; c.mon = c.ok ? Math.min(c.rent * (c.market ? rateM : rate) / 100, cap) : 0; c.amt = c.mon * months; });
      const elig = C.filter((c) => c.ok);
      if (elig.length < 2 || elig.length > 4) continue;
      const s = C.slice().sort((a, b) => b.amt - a.amt);
      if (s[0].amt - s[1].amt < 6) continue;
      const trap = C.filter((c) => !c.ok).sort((a, b) => b.rent - a.rent)[0];
      if (!trap || trap.rent <= s[0].rent) continue;
      const mo = (n) => (n < 12 ? `${n}개월` : n % 12 ? `${Math.floor(n / 12)}년 ${n % 12}개월` : `${n / 12}년`);
      return {
        type: '상황판단 · 규칙 적용',
        stem: '다음 글을 근거로 판단할 때, 연간 지원액이 가장 많은 사람은?',
        body: [
          { t: 'passage', h: `<p>A시는 청년 창업자에게 사업장 임차료를 지원한다.</p><ul class="cond"><li>지원 대상: 신청일 현재 만 ${ageCap}세 이하이고, 창업한 지 ${yrsCap}년 이내인 사람</li><li>지원액: 월 임차료의 ${rate}%(월 최대 ${cap}만 원), 12개월 지원</li><li>사업장이 전통시장 안에 있으면 지원 비율을 ${rateM}%로 한다. 월 최대 금액은 같다.</li></ul>` },
          { t: 'table', caption: '신청자 현황', head: ['신청자', '나이(만)', '창업 후 기간', '월 임차료', '전통시장'], rows: C.map((c) => [c.nm, `${c.age}세`, mo(c.m), `${c.rent}만 원`, c.market ? '○' : '×']) },
        ],
        options: NAMES.slice(), answer: NAMES.indexOf(s[0].nm),
        explain: [
          { t: 'table', head: ['신청자', '대상 여부', '월 지원액', '연간 지원액'], rows: C.map((c) => [c.nm, c.ok ? '대상' : (c.age > ageCap ? '나이 초과' : '창업 기간 초과'), c.ok ? `${fmt(c.mon, 1)}만 원` : '—', c.ok ? `${fmt(c.amt, 0)}만 원` : '0']), num: true },
          { t: 'p', h: `연간 지원액이 가장 많은 사람은 <b>${s[0].nm}</b>이다. 임차료가 가장 많은 ${top(trap.nm)} 지원 대상이 아니다.` },
        ],
      };
    }
    return null;
  }

  P.addGen('sit', 'S-law', '상황판단 · 법조문', 4, genLaw);
  P.addGen('sit', 'S-sess', '상황판단 · 일정', 1.4, genSessions);
  P.addGen('sit', 'S-due', '상황판단 · 기한', 1.2, genDeadline);
  P.addGen('sit', 'S-plan', '상황판단 · 비용 계산', 1.4, genPlans);
  P.addGen('sit', 'S-sel', '상황판단 · 규칙 적용', 1.4, genSelect);
  P.addGen('sit', 'S-league', '상황판단 · 리그전 추론', 1.2, genLeague, true);
  P.addGen('sit', 'S-seat', '상황판단 · 자리 배치', 1.4, genSeat, true);
  P.addGen('sit', 'S-rent', '상황판단 · 규칙 적용', 1, genRent);
})(typeof window !== 'undefined' ? window : globalThis);
