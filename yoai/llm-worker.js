/* 요AI: runs the in-browser language model away from the page, so the screen never freezes while it thinks */
import { WebWorkerMLCEngineHandler } from './vendor/web-llm-0.2.87.js';
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
