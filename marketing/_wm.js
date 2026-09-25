const fs = require('fs');
const f = __dirname + '/beat-film.js';
const L = fs.readFileSync(f, 'utf8').split('\n');
const i = L.findIndex((l) => l.includes('var lastB'));
L[i] = "  var lastB = PLAN[PLAN.length - 1]; if (T > lastB.s) w *= clamp(1 - (T - lastB.s) / 0.3);\n  if (wmark) { wmark.style.opacity = (w * 0.9).toFixed(3); wmark.style.transform = 'translateY(' + ((1 - w) * 8).toFixed(1) + 'px)'; }";
fs.writeFileSync(f, L.join('\n'));
console.log('fixed line', i + 1);
