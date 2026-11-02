// 요AI new features against a mocked API: history safety (frozen system + mid-chat system message + drop_block), journal page
// numbers, citation check (structured output), Word export with footnotes, long-PDF per-page fallback, style profile.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const fonts = require('./fonts.js');
const DIR = '/tmp/yohan-work/sg/';
const OUT = DIR + 'shots/';
const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const usage0 = { input_tokens: 1500, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
function streamAnswer(cite) {
  return sse([
    { type: 'message_start', message: { id: 'msg_s', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: usage0 } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '본질성 기준을 정리한다.' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig-1' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '', citations: null } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '## 정리\n\n본질적 사항은 의회가 스스로 정하여야 한다' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'citations_delta', citation: cite } },
    { type: 'content_block_stop', index: 1 },
    { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '', citations: null } },
    { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: '. [첨부 문헌] 그 범위는 다툼이 있다. [추론] 관련 결정의 사건번호는 확인이 필요하다. [검증 필요]' } },
    { type: 'content_block_stop', index: 2 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 300 } },
    { type: 'message_stop' },
  ]);
}
const json = (text, extra) => JSON.stringify({ id: 'msg_j', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'thinking', thinking: '', signature: 'sig-j' }, { type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 2000, output_tokens: 400 }, ...(extra || {}) });
(async () => {
  const b = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'ko-KR', acceptDownloads: true });
  await fonts(ctx);
  const calls = [];
  await ctx.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request(); const body = JSON.parse(req.postData() || '{}'); calls.push({ body, headers: req.headers() });
    const all = JSON.stringify(body.messages || []);
    if (body.output_config && body.output_config.format) return route.fulfill({ status: 200, contentType: 'application/json', body: json(JSON.stringify({ items: [{ n: 1, claim: '본질적 사항은 의회가 스스로 정하여야 한다', verdict: '뒷받침함', reason: '인용 원문이 같은 취지를 말한다.' }, { n: 1, claim: '그 범위는 다툼이 있다', verdict: '일부만 뒷받침함', reason: '원문은 범위의 다툼을 직접 말하지 않는다.' }], summary: '핵심 주장은 원문으로 확인되나 한 곳은 원문보다 넓다.' })) });
    if (!body.stream && all.includes('문체 프로필')) return route.fulfill({ status: 200, contentType: 'application/json', body: json('1. 문장: 한 문장이 길지 않고 판단의 근거를 먼저 밝힌다.\n2. 종결과 판단: ‘~라고 할 것이다’를 즐겨 쓴다.') });
    const block = all.includes('"type":"content"');
    const cite = block ? { type: 'content_block_location', cited_text: 'Long page 3: the legislature must decide essential matters (p3).', document_index: 0, document_title: 'Long', start_block_index: 2, end_block_index: 4 }
      : { type: 'page_location', cited_text: 'Short page 2: the legislature must decide essential matters (p2).', document_index: 0, document_title: 'Short', start_page_number: 2, end_page_number: 3 };
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: streamAnswer(cite) });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8766/yoai/'); await p.waitForTimeout(500);
  await p.keyboard.type(process.env.YOAI_PIN); await p.waitForTimeout(700);
  await p.fill('#k0', 'sk-ant-test-key'); await p.click('#k0save'); await p.waitForTimeout(400);
  await p.click('.topbar [data-act="ctx"]'); await p.waitForTimeout(200);
  await p.fill('[data-pf="question"]', '본질성이론에 따른 의회유보의 범위'); await p.waitForTimeout(500);
  await p.click('.topbar [data-act="ctx"]'); await p.waitForTimeout(200);
  // library: small PDF with journal first page
  await p.click('[data-act="attach"]'); await p.waitForTimeout(200);
  await p.setInputFiles('#files', { name: 'Short.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(DIR + 'small.pdf') }); await p.waitForTimeout(1200);
  console.log('library meta:', (await p.locator('.doc-row .m').first().textContent()).trim());
  await p.click('.doc-row [data-edit]'); await p.waitForTimeout(200);
  for (const [i, v] of [[1, '안요환'], [2, '2023'], [3, '공법연구 제50집 제1호'], [4, '123']]) await p.fill('#fb' + i, v);
  await p.click('#fb-ok'); await p.waitForTimeout(300);
  console.log('library meta after info:', (await p.locator('.doc-row .m').first().textContent()).trim());
  await p.check('.doc-row input[type="checkbox"]'); await p.click('.modal [data-close]'); await p.waitForTimeout(200);
  await p.fill('#input', '의회유보의 범위를 정리해 주세요'); await p.keyboard.press('Enter'); await p.waitForTimeout(1600);
  const r1 = calls[0];
  console.log('R1 betas:', r1.headers['anthropic-beta'], '| block_binding:', JSON.stringify(r1.body.thinking.block_binding), '| system blocks:', r1.body.system.length, '| sys0 has project:', JSON.stringify(r1.body.system[1] || {}).includes('본질성이론에 따른 의회유보의 범위'), '| doc source:', r1.body.messages[0].content[0].source.type);
  console.log('R1 sources:', (await p.locator('.sources li').first().textContent()).trim());
  // edit the project mid-conversation, then continue
  await p.click('.topbar [data-act="ctx"]'); await p.waitForTimeout(200);
  await p.fill('[data-pf="question"]', '의회유보의 범위와 위임입법의 한계'); await p.waitForTimeout(500);
  await p.click('.topbar [data-act="ctx"]'); await p.waitForTimeout(200);
  await p.fill('#input', '반론도 검토해 주세요'); await p.keyboard.press('Enter'); await p.waitForTimeout(1600);
  const r2 = calls[1];
  const last = r2.body.messages[r2.body.messages.length - 1];
  console.log('R2 system unchanged:', JSON.stringify(r2.body.system) === JSON.stringify(r1.body.system), '| roles:', r2.body.messages.map((m) => m.role).join(','), '| last system mentions new question:', last.role === 'system' && last.content.includes('위임입법의 한계'), '| first turn identical:', JSON.stringify(r2.body.messages[0]) === JSON.stringify(r1.body.messages[0]), '| assistant replayed with signature:', JSON.stringify(r2.body.messages[1]).includes('sig-1'));
  // third turn: the system message stays where it was
  await p.fill('#input', '정리해 주세요'); await p.keyboard.press('Enter'); await p.waitForTimeout(1600);
  const r3 = calls[2];
  console.log('R3 roles:', r3.body.messages.map((m) => m.role).join(','), '| prefix of R2 kept:', JSON.stringify(r3.body.messages.slice(0, 4)) === JSON.stringify(r2.body.messages.slice(0, 4)));
  // citation check
  await p.click('.msg.ai[data-i="1"] [data-act="verify"]'); await p.waitForTimeout(1500);
  const rv = calls[3];
  console.log('verify request: format', rv.body.output_config.format.type, '| tools', rv.body.tools ? 'present' : 'none', '| markers', rv.body.messages[0].content.includes('〔c1〕'), '| rows', await p.locator('.msg.ai[data-i="1"] .verify li').count(), '| badges', (await p.locator('.msg.ai[data-i="1"] .verify .vc').textContent()).trim(), '| flag', (await p.locator('.msg.ai[data-i="1"] .verify .vflag').count()));
  await p.locator('.msg.ai[data-i="1"]').screenshot({ path: OUT + 'yoai-verify.png' });
  // Word export of the first answer
  await p.click('.msg.ai[data-i="1"] [data-act="docx"]'); await p.waitForTimeout(200);
  await p.check('#dx-quote');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dx-go')]);
  await dl.saveAs(DIR + 'export-answer.docx');
  console.log('download name:', dl.suggestedFilename());
  await p.click('.topbar [data-act="ctx"]'); await p.waitForTimeout(200);
  await p.click('[data-act="export-docx"]'); await p.waitForTimeout(200);
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#dx-go')]);
  await dl2.saveAs(DIR + 'export-chat.docx');
  // style profile
  await p.click('[data-act="style-extract"]'); await p.waitForTimeout(200);
  await p.check('.doc-pick input'); await p.click('#st-run'); await p.waitForTimeout(1800);
  const rs = calls[calls.length - 1];
  console.log('style request: docs', rs.body.messages[0].content.filter((c) => c.type === 'document').map((c) => c.source.type).join(','), '| prompt', rs.body.messages[0].content.at(-1).text.slice(0, 20));
  await p.click('#st-save'); await p.waitForTimeout(400);
  console.log('style saved in panel:', (await p.inputValue('[data-pf="style"]')).slice(0, 30));
  await p.click('.topbar [data-act="ctx"]'); await p.waitForTimeout(200);
  // long PDF in a new chat → per-page document
  await p.click('[data-act="new-chat"]'); await p.waitForTimeout(300);
  await p.click('[data-act="attach"]'); await p.waitForTimeout(200);
  await p.setInputFiles('#files', { name: 'Long.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(DIR + 'big.pdf') }); await p.waitForTimeout(1500);
  await p.locator('.doc-row', { hasText: 'Long' }).locator('input[type="checkbox"]').check(); await p.click('.modal [data-close]'); await p.waitForTimeout(200);
  await p.fill('#input', '긴 문헌을 요약해 주세요'); await p.keyboard.press('Enter'); await p.waitForTimeout(3500);
  const rl = calls[calls.length - 1]; const d0 = rl.body.messages[0].content[0];
  console.log('long doc: source', d0.source.type, '| blocks', d0.source.content && d0.source.content.length, '| block 3 text', d0.source.content && d0.source.content[2].text.slice(0, 18), '| chip', (await p.locator('.msg.user .doc-chip small').first().textContent()), '| sources', (await p.locator('.sources li').first().textContent()).trim().slice(0, 30));
  await p.reload(); await p.waitForTimeout(1500);
  console.log('after reload: messages', await p.locator('.msg').count(), '| errors', errs.length ? errs.slice(0, 3) : 'none');
  await b.close();
})();
