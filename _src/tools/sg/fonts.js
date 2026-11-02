// route web fonts to local copies so screenshots use the real typefaces
const fs = require('fs');
const BASE = '/tmp/yohan-work/fonts/';
if (!fs.existsSync(BASE + 'gf/serif.css')) { module.exports = async () => {}; return; } // no local copies: let the pages fetch their fonts
const PRET = fs.readFileSync(BASE + 'ext/package/dist/web/variable/woff2/PretendardVariable.woff2');
const PCSS = '@font-face{font-family:"Pretendard Variable";font-weight:45 920;font-display:swap;src:url("https://cdn.jsdelivr.net/local/P.woff2") format("woff2-variations")}';
const SCSS = fs.readFileSync(BASE + 'gf/serif.css', 'utf8');
module.exports = async (ctx) => {
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => (r.request().url().endsWith('.woff2') ? r.fulfill({ status: 200, contentType: 'font/woff2', body: PRET }) : r.fulfill({ status: 200, contentType: 'text/css', body: PCSS })));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: SCSS }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => {
    const f = BASE + 'gf/files/' + r.request().url().replace('https://fonts.gstatic.com/', '').replace(/\//g, '_');
    if (fs.existsSync(f)) return r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' } });
    return r.fulfill({ status: 404, body: '' });
  });
};
