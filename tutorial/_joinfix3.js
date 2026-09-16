/* Chapter 5, third attempt, done properly.
 *
 * Why the first two failed: index.html always ships a static <input id="studentName">, so
 * "wait for the name box" passed instantly and the recorder typed into a box the app then
 * threw away. The app itself only revealed the class list on a FIRST press of Start, and
 * checked consent before revealing it - so the recorder's first press just bounced with
 * "Please tick the box above first." and the second press is what wiped the name.
 *
 * The app now looks the class up as soon as the code is typed (one press to get in), so the
 * scene becomes: type the code -> the list appears on its own -> pick a name -> tick -> Start.
 * That is exactly what a pupil does, which is the whole point of filming it.
 */
const fs = require('fs');
const P = __dirname + '/record.js';
let src = fs.readFileSync(P, 'utf8');

const START = "await typeIn(page, '#joinCode', code, 80);";
const END = "await page.locator('#checkCard').waitFor({ state: 'visible' });";

const a = src.indexOf(START);
const b = src.indexOf(END);
if (a < 0 || b < 0 || b < a) { console.error('CH5 BLOCK NOT FOUND (a=' + a + ' b=' + b + ')'); process.exit(1); }

const IND = '    ';
const block = [
  "await typeIn(page, '#joinCode', code, 80);",
  "await sleep(500);",
  "/* the name list now arrives on its own - no press needed */",
  "await page.locator('#nameArea select#studentName').waitFor({ state: 'visible', timeout: 20000 });",
  "await sleep(900);",
  "await focus(page, '#nameArea', { block: 'center', hold: 1200 });",
  "await caption(page, 'Pick your name from the list. No spelling it out.', 2600);",
  "await page.locator('#studentName').selectOption({ index: 1 });",
  "await sleep(700);",
  "console.log('  name picked:', await page.locator('#studentName').inputValue());",
  "",
  "/* the consent tick - the one thing a pupil must agree to before anything is sent */",
  "await focus(page, '.consent', { block: 'center', hold: 1000 }).catch(() => {});",
  "await caption(page, 'They tick one box: answers go to the teacher, and to an AI that reads them', 3600);",
  "await page.locator('#consent').check();",
  "await sleep(1000);",
  "",
  "/* ONE press. If this ever needs two again, the app has regressed. */",
  "await glideClick(page, '#btnJoin');",
  "await sleep(2600);",
  "const jdbg = await page.evaluate(() => {",
  "  const t = id => { const el = document.getElementById(id); return el ? (el.textContent || '').trim().slice(0, 90) : null; };",
  "  const v = id => { const el = document.getElementById(id); return el ? el.value : null; };",
  "  return { msg: t('joinMsg'), nm: v('studentName'), consentChecked: !!(document.getElementById('consent') || {}).checked, cardClass: (document.getElementById('checkCard') || { className: null }).className };",
  "});",
  "console.log('  join debug:', JSON.stringify(jdbg));",
  "if (jdbg.msg) console.log('  !! the page said:', jdbg.msg);",
].map(l => (l ? IND + l : l)).join('\n');

src = src.slice(0, a) + block + '\n' + IND + src.slice(b);
fs.writeFileSync(P, src);

/* also: the second click that used to live further down is now the only one - make sure no
   stray extra press of Start is left in chapter 5 */
const stray = src.slice(b, b + 4000).indexOf("await page.locator('#btnJoin')");
console.log('CH5 rewritten. stray extra presses after the join:', stray < 0 ? 'none' : 'CHECK LINE ' + stray);
console.log('lines:', src.split('\n').length);
