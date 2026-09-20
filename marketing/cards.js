/* Marketing stills in the advert's style: navy stage, big type, one gradient
   line, and the "free for a limited time" badge.
   The page is a template string in here, so there is no separate HTML to drift.
   node marketing/cards.js
   Sizes: 1080x1350 (Facebook and Instagram feed), 1080x1080 (grid). */
const fs = require('fs');
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);

const OUT = path.join(__dirname, 'out');
const SIZES = [['feed', 1080, 1350], ['square', 1080, 1080]];
const BADGE = 'Free for a limited time';
// Inlined as a data URI: setContent has no base URL, so a relative <img> would
// never load and the mark would silently vanish from every card.
const TICK = 'data:image/svg+xml;base64,' +
  fs.readFileSync(path.join(__dirname, '..', 'brand', 'out', 'tick-white.svg')).toString('base64');

// Each card is two lines. The second carries the gradient, like the advert.
const CARDS = [
  { id: 'nodding', a: 'Thirty students nodded.', b: "Nodding isn't understanding." },
  { id: 'topic', a: 'You type the topic.', b: 'It writes the questions.' },
  { id: 'minutes', a: 'They answer on phones.', b: 'You know in minutes.' },
  { id: 'before', a: "Know who didn't get it", b: 'before the test does.' },
  { id: 'faking', a: 'Who got it, who is shaky,', b: 'And who is faking it.' },
  { id: 'marking', a: 'No marking. No photocopying.', b: 'No A, B, C, D.' },
];

const page = (c) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#070a1a}
.card{position:relative;width:100vw;height:100vh;display:flex;flex-direction:column;
 justify-content:center;gap:5vh;padding:9vh 8vw;overflow:hidden;
 background:radial-gradient(120% 70% at 78% 6%,rgba(79,140,255,.30),transparent 60%),
            radial-gradient(90% 60% at 10% 100%,rgba(139,92,246,.20),transparent 62%),#070a1a;
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.card:after{content:"";position:absolute;inset:0;pointer-events:none;
 background:radial-gradient(125% 92% at 50% 44%,transparent 44%,rgba(0,0,0,.58))}
.badge{align-self:flex-start;background:linear-gradient(96deg,#4f8cff,#8b5cf6);color:#fff;
 font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:1.95vh;
 padding:1.5vh 2.7vh;border-radius:999px;box-shadow:0 18px 44px rgba(79,140,255,.35);z-index:2}
.a,.b{font-size:9.3vh;line-height:1.07;font-weight:800;letter-spacing:-.03em}
.b{background:linear-gradient(96deg,#7db4ff,#4f8cff 42%,#8b5cf6);
 -webkit-background-clip:text;background-clip:text;color:transparent}
.rules{margin-top:1.5vh;display:flex;gap:1.2vh}
.rules i{height:.55vh;flex:1;background:rgba(255,255,255,.14);border-radius:999px}
.foot{margin-top:3.5vh;display:flex;align-items:center;gap:1.8vh;color:#93a6c8;
 font-size:2.35vh;font-weight:600;z-index:2}
.foot img{height:3.6vh;display:block}
.type{position:relative;z-index:2}
</style></head><body><div class="card">
  <div class="badge">${BADGE}</div>
  <div class="type"><div class="a">${c.a}</div><div class="b">${c.b}</div><div class="rules"><i></i><i></i><i></i><i></i></div></div>
  <div class="foot"><img src="${TICK}" alt=""><span>dotheygetit.app &middot; free while we are testing it</span></div>
</div></body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const made = [];
  for (const [name, W, H] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page_ = await ctx.newPage();
    for (const c of CARDS) {
      await page_.setContent(page(c), { waitUntil: 'load' });
      await page_.waitForTimeout(120);
      const f = path.join(OUT, c.id + '-' + name + '.png');
      await page_.screenshot({ path: f });
      const m = await page_.evaluate(() => {
        const n = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
        const a = document.querySelector('.a'), b = document.querySelector('.b');
        const t = document.querySelector('.type').getBoundingClientRect();
        return { a: n(a), b: n(b), typePx: Math.round(t.height), frame: innerHeight, room: Math.round(innerHeight - t.bottom) };
      });
      made.push([f, fs.statSync(f).size, W + 'x' + H, m]);
    }
    await ctx.close();
  }
  await browser.close();
  const f = path.join(__dirname, '_card.html');
  fs.writeFileSync(f, page(CARDS[0]));
  console.log('cards -> marketing/out');
  for (const [p, b, dim, m] of made) console.log('  ' + path.basename(p).padEnd(26) + dim + '  ' + (b / 1024).toFixed(0) + ' KB  lines A' + m.a + '/B' + m.b + '  type ' + m.typePx + 'px  room left ' + m.room + 'px');
})();