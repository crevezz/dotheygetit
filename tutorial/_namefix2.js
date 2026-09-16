// Set the name whichever way the page presents it - a pick list or a plain box -
// through the DOM, so it cannot matter which one it is.
const fs = require('fs');
const F = 'record.js';
let s = fs.readFileSync(F, 'utf8');
const start = s.indexOf("await page.locator('#studentName').click();");
if (start < 0) { console.error('ANCHOR MISSING'); process.exit(1); }
const endMark = "console.log('  name box now holds:', JSON.stringify(await page.locator('#studentName').inputValue()));";
const end = s.indexOf(endMark, start);
if (end < 0) { console.error('END ANCHOR MISSING'); process.exit(1); }

const rep = [
  "await page.evaluate(() => {",
  "  const el = document.getElementById('studentName');",
  "  if (!el) return;",
  "  if (el.tagName === 'SELECT') {",
  "    const o = [...el.options].find(o => o.value && o.value !== '__other');",
  "    if (o) el.value = o.value;",
  "  } else { el.value = 'Maya Khan'; }",
  "  el.dispatchEvent(new Event('input', { bubbles: true }));",
  "  el.dispatchEvent(new Event('change', { bubbles: true }));",
  "});",
  "await sleep(600);",
  "console.log('  name now picked:', JSON.stringify(await page.evaluate(() => { const el = document.getElementById('studentName'); return el ? { tag: el.tagName, value: el.value } : null; })));"
].join('\n    ');

s = s.slice(0, start) + rep + s.slice(end + endMark.length);
fs.writeFileSync(F, s);
console.log('name picking patched');
