// 요AI against a mocked Anthropic API: streaming, thinking summary, web search activity, citations, project context,
// PDF attachment, pause_turn continuation, auth error, persistence. Screens on desktop and phone.
const { chromium, devices } = require('playwright');
const fonts = require('./fonts.js');
const OUT = '/tmp/yohan-work/sg/shots/';
const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const start = (id) => ({ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1, cache_creation_input_tokens: 3000, cache_read_input_tokens: 0 } } });
function answer(stop) {
  return sse([
    start('msg_a'),
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '쟁점을 법률유보와 의회유보로 나누어 검토한다.' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig-abc' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"행정기본법 제8조 법치행정의 원칙"}' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'content_block_start', index: 2, content_block: { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://www.law.go.kr/법령/행정기본법', title: '행정기본법 | 국가법령정보센터', encrypted_content: 'enc', page_age: null }] } },
    { type: 'content_block_stop', index: 2 },
    { type: 'content_block_start', index: 3, content_block: { type: 'text', text: '', citations: null } },
    { type: 'content_block_delta', index: 3, delta: { type: 'text_delta', text: '## 쟁점 정리\n\n' } },
    { type: 'content_block_delta', index: 3, delta: { type: 'text_delta', text: '행정작용은 법률에 근거하여야 한다는 원칙은 행정기본법에 명문화되어 있다. [검색 확인]' } },
    { type: 'content_block_delta', index: 3, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url: 'https://www.law.go.kr/법령/행정기본법', title: '행정기본법 | 국가법령정보센터', encrypted_index: 'ei', cited_text: '행정작용은 법률에 위반되어서는 아니 되며…' } } },
    { type: 'content_block_stop', index: 3 },
    { type: 'content_block_start', index: 4, content_block: { type: 'text', text: '', citations: null } },
    { type: 'content_block_delta', index: 4, delta: { type: 'text_delta', text: '\n\n| 구분 | 내용 |\n|---|---|\n| 침해유보설 | 침해 행정에만 법률 근거 |\n| 본질성이론 | 본질적 사항은 의회가 결정 |\n\n의회유보의 범위는 여전히 논쟁적이다. [추론] 판례의 정확한 사건번호는 원문 확인이 필요하다. [검증 필요]\n\n**연구자 판단이 필요한 지점**\n\n1. 본질성 판단 기준을 어디에 둘 것인가' } },
    { type: 'content_block_stop', index: 4 },
    { type: 'message_delta', delta: { stop_reason: stop || 'end_turn', stop_sequence: null }, usage: { output_tokens: 420, server_tool_use: { web_search_requests: 1 } } },
    { type: 'message_stop' },
  ]);
}
(async () => {
  const b = await chromium.launch();
  for (const mode of (process.env.MODES || 'desktop,mobile').split(',')) {
    const ctx = await b.newContext({ ...(mode === 'mobile' ? devices['iPhone 14'] : { viewport: { width: 1360, height: 860 } }), locale: 'ko-KR' });
    await fonts(ctx);
    const bodies = []; let call = 0;
    await ctx.route('https://api.anthropic.com/**', async (route) => {
      const req = route.request(); const body = JSON.parse(req.postData() || '{}'); bodies.push({ body, headers: req.headers() }); call++;
      if (body.messages && JSON.stringify(body.messages).includes('키 오류 시험')) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
      const paused = JSON.stringify(body.messages).includes('긴 검색 시험') && !JSON.stringify(body.messages.at(-1)).includes('sig-abc');
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_' + call }, body: answer(paused ? 'pause_turn' : 'end_turn') });
    });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('http://127.0.0.1:8766/yoai/'); await p.waitForTimeout(500);
    console.log(mode, 'lock shown:', await p.locator('.lock-card').count());
    await p.keyboard.type(process.env.YOAI_PIN); await p.waitForTimeout(700);
    console.log(mode, 'key card shown:', await p.locator('.keycard').count());
    await p.fill('#k0', 'sk-ant-test-key'); await p.click('#k0save'); await p.waitForTimeout(400);
    // project context
    if (mode === 'mobile') { /* ctx opens as drawer */ }
    await p.click('[data-act="ctx"]'); await p.waitForTimeout(200);
    await p.fill('[data-pf="question"]', '본질성이론에 따른 의회유보의 범위'); await p.fill('[data-pf="decided"]', '- 의회유보는 법률유보의 한 내용으로 본다.'); await p.waitForTimeout(500);
    if (mode === 'mobile') await p.screenshot({ path: OUT + 'yoai-ctx-mobile.png' });
    await p.click('#ctx [data-act="ctx"], .topbar [data-act="ctx"]'.split(', ')[mode === 'mobile' ? 0 : 1]); await p.waitForTimeout(250);
    if (mode === 'desktop') await p.screenshot({ path: OUT + 'yoai-empty-desktop.png' });
    // attach a PDF through the library
    await p.click('[data-act="attach"]'); await p.waitForTimeout(200);
    await p.setInputFiles('#files', { name: '선행연구-본질성이론.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF') });
    await p.waitForTimeout(400);
    await p.check('.doc-row input[type="checkbox"]'); await p.click('.modal [data-close]'); await p.waitForTimeout(200);
    await p.fill('#input', '의회유보의 범위를 정리해 주세요'); await p.keyboard.press('Enter');
    await p.waitForTimeout(1500);
    const req = bodies[0].body;
    console.log(mode, 'request: model', req.model, 'thinking', JSON.stringify(req.thinking), 'effort', req.output_config && req.output_config.effort, 'tools', (req.tools || []).map((t) => t.type).join(','), 'fallbacks', req.fallbacks, 'beta header', bodies[0].headers['anthropic-beta'], 'browser header', bodies[0].headers['anthropic-dangerous-direct-browser-access']);
    console.log(mode, 'system has project context:', JSON.stringify(req.system).includes('본질성이론에 따른 의회유보의 범위') && JSON.stringify(req.system).includes('연구자가 확정한 사항'));
    const um = req.messages[0].content; console.log(mode, 'user content types:', um.map((c) => c.type).join(','), 'doc title:', um[0].title, 'citations:', JSON.stringify(um[0].citations), 'base64 ok:', um[0].source && um[0].source.type === 'base64' && um[0].source.media_type === 'application/pdf');
    console.log(mode, 'rendered: tags', await p.locator('.tag-v').count(), 'cites', await p.locator('sup.cite').count(), 'sources', await p.locator('.sources li').count(), 'activity', await p.locator('.act').count(), 'think', await p.locator('details.think').count(), 'table', await p.locator('.answer table').count(), 'meta', await p.locator('.ai-foot .meta').textContent());
    await p.screenshot({ path: OUT + `yoai-answer-${mode}.png` });
    // second turn replays the full assistant content (thinking signature included)
    await p.fill('#input', '이어서 반론도 검토해 주세요'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
    const r2 = bodies[1].body; const asst = r2.messages.find((m) => m.role === 'assistant');
    console.log(mode, 'turn 2 replays assistant blocks:', asst && asst.content.map((c) => c.type).join(','), 'signature kept:', JSON.stringify(asst).includes('sig-abc'));
    // pause_turn continuation
    const before = bodies.length;
    await p.fill('#input', '긴 검색 시험'); await p.keyboard.press('Enter'); await p.waitForTimeout(1800);
    console.log(mode, 'pause_turn → requests made:', bodies.length - before, '(expect 2)');
    // auth error
    await p.fill('#input', '키 오류 시험'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
    console.log(mode, 'auth error notice:', (await p.locator('.notice-line').last().textContent()).slice(0, 40));
    // persistence
    await p.reload(); await p.waitForTimeout(1200);
    console.log(mode, 'after reload messages:', await p.locator('.msg').count(), 'chats:', await p.locator('.chat-link').count());
    console.log(mode, 'scroll', await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth].join('/')), 'errors', errs.length ? errs : 'none');
    await ctx.close();
  }
  await b.close();
})();
