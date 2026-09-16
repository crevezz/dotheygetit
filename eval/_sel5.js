const fs = require('fs');
const ix = fs.readFileSync('public/index.html', 'utf8');
const i = ix.indexOf('id="tab-teacher"');
console.log(ix.slice(Math.max(0, i - 500), i + 400).replace(/\s+/g, ' '));
