// Keep trying to get in: set the name, press Start, and if the page redraws the picker,
// do it again. Whichever way the page behaves, the pupil ends up in the check.
const fs = require('fs');
const F = 'record.js';
let s = fs.readFileSync(F, 'utf8');

const click = "await page.locator('#btnJoin').click();";
const first = s.indexOf(click);
const start = s.indexOf(click, first + 1);
if (start < 0) { console.error('SECOND JOIN NOT FOUND'); process.exit(1); }
const wait = "await page.locator('#checkCard').waitFor({ state: 'visible' });";
const w = s.indexOf(wait, start);
if (w < 0) { console.error('WAIT ANCHOR MISSING'); process.exit(1); }

const setter = [
  "  await page.evaluate(() => {",
  "    const el = document.getElementById('studentName');",
  "    if (!el) return;",
  "    if (el.tagName === 'SELECT') {",
  "      const o = [...el.options].find(o => o.value && o.value !== '__other');",
  "      if (o) el.value = o.value;",
  "    } else { el.value = 'Maya Khan'; }",
  "    el.dispatchEvent(new Event('input', { bubbles: true }));",
  "    el.dispatchEvent(new Event('change', { bubbles: true }));",
  "  });"
].join('\n');

const rep = [
  "for (let k = 0; k < 4; k++) {",
  setter,
  "  await sleep(600);",
  "  await page.locator('#btnJoin').click();",
  "  await sleep(2200);",
  "  const ok = await page.evaluate(() => { const c = document.getElementById('checkCard'); return !!(c && !c.classList.contains('hidden')); });",
  "  console.log('  join attempt ' + (k + 1) + ':', ok ? 'in' : 'picker came back - trying again');",
  "  if (ok) break;",
  "}"
].join('\n    ');

s = s.slice(0, start) + rep + '\n    ' + s.slice(w);
fs.writeFileSync(F, s);
console.log('join is now a retry loop');
