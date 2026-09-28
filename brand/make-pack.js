/* ============================================================================
   Get It? - New Teacher Survival Pack social image
   ----------------------------------------------------------------------------
   Renders the Facebook / WhatsApp / X link-preview card for
   /new-teacher-pack/ using the same brand source as everything else
   (brand/mark.js), so the tick and gradient can never drift.

     node brand/make-pack.js

   Output:
     brand/out/og-new-teacher-pack.png            1200 x 630  (the link preview)
     brand/out/og-new-teacher-pack-square.png     1080 x 1080 (feed square)
     landing-site/new-teacher-pack/og-pack.png    web copy
     landing-site/new-teacher-pack/og-pack-square.png
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { mark, PALETTE: P } = require('./mark');

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); }
catch { ({ chromium } = require('playwright')); }

const OUT = path.join(__dirname, 'out');
const WEB = path.join(__dirname, '..', 'landing-site', 'new-teacher-pack');

const FONT = `"Inter","Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif`;
/* Deliberately the bare domain, not the long path - a URL you can read at
   thumbnail size is a URL someone can type. */
const URL = 'dotheygetit.app/new-teacher-pack';

const GLOW = `
  background:
    radial-gradient(760px 540px at 15% 4%, rgba(79,140,255,.34), transparent 68%),
    radial-gradient(640px 480px at 92% 10%, rgba(139,92,246,.28), transparent 70%),
    radial-gradient(720px 520px at 50% 118%, rgba(61,220,132,.10), transparent 72%),
    linear-gradient(180deg, ${P.ink} 0%, ${P.ink2} 100%);`;

async function shoot(page, html, file, w, h) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const p = path.join(OUT, file);
  await page.screenshot({ path: p, clip: { x: 0, y: 0, width: w, height: h } });

  // A social image that overflows looks fine locally and loses its bottom line
  // in the feed. Measure it, and fail loudly rather than ship a cropped card.
  const over = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight
  }));
  const bad = over.sw > w + 1 || over.sh > h + 1;

  console.log('  ' + file.padEnd(40) + (w + 'x' + h).padEnd(11) +
    (fs.statSync(p).size / 1024).toFixed(1) + ' KB' +
    (bad ? '  <-- OVERFLOW ' + over.sw + 'x' + over.sh : '  ok'));
  if (bad) process.exitCode = 1;
}

/* The four things in the pack, as the little list card on the right. */
const ITEMS = [
  ['Behaviour scripts', 'what to actually say', P.accent],
  ['A plan that works', 'in four minutes', P.purple],
  ['Marking, tamed', 'stop losing evenings', P.green],
  ['Emails home', "that don't backfire", P.amber]
];
const row = (t, s, c) => `
  <div style="display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.03);
       border:1px solid ${P.line};border-left:3px solid ${c};border-radius:12px;
       padding:13px 16px;margin-bottom:10px">
    <div>
      <div style="font-size:19px;font-weight:700;color:${P.text};line-height:1.2">${t}</div>
      <div style="font-size:13.5px;color:${P.muted};margin-top:3px">${s}</div>
    </div>
  </div>`;

function page630() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0}
    body{width:1200px;height:630px;font-family:${FONT};color:${P.text};${GLOW}
      display:flex;flex-direction:column;justify-content:space-between;
      padding:56px 64px 44px;overflow:hidden}
    .top{display:flex;align-items:center;justify-content:space-between}
    .brand{display:flex;align-items:center;gap:14px}
    .brand svg{width:52px;height:52px}
    .brand .w{font-size:28px;font-weight:800;letter-spacing:-1px;line-height:1}
    .brand .w small{display:block;font-size:11.5px;font-weight:500;color:${P.muted};letter-spacing:4px;margin-top:5px}
    .badge{display:flex;align-items:center;gap:9px;font-size:16px;font-weight:700;color:${P.green};
      background:rgba(61,220,132,.14);border:1px solid rgba(61,220,132,.34);
      padding:9px 18px;border-radius:999px}
    .badge i{width:8px;height:8px;border-radius:50%;background:${P.green};display:block}
    .mid{display:flex;align-items:center;gap:44px}
    .left{flex:1;min-width:0}
    h1{font-size:64px;line-height:1.04;font-weight:800;letter-spacing:-2.6px;margin:0 0 18px}
    h1 em{font-style:normal;background:linear-gradient(100deg,${P.accentSoft},${P.purple});
      -webkit-background-clip:text;background-clip:text;color:transparent}
    .sub{font-size:21.5px;line-height:1.5;color:#c3cfe6;max-width:600px}
    .card{flex:0 0 372px;background:rgba(15,23,40,.72);border:1px solid ${P.line};
      border-radius:20px;padding:20px;box-shadow:0 34px 80px rgba(0,0,0,.5)}
    .card .h{font-size:12.5px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;
      color:${P.muted};margin:0 4px 14px}
    .foot{display:flex;align-items:center;justify-content:space-between}
    .url{font-size:18px;font-weight:600;color:${P.muted};letter-spacing:.2px}
    .who{font-size:17px;font-weight:600;color:#c3cfe6}
    .who b{color:${P.text}}
  </style></head><body>
    <div class="top">
      <div class="brand">${mark({ radius: 58 })}<div class="w">Get It?<small>DO THEY GET IT?</small></div></div>
      <div class="badge"><i></i>Free \u00b7 no signup</div>
    </div>

    <div class="mid">
      <div class="left">
        <h1>The New Teacher<br/><em>Survival Pack.</em></h1>
        <p class="sub">Behaviour scripts, planning, marking and emails home &mdash;
        the stuff nobody teaches you in week one.</p>
      </div>
      <div class="card">
        <p class="h">Inside &mdash; 8 free parts</p>
        ${ITEMS.map(([t, s, c]) => row(t, s, c)).join('')}
      </div>
    </div>

    <div class="foot">
      <div class="url">${URL}</div>
      <div class="who">For <b>ECTs, NQTs &amp; trainees</b></div>
    </div>
  </body></html>`;
}

function pageSquare() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0}
    body{width:1080px;height:1080px;font-family:${FONT};color:${P.text};${GLOW}
      display:flex;flex-direction:column;justify-content:space-between;
      padding:78px 74px 66px;overflow:hidden}
    .brand{display:flex;align-items:center;gap:18px;justify-content:center}
    .brand svg{width:66px;height:66px}
    .brand .w{font-size:34px;font-weight:800;letter-spacing:-1.2px;line-height:1}
    .brand .w small{display:block;font-size:13px;font-weight:500;color:${P.muted};letter-spacing:5px;margin-top:6px}
    .mid{text-align:center}
    .badge{display:inline-flex;align-items:center;gap:10px;font-size:20px;font-weight:700;color:${P.green};
      background:rgba(61,220,132,.14);border:1px solid rgba(61,220,132,.34);
      padding:11px 24px;border-radius:999px;margin-bottom:30px}
    .badge i{width:9px;height:9px;border-radius:50%;background:${P.green};display:block}
    h1{font-size:86px;line-height:1.02;font-weight:800;letter-spacing:-3.6px;margin:0 0 22px}
    h1 em{font-style:normal;background:linear-gradient(100deg,${P.accentSoft},${P.purple});
      -webkit-background-clip:text;background-clip:text;color:transparent}
    .sub{font-size:29px;line-height:1.45;color:#c3cfe6;max-width:780px;margin:0 auto}
    .tags{display:flex;gap:12px;justify-content:center;margin-top:38px;flex-wrap:wrap}
    .tag{font-size:21px;font-weight:700;color:#dbe6ff;background:rgba(255,255,255,.05);
      border:1px solid ${P.line};padding:12px 22px;border-radius:999px}
    .url{font-size:24px;font-weight:600;color:${P.muted};text-align:center}
  </style></head><body>
    <div class="brand">${mark({ radius: 58 })}<div class="w">Get It?<small>DO THEY GET IT?</small></div></div>
    <div class="mid">
      <div class="badge"><i></i>Free \u00b7 no signup</div>
      <h1>The New Teacher<br/><em>Survival Pack</em></h1>
      <p class="sub">Behaviour scripts, planning, marking and emails home &mdash;
      the stuff nobody teaches you in week one.</p>
      <div class="tags"><span class="tag">ECTs</span><span class="tag">NQTs</span><span class="tag">Trainees</span></div>
    </div>
    <div class="url">${URL}</div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  console.log('\nnew-teacher-pack social');

  await shoot(page, page630(), 'og-new-teacher-pack.png', 1200, 630);
  await shoot(page, pageSquare(), 'og-new-teacher-pack-square.png', 1080, 1080);

  await browser.close();

  fs.mkdirSync(WEB, { recursive: true });
  fs.copyFileSync(path.join(OUT, 'og-new-teacher-pack.png'),
    path.join(WEB, 'og-pack.png'));
  fs.copyFileSync(path.join(OUT, 'og-new-teacher-pack-square.png'),
    path.join(WEB, 'og-pack-square.png'));
  console.log('\n  copied -> landing-site/new-teacher-pack/og-pack.png');
  console.log('  copied -> landing-site/new-teacher-pack/og-pack-square.png');
  console.log('\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
