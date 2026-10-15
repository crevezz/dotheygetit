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
    const rows = [];
    const blocks = [...document.querySelectorAll('header.hero, section, footer, .wrap > *')];
    const seen = new Set();
    const items = [];
    for (const el of blocks) {
      const r = el.getBoundingClientRect();
      if (r.height < 4 || r.width < 4) continue;
      const key = Math.round(r.top) + ':' + Math.round(r.height);
      if (seen.has(key)) continue; seen.add(key);
      items.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 34), id: el.id || '', top: Math.round(r.top + window.scrollY), h: Math.round(r.height), bot: Math.round(r.bottom + window.scrollY) });
    }
    items.sort((a, c) => a.top - c.top);
    for (let i = 1; i < items.length; i++) {
      const gap = items[i].top - items[i - 1].bot;
      if (gap >= 90) rows.push({ gap, after: items[i - 1].tag + (items[i - 1].id ? '#' + items[i - 1].id : '.' + items[i - 1].cls), before: items[i].tag + (items[i].id ? '#' + items[i].id : '.' + items[i].cls), at: items[i].top });
    }
    const secs = [...document.querySelectorAll('section[id], header.hero')].map((s) => { const r = s.getBoundingClientRect(); const cs = getComputedStyle(s); return { id: s.id || 'hero', h: Math.round(r.height), padT: cs.paddingTop, padB: cs.paddingBottom, mt: cs.marginTop, mb: cs.marginBottom }; });
    const empties = [...document.querySelectorAll('.wrap > *, .wrap > * > *')].filter((e) => { const t = (e.textContent || '').trim(); const r = e.getBoundingClientRect(); return !t && r.height > 20; }).map((e) => e.tagName + '.' + (e.className || '') + ' h=' + Math.round(e.getBoundingClientRect().height));
    return { docHeight: document.body.scrollHeight, gaps: rows, secs, empties };
  });
  console.log('document height', out.docHeight);
  console.log('\n=== vertical gaps >= 90px ===');
  for (const g of out.gaps) console.log(String(g.gap).padStart(5) + 'px  after ' + g.after + '  ->  ' + g.before + '   (at y=' + g.at + ')');
  console.log('\n=== section heights + padding ===');
  for (const s of out.secs) console.log(s.id.padEnd(9) + ' h=' + String(s.h).padStart(5) + '  pad ' + s.padT + '/' + s.padB + '  margin ' + s.mt + '/' + s.mb);
  console.log('\n=== empty blocks >20px tall ===');
  console.log(out.empties.length ? out.empties.join('\n') : 'none');
  await b.close(); srv.close();
});
