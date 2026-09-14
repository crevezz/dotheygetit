/* ============================================================================
   Get It? - brand asset generator
   ----------------------------------------------------------------------------
   Renders every asset the brand needs from a single source (brand/mark.js), so
   the favicon, the app icon and the social image can never disagree.

   Uses the Playwright already installed in ../briefs - same as tutorial/record.js.

     node brand/make.js            everything
     node brand/make.js icons      just the favicon / app icon set
     node brand/make.js social     just the OG / Twitter / banner images

   Output: brand/out/  (plus web-ready copies copied into the right folders)
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { mark, tick, PALETTE: P } = require('./mark');
const { buildIco } = require('./ico');

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); }
catch { ({ chromium } = require('playwright')); }

const OUT = path.join(__dirname, 'out');
const only = (process.argv[2] || '').toLowerCase();

const FONT = `"Inter","Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif`;
const URL = 'app.dotheygetit.app';
const TAG = 'Know who got it \u2014 before the test does.';

/* ---------- helpers ------------------------------------------------------- */

async function shoot(page, html, file, w, h, { transparent = false } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.screenshot({
    path: path.join(OUT, file),
    omitBackground: transparent,
    clip: { x: 0, y: 0, width: w, height: h }
  });
  console.log('  ' + file.padEnd(34) + (w + 'x' + h).padEnd(11) +
    (fs.statSync(path.join(OUT, file)).size / 1024).toFixed(1) + ' KB');
}

/* The glow the whole site sits on - reused so images feel like the product. */
const GLOW = `
  background:
    radial-gradient(720px 520px at 18% 6%, rgba(79,140,255,.30), transparent 68%),
    radial-gradient(620px 460px at 88% 12%, rgba(139,92,246,.24), transparent 70%),
    radial-gradient(700px 500px at 50% 116%, rgba(61,220,132,.10), transparent 72%),
    linear-gradient(180deg, ${P.ink} 0%, ${P.ink2} 100%);`;

/* ---------- icons --------------------------------------------------------- */

async function icons(page) {
  console.log('\nicons');

  // Favicon: rounded tile, so it looks deliberate in a tab strip.
  // The tick is drawn a little heavier at tiny sizes - at 16px the standard
  // weight thins out to barely a pixel and the tick stops reading as a tick.
  const WEIGHT = { 16: 33, 32: 30, 48: 28, 64: 27 };
  for (const s of [16, 32, 48, 64]) {
    await shoot(page, svgPage(mark({ size: s, radius: 58, weight: WEIGHT[s] })),
      `favicon-${s}.png`, s, s, { transparent: true });
  }

  // Apple touch: full bleed square - iOS applies its own rounding, and a
  // pre-rounded icon ends up with visible corners inside the iOS mask.
  await shoot(page, svgPage(mark({ size: 180, radius: 0 })), 'apple-touch-icon.png', 180, 180);

  // Android / PWA.
  await shoot(page, svgPage(mark({ size: 192, radius: 46 })), 'android-chrome-192.png', 192, 192);
  await shoot(page, svgPage(mark({ size: 512, radius: 120 })), 'android-chrome-512.png', 512, 512);

  // Maskable: Android may crop to a circle, so anything outside the middle 80%
  // can be cut. Tick shrunk to 55% so it is always safe.
  await shoot(page, svgPage(mark({ size: 512, radius: 0, scale: 0.55 })), 'android-chrome-maskable-512.png', 512, 512);

  // Windows / Teams tile.
  await shoot(page, svgPage(mark({ size: 150, radius: 34 })), 'mstile-150.png', 150, 150);

  // Vector favicon - modern browsers prefer this, and it stays sharp at any zoom.
  fs.writeFileSync(path.join(OUT, 'favicon.svg'), mark({ radius: 58 }));

  // Multi-size .ico for the browsers and link previews that still want one.
  const ico = buildIco([16, 32, 48].map(s => ({
    size: s, png: fs.readFileSync(path.join(OUT, `favicon-${s}.png`))
  })));
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico);
  console.log('  ' + 'favicon.ico'.padEnd(34) + '16+32+48'.padEnd(11) + (ico.length / 1024).toFixed(1) + ' KB');

  // Web manifest.
  fs.writeFileSync(path.join(OUT, 'site.webmanifest'), JSON.stringify({
    name: 'Get It?', short_name: 'Get It?',
    description: 'Find out who really understood the lesson - before the test does.',
    start_url: '/', scope: '/', display: 'standalone',
    background_color: P.ink, theme_color: P.accent,
    icons: [
      { src: '/android-chrome-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/android-chrome-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }, null, 2) + '\n');

  // Logos for press, email signatures, decks. Transparent.
  await shoot(page, svgPage(logoRow({ h: 200 })), 'logo-horizontal.png', 900, 260, { transparent: true });
  await shoot(page, svgPage(logoRow({ h: 200, stacked: true })), 'logo-stacked.png', 620, 460, { transparent: true });
  fs.writeFileSync(path.join(OUT, 'logo-mark.svg'), mark({ radius: 58 }));
  fs.writeFileSync(path.join(OUT, 'tick-white.svg'), tick({ colour: '#ffffff' }));
  fs.writeFileSync(path.join(OUT, 'tick-dark.svg'), tick({ colour: '#0b1020' }));
}

/* ---------- social -------------------------------------------------------- */

async function social(page) {
  console.log('\nsocial');

  await shoot(page, ogPage(), 'og-image.png', 1200, 630);
  await shoot(page, ogPage({ square: true }), 'og-square.png', 1080, 1080);
  await shoot(page, ogPage({ tall: true }), 'story-1080x1920.png', 1080, 1920);
  await shoot(page, bannerPage(), 'linkedin-banner-1584x396.png', 1584, 396);
  await shoot(page, bannerPage({ twitter: true }), 'twitter-card-1200x600.png', 1200, 600);
}

/* ---------- templates ----------------------------------------------------- */

const svgPage = (svg) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
     html,body{margin:0;padding:0;background:transparent}
     svg{display:block}
   </style></head><body>${svg}</body></html>`;

const logoRow = ({ h = 200, stacked = false }) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="${stacked ? 620 : 900}" height="${stacked ? 460 : 260}"
       viewBox="0 0 ${stacked ? 620 : 900} ${stacked ? 460 : 260}">
    <defs>${'<linearGradient id="gi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7db4ff"/><stop offset=".42" stop-color="#4f8cff"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>'}</defs>
    ${stacked
      ? `<g transform="translate(210 40) scale(${200 / 256})">
           <rect width="256" height="256" rx="58" fill="url(#gi)"/>
           <path d="M62 133 L107 178 L195 84" fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
         </g>
         <text x="310" y="330" text-anchor="middle" font-family='${FONT}' font-size="104" font-weight="800" fill="#ffffff" letter-spacing="-3">Get It?</text>
         <text x="310" y="386" text-anchor="middle" font-family='${FONT}' font-size="30" font-weight="500" fill="#93a3c4" letter-spacing="4">DO THEY GET IT?</text>`
      : `<g transform="translate(20 30) scale(${200 / 256})">
           <rect width="256" height="256" rx="58" fill="url(#gi)"/>
           <path d="M62 133 L107 178 L195 84" fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
         </g>
         <text x="268" y="152" font-family='${FONT}' font-size="104" font-weight="800" fill="#ffffff" letter-spacing="-3">Get It?</text>
         <text x="272" y="204" font-family='${FONT}' font-size="30" font-weight="500" fill="#93a3c4" letter-spacing="4">DO THEY GET IT?</text>`}
  </svg>`;

function ogPage({ square = false, tall = false } = {}) {
  const w = square ? 1080 : tall ? 1080 : 1200;
  const h = square ? 1080 : tall ? 1920 : 630;
  const big = square || tall;

  if (tall) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0}
      body{width:${w}px;height:${h}px;font-family:${FONT};color:${P.text};${GLOW}
        display:flex;flex-direction:column;justify-content:space-between;padding:110px 90px 96px;overflow:hidden}
      .mark{width:170px;height:170px}
      .word{font-size:62px;font-weight:800;letter-spacing:-2px;margin-top:30px}
      .word small{display:block;font-size:24px;font-weight:500;color:${P.muted};letter-spacing:6px;margin-top:8px}
      h1{font-size:92px;line-height:1.05;font-weight:800;letter-spacing:-3.5px;margin:0 0 34px}
      h1 em{font-style:normal;background:linear-gradient(100deg,${P.accentSoft},${P.purple});-webkit-background-clip:text;background-clip:text;color:transparent}
      p{font-size:34px;line-height:1.45;color:#c3cfe6;max-width:820px}
      .strip{display:flex;gap:18px;margin-top:52px}
      .pill{font-size:26px;font-weight:700;padding:16px 30px;border-radius:999px}
      .g{background:rgba(61,220,132,.16);color:${P.green}}
      .a{background:rgba(255,200,87,.16);color:${P.amber}}
      .r{background:rgba(255,107,107,.16);color:${P.red}}
      .url{font-size:28px;font-weight:600;color:${P.muted};letter-spacing:.4px}
    </style></head><body>
      <div>
        <div class="mark">${mark({ radius: 58 })}</div>
        <div class="word">Get It?<small data-deco>DO THEY GET IT?</small></div>
      </div>
      <div>
        <h1>You taught it.<br/>Did they <em>get it?</em></h1>
        <p>Find out in two minutes who really understood &mdash; and who is quietly faking it.</p>
        <div class="strip">
          <span class="pill g">21 get it</span><span class="pill a">6 shaky</span><span class="pill r">3 struggling</span>
        </div>
      </div>
      <div class="url">${URL} &nbsp;&middot;&nbsp; ${TAG}</div>
    </body></html>`;
  }

  const markSize = big ? 128 : 74;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0}
      body{width:${w}px;height:${h}px;font-family:${FONT};color:${P.text};${GLOW}
        display:flex;align-items:center;gap:${big ? 0 : 52}px;
        flex-direction:${big ? 'column' : 'row'};
        justify-content:${big ? 'center' : 'flex-start'};
        padding:${big ? 96 : 62}px ${big ? 92 : 72}px;overflow:hidden}
      .left{flex:1;min-width:0}
      .brand{display:flex;align-items:center;gap:18px;margin-bottom:${big ? 54 : 34}px;justify-content:${big ? 'center' : 'flex-start'}}
      .brand svg{width:${markSize}px;height:${markSize}px;flex:0 0 auto}
      .word{font-size:${big ? 50 : 40}px;font-weight:800;letter-spacing:-1.5px;line-height:1}
      .word small{display:block;font-size:${big ? 19 : 15}px;font-weight:500;color:${P.muted};letter-spacing:5px;margin-top:7px}
      h1{font-size:${big ? 86 : 74}px;line-height:1.04;font-weight:800;letter-spacing:-3px;margin-bottom:26px;text-align:${big ? 'center' : 'left'}}
      h1 em{font-style:normal;background:linear-gradient(100deg,${P.accentSoft},${P.purple});-webkit-background-clip:text;background-clip:text;color:transparent}
      p{font-size:${big ? 32 : 25}px;line-height:1.5;color:#c3cfe6;max-width:${big ? 780 : 620}px;text-align:${big ? 'center' : 'left'}}
      .strip{display:flex;gap:12px;margin-top:${big ? 46 : 32}px;justify-content:${big ? 'center' : 'flex-start'}}
      .pill{font-size:${big ? 24 : 18}px;font-weight:700;padding:${big ? 14 : 10}px ${big ? 26 : 20}px;border-radius:999px}
      .g{background:rgba(61,220,132,.16);color:${P.green}}
      .a{background:rgba(255,200,87,.16);color:${P.amber}}
      .r{background:rgba(255,107,107,.16);color:${P.red}}
      .url{font-size:${big ? 24 : 19}px;font-weight:600;color:${P.muted};margin-top:${big ? 54 : 34}px;text-align:${big ? 'center' : 'left'}}
      ${big ? '' : `/* the little result card on the right of the 1200x630 */`}
    </style></head><body>
      <div class="left">
        <div class="brand">${mark({ radius: 58 })}<div class="word">Get It?<small data-deco>DO THEY GET IT?</small></div></div>
        <h1>You taught it.<br/>Did they <em>get it?</em></h1>
        <p>Find out in two minutes who really understood &mdash; and who is quietly faking it. Thirty pupils, one conversation each.</p>
        <div class="strip"><span class="pill g">21 get it</span><span class="pill a">6 shaky</span><span class="pill r">3 struggling</span></div>
        <div class="url">${URL}</div>
      </div>
      ${big ? '' : `
      <div data-deco style="flex:0 0 372px">
        <div style="background:#0f1728;border:1px solid ${P.line};border-radius:22px;padding:22px;box-shadow:0 40px 90px rgba(0,0,0,.55)">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px">
            <b style="font-size:17px">Comparing fractions</b><span style="font-size:12px;color:${P.muted}">Today</span>
          </div>
          ${pupilRow('Amira', 'Explained it cleanly', P.green, 'green')}
          ${pupilRow('Jack', 'Knows it, muddles the comparison', P.amber, 'amber')}
          ${pupilRow('Callum', 'Reading 4 as bigger than 3', P.red, 'red')}
        </div>
      </div>`}
    </body></html>`;
}

const pupilRow = (name, note, colour, tag) => `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;
       background:rgba(255,255,255,.025);border:1px solid ${P.line};border-left:3px solid ${colour};
       border-radius:12px;padding:12px 14px;margin-bottom:9px">
    <div><div style="font-size:14px;font-weight:650">${name}</div>
      <div style="font-size:11.5px;color:${P.muted};margin-top:2px">${note}</div></div>
    <span style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
      padding:4px 10px;border-radius:999px;background:${colour}22;color:${colour};flex:0 0 auto">${tag}</span>
  </div>`;

function bannerPage({ twitter = false } = {}) {
  const w = twitter ? 1200 : 1584;
  const h = twitter ? 600 : 396;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box;margin:0}
      body{width:${w}px;height:${h}px;font-family:${FONT};color:${P.text};${GLOW}
        display:flex;align-items:center;justify-content:space-between;gap:40px;
        padding:${twitter ? 70 : 52}px ${twitter ? 80 : 70}px;overflow:hidden}
      .brand{display:flex;align-items:center;gap:16px}
      .brand svg{width:${twitter ? 92 : 76}px;height:${twitter ? 92 : 76}px}
      .word{font-size:${twitter ? 46 : 38}px;font-weight:800;letter-spacing:-1.5px;line-height:1}
      .word small{display:block;font-size:${twitter ? 17 : 14}px;font-weight:500;color:${P.muted};letter-spacing:5px;margin-top:6px}
      h1{font-size:${twitter ? 62 : 52}px;line-height:1.08;font-weight:800;letter-spacing:-2.4px;text-align:right}
      h1 em{font-style:normal;background:linear-gradient(100deg,${P.accentSoft},${P.purple});-webkit-background-clip:text;background-clip:text;color:transparent}
      .url{font-size:${twitter ? 22 : 18}px;font-weight:600;color:${P.muted};margin-top:${twitter ? 22 : 14}px;text-align:right}
    </style></head><body>
      <div class="brand">${mark({ radius: 58 })}<div class="word">Get It?<small data-deco>DO THEY GET IT?</small></div></div>
      <div>
        <h1>You taught it.<br/>Did they <em>get it?</em></h1>
        <div class="url">${URL}</div>
      </div>
    </body></html>`;
}

/* ---------- contact sheet ------------------------------------------------- */

async function sheet(page) {
  const files = fs.readdirSync(OUT).filter(f => /\.(png|svg)$/.test(f)).sort();
  const cells = files.map(f => {
    const isSvg = f.endsWith('.svg');
    const dim = isSvg ? 'vector' : pngSize(f);
    return `<figure><div class="box"><img src="${f}"/></div>
      <figcaption><b>${f}</b><span>${dim}</span></figcaption></figure>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Get It? brand assets</title><style>
    body{font-family:${FONT};background:#0b1020;color:${P.text};padding:44px;margin:0}
    h1{font-size:30px;margin:0 0 6px;letter-spacing:-1px}
    p.sub{color:${P.muted};margin:0 0 34px;font-size:15px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:22px}
    figure{margin:0;background:#111a2e;border:1px solid ${P.line};border-radius:16px;padding:18px;
      display:flex;flex-direction:column;gap:14px}
    .box{background:repeating-conic-gradient(#1a2236 0% 25%,#141d2f 0% 50%) 50%/22px 22px;
      border-radius:10px;padding:16px;display:grid;place-items:center;min-height:150px}
    img{max-width:100%;max-height:190px;display:block}
    figcaption{font-size:12.5px;display:flex;justify-content:space-between;gap:10px;color:${P.muted}}
    figcaption b{color:${P.text};font-weight:650;word-break:break-all}
  </style></head><body>
    <h1>Get It? &mdash; brand assets</h1>
    <p class="sub">Generated by brand/make.js. Checkerboard = transparent.</p>
    <div class="grid">${cells}</div>
  </body></html>`;
  fs.writeFileSync(path.join(OUT, 'preview.html'), html);
}

function pngSize(file) {
  const b = fs.readFileSync(path.join(OUT, file));
  return b.readUInt32BE(16) + '\u00d7' + b.readUInt32BE(20);
}

/* ---------- run ----------------------------------------------------------- */

module.exports = { ogPage, bannerPage, logoRow, mark, tick, PALETTE: P };

if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('Get It? brand assets -> ' + OUT);
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  if (!only || only === 'icons') await icons(page);
  if (!only || only === 'social') await social(page);
  await sheet(page);

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'preview.url'), '[InternetShortcut]\nURL=file:///' +
    path.join(OUT, 'preview.html').replace(/\\/g, '/') + '\n');
  console.log('\nDone. Open brand/out/preview.html to eyeball the lot.');
})();
