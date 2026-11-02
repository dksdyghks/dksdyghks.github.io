// Static server that behaves like GitHub Pages for text assets: gzip, correct types, 10-minute cache.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = process.argv[2], PORT = +process.argv[3];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const ext = path.extname(f), body = fs.readFileSync(f), type = TYPES[ext] || 'application/octet-stream';
  const gz = /text|javascript|json|svg|manifest/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=600', ...(gz ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}) });
  res.end(gz ? zlib.gzipSync(body) : body);
}).listen(PORT, '127.0.0.1');
