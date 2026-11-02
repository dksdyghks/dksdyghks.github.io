/* 요AI의 오프라인 AI — 이 컴퓨터 안에서 돌아가는 언어 모델. 어디로도 내용을 보내지 않는다.
   · 브라우저 안(WebGPU): 공개 모델을 한 번 내려받아 브라우저 저장소에 두고, 그 뒤로는 인터넷 없이 이 컴퓨터의 그래픽 칩으로 돌린다.
     모델은 별도 작업자(Web Worker)에서 돌아 화면이 멈추지 않는다.
   · Ollama: 컴퓨터에 Ollama(무료 프로그램)를 설치해 두었으면 그 모델을 쓴다(더 큰 모델, 예: LG EXAONE 3.5).
   두 방식 모두 같은 함수(stream, complete)로 쓴다. */
const WEBLLM = new URL('./vendor/web-llm-0.2.87.js', import.meta.url).href;
const OLLAMA = 'http://localhost:11434';
export const WEB_MODELS = [
  { id: 'Qwen3.5-2B', name: 'Qwen3.5 2B', vram: 2245, note: '가벼움 · 대부분의 컴퓨터' },
  { id: 'Qwen3.5-4B', name: 'Qwen3.5 4B', vram: 3868, note: '권장 · 보통 컴퓨터' },
  { id: 'Qwen3.5-9B', name: 'Qwen3.5 9B', vram: 6433, note: '가장 정확 · 그래픽 메모리가 넉넉한 컴퓨터' },
];
const webId = (base, f16) => `${base}-${f16 ? 'q4f16_1' : 'q4f32_1'}-MLC`;
let lib = null, engine = null, worker = null, ollama = null, abortCtl = null;
export const AI = {
  state: { backend: '', model: '', name: '', status: 'none', progress: 0, text: '', ctx: 4096 },
  listeners: new Set(),
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const fn of this.listeners) { try { fn(this.state); } catch (e) { /* ignore */ } } },
  set(p) { Object.assign(this.state, p); this.emit(); },
  ready() { return this.state.status === 'ready'; },

  /* can this browser run a model on the graphics chip? */
  async webSupport() {
    if (!('gpu' in navigator)) return { ok: false, reason: '이 브라우저는 WebGPU를 지원하지 않습니다. 최신 Chrome이나 Edge를 쓰세요.' };
    let a = null;
    try { a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { a = null; }
    if (!a) return { ok: false, reason: '이 컴퓨터에서 그래픽 칩(WebGPU)을 쓸 수 없습니다. 그래픽 드라이버를 업데이트하거나 Ollama를 쓰세요.' };
    const f16 = a.features.has('shader-f16');
    const mem = navigator.deviceMemory || 8;
    const big = (a.limits && a.limits.maxBufferSize) || 0;
    const rec = !f16 || mem < 8 || big < 2 ** 30 ? 'Qwen3.5-2B' : 'Qwen3.5-4B';
    return { ok: true, f16, rec };
  },
  async lib() { if (!lib) lib = await import(WEBLLM); return lib; },
  async webCached(base, f16) { try { const L = await this.lib(); return await L.hasModelInCache(webId(base, f16)); } catch (e) { return false; } },
  async deleteWeb(base, f16) { const L = await this.lib(); await L.deleteModelAllInfoInCache(webId(base, f16)); },

  /* load a browser model: downloads once (progress shown), later loads from this computer's storage */
  async loadWeb(base, f16) {
    await this.unload();
    const id = webId(base, f16), m = WEB_MODELS.find((x) => x.id === base);
    this.set({ backend: 'web', model: base, name: m ? m.name : base, status: 'loading', progress: 0, text: '준비 중…' });
    const L = await this.lib();
    const progress = (p) => this.set({ progress: Math.round((p.progress || 0) * 100), text: p.text || '' });
    let lastErr = null;
    for (const ctx of [16384, 8192, 4096]) { // the longer the context, the more pages a question can read at once
      try {
        worker = new Worker(new URL('./llm-worker.js', import.meta.url), { type: 'module' });
        engine = await L.CreateWebWorkerMLCEngine(worker, id, { initProgressCallback: progress }, { context_window_size: ctx });
        this.set({ status: 'ready', ctx, progress: 100, text: '' });
        return true;
      } catch (e) { lastErr = e; try { worker && worker.terminate(); } catch (e2) { /* ignore */ } worker = null; engine = null; }
    }
    this.set({ status: 'error', text: (lastErr && lastErr.message) || String(lastErr) });
    return false;
  },
  /* Ollama on this computer: list installed models (fails if Ollama is not running or does not allow this page) */
  async ollamaModels() {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
    try {
      const r = await fetch(`${OLLAMA}/api/tags`, { signal: ctl.signal });
      if (!r.ok) throw new Error('Ollama ' + r.status);
      const j = await r.json();
      return (j.models || []).map((m) => ({ name: m.name, size: m.size || 0 }));
    } finally { clearTimeout(t); }
  },
  /* a big model (about 12GB or more on disk, e.g. exaone3.5:32b) reads 8천 토큰 at a time: its working memory at 16천 would
     push a usual computer into swapping */
  async useOllama(model, size = 0) {
    await this.unload();
    ollama = { model };
    this.set({ backend: 'ollama', model, name: model, status: 'ready', ctx: size >= 12e9 ? 8192 : 16384, size, progress: 100, text: '' });
    return true;
  },
  /* how much of the loaded Ollama model sits in graphics memory; well under all of it means it runs on the processor (slow) */
  async ollamaLoad() {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
    try {
      const r = await fetch(`${OLLAMA}/api/ps`, { signal: ctl.signal }); if (!r.ok) return null;
      const j = await r.json(); const m = (j.models || []).find((x) => x.name === (ollama && ollama.model) || x.model === (ollama && ollama.model));
      return m ? { size: m.size || 0, vram: m.size_vram || 0 } : null;
    } catch (e) { return null; } finally { clearTimeout(t); }
  },
  async unload() {
    this.stop();
    if (engine) { try { await engine.unload(); } catch (e) { /* ignore */ } }
    if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } }
    engine = null; worker = null; ollama = null;
    this.set({ backend: '', model: '', name: '', status: 'none', progress: 0, text: '' });
  },
  stop() { if (abortCtl) { try { abortCtl.abort(); } catch (e) { /* ignore */ } } if (engine) { try { engine.interruptGenerate(); } catch (e) { /* ignore */ } } },

  /* stream an answer: messages are [{role: 'system'|'user'|'assistant', content}] */
  async *stream(messages, o = {}) {
    if (this.state.status !== 'ready') throw new Error('AI가 준비되지 않았습니다.');
    const maxTokens = o.maxTokens || 1500, temperature = o.temperature ?? 0.3;
    if (this.state.backend === 'web') {
      const chunks = await engine.chat.completions.create({ messages, stream: true, temperature, max_tokens: maxTokens, extra_body: { enable_thinking: false } });
      for await (const ch of chunks) { const d = ch.choices && ch.choices[0] && ch.choices[0].delta && ch.choices[0].delta.content; if (d) yield d; }
      return;
    }
    if (this.state.backend === 'ollama') {
      abortCtl = new AbortController();
      const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', signal: abortCtl.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ollama.model, messages, stream: true, think: false, options: { num_ctx: this.state.ctx, temperature, num_predict: maxTokens } }) });
      if (!r.ok || !r.body) throw new Error(`Ollama가 응답하지 않았습니다(${r.status}).`);
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      try {
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; const j = JSON.parse(line); if (j.error) throw new Error(j.error); const d = j.message && j.message.content; if (d) yield d; if (j.done) return; }
        }
      } catch (e) { if (e && e.name === 'AbortError') return; throw e; }
      finally { abortCtl = null; }
    }
  },
  async complete(messages, o = {}) { let out = ''; for await (const d of this.stream(messages, o)) out += d; return stripThink(out); },
};
/* some models write their reasoning between <think> tags; only the answer is kept */
export const stripThink = (t) => String(t || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
/* a test double: answers from the sources it is given, so the reading and citing around it can be checked without a model */
if (typeof window !== 'undefined' && window.__YOAI_FAKE_AI) {
  AI.fake = true;
  AI.useFake = function () { this.set({ backend: 'fake', model: 'fake', name: '시험용', status: 'ready', ctx: 8192 }); };
  const real = AI.stream.bind(AI);
  AI.stream = async function* (messages, o) { if (this.state.backend !== 'fake') { yield* real(messages, o); return; } const out = window.__YOAI_FAKE_AI(messages, o); for (const part of out.match(/[\s\S]{1,12}/g) || []) { await new Promise((r) => setTimeout(r, 2)); yield part; } };
}
