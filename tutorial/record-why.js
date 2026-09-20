/* ============================================================================
   Get It? - "Why I built this" recorder
   ----------------------------------------------------------------------------
   Chapter 7 is not a demo, it is a scroll of the landing page with narration on
   top. Same film overlay as record.js, same black chapter card, so the same
   ffmpeg pipeline cuts it.

   Output: tutorial/out/why.webm
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { OVERLAY } = require('./record.js');

const PW_DIR = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
let chromium;
try { ({ chromium } = require(PW_DIR)); } catch { ({ chromium } = require('playwright')); }

const URL = process.env.WHY_URL || 'https://dotheygetit.app/';
/* MOBILE=1 mirrors record.js: the same phone viewport, so the landing chapter
   belongs to a mobile set instead of being the one landscape video in it. */
const MOBILE = process.env.MOBILE?.trim() === '1';
const VP  = MOBILE ? { width: 390, height: 844 } : { width: 1280, height: 800 };
const DSF = MOBILE ? 2 : 1;
const TAKE = MOBILE ? 'why-mobile' : 'why';
/* desktop-framed cursor coords, scaled into whatever viewport is being filmed:
   identical to before at 1280x800, and on-screen on a phone. */
const mx = x => Math.round(x / 1280 * VP.width);
const my = y => Math.round(y / 800 * VP.height);
const OUT = path.join(__dirname, 'out');
const CARD_MS = Number(process.env.CARD_MS) || 2200;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TL = [];
let T0 = 0;
const mark = n => TL.push({ name: n, at: T0 ? Date.now() - T0 : 0 });

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('Why-I-built-this recorder ->', URL);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VP,
    /* size = the viewport, NOT viewport*DSF: Playwright pads rather than scales up,
       which would leave the page in the top-left of a grey frame. */
    recordVideo: { dir: OUT, size: { width: VP.width, height: VP.height } },
    deviceScaleFactor: DSF,
    isMobile: MOBILE,
    hasTouch: MOBILE
  });
  await context.addInitScript(OVERLAY);

  const page = await context.newPage();
  const video = page.video();
  T0 = Date.now();
  mark('start');

  /* .trim(): `set CAPTIONS=0 && node ...` leaves a trailing space, and "0 " !== "0" */
  const CAPTIONS = (process.env.CAPTIONS || '').trim() !== '0';
  const cap = (t, hold = 2600) =>
    (CAPTIONS ? page.evaluate(x => window.__cap(x), t) : Promise.resolve()).then(() => page.waitForTimeout(hold));
  const clearCap = () => page.evaluate(() => window.__cap(''));

  await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await sleep(1200);
  await page.mouse.move(mx(640), my(300), { steps: 12 });
  await sleep(600);

  /* black chapter card - the "chapter 7" title */
  mark('card:7');
  await page.evaluate(() => window.__card(7, 'Why I built this', 'The bit behind it'));
  await page.waitForTimeout(CARD_MS);
  await page.evaluate(() => window.__card(null));
  await sleep(700);

  /* slow, deliberate scroll of the whole page, pausing to read */
  const goTo = async (frac, hold) => {
    await page.evaluate(f => {
      const max = Math.max(0, document.body.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.round(max * f), behavior: 'smooth' });
    }, frac);
    await page.waitForTimeout(1100);
    await page.mouse.move(mx(430 + Math.round(frac * 200)), my(340 + Math.round(frac * 90)), { steps: 18 });
    await page.waitForTimeout(hold);
  };

  await cap('Every teacher has had this drive home.', 3000);
  await goTo(0.14, 1200);
  await cap('You taught it. It felt like it landed.', 3000);
  await goTo(0.30, 1400);
  await cap('Then something tells you it did not — three weeks later.', 3400);
  await goTo(0.46, 1400);
  await cap('Usually with the ones who would never put their hand up.', 3400);
  await goTo(0.62, 1200);
  await cap('Asking in front of the class does not work.', 3000);
  await goTo(0.76, 1400);
  await cap('So I stopped asking. It asks them properly, one to one.', 3400);
  await goTo(0.90, 1400);
  await cap('And shows you the gaps while you can still fix them.', 3400);
  await clearCap();
  await sleep(1600);
  mark('end');

  const raw = video ? await video.path() : null;
  await context.close();
  await browser.close();

  if (raw && fs.existsSync(raw)) {
    const final = path.join(OUT, TAKE + '.webm');
    if (fs.existsSync(final)) fs.unlinkSync(final);
    fs.renameSync(raw, final);
    fs.writeFileSync(path.join(OUT, 'timeline-' + TAKE + '.json'), JSON.stringify({ cardMs: CARD_MS, marks: TL }, null, 2));
    console.log('  ' + TAKE + ' -> ' + final + '  (' + (fs.statSync(final).size / 1048576).toFixed(1) + ' MB)');
    console.log('  marks -> ' + TL.map(m => m.name + '@' + (m.at / 1000).toFixed(1) + 's').join('  '));
  } else {
    console.log('  No video produced.');
  }
}

if (require.main === module) main().catch(e => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
