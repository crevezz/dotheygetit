// The second Join press: click it natively, then say what the page replied.
const fs = require('fs');
const F = 'record.js';
let s = fs.readFileSync(F, 'utf8');
const needle = "await glideClick(page, '#btnJoin');";
const first = s.indexOf(needle);
if (first < 0) { console.error('ANCHOR MISSING'); process.exit(1); }
const second = s.indexOf(needle, first + 1);
if (second < 0) { console.error('SECOND JOIN NOT FOUND'); process.exit(1); }

const after = s.indexOf('\n', second);
const lines = [
  "await sleep(500);",
  "await page.locator('#btnJoin').click();",
  "await sleep(2400);",
  "const jdbg = await page.evaluate(() => {",
  "  const t = id => { const el = document.getElementById(id); return el ? (el.textContent || '').trim().slice(0, 90) : null; };",
  "  const v = id => { const el = document.getElementById(id); return el ? el.value : null; };",
  "  return { msg: t('joinMsg'), nm: v('studentName'), consentChecked: !!(document.getElementById('consent') || {}).checked, cardClass: (document.getElementById('checkCard') || { className: null }).className };",
  "});",
  "console.log('  join debug:', JSON.stringify(jdbg));"
].join('\n    ');

s = s.slice(0, second) + lines + s.slice(after);
fs.writeFileSync(F, s);
console.log('patched. second join now:', s.slice(second, second + 120).replace(/\n/g, ' | '));
