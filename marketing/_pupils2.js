const fs = require('fs');
const f = __dirname + '/scenes.js';
let c = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!c.includes(a)) throw new Error('missing: ' + a.slice(0, 60)); c = c.replace(a, b); };
if (!c.includes('.pup.up .hd{')) {
  rep('.pup.dim .hd{', `.pup.up .hd{background:radial-gradient(circle at 50% 66%,var(--sk) 0 56%,#0000 57%),var(--hr);box-shadow:0 0 0 calc(var(--u) * .25) rgba(0,0,0,.25)}
.pup.up .sh{background:linear-gradient(180deg,var(--jp),#1c2740)}
.pup.up .ua,.pup.up .fa{background:linear-gradient(90deg,var(--jp),color-mix(in srgb,var(--jp),#fff 18%))}
.pup.up .hand{background:linear-gradient(180deg,var(--sk),color-mix(in srgb,var(--sk),#000 18%))}
.pup.up .arm{height:calc(var(--u) * 4);width:calc(var(--u) * 3.1)}
.pup.up .fa{width:calc(var(--u) * 2.8);height:calc(var(--u) * 3.8);top:calc(var(--u) * -3.6)}
.pup.up .hand{width:calc(var(--u) * 3.6);height:calc(var(--u) * 4.2);top:calc(var(--u) * -3.7)}
.pup.dim .hd{`);
}
rep(";--fb:${[-22,-12,-28,-16,-20][i%5]}deg\">",
  ";--fb:${[-22,-12,-28,-16,-20][i%5]}deg;--sk:${['#f0cfa8','#c68a5c','#e6b98f','#8d5a3b','#f3d6b6'][i%5]};--hr:${['#2b1d14','#111111','#8a5a2b','#1a1410','#c79a52'][i%5]};--jp:${['#4a6898','#8a3b4e','#3d7b5a','#6a58a0','#9a7a33'][i%5]}\">");
fs.writeFileSync(f, c);
console.log('ok');
