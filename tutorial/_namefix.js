// The name box is a plain input now, and typing into it can miss. Fill it, then prove it took.
const fs = require('fs');
const F = 'record.js';
let s = fs.readFileSync(F, 'utf8');
const old = "await typeIn(page, '#studentName', 'Maya Khan', 60);";
if (s.indexOf(old) < 0) { console.error('ANCHOR MISSING'); process.exit(1); }
const rep = [
  "await page.locator('#studentName').click();",
  "await page.locator('#studentName').fill('Maya Khan');",
  "await sleep(500);",
  "if (!(await page.locator('#studentName').inputValue())) {",
  "  await page.locator('#studentName').click();",
  "  await page.locator('#studentName').pressSequentially('Maya Khan', { delay: 60 });",
  "  await sleep(500);",
  "}",
  "console.log('  name box now holds:', JSON.stringify(await page.locator('#studentName').inputValue()));"
].join('\n    ');
s = s.replace(old, rep);
fs.writeFileSync(F, s);
console.log('name entry patched');
