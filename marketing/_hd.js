/* Adds a 1920x1080 'hd' size (landscape: caption left, picture right) and the explainer config. */
const fs = require('fs');
let t = fs.readFileSync('tokens.js', 'utf8');
if (!/id: 'hd'/.test(t)) {
  t = t.replace("{ id: 'wide',", "{ id: 'hd',     w: 1920, h: 1080, k: 1.3,  use: 'Landing page hero, YouTube 16:9' },\n  { id: 'wide',");
  fs.writeFileSync('tokens.js', t);
}
let s = fs.readFileSync('scenes.js', 'utf8');
if (!/hd: \{ t:/.test(s)) {
  s = s.replace("wide: { t: 9, r: 6.5, b: 9, l: 6.5 },", "wide: { t: 9, r: 6.5, b: 9, l: 6.5 },\n  hd: { t: 9, r: 6, b: 11, l: 6 },");
  const anchor = '.stage{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;position:relative}';
  if (!s.includes(anchor)) throw new Error('stage anchor');
  s = s.replace(anchor, anchor + "\n${size.id === 'hd' ? `.scene:not(.centre){flex-direction:row;align-items:center;gap:calc(var(--u) * 5)}\n.scene:not(.centre) .cap{flex:0 0 36%}\n.scene:not(.centre) .stage{align-self:stretch}\n.scene:not(.centre) .cap .ln{font-size:calc(var(--u) * 6.2)}\n.scene.centre .cap{max-width:78%}` : ''}");
  fs.writeFileSync('scenes.js', s);
}
let b = fs.readFileSync('beats.config.js', 'utf8');
if (!/explainer:/.test(b)) {
  b = b.replace("const OVERRIDES = {", "const OVERRIDES = {\n  explainer: { 0: 'chips', 1: 'chips', 2: 'text', 3: 'laptop', 4: 'text', 5: 'phone', 6: 'phone', 7: 'results', 8: 'text', 9: 'text', 10: 'domain' },");
  b = b.replace("const PARAMS = {", "const PARAMS = {\n  explainer: {\"0\":{\"chips\":[\"Ellie\",\"Sam\",\"Noah\"],\"icon\":\"hand\",\"hand\":1},\"1\":{\"chips\":[\"Maya\"],\"quiet\":1},\"5\":{\"q\":\"Why does it eventually rain?\",\"answer\":\"The droplets get too heavy.\",\"mode\":\"type\",\"tab\":1},\"6\":{\"q\":\"Where do clouds come from?\",\"answer\":\"Water evaporates and then condenses.\",\"mode\":\"speak\",\"tab\":1},\"7\":{\"hl\":[\"Maya\",\"Sam\",\"Noah\"]},\"10\":{\"min\":1}},");
  b = b.replace("function cfgFor(id) {", "per.explainer = Object.assign({}, per.quiet);\nNAMES_OVR.explainer = NAMES_OVR.quiet;\nfunction cfgFor(id) {");
  fs.writeFileSync('beats.config.js', b);
}
console.log('hd + explainer ready');
