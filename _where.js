const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, 'landing-site');
const MIME = { '.html': 'text/html', '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/json', '.ico': 'image/x-icon' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(''); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
srv.listen(8099, async () => {
  const { chromium } = require('C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright');
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await pg.goto('http://localhost:8099/', { waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  const out = await pg.evaluate(() => {
    const bad = [...document.querySelectorAll('br, span.mark, span')].filter((e) => { const t = (e.textContent || '').trim(); const r = e.getBoundingClientRect(); return !t && r.height > 20 && r.width < 400; });
    return bad.map((e) => {
      const chain = []; let n = e;
      while (n && n.tagName !== 'BODY') { chain.unshift(n.tagName.toLowerCase() + (n.className ? '.' + n.className.toString().split(' ')[0] : '')); n = n.parentElement; }
      const p = e.parentElement;
      return { el: chain.join(' > '), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width), parentText: (p.textContent || '').trim().slice(0, 90), parentHTML: p.innerHTML.trim().slice(0, 200) };
    });
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.close();
});
