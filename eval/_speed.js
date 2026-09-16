/* the default-speed swap left two options sharing value="1" - rewrite the block cleanly */
const fs = require('fs');
const P = __dirname + '/../public/help.html';
let s = fs.readFileSync(P, 'utf8');
const a = s.indexOf('<select id="speed"');
const b = s.indexOf('</select>', a);
if (a < 0 || b < 0) { console.error('SPEED SELECT NOT FOUND'); process.exit(1); }
const X = '\u00d7';
const block =
  '<select id="speed" title="Playback speed">\n' +
  '        <option value="1" selected>1' + X + ' speed</option>\n' +
  '        <option value="1.25">1.25' + X + '</option>\n' +
  '        <option value="1.5">1.5' + X + '</option>\n' +
  '        <option value="1.75">1.75' + X + '</option>\n' +
  '        <option value="2">2' + X + '</option>\n      ';
s = s.slice(0, a) + block + s.slice(b);
fs.writeFileSync(P, s);
console.log(s.slice(a, s.indexOf('</select>', a) + 9));
