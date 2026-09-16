const fs = require('fs');
const aj = fs.readFileSync('public/app.js', 'utf8');
[...aj.matchAll(/ovbtn/g)].forEach(m => {
  const s = Math.max(0, m.index - 160);
  console.log('@' + m.index + ' :: ' + aj.slice(s, m.index + 160).replace(/\s+/g, ' '));
  console.log('---');
});
console.log('=== badge / YOU ===');
[...aj.matchAll(/\(YOU\)|byou|data-ov|ovlvl/g)].forEach(m => {
  console.log('@' + m.index + ' :: ' + aj.slice(Math.max(0, m.index - 200), m.index + 120).replace(/\s+/g, ' '));
  console.log('---');
});
