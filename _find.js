const fs = require('fs');
const h = fs.readFileSync('landing-site/index.html', 'utf8');
const lines = h.split('\n');
const hits = [];
lines.forEach((l, i) => {
  if (/<br\s*\/?>\s*$/i.test(l.trim()) || /<span class="mark">\s*<\/span>/i.test(l)) hits.push(i);
});
for (const i of hits) console.log('--- line ' + (i + 1) + ' ---\n' + lines.slice(Math.max(0, i - 3), i + 4).map((x, k) => (i - 2 + k) + ': ' + x).join('\n'));
console.log('\ncounts: bare <br> at EOL =', lines.filter((l) => /<br\s*\/?>\s*$/i.test(l.trim())).length, '| empty span.mark =', (h.match(/<span class="mark">\s*<\/span>/gi) || []).length);
