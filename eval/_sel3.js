const fs = require('fs');
const aj = fs.readFileSync('public/app.js', 'utf8');
const i = aj.indexOf('folded ones are remembered by name');
console.log('=== FOLD LISTENER ===\n' + aj.slice(i, i + 900).replace(/\s+/g, ' ') + '\n');
const j = aj.indexOf('ovbtn');
console.log('=== OVBUTTON MARKUP ===\n' + aj.slice(Math.max(0, j - 700), j + 120).replace(/\s+/g, ' ') + '\n');
const k = aj.indexOf('const drawResults');
console.log('=== drawResults HEAD ===\n' + aj.slice(k, k + 700).replace(/\s+/g, ' '));
