const fs = require('fs');
const aj = fs.readFileSync('public/app.js', 'utf8');
const find = (needle, n = 200) => {
  const i = aj.indexOf(needle);
  if (i < 0) { console.log('### ' + needle + ' -> NOT FOUND'); return; }
  console.log('### ' + needle + ' @' + i + '\n' + aj.slice(i, i + n).replace(/\s+/g, ' ') + '\n');
};
['qrow', 'qdel', 'btnAddQ', 'folded', 'pdone', 'ovbtn', 'stags', 'sname', 'ckill', 'btnExport'].forEach(n => find(n));
console.log('=== qlist markup in index.html ===');
const ix = fs.readFileSync('public/index.html', 'utf8');
const i = ix.indexOf('id="qlist"');
console.log(ix.slice(Math.max(0, i - 300), i + 200).replace(/\s+/g, ' '));
