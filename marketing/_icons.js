const fs = require('fs');
let s = fs.readFileSync('scenes.js', 'utf8');
const P = {
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  thumb: '<path d="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8a2 2 0 0 1-2 1.7H7V10l4-8a3 3 0 0 1 4 3.9z"/>',
  book: '<path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5zM4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  ticket: '<path d="M2 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM13 5v2M13 17v2M13 11v2"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v6h6"/>',
  quote: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  exam: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  cross: '<path d="M18 6 6 18M6 6l12 12"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/><path d="M3 3l18 18"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  ask: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
};
if (!s.includes('CHIP_ICONS')) {
  s = s.replace(/<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#7fb0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6[^']*?<\/svg>/,
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#7fb0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\' + (CHIP_ICONS[cfg.icon] || CHIP_ICONS.hand) + \'</svg>');
  s = s.replace("${cfg.quiet ? '···' :", "${cfg.quiet && !cfg.icon ? '···' :");
  s = 'const CHIP_ICONS = ' + JSON.stringify(P) + ';\n' + s;
  fs.writeFileSync('scenes.js', s);
}
// per-ad icons
const I = { quiet: ['hand'], nod: ['thumb', 'cross'], ninepm: ['book', 'ask'], twominutes: ['ticket', 'ask'], middle: ['star', 'ask'],
  cover: ['note', 'ask'], proof: ['quote', 'ask'], before: ['exam', 'cross'], speak: ['mic', 'pen'], plainly: ['target', 'ask'] };
let c = fs.readFileSync('beats.config.js', 'utf8');
for (const [id, [a, b]] of Object.entries(I)) {
  c = c.replace(new RegExp('(\\n  ' + id + ': \\{"0":\\{"chips":\\[[^\\]]*\\])'), `$1,"icon":"${a}"`);
  if (b) c = c.replace(new RegExp('(\\n  ' + id + ': \\{"0":[^\\n]*?"1":\\{"chips":\\[[^\\]]*\\],"quiet":1)'), `$1,"icon":"${b}"`);
}
fs.writeFileSync('beats.config.js', c);
const cf = require('./beats.config.js').cfgFor;
for (const id in I) console.log(id, cf(id).params[0].icon, cf(id).params[1].icon);
