const fs = require('fs');
const aj = fs.readFileSync('public/app.js', 'utf8');
[...aj.matchAll(/studentName/g)].forEach(m => {
  console.log('@' + m.index + ' :: ' + aj.slice(Math.max(0, m.index - 120), m.index + 220).replace(/\s+/g, ' '));
  console.log('---');
});
const i = aj.indexOf('Now pick your name');
console.log('=== msg site ===\n' + aj.slice(Math.max(0, i - 900), i + 200).replace(/\s+/g, ' '));
