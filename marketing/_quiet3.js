const fs = require('fs');
const D = __dirname;
let s = fs.readFileSync(D + '/scenes.js', 'utf8');
const r = (a, b) => { if (!s.includes(a)) throw new Error('missing ' + a.slice(0, 60)); s = s.replace(a, b); };
if (!s.includes('.ph.tab{')) {
  r('html: `<div class="ph">', 'html: `<div class="ph${cfg.tab ? \' tab\' : \'\'}">');
  r('.phtop{', '.ph.tab{width:calc(var(--u) * 62);min-height:calc(var(--u) * 42);border-radius:calc(var(--u) * 3)}\n.ph.tab:before{display:none}\n.phtop{');
  r("<div class=\"domsub\">${esc(cfg.sub || 'Free. Nothing to install.')}</div>",
    "${cfg.min ? '' : `<div class=\"domsub\">${esc(cfg.sub || 'Free. Nothing to install.')}</div>`}");
}
fs.writeFileSync(D + '/scenes.js', s);
let c = fs.readFileSync(D + '/beats.config.js', 'utf8');
if (!c.includes('tab: 1')) {
  if (!c.includes("mode: 'type' }, 4:")) throw new Error('cfg');
  c = c.replace("mode: 'type' }, 4:", "mode: 'type', tab: 1 }, 5: { min: 1 }, 4:");
}
fs.writeFileSync(D + '/beats.config.js', c);
const f = D + '/scripts/quiet.json';
const j = JSON.parse(fs.readFileSync(f, 'utf8'));
const B = j.beats;
B[1].vo = 'Maya knows the answer. She would never say it out loud.';
B[3].onscreen = 'Every pupil answers. Any device.';
B[3].vo = 'Every pupil answers on any device. Maya types: the droplets get too heavy.';
B[4].onscreen = 'Marked. Sorted. Instantly.';
B[4].vo = "It marks every answer and tells you who got it and who didn't. Maya got it. Noah needs help.";
fs.writeFileSync(f, JSON.stringify(j, null, 2));
console.log('ok');
