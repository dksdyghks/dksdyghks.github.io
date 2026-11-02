// 요AI: auto citation check after an answer, fallback when role:"system" is rejected, phone layout of the new dialogs.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const fonts = require('./fonts.js');
const DIR = '/tmp/yohan-work/sg/';
const sse = (ev) => ev.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const answer = () => sse([
  { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 900, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '의회는 본질적 사항을 스스로 정한다' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: { type: 'page_location', cited_text: 'Short page 1: the legislature must decide essential matters (p1).', document_index: 0, document_title: 'Short', start_page_number: 1, end_page_number: 2 } } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 50 } }, { type: 'message_stop' }]);
(async () => {
  const b = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
  const ctx = await b.newContext({ ...devices['iPhone 14'], locale: 'ko-KR' });
  await fonts(ctx);
  const calls = []; let rejectSystem = true;
  await ctx.route('https://api.anthropic.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}'); calls.push(body);
    if (body.output_config && body.output_config.format) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'v', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ items: [{ n: 1, claim: '의회는 본질적 사항을 스스로 정한다', verdict: '뒷받침하지 않음', reason: '원문과 다르다.' }], summary: '불일치 1건.' }) }], stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 80 } }) });
    if (rejectSystem && (body.messages || []).some((m) => m.role === 'system')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: "role 'system' is not supported on this model" } }) });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: answer() });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8766/yoai/'); await p.waitForTimeout(400);
  await p.keyboard.type(process.env.YOAI_PIN); await p.waitForTimeout(700);
  await p.fill('#k0', 'sk-ant-test-key'); await p.click('#k0save'); await p.waitForTimeout(400);
  // settings: turn on automatic citation check
  await p.click('[data-act="menu"]'); await p.waitForTimeout(200); await p.click('.side [data-act="settings"]'); await p.waitForTimeout(200);
  await p.check('#s-verify'); await p.click('#save'); await p.waitForTimeout(300);
  await p.click('[data-act="attach"]'); await p.waitForTimeout(200);
  await p.setInputFiles('#files', { name: 'Short.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(DIR + 'small.pdf') }); await p.waitForTimeout(1000);
  await p.check('.doc-row input[type="checkbox"]'); await p.click('.modal [data-close]'); await p.waitForTimeout(200);
  await p.fill('#input', '첫 질문'); await p.click('[data-act="send"]'); await p.waitForTimeout(2500);
  console.log('auto verify ran:', calls.some((c) => c.output_config && c.output_config.format), '| verify rows', await p.locator('.verify li').count(), '| verdict', (await p.locator('.verify li .vb').first().textContent()));
  await p.screenshot({ path: DIR + 'shots/yoai-verify-mobile.png', fullPage: false });
  // change the project mid-chat → the model "rejects" role:system → app switches to inline notes; regenerate succeeds
  await p.click('.topbar [data-act="ctx"]'); await p.waitForTimeout(250);
  await p.fill('[data-pf="question"]', '새 연구문제'); await p.waitForTimeout(500);
  await p.screenshot({ path: DIR + 'shots/yoai-ctx-mobile2.png' });
  await p.click('#ctx [data-act="ctx"]'); await p.waitForTimeout(250);
  await p.fill('#input', '둘째 질문'); await p.click('[data-act="send"]'); await p.waitForTimeout(1500);
  console.log('notice:', (await p.locator('.notice-line').last().textContent()).slice(0, 40));
  await p.click('[data-act="regen"]'); await p.waitForTimeout(2500);
  const lastAns = calls.filter((c) => c.stream).pop();
  const lastUser = lastAns.messages.filter((m) => m.role === 'user').pop();
  console.log('regen roles:', lastAns.messages.map((m) => m.role).join(','), '| inline note:', JSON.stringify(lastUser).includes('[연구 프로젝트 맥락 갱신]'));
  // dialogs on a phone
  await p.click('.msg.ai >> nth=-1 >> [data-act="docx"]'); await p.waitForTimeout(250);
  await p.screenshot({ path: DIR + 'shots/yoai-docx-modal-mobile.png' });
  await p.click('.modal [data-close]'); await p.waitForTimeout(200);
  console.log('scroll', await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth].join('/')), '| errors', errs.length ? errs : 'none');
  await b.close();
})();
