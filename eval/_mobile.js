const path = require('path');
const fs = require('fs');
const PW = process.env.PW_DIR || 'C:/Users/CREVE/Desktop/apps/briefs/node_modules/playwright';
const { chromium } = require(PW);

const SITE = process.env.SITE || 'https://app.dotheygetit.app';
const OUT = path.join(__dirname, '..', 'tutorial', 'out', 'mobile');
fs.mkdirSync(OUT, { recursive: true });

/* iPhone 14 in CSS pixels, the width most of these will actually be */
const PHONE = { width: 390, height: 844 };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();

  const probe = async (label, url, shot) => {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const over = [...document.querySelectorAll('*')]
        .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 6)
        .map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''));
      const small = [...document.querySelectorAll('button,a,input,select,textarea')]
        .filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.height < 40 || r.width < 40); })
        .slice(0, 5).map(el => (el.id ? '#' + el.id : el.tagName.toLowerCase()));
      return {
        scrollW: de.scrollWidth, innerW: window.innerWidth,
        overflowX: de.scrollWidth - window.innerWidth,
        offenders: over, tinyTargets: small,
        smallestFont: Math.min(...[...document.querySelectorAll('body *')].filter(e => e.textContent && e.textContent.trim()).map(e => parseFloat(getComputedStyle(e).fontSize)).filter(Boolean)),
      };
    });
    console.log('\n--- ' + label + ' ' + url);
    console.log('  width ' + m.innerW + ' / content ' + m.scrollW + (m.overflowX > 0 ? '   ** SIDEWAYS SCROLL +' + m.overflowX + 'px **' : '   ok'));
    if (m.offenders.length) console.log('  past the edge: ' + m.offenders.join(', '));
    if (m.tinyTargets.length) console.log('  tap targets under 40px: ' + m.tinyTargets.join(', '));
    console.log('  smallest text: ' + m.smallestFont + 'px');
    if (shot) { await page.screenshot({ path: path.join(OUT, shot + '.png'), fullPage: false }); console.log('  shot: ' + shot + '.png'); }
    return m;
  };

  await probe('landing', SITE + '/', '01-landing');
  await page.evaluate(() => { const t = document.getElementById('tab-student'); if (t) t.click(); });
  await page.waitForTimeout(1200);
  await probe('pupil tab (join)', SITE + '/', '02-join');
  await probe('help', SITE + '/help', '03-help');
  await probe('privacy', SITE + '/privacy', '04-privacy');

  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log('\nshots in tutorial/out/mobile: ' + files.join(', '));
  await browser.close();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
